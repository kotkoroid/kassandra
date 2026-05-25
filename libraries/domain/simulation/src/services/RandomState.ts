// PR-D3e.3 — Mulberry32-backed `effect/Random` Reference + seed
// accessor for persistence.
//
// Master plan principle 8 ("effect/Random only") lands here.
// Previously the seeded PRNG lived on `world.rng` as a closure-based
// Rng struct. That coupling forced every sim system to read rng off
// the world, made the rng "hidden state" inside the sync impls, and
// confused property-replay tests (the seed travelled inside the
// world data instead of being a separately-replayable component).
//
// New shape:
//   - `effect/Random.Random` Reference provides `nextIntUnsafe` /
//     `nextDoubleUnsafe` to every Effect-yielding code path.
//   - `RandomState` service exposes `getSeed()` for save/restore.
//   - Both are backed by ONE shared mutable Mulberry32 state — the
//     Random Reference advances the same `s` that getSeed() reads.
//   - `makeRandomLayer(seed)` returns a Layer that provides both,
//     seeded from `seed`. RealmRoom calls this with the persisted
//     seed at boot and reads getSeed() at save time.
//
// The Mulberry32 algorithm matches what used to live in `rng.ts` —
// existing saved worlds with `rngSeed: N` replay byte-identically.

import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Random from 'effect/Random';

export interface RandomStateShape {
  /** Current Mulberry32 state. Persisted to DO storage on save. */
  readonly getSeed: () => number;
  /**
   * Sync rng callable shared with the `effect/Random.Random` Reference.
   * Used to bind `world.rng` at RealmRoom boot so sync sim impls and
   * Effect-yielding sites advance the same stream.
   */
  readonly next: () => number;
}

export class RandomState extends Context.Service<RandomState, RandomStateShape>()(
  'kassandra/sim/RandomState',
) {}

/**
 * Build a Mulberry32-backed Layer providing `effect/Random.Random`
 * and `RandomState`. Both bindings share a single mutable `s` so
 * `getSeed()` always reflects the live state.
 */
export const makeRandomLayer = (initialSeed: number): Layer.Layer<RandomState> => {
  let s = initialSeed >>> 0;
  const advance = (): number => {
    s = (s + 0x6d2b79f5) | 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  };
  const next = () => advance() / 4294967296;
  const impl = {
    // 32-bit signed int; matches the existing Mulberry32 mapping
    // (uint32 → int32 by truncation). nextDoubleUnsafe divides the
    // uint32 by 2^32 to land in [0, 1).
    nextIntUnsafe: () => advance() | 0,
    nextDoubleUnsafe: next,
  };
  const RandomLayer = Layer.succeed(Random.Random)(impl);
  const RandomStateLayer = Layer.succeed(RandomState)({ getSeed: () => s, next });
  return Layer.merge(RandomLayer, RandomStateLayer);
};

/**
 * Helper for sync impls: yields a `rng: () => number` callable
 * bound to the fiber's `Random.Random` reference. Use inside a
 * service's tick method to pass rng down to the pure inner core:
 *
 *   tick: (world, dt) => Effect.gen(function*() {
 *     const rng = yield* makeRngCallable;
 *     tickDeathImpl(world, dt, rng);
 *   })
 */
export const makeRngCallable: Effect.Effect<() => number> = Effect.withFiber((fiber) => {
  const random = fiber.getRef(Random.Random);
  return Effect.succeed(() => random.nextDoubleUnsafe());
});
