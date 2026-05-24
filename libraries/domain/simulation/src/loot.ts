import type { ItemId } from './items.ts';
import type { MonsterId } from './monsters.ts';

import catalog from './data/loot.json' with { type: 'json' };

// Each table row is either:
//   - a bare number — drop chance in %, count = 1 on success;
//   - { chance, count }            — fixed count on success;
//   - { chance, min, max }         — count uniformly sampled in
//                                    [min, max] inclusive on success.
export type LootEntry =
  | number
  | { chance: number; count: number }
  | { chance: number; min: number; max: number };

export type LootTable = Record<ItemId, LootEntry>;

export const LOOT: Record<MonsterId, LootTable> = catalog as Record<MonsterId, LootTable>;

// PR-D3e.3: the rng-consuming roller lives in `pure/loot.ts` taking
// `rng: () => number`. Both pre-extraction sites here flowed through
// `Math.random()`, breaking the sim-wide determinism guarantee.
// Callers (combat.ts's `onEntityDeath`) bind `world.rng.next` at the
// usage site, matching the pure-twin convention from PR-D3e.1/.2.
export { rollLoot } from './pure/loot.ts';
export type { ItemId, MonsterId };
