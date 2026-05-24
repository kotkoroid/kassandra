import { verify as verifyJwt } from '@kassandra/effect-conventions-foundation-library';
import * as Alchemy from 'alchemy';
import * as Cloudflare from 'alchemy/Cloudflare';
import * as Config from 'effect/Config';
import * as Effect from 'effect/Effect';
import * as Redacted from 'effect/Redacted';
import * as HttpServerResponse from 'effect/unstable/http/HttpServerResponse';
import { HttpServerRequest } from 'effect/unstable/http/HttpServerRequest';
import PartyRoom from './PartyRoom.ts';
import PlayerProfile from './PlayerProfile.ts';

// Realm Worker — entry point for all game-server traffic.
//
// Routing:
//   GET /parties/:partyId/ws?upgrade=websocket    → PartyRoom DO
//   GET /profiles/:accountId/rpc?upgrade=websocket → PlayerProfile DO
//   *                                              → 404
//
// PR-G2: every WS upgrade is authenticated. The browser ships its JWT
// inside `Sec-WebSocket-Protocol` (subprotocol `bearer.<jwt>`); the
// realm verifies the HS256 signature against the JWT_SECRET binding
// shared with the gateway (see orchestrators/gateway/src/Gateway.ts),
// then forwards to the DO with the verified identity:
//   - /parties → rewritten URL `?playerId=<jwt.sub>`. The DO is no
//     longer free to trust a client-supplied playerId query — it
//     receives a realm-controlled value derived from the verified sub.
//   - /profiles → `jwt.sub` must equal the path `:accountId`. 403 on
//     mismatch. (The DO still reads accountId from the path; the edge
//     check enforces that it's actually yours.)
//
// Bad/missing token → 401. The error response carries no body details
// to avoid surfacing the verify path's failure mode to a probing
// client; the gateway is the only legitimate token source.

// Same dev fallback as the gateway. Production must set JWT_SECRET as
// a real secret binding — any mismatch between the two workers'
// secrets would surface as universal 401 on verify, fail-closed.
const DEV_JWT_SECRET_FALLBACK = 'dev-only-jwt-secret-replace-in-production';

const BEARER_PREFIX = 'bearer.';

// Parse the JWT out of the request's `Sec-WebSocket-Protocol` header.
// The browser sends a comma-separated list (whitespace allowed); we
// look for a token of the form `bearer.<jwt>` and ignore other
// subprotocols (e.g. a future `kassandra.v1` handshake marker the
// realm might echo back).
const extractBearerToken = (headerValue: string | undefined): string | null => {
  if (!headerValue) return null;
  const candidates = headerValue.split(',').map((s) => s.trim());
  for (const candidate of candidates) {
    if (candidate.startsWith(BEARER_PREFIX)) {
      const token = candidate.slice(BEARER_PREFIX.length);
      if (token.length > 0) return token;
    }
  }
  return null;
};

export default class Realm extends Cloudflare.Worker<Realm>()(
  'Realm',
  {
    main: import.meta.path,
    compatibility: {
      flags: ['nodejs_compat'],
    },
  },
  Effect.gen(function* () {
    // PR-G2: bind JWT_SECRET on this Worker's env. Same Config source as
    // the gateway's Alchemy.Secret call, so both workers resolve to the
    // same value at deploy time (the secret IS the agreement between
    // signer and verifier).
    yield* Alchemy.Secret(
      'JWT_SECRET',
      Config.redacted('JWT_SECRET').pipe(
        Config.withDefault(Redacted.make(DEV_JWT_SECRET_FALLBACK)),
      ),
    );

    const rooms = yield* PartyRoom;
    const profiles = yield* PlayerProfile;

    return {
      fetch: Effect.gen(function* () {
        const request = yield* HttpServerRequest;
        const url = new URL(request.url, 'http://localhost');
        const pathname = url.pathname;

        const partyMatch = pathname.match(/^\/parties\/([^/]+)\/ws$/);
        const profileMatch = pathname.match(/^\/profiles\/([^/]+)\/rpc$/);
        if (!partyMatch && !profileMatch) {
          return HttpServerResponse.text('Not Found', { status: 404 });
        }

        const upgradeHeader = request.headers['upgrade'];
        if (upgradeHeader?.toLowerCase() !== 'websocket') {
          return HttpServerResponse.text('Expected WebSocket upgrade', { status: 426 });
        }

        // Authenticate. Read the JWT from the WS subprotocol header
        // (cleanest cross-origin shape — see PR-G2 commit notes on
        // why we picked subprotocol over cookies). The browser is the
        // only entity that can set Sec-WebSocket-Protocol on a WS
        // open handshake, so this is functionally equivalent to an
        // Authorization header.
        const token = extractBearerToken(request.headers['sec-websocket-protocol']);
        if (!token) {
          return HttpServerResponse.text('Unauthorized', { status: 401 });
        }

        const env = yield* Cloudflare.WorkerEnvironment;
        const secret = (env as Record<string, unknown>)['JWT_SECRET'] as string;

        const verifyResult = yield* Effect.result(verifyJwt({ secret, token }));
        if (verifyResult._tag === 'Failure') {
          // Swallow the specific error tag — don't leak signature vs
          // expired vs malformed to the client. All three collapse to
          // 401 here; the server-side log captures the underlying
          // tag for triage.
          yield* Effect.logWarning('JWT verify failed').pipe(
            Effect.annotateLogs({ tag: verifyResult.failure._tag, path: pathname }),
          );
          return HttpServerResponse.text('Unauthorized', { status: 401 });
        }
        const claims = verifyResult.success;

        if (profileMatch) {
          const accountId = profileMatch[1]!;
          // PR-G2: the verified sub claim MUST match the path's
          // accountId. Without this check, any authenticated user
          // could open a WS to anyone else's PlayerProfile DO simply
          // by changing the URL.
          if (claims.sub !== accountId) {
            return HttpServerResponse.text('Forbidden', { status: 403 });
          }
          const profile = profiles.getByName(accountId);
          return yield* profile.fetch(request);
        }

        // Parties: rewrite the URL so the DO sees the verified
        // playerId (= JWT.sub) as a query parameter. PartyRoom keeps
        // its existing `?playerId=` parsing — but the value is now
        // realm-controlled, not client-controlled. Any client query
        // string is discarded.
        const partyId = partyMatch![1]!;
        const forwardedUrl = new URL(url);
        forwardedUrl.searchParams.set('playerId', claims.sub);
        const forwarded = request.modify({ url: forwardedUrl.toString() });
        const room = rooms.getByName(partyId);
        return yield* room.fetch(forwarded);
      }),
    };
  }),
) {}
