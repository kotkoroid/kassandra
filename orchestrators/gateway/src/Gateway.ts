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
import { CreatePartySuccess } from './api/parties/create-party.schema.ts';
import {
  CreateSessionRequest,
  CreateSessionSuccess,
} from './api/sessions/create-session.schema.ts';

const HttpPlatformStub = Layer.succeed(HttpPlatform.HttpPlatform, {
  fileResponse: () => Effect.die('HttpPlatform.fileResponse not supported'),
  fileWebResponse: () => Effect.die('HttpPlatform.fileWebResponse not supported'),
});

// PR-G5 cookie/origin config. The Worker reads these from env at boot;
// `alchemy.run.ts` sets dev defaults, production must override.
//   COOKIE_SECURE   — '1' in prod (TLS-only cookie); '0' in dev so
//                     localhost http:// can carry it.
//   COOKIE_DOMAIN   — eTLD+1 shared across api/realm/app subdomains in
//                     prod (e.g. 'kotkoroid.com'); empty in dev so the
//                     cookie defaults to host-only on localhost.
//   ALLOWED_ORIGIN  — exact app origin for CORS allow + the explicit
//                     origin check on session endpoints. Comma-separated
//                     list permitted; first match wins on echo.
const isTruthy = (v: string | undefined) => v === '1' || v === 'true';

const decodeSessionRequest = Schema.decodeUnknownEffect(CreateSessionRequest);

export default class Gateway extends Cloudflare.Worker<Gateway>()(
  'Api',
  {
    main: import.meta.path,
    compatibility: {
      flags: ['nodejs_compat'],
    },
  },
  Effect.gen(function* () {
    // PR-G5: bind the shared KV namespace that stores opaque session
    // records. Realm yields the SAME `SessionsKvNamespace` constant so
    // both Workers end up bound to one physical KV namespace.
    // `KVNamespaceBindingLive` is provided below so the `.bind(...)`
    // call resolves its KVNamespaceBinding requirement.
    const sessionsResource = yield* SessionsKvNamespace;
    const sessionsKv = yield* Cloudflare.KVNamespace.bind(sessionsResource);

    // Config-driven cookie attributes. We read directly from
    // `WorkerEnvironment` (the same pattern PR-G2 used for JWT_SECRET)
    // instead of `Config.string(...).withDefault(...)` because the
    // Config form leaks `ConfigError` into the Worker's effect channel,
    // and the Worker class demands `never` errors at construction.
    const env = yield* Cloudflare.WorkerEnvironment;
    const envRec = env as Record<string, string | undefined>;
    const cookieSecure = isTruthy(envRec['SESSION_COOKIE_SECURE']);
    const cookieDomain = envRec['SESSION_COOKIE_DOMAIN'] ?? '';
    // Dev default is `Lax` to dodge a Chromium quirk where Strict
    // cookies don't attach to `ws://` upgrades even from same-origin
    // pages. Prod should set `Strict` explicitly. The Origin
    // allow-list (below) is the substantive CSRF defense — SameSite
    // is belt-and-suspenders. Permitted values: Strict | Lax | None.
    const cookieSameSiteRaw = envRec['SESSION_COOKIE_SAMESITE'] ?? 'Lax';
    const cookieSameSite: 'Strict' | 'Lax' | 'None' =
      cookieSameSiteRaw === 'Strict' || cookieSameSiteRaw === 'None'
        ? cookieSameSiteRaw
        : 'Lax';
    // Dev default permits common local-dev page origins. Note that
    // `alchemy dev` itself binds port 5173 for its Cloudflare.Vite
    // bundled-asset serving, so a *second* standalone Vite always
    // falls back to 5174 (and onward if that's also busy). We allow
    // a small range of fallback ports so the default boots whatever
    // port Vite ends up on; production sets ALLOWED_ORIGIN
    // explicitly and the default is irrelevant.
    const allowedOrigin =
      envRec['ALLOWED_ORIGIN'] ??
      [
        // Bun single-origin entry proxy (`scripts/ws-proxy.ts`).
        // Recommended dev path because it sidesteps the alchemy
        // local-subdomain WS forwarding bug for browsers.
        'http://localhost:5555',
        // Vite standalone (5173) + its fallback ports (alchemy dev's
        // embedded Vite holds 5173, so a second Vite lands on 5174+).
        'http://localhost:5173',
        'http://localhost:5174',
        'http://localhost:5175',
        'http://localhost:5176',
        // alchemy dev's bundled-asset endpoint (used when bypassing
        // the Bun proxy entirely — browser WS will still fail, but
        // POST /sessions works for diagnostics).
        'http://game.localhost:1337',
      ].join(',');
    const allowedOrigins = allowedOrigin
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    const cookieOpts = {
      secure: cookieSecure,
      sameSite: cookieSameSite,
      ...(cookieDomain.length > 0 ? { domain: cookieDomain } : {}),
      maxAge: DEFAULT_TTL_SECONDS,
    } as const;
    const clearCookieOpts = {
      secure: cookieSecure,
      sameSite: cookieSameSite,
      ...(cookieDomain.length > 0 ? { domain: cookieDomain } : {}),
    } as const;

    // Build CORS headers for a given response. Vary:Origin so caches
    // don't reuse a response across origins; credentials:true is
    // mandatory once the cookie flow starts.
    const corsHeadersFor = (originHeader: string | undefined) => {
      const allowed =
        originHeader && allowedOrigins.includes(originHeader) ? originHeader : allowedOrigins[0]!;
      return {
        'Access-Control-Allow-Origin': allowed,
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Allow-Methods': 'POST, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'content-type',
        Vary: 'Origin',
      };
    };

    // Reject session requests whose Origin header doesn't match the
    // configured app. This is the CSRF defense layer that pairs with
    // SameSite=Strict on the cookie itself — SameSite handles browsers
    // that respect it; the Origin check covers everything else.
    const originAllowed = (originHeader: string | undefined): boolean =>
      typeof originHeader === 'string' && allowedOrigins.includes(originHeader);

    const partiesApi = HttpApiBuilder.group(ApiDefinition, 'Parties', (handlers) =>
      handlers.handle('create-party', () =>
        Effect.sync(() => new CreatePartySuccess({ id: crypto.randomUUID() })),
      ),
    );

    // Build the inner HttpApi request handler ONCE at worker boot.
    // `toHttpEffect` returns `Effect<Effect<Response>, ...>` — the outer
    // is one-shot setup (layer-build), the inner handles each request.
    // Yielding here collapses to just the request-handling effect.
    const httpApiFetch = yield* HttpApiBuilder.layer(ApiDefinition).pipe(
      Layer.provide([partiesApi]),
      Layer.provide([Etag.layer, HttpPlatformStub, Path.layer]),
      Layer.provide(HttpRouter.cors({ allowedOrigins, credentials: true })),
      HttpRouter.toHttpEffect,
    );

    return {
      fetch: Effect.gen(function* () {
        const request = yield* HttpServerRequest;
        const url = new URL(request.url, 'http://localhost');
        const originHeader = request.headers['origin'] as string | undefined;
        const cors = corsHeadersFor(originHeader);

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
        // just /parties).
        return yield* httpApiFetch;
      }),
    };
  }).pipe(Effect.provide(KVNamespaceBindingLive)),
) {}
