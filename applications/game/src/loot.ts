// Loot table loader. Source-of-truth is `loot.jsonc`, imported raw
// so authors can annotate drops with `//` comments. Same naive
// stripper as items.ts / monsters.ts.

import type { ItemId } from './items';
import type { MonsterId } from './monsters';

import rawCatalog from './loot.jsonc?raw';

export type LootTable = Record<ItemId, number>;

function stripJsonc(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:"])\/\/.*$/gm, '$1');
}

export const LOOT: Record<MonsterId, LootTable> = JSON.parse(
  stripJsonc(rawCatalog),
);

// Independent-roll model: every entry in the monster's table is
// rolled separately. A kill may drop nothing, one item, or several.
export function rollLoot(monsterId: MonsterId): ItemId[] {
  const table = LOOT[monsterId];
  if (!table) return [];
  const drops: ItemId[] = [];
  for (const itemId of Object.keys(table)) {
    const chance = table[itemId] ?? 0;
    if (Math.random() * 100 < chance) drops.push(itemId);
  }
  return drops;
}
