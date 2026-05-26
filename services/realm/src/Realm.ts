import {
  deriveAuthConfig,
  parseSessionCookie,
  PROD_APP_HOST,
  readSession,
  SessionsKvNamespace,
  touchSession,
} from '@kassandra/effect-conventions-foundation-library';
import * as Cloudflare from 'alchemy/Cloudflare';
import { KVNamespaceBindingLive } from 'alchemy/Cloudflare';
import * as Effect from 'effect/Effect';
import { HttpServerRequest } from 'effect/unstable/http/HttpServerRequest';
import * as HttpServerResponse from 'effect/unstable/http/HttpServerResponse';
import RealmRoom from './RealmRoom.ts';

// Realm Worker — entry point for all game-server traffic.
//
// Routing:
//   /realms/:realmId/ws (Upgrade: websocket) → RealmRoom DO
//   path match, no upgrade header             → 426 Upgrade Required
//   anything else                             → 404 Not Found
//
// Auth: every WS upgrade authenticated by SESSION COOKIE. Reads the
// shared KV session record set by Gateway, slides TTL on success,
// rewrites the forwarded URL with `?playerId=<accountId>` so the DO
// sees a realm-controlled identity.
//
// Auth config (allowed origins, cookie domain, secure flag) is derived
// per-request from the `Host` header via the shared `deriveAuthConfig`
// helper. See the long comment in authConfig.ts for why this isn't
// deploy-time env injection.

export default class Realm extends Cloudflare.Worker<Realm>()(
  'Realm',
  {
    main: import.meta.path,
    compatibility: {
      flags: ['nodejs_compat'],
    },
    domain: `realm.${PROD_APP_HOST}`,
  },
  Effect.gen(function* () {
    // PR-G5: bind the shared session KV. The Gateway yields the SAME
    // `SessionsKvNamespace` constant so both Workers are bound to one
    // physical namespace.
    const sessionsResource = yield* SessionsKvNamespace;
    const sessionsKv = yield* Cloudflare.KVNamespace.bind(sessionsResource);

    const rooms = yield* RealmRoom;

    return {
      fetch: Effect.gen(function* () {
        const request = yield* HttpServerRequest;
        const auth = deriveAuthConfig(request.headers['host']);
        const url = new URL(request.url, 'http://localhost');
        const pathname = url.pathname;

        const realmMatch = pathname.match(/^\/realms\/([^/]+)\/ws$/);
        if (!realmMatch) {
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
        const originHeader = request.headers['origin'];
        if (
          typeof originHeader !== 'string' ||
          !auth.allowedOrigins.includes(originHeader)
        ) {
          yield* Effect.logWarning('Origin rejected').pipe(
            Effect.annotateLogs({
              origin: originHeader ?? '<missing>',
              path: pathname,
              allowed: auth.allowedOrigins.join(','),
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

        // Sliding TTL — touch on every successful upgrade.
        yield* touchSession(sessionsKv, sid, record);

        // Rewrite the URL so the DO sees the verified playerId
        // (= session.accountId) as a query parameter. Any client
        // query string is discarded.
        const realmId = realmMatch[1]!;
        const forwardedUrl = new URL(url);
        forwardedUrl.searchParams.set('playerId', record.accountId);
        const forwarded = request.modify({ url: forwardedUrl.toString() });
        const room = rooms.getByName(realmId);
        return yield* room.fetch(forwarded);
      }),
    };
  }).pipe(Effect.provide(KVNamespaceBindingLive)),
) {}
