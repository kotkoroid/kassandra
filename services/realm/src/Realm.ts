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

const PROD_APP_HOST = 'kassandra.kotkoroid.com';
const DEV_ORIGINS = [
  'http://localhost:5555',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
  'http://localhost:5176',
  'http://game.localhost:1337',
];

const extractOrigin = (headers: Record<string, string>): string | undefined =>
  headers['origin'];

// Per-request origin allow-list — mirrors `deriveScope` in Gateway.ts.
// The same Realm Worker binary serves dev (realm.localhost:1337) and
// prod (realm.kassandra.kotkoroid.com); the request's Host header tells
// us which, and the allowed origin set follows.
function isLocalDevHost(host: string): boolean {
  if (host === '') return true;
  const bare = host.split(':')[0]!;
  if (bare === 'localhost' || bare.endsWith('.localhost')) return true;
  if (host.includes(':1337')) return true;
  if (/:5(17[3-6]|555)$/.test(host)) return true;
  return false;
}

function originsFor(hostHeader: string | undefined): string[] {
  const host = (hostHeader ?? '').toLowerCase();
  if (isLocalDevHost(host)) return DEV_ORIGINS;
  // Cloudflare terminates TLS at the edge, so any non-localhost host
  // means HTTPS. Derive the cookie's parent site by dropping the first
  // DNS label (realm.kassandra.kotkoroid.com → kassandra.kotkoroid.com)
  // and accept https://<site> as the only valid origin.
  const labels = host.split(':')[0]!.split('.');
  const site = labels.length >= 3 ? labels.slice(1).join('.') : labels.join('.');
  return [`https://${site}`];
}

export default class Realm extends Cloudflare.Worker<Realm>()(
  'Realm',
  {
    main: import.meta.path,
    compatibility: {
      flags: ['nodejs_compat'],
    },
    // Production custom hostname. Alchemy infers the Cloudflare Zone
    // from the suffix. Dev mode ignores this (LocalWorkerProvider
    // unconditionally sets `domains: []`).
    domain: `realm.${PROD_APP_HOST}`,
  },
  Effect.gen(function* () {
    // PR-G5: bind the shared session KV. The Gateway yields the SAME
    // `SessionsKvNamespace` constant so both Workers are bound to one
    // physical namespace.
    const sessionsResource = yield* SessionsKvNamespace;
    const sessionsKv = yield* Cloudflare.KVNamespace.bind(sessionsResource);

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
        // check is the only server-side guarantee. The allow-list is
        // derived from the request's own host so dev (localhost) and
        // prod (realm.kassandra.kotkoroid.com) work from the same
        // Worker binary.
        const originHeader = extractOrigin(request.headers);
        const allowedOrigins = originsFor(request.headers['host']);
        if (
          typeof originHeader !== 'string' ||
          !allowedOrigins.includes(originHeader)
        ) {
          yield* Effect.logWarning('Origin rejected').pipe(
            Effect.annotateLogs({
              origin: originHeader ?? '<missing>',
              path: pathname,
              allowed: allowedOrigins.join(','),
            }),
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
