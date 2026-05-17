// Player inventory ("bag"). Keyed by ItemId so stacking is a single
// counter increment regardless of how many of an item drop. No
// retrieval UI yet — kill handlers push into this, nothing reads.

import type { ItemId } from './items';

// Object-as-map: $state proxy makes per-key writes reactive without
// needing a Map wrapper. The HUD will read this once we wire it.
export const bag = $state<Record<ItemId, number>>({});

export function addToBag(itemId: ItemId, count = 1) {
  bag[itemId] = (bag[itemId] ?? 0) + count;
}
