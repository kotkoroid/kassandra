// PR-G2: client-side auth bootstrap.
//
// The browser holds a stable `accountId` (a UUID) in localStorage. On
// app boot it POSTs `{accountId}` to the gateway's /sessions endpoint
// and receives an HS256 JWT (signed with the gateway+realm shared
// secret). Every subsequent WebSocket open attaches that token via the
// `bearer.<jwt>` subprotocol; the realm verifies before forwarding to
// any DO.
//
// Account model is intentionally trivial for v1 — there is no signup,
// no password, no recovery flow. The accountId IS the identity; lose
// localStorage and you've lost your character. A future PR-G3 follow-up
// will move accounts into a real registry, but for now this is the
// same trust model parties already had (party UUID in the URL = capability)
// just scoped per-browser.

const STORAGE_KEY = 'kassandra.accountId';

function loadOrCreateAccountId(): string {
  const existing = localStorage.getItem(STORAGE_KEY);
  if (existing) return existing;
  const fresh = crypto.randomUUID();
  localStorage.setItem(STORAGE_KEY, fresh);
  return fresh;
}

/**
 * Where to reach the gateway. In dev we route through Vite's `/api`
 * proxy (which forwards to `api.localhost:1337`); in prod we hit
 * `VITE_GATEWAY_URL` directly. Mirrors the realm dev-loop workaround
 * documented in realm-client.ts.
 */
const GATEWAY_BASE = import.meta.env.DEV
  ? '/api'
  : import.meta.env.VITE_GATEWAY_URL.replace(/\/$/, '');

/**
 * Reactive auth state. Components and Effect runtimes that need a
 * fresh token read `auth.token` directly — once `auth.token` is set,
 * it's valid until `auth.exp` (seconds-since-epoch). PR-G3 will add
 * a refresh-before-expiry effect; today, the 24 h default TTL is
 * generous enough that a single session never needs to renew.
 */
export const auth = $state({
  accountId: '',
  token: null as string | null,
  // Seconds-since-epoch, matching the JWT `exp` claim.
  exp: 0,
});

async function fetchToken(accountId: string): Promise<{ token: string; exp: number }> {
  const res = await fetch(`${GATEWAY_BASE}/sessions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ accountId }),
  });
  if (!res.ok) {
    throw new Error(`session bootstrap failed: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<{ token: string; exp: number }>;
}

/**
 * Called once from `main.ts` before the Svelte app mounts. Settles
 * `auth.accountId` synchronously, then awaits the gateway round-trip
 * for the JWT. Throws on gateway failure — letting the app crash
 * loudly is better than silently mounting in a half-auth state where
 * every WS upgrade returns 401.
 */
export async function initAuth(): Promise<void> {
  const accountId = loadOrCreateAccountId();
  auth.accountId = accountId;
  const { token, exp } = await fetchToken(accountId);
  auth.token = token;
  auth.exp = exp;
}
