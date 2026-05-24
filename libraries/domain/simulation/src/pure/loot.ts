// PR-D3e.3 — pure-core for the loot table roller.
//
// Closes the determinism grep gate: pre-extraction `loot.ts` used
// `Math.random()` directly for both the entry-chance roll and the
// {min, max} count sample, breaking the sim-wide determinism
// guarantee (every other rng-consuming system already routed through
// `world.rng`). This module is the pure twin; callers (combat.ts's
// `onEntityDeath`) supply `rng` from `world.rng.next` at the binding
// point.
//
// `rollLoot` consumption is data-dependent: one rng per table entry
// for the chance roll, plus one more per success iff the entry has a
// {min, max} band. The callable shape preserves this without forcing
// callers to know table internals.

import type { ItemId } from '../items.ts';
import { LOOT, type LootEntry } from '../loot.ts';
import type { MonsterId } from '../monsters.ts';

function entryChance(entry: LootEntry): number {
  return typeof entry === 'number' ? entry : entry.chance;
}

function entryCount(entry: LootEntry, rng: () => number): number {
  if (typeof entry === 'number') return 1;
  if ('count' in entry) return entry.count;
  const span = entry.max - entry.min + 1;
  return entry.min + Math.floor(rng() * span);
}

/**
 * Independent-roll model: every entry in the monster's table is
 * rolled separately. A kill may drop nothing, one item, or several.
 * Stack-count items (e.g. currency) appear as repeated ItemIds in
 * the returned array — the bag/loot UI groups by id at render time.
 */
export function rollLoot(monsterId: MonsterId, rng: () => number): ItemId[] {
  const table = LOOT[monsterId];
  if (!table) return [];
  const drops: ItemId[] = [];
  for (const itemId of Object.keys(table)) {
    const entry = table[itemId]!;
    if (rng() * 100 < entryChance(entry)) {
      const count = entryCount(entry, rng);
      for (let i = 0; i < count; i++) drops.push(itemId);
    }
  }
  return drops;
}
