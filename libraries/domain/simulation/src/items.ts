import catalog from './data/items.json' with { type: 'json' };

export type ItemType = 'WEAPON' | 'CURRENCY';
export type ItemSubtype = 'SWORD' | 'COIN';

export interface ItemAttributes {
  damage: number;
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

export const ITEMS: Record<ItemId, Item> = catalog as Record<ItemId, Item>;

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
