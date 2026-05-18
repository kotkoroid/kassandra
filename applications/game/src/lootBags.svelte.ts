// World loot bags dropped by slain monsters. Distinct from the
// player's death bag in death.svelte.ts — those carry held XP after
// the player dies, these carry the monster's drop-table roll. Both
// use the same per-frame `ttl` countdown so they read consistently.

import type { ItemId } from './items';
import { player } from './state.svelte';

export interface LootBagItem {
  // Display name of the player the item is allocated to. Stamped at
  // drop time so a later character rename doesn't retroactively
  // reassign ownership. Multiplayer will eventually mix owners
  // inside a single bag; for now every entry resolves to the local
  // player.
  owner: string;
  itemId: ItemId;
}

export interface WorldLootBag {
  id: string;
  x: number;
  z: number;
  // One entry per dropped item. The inspect panel groups them by
  // owner first, then collapses duplicates within each group.
  items: LootBagItem[];
  // Seconds remaining before the bag despawns. Counted down each
  // frame in scene/LootBags.svelte.
  ttl: number;
}

export const lootBags = $state<WorldLootBag[]>([]);

// Currently-open inspect panel target. The HUD renders the panel
// when this is set; clicking a bag in the world assigns it, the
// panel's close button or backdrop clears it.
export const lootBagOpen = $state<{ value: WorldLootBag | null }>({
  value: null,
});

// Three real minutes per spec. Matches the death bag's countdown
// mechanism (ttl ticked once per frame), with a tighter window.
export const LOOT_BAG_TTL = 3 * 60;

let nextId = 1;

export function spawnLootBag(x: number, z: number, items: ItemId[]) {
  if (items.length === 0) return;
  // Stamp every dropped item with the current player. Multiplayer
  // will replace this with a real allocation rule (e.g. round-robin
  // or contribution-weighted), but the shape stays the same.
  const owner = player.name;
  lootBags.push({
    id: `lb${nextId++}`,
    x,
    z,
    items: items.map((itemId) => ({ owner, itemId })),
    ttl: LOOT_BAG_TTL,
  });
}
