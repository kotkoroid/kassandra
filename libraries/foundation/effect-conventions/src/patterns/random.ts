// Pattern: Random / determinism (effect/Random)
// ----------------------------------------------------------------------
//
// Rule (whole-repo from PR-D onward):
//   `Math.random` is BANNED in simulation code. All randomness flows
//   through `effect/Random`, which is a `Context.Reference` — services
//   request randomness from the context, tests seed it deterministically.
//
// What it replaces in Kassandra:
//   - libraries/domain/simulation/src/rng.ts (Mulberry32 closure) →
//     deleted. The `world.rng` field disappears entirely; randomness
//     is no longer state, it's context. On rehydrate from DO storage
//     (PR-E), the saved seed is restored via `Random.withSeed(seed)`
//     at the realm runtime layer.
//
// Useful operators:
//   - `Random.next`             — Effect<number> in [0, 1).
//   - `Random.nextInt`          — Effect<number> across the full int range.
//   - `Random.nextIntBetween(a, b)` — Effect<number> in [a, b).
//   - `Random.nextBetween(a, b)`  — Effect<number> in [a, b].
//   - `Random.nextBoolean`      — Effect<boolean>.
//
// Seeding for tests:
//   `program.pipe(Random.withSeed('test-seed'))` — replaces the runtime
//   Random implementation with a deterministic seeded one for the
//   duration of this program. Per-test seeds give record-and-replay
//   testing for free.

import * as Effect from 'effect/Effect';
import * as Random from 'effect/Random';

// Reference shape: a function that draws a position uniformly in a
// square. Pure in everything except the source of randomness, which
// is in context.
export const spawnPosition = (radius: number) =>
  Effect.gen(function* () {
    const x = yield* Random.nextBetween(-radius, radius);
    const z = yield* Random.nextBetween(-radius, radius);
    return { x, z };
  });

// Reference usage — production code yields straight from Random with
// no extra plumbing. Tests pipe `Random.withSeed('…')` to make the
// draw deterministic.
export const _exampleProductionUse = spawnPosition(50);

export const _exampleSeededUse = spawnPosition(50).pipe(
  Random.withSeed('patterns/Random/spawnPosition/seed-1'),
);
