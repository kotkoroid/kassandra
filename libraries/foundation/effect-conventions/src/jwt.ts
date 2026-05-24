// JWT helper — HS256 sign/verify via Web Crypto SubtleCrypto.
//
// Used by:
//   - orchestrators/gateway — issues JWTs to clients on POST /sessions
//   - services/realm — verifies JWTs on /parties/:id/ws and
//     /profiles/:id/rpc WebSocket upgrades
//   - applications/game (eventually) — could verify locally for UX
//     niceties (expiry countdown), but the realm is the auth boundary
//
// Why hand-rolled instead of a library:
//   - Cloudflare Workers / workerd / modern browsers all expose
//     SubtleCrypto with HMAC-SHA-256. ~80 lines of Effect-wrapping
//     vs. a npm dep + its transitive surface.
//   - One algorithm (HS256) is enough for v1. The signing key lives
//     in a single Worker env binding; both the issuer and the
//     verifier share it.
//
// Wire format: standard JWS compact serialization —
//   `${base64url(header)}.${base64url(payload)}.${base64url(sig)}`
// Header is fixed `{alg: 'HS256', typ: 'JWT'}`.

import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

// ---------------------------------------------------------------------
// Tagged errors
// ---------------------------------------------------------------------

export class JwtMalformedError extends Schema.TaggedErrorClass<JwtMalformedError>()(
  'kassandra/auth/JwtMalformedError',
  { reason: Schema.String },
) {}

export class JwtSignatureError extends Schema.TaggedErrorClass<JwtSignatureError>()(
  'kassandra/auth/JwtSignatureError',
  {},
) {}

export class JwtExpiredError extends Schema.TaggedErrorClass<JwtExpiredError>()(
  'kassandra/auth/JwtExpiredError',
  { exp: Schema.Number, now: Schema.Number },
) {}

// ---------------------------------------------------------------------
// Claims
// ---------------------------------------------------------------------

/**
 * Minimal JWT payload. `sub` carries the accountId; `iat` and `exp`
 * are seconds-since-epoch per RFC 7519.
 */
export const JwtClaims = Schema.Struct({
  sub: Schema.String,
  iat: Schema.Number,
  exp: Schema.Number,
});
export type JwtClaims = typeof JwtClaims.Type;

const decodeClaims = Schema.decodeUnknownResult(JwtClaims);

// ---------------------------------------------------------------------
// Base64url helpers — JWS uses the URL-safe variant without padding.
// ---------------------------------------------------------------------

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

// SubtleCrypto's BufferSource type rejects `Uint8Array<SharedArrayBufferLike>`.
// Copy into a fresh ArrayBuffer-backed Uint8Array so the type
// narrows cleanly without `as` casts.
function intoArrayBuffer(view: Uint8Array): ArrayBuffer {
  const out = new ArrayBuffer(view.byteLength);
  new Uint8Array(out).set(view);
  return out;
}

function bytesToB64Url(bytes: Uint8Array): string {
  // btoa works on binary strings (one char per byte). Build the
  // string manually to avoid TextDecoder("utf-8") interpreting
  // arbitrary bytes as UTF-8 (which can collapse multi-byte runs).
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64UrlToBytes(s: string): Uint8Array {
  // Restore standard base64 (revert URL-safe + repad).
  const padLen = (4 - (s.length % 4)) % 4;
  const std = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(padLen);
  const bin = atob(std);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function strToB64Url(s: string): string {
  return bytesToB64Url(textEncoder.encode(s));
}

function b64UrlToStr(s: string): string {
  return textDecoder.decode(b64UrlToBytes(s));
}

// ---------------------------------------------------------------------
// Key import — cached once per secret per Effect run.
// ---------------------------------------------------------------------

const importKey = (secret: string): Effect.Effect<CryptoKey> =>
  Effect.tryPromise({
    try: () =>
      crypto.subtle.importKey(
        'raw',
        textEncoder.encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign', 'verify'],
      ),
    catch: (cause) => new Error(`HMAC key import failed: ${String(cause)}`),
  }).pipe(Effect.orDie);

// ---------------------------------------------------------------------
// Sign
// ---------------------------------------------------------------------

const HEADER_B64 = strToB64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));

export interface SignOptions {
  readonly secret: string;
  readonly subject: string;
  /** Lifetime in seconds. Default 86400 (24 h). */
  readonly ttlSeconds?: number;
}

export const sign = (opts: SignOptions): Effect.Effect<{ token: string; exp: number }> =>
  Effect.gen(function* () {
    const ttl = opts.ttlSeconds ?? 86400;
    const iat = Math.floor(Date.now() / 1000);
    const exp = iat + ttl;
    const payload: JwtClaims = { sub: opts.subject, iat, exp };
    const payloadB64 = strToB64Url(JSON.stringify(payload));
    const signingInput = `${HEADER_B64}.${payloadB64}`;
    const key = yield* importKey(opts.secret);
    const sigBuf = yield* Effect.promise(() =>
      crypto.subtle.sign('HMAC', key, intoArrayBuffer(textEncoder.encode(signingInput))),
    );
    const sigB64 = bytesToB64Url(new Uint8Array(sigBuf));
    return { token: `${signingInput}.${sigB64}`, exp };
  });

// ---------------------------------------------------------------------
// Verify
// ---------------------------------------------------------------------

export interface VerifyOptions {
  readonly secret: string;
  readonly token: string;
  /** Override the current time (seconds-since-epoch). For tests. */
  readonly nowSeconds?: number;
}

export const verify = (
  opts: VerifyOptions,
): Effect.Effect<JwtClaims, JwtMalformedError | JwtSignatureError | JwtExpiredError> =>
  Effect.gen(function* () {
    const parts = opts.token.split('.');
    if (parts.length !== 3) {
      return yield* Effect.fail(new JwtMalformedError({ reason: 'expected 3 dot-segments' }));
    }
    const [headerB64, payloadB64, sigB64] = parts as [string, string, string];

    // Decode + signature-check happen before payload validation so a
    // tampered token never even reaches Schema decode.
    const key = yield* importKey(opts.secret);
    const signingInput = `${headerB64}.${payloadB64}`;
    const ok = yield* Effect.promise(() =>
      crypto.subtle.verify(
        'HMAC',
        key,
        intoArrayBuffer(b64UrlToBytes(sigB64)),
        intoArrayBuffer(textEncoder.encode(signingInput)),
      ),
    );
    if (!ok) return yield* Effect.fail(new JwtSignatureError({}));

    // Now decode the payload — the signature being valid means we
    // trust the content was issued by our gateway, not that it's
    // well-formed (a future schema change could break old tokens).
    let parsed: unknown;
    try {
      parsed = JSON.parse(b64UrlToStr(payloadB64));
    } catch (cause) {
      return yield* Effect.fail(
        new JwtMalformedError({
          reason: `payload JSON parse failed: ${String(cause)}`,
        }),
      );
    }
    const result = decodeClaims(parsed);
    if (result._tag === 'Failure') {
      return yield* Effect.fail(
        new JwtMalformedError({
          reason: `payload Schema decode failed: ${String(result.failure)}`,
        }),
      );
    }
    const claims = result.success;

    const now = opts.nowSeconds ?? Math.floor(Date.now() / 1000);
    if (claims.exp <= now) {
      return yield* Effect.fail(new JwtExpiredError({ exp: claims.exp, now }));
    }
    return claims;
  });
