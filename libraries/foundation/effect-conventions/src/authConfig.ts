// Shared CORS / cookie config for the Gateway and Realm Workers.
//
// Both Workers need the same answer to "what origins do we accept on
// credentialed requests, what domain do session cookies belong to, is
// the request channel secure". The answer differs between dev
// (localhost) and prod (kassandra.kotkoroid.com); the discriminator is
// the request's `Host` header.
//
// ## Why host-sniffing rather than deploy-time env injection
//
// The architecturally cleaner pattern would be to inject env values at
// deploy time (`alchemy.run.ts` reads `AlchemyContext.dev`, passes
// `ALLOWED_ORIGINS` / `COOKIE_DOMAIN` / `IS_SECURE` into each Worker's
// `env:` prop). We tried this. Two alchemy constraints block it:
//
//   1. Class form's props must be STATIC at class-definition time.
//      Wrapping props in `Effect.gen(... AlchemyContext ...)` makes
//      AlchemyContext referenced from the Worker file, which the
//      bundler then ships into the runtime bundle. At exec phase
//      AlchemyContext isn't provided → `Service not found:
//      alchemy/Context` crash on first request.
//   2. Function-form factory (`export default function Gateway(env)`)
//      breaks the runtime entry contract — `main: import.meta.path`
//      tells alchemy to bundle the file whose default export must be a
//      Worker handler. A factory function fails with `Fiber.runLoop:
//      Not a valid effect: function Gateway(...)`.
//
// Until alchemy supports deploy-time env injection that doesn't ship
// AlchemyContext into the runtime bundle, host-sniffing is the
// pragmatic answer. The mitigations: all the logic lives in ONE place
// (this file), neither Worker duplicates it, and the eTLD+1 / port
// list are at least centralized.

export const PROD_APP_HOST = 'kassandra.kotkoroid.com';

// Dev origins both Workers accept credentialed requests from. Facts
// about the game client's dev-server topology: Bun single-origin proxy
// on :5555, standalone Vite on :5173-5176, alchemy's bundled-asset
// endpoint on game.localhost:1337.
const DEV_ORIGINS: ReadonlyArray<string> = [
  'http://localhost:5555',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
  'http://localhost:5176',
  'http://game.localhost:1337',
];

export interface AuthConfig {
  readonly isSecure: boolean;
  readonly cookieDomain: string;
  readonly allowedOrigins: ReadonlyArray<string>;
}

/**
 * Derive auth config from the request's `Host` header.
 *
 * Inverted default: a request is **prod** only when its hostname is
 * the production app host (`kassandra.kotkoroid.com`) or a subdomain
 * of it (`api.…`, `realm.…`). Everything else — localhost, .localhost,
 * 127.0.0.1, workerd's loopback IPs (`127.0.0.1:<random>`), any other
 * hostname — is treated as dev.
 *
 * Why inverted: enumerating "dev" patterns kept breaking (the original
 * version missed 127.0.0.1, which is what alchemy's local workerd
 * actually serves on). Production traffic only ever arrives at this
 * Worker through Cloudflare's edge with a Host header set by
 * Cloudflare to one of our custom domains; there is no scenario where
 * a request with a non-prod Host should be treated as prod.
 */
export const deriveAuthConfig = (hostHeader: string | undefined): AuthConfig => {
  const bare = (hostHeader ?? '').toLowerCase().split(':')[0]!;
  if (isProdHost(bare)) {
    return {
      isSecure: true,
      // Cookie scoped to the parent site so the same session cookie
      // travels to api.<host>, realm.<host>, and bare <host>.
      cookieDomain: '.' + PROD_APP_HOST,
      allowedOrigins: [`https://${PROD_APP_HOST}`],
    };
  }
  return {
    isSecure: false,
    cookieDomain: '',
    allowedOrigins: DEV_ORIGINS,
  };
};

const isProdHost = (bareHost: string): boolean =>
  bareHost === PROD_APP_HOST || bareHost.endsWith('.' + PROD_APP_HOST);
