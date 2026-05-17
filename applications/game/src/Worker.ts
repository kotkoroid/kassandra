import * as Cloudflare from 'alchemy/Cloudflare';
import * as Effect from 'effect/Effect';
import * as HttpServerResponse from 'effect/unstable/http/HttpServerResponse';
import { Assets } from './Assets';

const mime: Record<string, string> = {
  html: 'text/html; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  mjs: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8',
  json: 'application/json; charset=utf-8',
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  ico: 'image/x-icon',
  woff: 'font/woff',
  woff2: 'font/woff2',
};

const contentType = (pathname: string) => {
  const ext = pathname.split('.').pop()?.toLowerCase() ?? '';
  return mime[ext];
};

const withContentType = (response: Response, pathname: string): Response => {
  const ct = contentType(pathname);
  if (!ct) return response;
  const headers = new Headers(response.headers);
  headers.set('content-type', ct);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};

export default Cloudflare.Worker(
  'Worker',
  // Yielding Assets here ties the Worker's asset manifest to the
  // Build resource's output hash. When Build re-runs vite and the
  // output hash changes, the Worker's plan re-evaluates against the
  // new directory instead of trying to upload stale filenames.
  Effect.gen(function* () {
    const build = yield* Assets;
    return {
      main: import.meta.path,
      assets: {
        path: build.outdir,
        hash: build.hash,
        config: {
          htmlHandling: 'auto-trailing-slash' as const,
          notFoundHandling: 'single-page-application' as const,
        },
      },
      // TODO: Comment this for successfull deploy
      bindings: {
        ASSETS: {
          kind: 'Cloudflare.Workers.Assets',
        } satisfies Cloudflare.Assets,
      },
    };
  }),
  Effect.succeed({
    fetch: Effect.gen(function* () {
      const env = yield* Cloudflare.WorkerEnvironment;
      const request = yield* Cloudflare.Request;
      const url = new URL(request.url);

      // Production's assets pipeline applies htmlHandling + SPA fallback
      // and sets Content-Type from file extensions. Alchemy dev's local
      // runtime exposes assets via workerd's `disk` service which does
      // neither, so emulate both here: directory and unknown paths fall
      // back to index.html for client-side routing, and we set
      // Content-Type ourselves so ES modules execute.
      const fetchAsset = (target: string) =>
        Effect.promise(async () => {
          const res = await env['ASSETS'].fetch(
            new Request(new URL(target, url), request),
          );
          return withContentType(res, target);
        });

      if (url.pathname === '/' || url.pathname.endsWith('/')) {
        return HttpServerResponse.fromWeb(yield* fetchAsset('/index.html'));
      }

      const response = yield* fetchAsset(url.pathname);
      if (response.status === 404) {
        return HttpServerResponse.fromWeb(yield* fetchAsset('/index.html'));
      }
      return HttpServerResponse.fromWeb(response);
    }),
  }),
);
