// Item catalog loader. The source-of-truth is `items.jsonc`, imported
// as raw text so authors can keep `//` comments next to each entry.
// A small stripper removes line + block comments before JSON.parse.

import rawCatalog from './data/items.jsonc?raw';

export type ItemType = 'WEAPON' | 'CURRENCY';
export type ItemSubtype = 'SWORD' | 'COIN';

export interface ItemAttributes {
  // Flat damage added to the wielder's base damage on each hit.
  damage: number;
  // Flat attack speed (hits/sec) added on top of base attack speed.
  attackSpeed: number;
}

export interface Item {
  name: string;
  type: ItemType;
  subtype: ItemSubtype;
  level: number;
  attributes: ItemAttributes;
}

export type ItemId = string;

function stripJsonc(text: string): string {
  // Block comments first, then line comments, then trailing commas
  // (the formatter likes them; JSON.parse doesn't). The data file has
  // no strings containing `//` or `/*`, so the naive regex is safe.
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:"])\/\/.*$/gm, '$1')
    .replace(/,(\s*[}\]])/g, '$1');
}

export const ITEMS: Record<ItemId, Item> = JSON.parse(stripJsonc(rawCatalog));

// Player starts with the wooden sword equipped.
export const STARTING_WEAPON_ID: ItemId = 'ITEM000002';

// Currency item id. Lars are the in-world coins that drop from
// every kill. Stored as repeated entries in `world.player.bag` so
// the existing stack-by-id grouping in BagPanel/LootBagPanel
// renders the running total automatically.
export const LARS_ID: ItemId = 'ITEM000001';

export function getItem(id: ItemId): Item | undefined {
  return ITEMS[id];
}
