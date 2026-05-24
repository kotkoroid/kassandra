// JWT round-trip tests. The helper uses Web Crypto SubtleCrypto so
// the test runner needs a real crypto.subtle — the Chromium browser
// mode the simulation project uses serves the same role here.

import { describe, expect, it } from '@effect/vitest';
import { Effect, Exit } from 'effect';
import {
  JwtExpiredError,
  JwtMalformedError,
  JwtSignatureError,
  sign,
  verify,
} from './jwt.ts';

const SECRET = 'test-secret-do-not-use-in-prod';
const OTHER_SECRET = 'a-different-secret';

describe('jwt', () => {
  it.effect('sign + verify round-trips claims', () =>
    Effect.gen(function* () {
      const { token, exp } = yield* sign({
        secret: SECRET,
        subject: 'account-123',
        ttlSeconds: 3600,
      });
      expect(token.split('.').length).toBe(3);
      const claims = yield* verify({ secret: SECRET, token });
      expect(claims.sub).toBe('account-123');
      expect(claims.exp).toBe(exp);
      expect(claims.iat).toBeLessThan(claims.exp);
    }),
  );

  it.effect('verify with wrong secret raises JwtSignatureError', () =>
    Effect.gen(function* () {
      const { token } = yield* sign({ secret: SECRET, subject: 'a' });
      const exit = yield* Effect.exit(verify({ secret: OTHER_SECRET, token }));
      expect(Exit.isFailure(exit)).toBe(true);
      if (Exit.isFailure(exit)) {
        // Effect 4.0: Cause is flat with `reasons: ReadonlyArray<Reason>`.
        // For a single Effect.fail there's exactly one Fail reason.
        const reason = exit.cause.reasons[0];
        const err = reason && reason._tag === 'Fail' ? reason.error : null;
        expect(err).toBeInstanceOf(JwtSignatureError);
      }
    }),
  );

  it.effect('verify rejects a tampered payload', () =>
    Effect.gen(function* () {
      const { token } = yield* sign({ secret: SECRET, subject: 'orig' });
      const [h, p, s] = token.split('.') as [string, string, string];
      const tampered = `${h}.${p.replace(/.$/, (c) => (c === 'a' ? 'b' : 'a'))}.${s}`;
      const exit = yield* Effect.exit(verify({ secret: SECRET, token: tampered }));
      expect(Exit.isFailure(exit)).toBe(true);
      if (Exit.isFailure(exit)) {
        // Effect 4.0: Cause is flat with `reasons: ReadonlyArray<Reason>`.
        // For a single Effect.fail there's exactly one Fail reason.
        const reason = exit.cause.reasons[0];
        const err = reason && reason._tag === 'Fail' ? reason.error : null;
        expect(err).toBeInstanceOf(JwtSignatureError);
      }
    }),
  );

  it.effect('verify rejects an expired token', () =>
    Effect.gen(function* () {
      const { token, exp } = yield* sign({
        secret: SECRET,
        subject: 'a',
        ttlSeconds: 60,
      });
      const exit = yield* Effect.exit(
        verify({ secret: SECRET, token, nowSeconds: exp + 120 }),
      );
      expect(Exit.isFailure(exit)).toBe(true);
      if (Exit.isFailure(exit)) {
        // Effect 4.0: Cause is flat with `reasons: ReadonlyArray<Reason>`.
        // For a single Effect.fail there's exactly one Fail reason.
        const reason = exit.cause.reasons[0];
        const err = reason && reason._tag === 'Fail' ? reason.error : null;
        expect(err).toBeInstanceOf(JwtExpiredError);
      }
    }),
  );

  it.effect('verify rejects a token with the wrong segment count', () =>
    Effect.gen(function* () {
      const exit = yield* Effect.exit(
        verify({ secret: SECRET, token: 'not-a-jwt' }),
      );
      expect(Exit.isFailure(exit)).toBe(true);
      if (Exit.isFailure(exit)) {
        // Effect 4.0: Cause is flat with `reasons: ReadonlyArray<Reason>`.
        // For a single Effect.fail there's exactly one Fail reason.
        const reason = exit.cause.reasons[0];
        const err = reason && reason._tag === 'Fail' ? reason.error : null;
        expect(err).toBeInstanceOf(JwtMalformedError);
      }
    }),
  );
});
