import {
  buildClearCookie,
  buildSetCookie,
  createSession,
  DEFAULT_TTL_SECONDS,
  parseSessionCookie,
  revokeSession,
  SessionsKvNamespace,
} from '@kassandra/effect-conventions-foundation-library';
import * as Cloudflare from 'alchemy/Cloudflare';
import { KVNamespaceBindingLive } from 'alchemy/Cloudflare';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Schema from 'effect/Schema';
import * as Etag from 'effect/unstable/http/Etag';
import { HttpServerRequest } from 'effect/unstable/http/HttpServerRequest';
import * as HttpServerResponse from 'effect/unstable/http/HttpServerResponse';
import * as HttpPlatform from 'effect/unstable/http/HttpPlatform';
import * as HttpRouter from 'effect/unstable/http/HttpRouter';
import * as HttpApiBuilder from 'effect/unstable/httpapi/HttpApiBuilder';
import * as Path from 'effect/Path';
import { ApiDefinition } from './api/api.definition.ts';
import { CreateRealmSuccess } from './api/realms/create-realm.schema.ts';
import {
  CreateSessionRequest,
  CreateSessionSuccess,
} from './api/sessions/create-session.schema.ts';

const HttpPlatformStub = Layer.succeed(HttpPlatform.HttpPlatform, {
  fileResponse: () => Effect.die('HttpPlatform.fileResponse not supported'),
  fileWebResponse: () => Effect.die('HttpPlatform.fileWebResponse not supported'),
});

// PR-G5 cookie/origin config — derived from the incoming request's host
// at runtime so the same code works in dev (localhost) and prod
// (api.kassandra.kotkoroid.com) without env files or stage flags.
//
//   Dev request: Host=api.localhost:1337 → host-only cookie, no Secure
//                flag, SameSite=Lax, ALLOW http://localhost:* origins
//   Prod request: Host=api.kassandra.kotkoroid.com → cookie scoped to
//                 .kassandra.kotkoroid.com, Secure, SameSite=Strict,
//                 ALLOW https://kassandra.kotkoroid.com origin
//
// The site=eTLD+1 derivation strips the first DNS label off the Host
// (e.g. api.kassandra.kotkoroid.com → kassandra.kotkoroid.com), then
// prepends a dot so the cookie scopes across every sibling subdomain.
// The origin allow-list is built from the same site (https://<site>)
// plus the static localhost dev set.

const PROD_APP_HOST = 'kassandra.kotkoroid.com';
const DEV_ORIGINS = [
  // Bun single-origin entry proxy (`scripts/ws-proxy.ts`) — recommended
  // dev path; sidesteps alchemy's local-subdomain WS forwarding bug.
  'http://localhost:5555',
  // Standalone Vite + its fallback ports (alchemy dev's embedded Vite
  // holds 5173, so a second Vite lands on 5174+).
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
  'http://localhost:5176',
  // alchemy dev's bundled-asset endpoint.
  'http://game.localhost:1337',
];

interface RequestScope {
  isSecure: boolean;
  cookieDomain: string;
  allowedOrigins: string[];
}

function isLocalDevHost(host: string): boolean {
  // Local dev variants: localhost, *.localhost, anything on the alchemy
  // local-subdomain proxy port (:1337), and the common Vite dev ports
  // a *standalone* Vite picks (5173..5176, plus the Bun proxy 5555).
  if (host === '') return true;
  const bare = host.split(':')[0]!;
  if (bare === 'localhost' || bare.endsWith('.localhost')) return true;
  if (host.includes(':1337')) return true;
  if (/:5(17[3-6]|555)$/.test(host)) return true;
  return false;
}

function deriveScope(hostHeader: string | undefined): RequestScope {
  const host = (hostHeader ?? '').toLowerCase();
  if (isLocalDevHost(host)) {
    return { isSecure: false, cookieDomain: '', allowedOrigins: DEV_ORIGINS };
  }
  // Production custom-domain request. Cloudflare terminates TLS for us,
  // so any non-localhost host means HTTPS at the edge (and we trust the
  // request's own Host header because Cloudflare's edge sets it). Derive
  // the cookie's parent site by dropping the first DNS label
  // (api.kassandra.kotkoroid.com → kassandra.kotkoroid.com); the app
  // origin we accept is https://<site>.
  const labels = host.split(':')[0]!.split('.');
  const site = labels.length >= 3 ? labels.slice(1).join('.') : labels.join('.');
  return {
    isSecure: true,
    cookieDomain: '.' + site,
    allowedOrigins: [`https://${site}`],
  };
}

const decodeSessionRequest = Schema.decodeUnknownEffect(CreateSessionRequest);

export default class Gateway extends Cloudflare.Worker<Gateway>()(
  'Api',
  {
    main: import.meta.path,
    compatibility: {
      flags: ['nodejs_compat'],
    },
    // Production custom hostname. Alchemy infers the Cloudflare Zone
    // from the suffix; the kotkoroid.com zone must already exist on
    // the account (it does). Dev mode (`alchemy dev`) ignores this
    // field — LocalWorkerProvider sets `domains: []` unconditionally.
    domain: `api.${PROD_APP_HOST}`,
  },
  Effect.gen(function* () {
    // PR-G5: bind the shared KV namespace that stores opaque session
    // records. Realm yields the SAME `SessionsKvNamespace` constant so
    // both Workers end up bound to one physical KV namespace.
    // `KVNamespaceBindingLive` is provided below so the `.bind(...)`
    // call resolves its KVNamespaceBinding requirement.
    const sessionsResource = yield* SessionsKvNamespace;
    const sessionsKv = yield* Cloudflare.KVNamespace.bind(sessionsResource);

    // HttpApi router for /realms. The CORS layer needs a static
    // origin list at build time; we pass the union of dev + prod so
    // the router handles preflight + response headers for both
    // environments. The hand-rolled /sessions branch below does its
    // own per-request origin check (tighter, host-aware) for the
    // CSRF defense — the static union here is just so HttpApi's CORS
    // middleware can echo back the right Allow-Origin.
    const realmsApi = HttpApiBuilder.group(ApiDefinition, 'Realms', (handlers) =>
      handlers.handle('create-realm', () =>
        Effect.sync(() => new CreateRealmSuccess({ id: crypto.randomUUID() })),
      ),
    );

    const httpApiFetch = yield* HttpApiBuilder.layer(ApiDefinition).pipe(
      Layer.provide([realmsApi]),
      Layer.provide([Etag.layer, HttpPlatformStub, Path.layer]),
      Layer.provide(
        HttpRouter.cors({
          allowedOrigins: [...DEV_ORIGINS, `https://${PROD_APP_HOST}`],
          credentials: true,
        }),
      ),
      HttpRouter.toHttpEffect,
    );

    return {
      fetch: Effect.gen(function* () {
        const request = yield* HttpServerRequest;
        const url = new URL(request.url, 'http://localhost');
        const originHeader = request.headers['origin'] as string | undefined;
        const hostHeader = request.headers['host'] as string | undefined;

        // Per-request scope derivation. The same Worker binary serves
        // dev (api.localhost:1337) and prod (api.kassandra.kotkoroid.com);
        // the request's own Host tells us which.
        const scope = deriveScope(hostHeader);
        const cookieOpts = {
          secure: scope.isSecure,
          // Strict over TLS, Lax on localhost — dodges a Chromium quirk
          // where Strict cookies don't attach to ws:// upgrades even
          // from same-origin pages. Origin allow-list below is the
          // substantive CSRF defense; SameSite is belt-and-suspenders.
          sameSite: scope.isSecure ? ('Strict' as const) : ('Lax' as const),
          ...(scope.cookieDomain.length > 0 ? { domain: scope.cookieDomain } : {}),
          maxAge: DEFAULT_TTL_SECONDS,
        };
        const clearCookieOpts = {
          secure: scope.isSecure,
          sameSite: scope.isSecure ? ('Strict' as const) : ('Lax' as const),
          ...(scope.cookieDomain.length > 0 ? { domain: scope.cookieDomain } : {}),
        };
        const allowed =
          originHeader && scope.allowedOrigins.includes(originHeader)
            ? originHeader
            : scope.allowedOrigins[0]!;
        const cors = {
          'Access-Control-Allow-Origin': allowed,
          'Access-Control-Allow-Credentials': 'true',
          'Access-Control-Allow-Methods': 'POST, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'content-type',
          Vary: 'Origin',
        };
        const originAllowed = (h: string | undefined): boolean =>
          typeof h === 'string' && scope.allowedOrigins.includes(h);

        // ----- /sessions: cookie-flow endpoints -----
        if (url.pathname === '/sessions') {
          // CORS preflight. Any path that the browser will hit with a
          // non-simple verb + credentials needs to answer OPTIONS.
          if (request.method === 'OPTIONS') {
            return HttpServerResponse.empty({ status: 204, headers: cors });
          }

          if (!originAllowed(originHeader)) {
            return HttpServerResponse.text('Forbidden', { status: 403, headers: cors });
          }

          if (request.method === 'POST') {
            const bodyResult = yield* Effect.result(
              request.json.pipe(Effect.flatMap(decodeSessionRequest)),
            );
            if (bodyResult._tag === 'Failure') {
              return HttpServerResponse.text('Bad Request', { status: 400, headers: cors });
            }
            const { accountId } = bodyResult.success;
            const { sid } = yield* createSession(sessionsKv, { accountId });
            return yield* HttpServerResponse.schemaJson(CreateSessionSuccess)(
              new CreateSessionSuccess({ accountId }),
              {
                status: 201,
                headers: {
                  ...cors,
                  'Set-Cookie': buildSetCookie(sid, cookieOpts),
                },
              },
            );
          }

          if (request.method === 'DELETE') {
            const sid = parseSessionCookie(request.headers['cookie']);
            if (sid) {
              yield* revokeSession(sessionsKv, sid);
            }
            return HttpServerResponse.empty({
              status: 204,
              headers: {
                ...cors,
                'Set-Cookie': buildClearCookie(clearCookieOpts),
              },
            });
          }

          return HttpServerResponse.text('Method Not Allowed', { status: 405, headers: cors });
        }

        // Everything else: delegate to the HttpApi router (currently
        // just /realms).
        return yield* httpApiFetch;
      }),
    };
  }).pipe(Effect.provide(KVNamespaceBindingLive)),
) {}
