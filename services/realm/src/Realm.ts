import {
  parseSessionCookie,
  readSession,
  SessionsKvNamespace,
  touchSession,
} from '@kassandra/effect-conventions-foundation-library';
import * as Cloudflare from 'alchemy/Cloudflare';
import { KVNamespaceBindingLive } from 'alchemy/Cloudflare';
import * as Effect from 'effect/Effect';
import * as HttpServerResponse from 'effect/unstable/http/HttpServerResponse';
import { HttpServerRequest } from 'effect/unstable/http/HttpServerRequest';
import PartyRoom from './PartyRoom.ts';

// Realm Worker — entry point for all game-server traffic.
//
// Routing:
//   GET /parties/:partyId/ws?upgrade=websocket → PartyRoom DO
//   *                                          → 404
//
// PR-G5: every WS upgrade is authenticated by SESSION COOKIE. The
// gateway sets `__Secure-kassandra.sid=<opaqueId>` on POST /sessions
// (HttpOnly+Secure+SameSite=Strict+Domain=eTLD+1); the browser ships
// the cookie on the WS upgrade handshake same-site; the realm parses
// it out, reads the session record from the shared KV namespace, and:
//   - rejects with 401 on missing/expired/unknown sid
//   - rejects with 403 on Origin mismatch (CSRF defense alongside the
//     SameSite cookie attribute — belt-and-suspenders since SameSite
//     is browser-honored only)
//   - slides the session TTL on every successful upgrade (active
//     players never time out; idle ones reclaim automatically)
//   - rewrites the forwarded URL with `?playerId=<accountId>` so the
//     PartyRoom DO sees a realm-controlled player identity, never
//     client-controlled
//
// ADR-002: PlayerProfile DO + /profiles route are gone. Character
// identity is per-realm and lives inside each PartyRoom's persisted
// world.

const extractOrigin = (headers: Record<string, string>): string | undefined =>
  headers['origin'];

export default class Realm extends Cloudflare.Worker<Realm>()(
  'Realm',
  {
    main: import.meta.path,
    compatibility: {
      flags: ['nodejs_compat'],
    },
  },
  Effect.gen(function* () {
    // PR-G5: bind the shared session KV. The Gateway yields the SAME
    // `SessionsKvNamespace` constant so both Workers are bound to one
    // physical namespace.
    const sessionsResource = yield* SessionsKvNamespace;
    const sessionsKv = yield* Cloudflare.KVNamespace.bind(sessionsResource);

    // Origin allow-list. Read directly from env (same shape PR-G2 used
    // for JWT_SECRET) to avoid leaking `ConfigError` into the Worker's
    // never-error channel.
    const env = yield* Cloudflare.WorkerEnvironment;
    // Dev default mirrors the gateway: alchemy dev binds 5173 for its
    // bundled-asset Vite, so a second standalone Vite (used for HMR
    // against the live workers) lands on 5174+. Allow a small range
    // so the default boots whichever port Vite picks. Production sets
    // ALLOWED_ORIGIN explicitly.
    const allowedOrigin =
      (env as Record<string, string | undefined>)['ALLOWED_ORIGIN'] ??
      [
        'http://localhost:5555',
        'http://localhost:5173',
        'http://localhost:5174',
        'http://localhost:5175',
        'http://localhost:5176',
        'http://game.localhost:1337',
      ].join(',');
    const allowedOrigins = allowedOrigin
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    const originAllowed = (origin: string | undefined): boolean =>
      typeof origin === 'string' && allowedOrigins.includes(origin);

    const rooms = yield* PartyRoom;

    return {
      fetch: Effect.gen(function* () {
        const request = yield* HttpServerRequest;
        const url = new URL(request.url, 'http://localhost');
        const pathname = url.pathname;

        const partyMatch = pathname.match(/^\/parties\/([^/]+)\/ws$/);
        if (!partyMatch) {
          return HttpServerResponse.text('Not Found', { status: 404 });
        }

        const upgradeHeader = request.headers['upgrade'];
        if (upgradeHeader?.toLowerCase() !== 'websocket') {
          return HttpServerResponse.text('Expected WebSocket upgrade', { status: 426 });
        }

        // CSRF defense: pair SameSite=Strict on the cookie with an
        // explicit Origin allow-list check on the upgrade. Browsers
        // can initiate WS cross-origin (no preflight), so an Origin
        // check is the only server-side guarantee.
        const originHeader = extractOrigin(request.headers);
        if (!originAllowed(originHeader)) {
          yield* Effect.logWarning('Origin rejected').pipe(
            Effect.annotateLogs({ origin: originHeader ?? '<missing>', path: pathname }),
          );
          return HttpServerResponse.text('Forbidden', { status: 403 });
        }

        const sid = parseSessionCookie(request.headers['cookie']);
        if (!sid) {
          return HttpServerResponse.text('Unauthorized', { status: 401 });
        }

        // Read + validate. All failure modes (not-found / decode-fail /
        // expired) collapse to 401 — the client treats 401 as "log in
        // again". Server-side log carries the specific tag for triage.
        const readResult = yield* Effect.result(readSession(sessionsKv, sid));
        if (readResult._tag === 'Failure') {
          yield* Effect.logWarning('Session read failed').pipe(
            Effect.annotateLogs({ tag: readResult.failure._tag, path: pathname }),
          );
          return HttpServerResponse.text('Unauthorized', { status: 401 });
        }
        const record = readResult.success;

        // Sliding TTL — touch on every successful upgrade. Cheap
        // (single KV put) and keeps active players logged in
        // indefinitely without absolute renewal complexity.
        yield* touchSession(sessionsKv, sid, record);

        // Parties: rewrite the URL so the DO sees the verified
        // playerId (= session.accountId) as a query parameter.
        // PartyRoom keeps its existing `?playerId=` parsing — but
        // the value is now realm-controlled. Any client query string
        // is discarded.
        const partyId = partyMatch[1]!;
        const forwardedUrl = new URL(url);
        forwardedUrl.searchParams.set('playerId', record.accountId);
        const forwarded = request.modify({ url: forwardedUrl.toString() });
        const room = rooms.getByName(partyId);
        return yield* room.fetch(forwarded);
      }),
    };
  }).pipe(Effect.provide(KVNamespaceBindingLive)),
) {}
