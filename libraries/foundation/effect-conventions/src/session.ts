// Server-side session management per OWASP Session Management Cheat Sheet.
//
// Replaces PR-G2's stateless HS256 JWT with opaque session IDs backed
// by a Cloudflare KV namespace. The cookie carries only an opaque
// random identifier; the {accountId, expiresAt} record lives in KV.
//
// Why opaque sessions over JWT-in-cookie:
//   - Revocation is a single KV delete instead of a signing-key
//     rotation or a denylist scan.
//   - The wire never carries account-identifying data (the JWT.sub
//     was on every WS upgrade handshake — now nothing).
//   - Sliding TTL is a single put on each successful upgrade.
//   - Stateful sessions are OWASP's primary recommendation for
//     browser apps; stateless JWTs are an acceptable variant but
//     trade convenience for revocation pain.
//
// Wire shape: the gateway sets a cookie on POST /sessions; the
// browser ships it on every subsequent same-site request (including
// WS upgrades, which is what the realm cares about). Cookie attrs:
//   HttpOnly        — no JS access (XSS-resistant)
//   Secure          — TLS only (omitted in dev; localhost is exempt)
//   SameSite=Strict — closes the CSRF surface, including top-level
//                     cross-site navigation
//   Path=/          — travels to /realms, /sessions
//   Domain=eTLD+1   — shared across api/realm/app subdomains in prod
//   __Secure- pref. — enforces Secure + same-origin on modern browsers
//                     (prod only; the prefix demands Secure)

import type { KVNamespaceClient } from 'alchemy/Cloudflare';
import type { RuntimeContext } from 'alchemy/RuntimeContext';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

// ---------------------------------------------------------------------
// Cookie names
// ---------------------------------------------------------------------

// Prod uses the __Secure- prefix; the prefix REQUIRES Secure=true and
// forbids the cookie over plain http. Dev runs on http://localhost so
// it cannot carry the prefix — `kassandra.sid` is the dev-only name.
// Realm accepts either; gateway picks one based on cookie options.
export const COOKIE_NAME_PROD = '__Secure-kassandra.sid';
export const COOKIE_NAME_DEV = 'kassandra.sid';

// ---------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------

/** 24 h sliding TTL — extended on each successful realm upgrade. */
export const DEFAULT_TTL_SECONDS = 24 * 60 * 60;

// ---------------------------------------------------------------------
// Tagged errors
// ---------------------------------------------------------------------

export class SessionNotFoundError extends Schema.TaggedErrorClass<SessionNotFoundError>()(
  'kassandra/auth/SessionNotFoundError',
  {},
) {}

export class SessionExpiredError extends Schema.TaggedErrorClass<SessionExpiredError>()(
  'kassandra/auth/SessionExpiredError',
  { expiresAt: Schema.Number, now: Schema.Number },
) {}

export class SessionDecodeError extends Schema.TaggedErrorClass<SessionDecodeError>()(
  'kassandra/auth/SessionDecodeError',
  { reason: Schema.String },
) {}

// ---------------------------------------------------------------------
// Session record — sole source of truth that a session is live.
// ---------------------------------------------------------------------

export const SessionRecord = Schema.Struct({
  accountId: Schema.String,
  /** Seconds-since-epoch. */
  createdAt: Schema.Number,
  /** Seconds-since-epoch. Slid on each successful upgrade. */
  expiresAt: Schema.Number,
});
export type SessionRecord = typeof SessionRecord.Type;

const decodeRecord = Schema.decodeUnknownResult(SessionRecord);

// ---------------------------------------------------------------------
// Opaque session ID — 256 bits of crypto-grade entropy, base64url
// without padding (~43 chars). Standard "session token" entropy budget.
// ---------------------------------------------------------------------

const ID_BYTE_LEN = 32;

export const generateSessionId: Effect.Effect<string> = Effect.sync(() => {
  const bytes = new Uint8Array(ID_BYTE_LEN);
  crypto.getRandomValues(bytes);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
});

// ---------------------------------------------------------------------
// Cookie helpers — pure, no IO.
// ---------------------------------------------------------------------

export interface CookieOptions {
  /** `__Secure-` prefix demands true. Set false ONLY in localhost dev. */
  readonly secure: boolean;
  /** Cross-subdomain shared cookie — e.g. `kotkoroid.com`. Omit in dev. */
  readonly domain?: string;
  /** Seconds — mirrors the session record's TTL so the browser drops
   *  the cookie at the same time the KV record expires. */
  readonly maxAge: number;
  /**
   * `Strict` is the CSRF-hardest default and appropriate for prod.
   * Several Chromium versions have quirks attaching Strict cookies
   * to `ws://` upgrades even from same-origin pages — flip to
   * `Lax` in dev if WS upgrades show "timeout waiting for open" /
   * cookie missing. The Origin allow-list still provides the
   * substantive CSRF defense.
   * @default 'Strict'
   */
  readonly sameSite?: 'Strict' | 'Lax' | 'None';
}

export const buildSetCookie = (sid: string, opts: CookieOptions): string => {
  const name = opts.secure ? COOKIE_NAME_PROD : COOKIE_NAME_DEV;
  const sameSite = opts.sameSite ?? 'Strict';
  const parts = [
    `${name}=${sid}`,
    'Path=/',
    'HttpOnly',
    `SameSite=${sameSite}`,
    `Max-Age=${opts.maxAge}`,
  ];
  if (opts.secure) parts.push('Secure');
  if (opts.domain) parts.push(`Domain=${opts.domain}`);
  return parts.join('; ');
};

export const buildClearCookie = (
  opts: Pick<CookieOptions, 'secure' | 'domain' | 'sameSite'>,
): string => {
  const name = opts.secure ? COOKIE_NAME_PROD : COOKIE_NAME_DEV;
  const sameSite = opts.sameSite ?? 'Strict';
  const parts = [`${name}=`, 'Path=/', 'HttpOnly', `SameSite=${sameSite}`, 'Max-Age=0'];
  if (opts.secure) parts.push('Secure');
  if (opts.domain) parts.push(`Domain=${opts.domain}`);
  return parts.join('; ');
};

/**
 * Extract the session ID from a `Cookie` header value. Accepts both
 * the prod and dev names so the realm doesn't need to branch on
 * environment — the gateway sets one, the realm finds whichever is
 * present. Returns null on any malformed / missing input.
 */
export const parseSessionCookie = (headerValue: string | undefined): string | null => {
  if (!headerValue) return null;
  for (const pair of headerValue.split(';')) {
    const eq = pair.indexOf('=');
    if (eq < 0) continue;
    const name = pair.slice(0, eq).trim();
    if (name === COOKIE_NAME_PROD || name === COOKIE_NAME_DEV) {
      const value = pair.slice(eq + 1).trim();
      if (value.length > 0) return value;
    }
  }
  return null;
};

// ---------------------------------------------------------------------
// KV operations — single-namespace, key = `session:<sid>`.
//
// All ops are written against the Alchemy KVNamespaceClient surface so
// gateway and realm consume the same API. Records are JSON-encoded.
// KV's native `expirationTtl` mirrors the application-level expiresAt
// so abandoned sessions get reclaimed without a sweeper job.
// ---------------------------------------------------------------------

const SESSION_KEY_PREFIX = 'session:';
const sessionKey = (sid: string): string => `${SESSION_KEY_PREFIX}${sid}`;

export interface CreateSessionOptions {
  readonly accountId: string;
  /** TTL in seconds. Defaults to {@link DEFAULT_TTL_SECONDS}. */
  readonly ttlSeconds?: number;
}

export interface CreateSessionResult {
  readonly sid: string;
  readonly record: SessionRecord;
}

/**
 * Mint a new session record. Generates the ID, writes the record to
 * KV with a matching native TTL, and returns both so the caller can
 * build the Set-Cookie header without an extra round trip.
 */
export const createSession = (
  kv: KVNamespaceClient,
  opts: CreateSessionOptions,
): Effect.Effect<CreateSessionResult, never, RuntimeContext> =>
  Effect.gen(function* () {
    const sid = yield* generateSessionId;
    const ttl = opts.ttlSeconds ?? DEFAULT_TTL_SECONDS;
    const now = Math.floor(Date.now() / 1000);
    const record: SessionRecord = {
      accountId: opts.accountId,
      createdAt: now,
      expiresAt: now + ttl,
    };
    yield* kv
      .put(sessionKey(sid), JSON.stringify(record), { expirationTtl: ttl })
      .pipe(Effect.orDie);
    return { sid, record };
  });

/**
 * Read + validate a session by its ID. The fast 401 path: any of
 * not-found / decode-failure / expired collapses to a tagged failure;
 * callers `Effect.result` and treat all three as 401.
 */
export const readSession = (
  kv: KVNamespaceClient,
  sid: string,
): Effect.Effect<
  SessionRecord,
  SessionNotFoundError | SessionExpiredError | SessionDecodeError,
  RuntimeContext
> =>
  Effect.gen(function* () {
    const raw = yield* kv.get(sessionKey(sid), 'text').pipe(Effect.orDie);
    if (raw === null) {
      return yield* Effect.fail(new SessionNotFoundError({}));
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (cause) {
      return yield* Effect.fail(
        new SessionDecodeError({ reason: `JSON parse failed: ${String(cause)}` }),
      );
    }
    const result = decodeRecord(parsed);
    if (result._tag === 'Failure') {
      return yield* Effect.fail(
        new SessionDecodeError({ reason: `Schema decode failed: ${String(result.failure)}` }),
      );
    }
    const record = result.success;
    const now = Math.floor(Date.now() / 1000);
    if (record.expiresAt <= now) {
      return yield* Effect.fail(new SessionExpiredError({ expiresAt: record.expiresAt, now }));
    }
    return record;
  });

/**
 * Extend a session by re-writing the record with a fresh expiresAt
 * and a fresh KV native TTL. Idempotent. Cheap. Called on every
 * successful realm upgrade so an active player never sees a timeout.
 */
export const touchSession = (
  kv: KVNamespaceClient,
  sid: string,
  record: SessionRecord,
  ttlSeconds: number = DEFAULT_TTL_SECONDS,
): Effect.Effect<SessionRecord, never, RuntimeContext> =>
  Effect.gen(function* () {
    const now = Math.floor(Date.now() / 1000);
    const renewed: SessionRecord = { ...record, expiresAt: now + ttlSeconds };
    yield* kv
      .put(sessionKey(sid), JSON.stringify(renewed), { expirationTtl: ttlSeconds })
      .pipe(Effect.orDie);
    return renewed;
  });

/** Logout. Idempotent on missing keys. */
export const revokeSession = (
  kv: KVNamespaceClient,
  sid: string,
): Effect.Effect<void, never, RuntimeContext> =>
  kv.delete(sessionKey(sid)).pipe(Effect.orDie);
