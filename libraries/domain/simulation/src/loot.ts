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

function entryChance(entry: LootEntry): number {
  return typeof entry === 'number' ? entry : entry.chance;
}

function entryCount(entry: LootEntry): number {
  if (typeof entry === 'number') return 1;
  if ('count' in entry) return entry.count;
  const span = entry.max - entry.min + 1;
  return entry.min + Math.floor(Math.random() * span);
}

// Independent-roll model: every entry in the monster's table is
// rolled separately. A kill may drop nothing, one item, or several.
// Stack-count items (e.g. currency) appear as repeated ItemIds in
// the returned array — the bag/loot UI groups by id at render time.
export function rollLoot(monsterId: MonsterId): ItemId[] {
  const table = LOOT[monsterId];
  if (!table) return [];
  const drops: ItemId[] = [];
  for (const itemId of Object.keys(table)) {
    const entry = table[itemId]!;
    if (Math.random() * 100 < entryChance(entry)) {
      const count = entryCount(entry);
      for (let i = 0; i < count; i++) drops.push(itemId);
    }
  }
  return drops;
}
