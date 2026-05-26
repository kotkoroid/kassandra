import {
  buildClearCookie,
  buildSetCookie,
  createSession,
  DEFAULT_TTL_SECONDS,
  deriveAuthConfig,
  parseSessionCookie,
  PROD_APP_HOST,
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

// Gateway Worker — `/sessions` cookie endpoints + `/realms` HttpApi.
//
// Auth config (cookie domain, secure flag, allowed origins) is derived
// per-request from the `Host` header via the shared `deriveAuthConfig`
// helper. See the long comment in authConfig.ts for why this isn't
// deploy-time env injection.

const HttpPlatformStub = Layer.succeed(HttpPlatform.HttpPlatform, {
  fileResponse: () => Effect.die('HttpPlatform.fileResponse not supported'),
  fileWebResponse: () => Effect.die('HttpPlatform.fileWebResponse not supported'),
});

const decodeSessionRequest = Schema.decodeUnknownEffect(CreateSessionRequest);

export default class Gateway extends Cloudflare.Worker<Gateway>()(
  'Api',
  {
    main: import.meta.path,
    compatibility: {
      flags: ['nodejs_compat'],
    },
    domain: `api.${PROD_APP_HOST}`,
  },
  Effect.gen(function* () {
    // PR-G5: bind the shared KV namespace that stores opaque session
    // records. Realm yields the SAME `SessionsKvNamespace` constant so
    // both Workers end up bound to one physical KV namespace.
    const sessionsResource = yield* SessionsKvNamespace;
    const sessionsKv = yield* Cloudflare.KVNamespace.bind(sessionsResource);

    // HttpApi router for /realms. CORS is applied by the outer fetch
    // handler (not a Layer) so every route goes through one consistent
    // CSRF/CORS path keyed off the per-request auth config.
    const realmsApi = HttpApiBuilder.group(ApiDefinition, 'Realms', (handlers) =>
      handlers.handle('create-realm', () =>
        Effect.sync(() => new CreateRealmSuccess({ id: crypto.randomUUID() })),
      ),
    );

    const httpApiFetch = yield* HttpApiBuilder.layer(ApiDefinition).pipe(
      Layer.provide([realmsApi]),
      Layer.provide([Etag.layer, HttpPlatformStub, Path.layer]),
      HttpRouter.toHttpEffect,
    );

    return {
      fetch: Effect.gen(function* () {
        const request = yield* HttpServerRequest;
        const auth = deriveAuthConfig(request.headers['host']);
        const url = new URL(request.url, 'http://localhost');
        const originHeader = request.headers['origin'] as string | undefined;

        const sameSite = auth.isSecure ? ('Strict' as const) : ('Lax' as const);
        const cookieOpts = {
          secure: auth.isSecure,
          // Strict over TLS, Lax on localhost — dodges a Chromium quirk
          // where Strict cookies don't attach to ws:// upgrades even
          // from same-origin pages. The Origin allow-list below is the
          // substantive CSRF defense; SameSite is belt-and-suspenders.
          sameSite,
          ...(auth.cookieDomain.length > 0 ? { domain: auth.cookieDomain } : {}),
          maxAge: DEFAULT_TTL_SECONDS,
        };
        const clearCookieOpts = {
          secure: auth.isSecure,
          sameSite,
          ...(auth.cookieDomain.length > 0 ? { domain: auth.cookieDomain } : {}),
        };

        // Echo the request's Origin when allow-listed, otherwise fall
        // back to the first allowed origin so the CORS response is
        // well-formed even on rejected requests.
        const allowed =
          originHeader && auth.allowedOrigins.includes(originHeader)
            ? originHeader
            : auth.allowedOrigins[0]!;
        const cors = {
          'Access-Control-Allow-Origin': allowed,
          'Access-Control-Allow-Credentials': 'true',
          'Access-Control-Allow-Methods': 'POST, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'content-type',
          Vary: 'Origin',
        };
        // Production CSRF guard. Only enforced when isSecure=true
        // (real HTTPS Cloudflare edge request). In local dev the proxy
        // chain (browser → ws-proxy → alchemy) can mangle or rewrite
        // the Origin header in ways that make an exact-match check
        // unreliable; localhost CSRF is not a real threat, so we skip
        // the check there entirely.
        const originAllowed = (h: string | undefined): boolean =>
          typeof h === 'string' && auth.allowedOrigins.includes(h);

        // ----- Global CORS preflight -----
        // All credentialed endpoints (/sessions, /realms, …) trigger
        // an OPTIONS preflight. Handle it once here so each route
        // branch doesn't have to repeat it.
        if (request.method === 'OPTIONS') {
          return HttpServerResponse.empty({ status: 204, headers: cors });
        }

        // ----- /sessions: cookie-flow endpoints -----
        if (url.pathname === '/sessions') {
          if (auth.isSecure && !originAllowed(originHeader)) {
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
        // just /realms). Inject CORS headers onto the response here.
        const apiResponse = yield* httpApiFetch;
        return HttpServerResponse.setHeaders(cors)(apiResponse);
      }),
    };
  }).pipe(Effect.provide(KVNamespaceBindingLive)),
) {}
