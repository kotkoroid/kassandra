// Deterministic PRNG. Mulberry32 is fast, has decent statistical
// properties for game-feel randomness (mob spawn angles, loot rolls,
// AI staggering), and seeds cleanly to 32 bits so save/replay can
// reproduce a run.
//
// `world.rng` is the single instance used by every sim system —
// `Math.random()` is forbidden inside `sim/`.

export interface Rng {
  // Internal state, exposed so saves can round-trip the seed.
  seed: number;
  next(): number;
  // Inclusive lower bound, exclusive upper bound, like Math.random
  // scaled to a range.
  range(min: number, max: number): number;
  pick<T>(items: readonly T[]): T;
  intInclusive(min: number, max: number): number;
}

export function createRng(seed: number): Rng {
  // Mulberry32. Keep state inside the closure so each Rng is its
  // own deterministic stream.
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    get seed() {
      return s;
    },
    set seed(value: number) {
      s = value >>> 0;
    },
    next,
    range: (min, max) => min + (max - min) * next(),
    pick: (items) => items[Math.floor(next() * items.length)]!,
    intInclusive: (min, max) =>
      min + Math.floor(next() * (max - min + 1)),
  };
}
