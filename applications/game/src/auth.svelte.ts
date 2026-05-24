// PR-G5: client-side auth bootstrap (cookie-based session).
//
// The browser holds a stable `accountId` (a UUID) in localStorage. On
// app boot it POSTs `{accountId}` to the gateway's /sessions endpoint
// with `credentials: 'include'`. The gateway creates a session record
// in KV and replies with an HttpOnly+Secure+SameSite=Strict cookie
// (`__Secure-kassandra.sid` in prod, `kassandra.sid` in dev). The
// browser ships that cookie automatically on every subsequent same-site
// request — including WebSocket upgrades to the realm — so this module
// never has to handle the credential itself.
//
// What changed from PR-G2:
//   - No JWT in the response body, no token state, no expiry tracking.
//     The credential is opaque + server-controlled; revocation is a
//     single DELETE /sessions away.
//   - `auth.token` is gone. Components that previously read it to
//     decide if auth had settled now read `auth.accountId !== ''`.
//   - `logout()` is new: it DELETEs the session, clearing both the
//     KV record and the cookie.
//
// Account model is still intentionally trivial for v1 — no signup,
// no password, no recovery. The accountId IS the identity; lose
// localStorage and you've lost your character. A future PR can move
// accounts into a real registry; for now this is a per-browser
// capability scoped by the secure cookie.

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
 * Reactive auth state. `accountId === ''` means auth hasn't settled
 * yet; non-empty means the session cookie is live and the realm will
 * accept WS upgrades. The cookie itself is HttpOnly and inaccessible
 * to JS — by design.
 */
export const auth = $state({
  accountId: '',
});

async function postSession(accountId: string): Promise<{ accountId: string }> {
  const res = await fetch(`${GATEWAY_BASE}/sessions`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ accountId }),
  });
  if (!res.ok) {
    throw new Error(`session bootstrap failed: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<{ accountId: string }>;
}

/**
 * Called once from `main.ts` before the Svelte app mounts. Settles
 * `auth.accountId` synchronously, then awaits the gateway round-trip
 * for the Set-Cookie response. Throws on gateway failure — letting
 * the app crash loudly is better than silently mounting in a half-auth
 * state where every WS upgrade returns 401.
 */
export async function initAuth(): Promise<void> {
  const accountId = loadOrCreateAccountId();
  const accepted = await postSession(accountId);
  auth.accountId = accepted.accountId;
}

/**
 * Revoke the current session server-side and clear the cookie. The
 * accountId stays in localStorage — it's the stable identity, not the
 * credential. A subsequent `initAuth()` mints a fresh session for the
 * same accountId.
 */
export async function logout(): Promise<void> {
  await fetch(`${GATEWAY_BASE}/sessions`, {
    method: 'DELETE',
    credentials: 'include',
  });
  auth.accountId = '';
}
