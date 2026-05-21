// World loot-bag bookkeeping: tick the TTL on every bag, despawn
// expired ones, and auto-pick-up the player's death-bag on
// proximity (granting the XP-recovery slice). Kill-loot bags stay
// in place until they expire — the player inspects them by clicking
// on the world model; inventory pickup isn't wired yet.

import { grantExperience } from '../combat.ts';
import { BAG_PICKUP_RADIUS, BAG_XP_RECOVERY } from '../constants.ts';
import type { World } from '../types.ts';
import { localPlayer } from '../world.ts';

export function tickLootBags(world: World, dt: number) {
  const p = localPlayer(world);
  for (let i = world.lootBags.length - 1; i >= 0; i--) {
    const b = world.lootBags[i];
    if (!b) continue;
    b.ttl -= dt;
    if (b.ttl <= 0) {
      // Bag expired in the world. If it was the player's death bag
      // the indicator bug has nothing left to point at — drop it
      // alongside.
      if (b.isDeathBag) world.death.bug = null;
      world.lootBags.splice(i, 1);
      continue;
    }

    // Auto-pickup applies only to the player's death bag — walking
    // back to your corpse reclaims XP. Kill-loot stays in place
    // until inventory lands; click-to-inspect is handled in the UI.
    if (!world.death.alive) continue;
    if (!b.isDeathBag) continue;
    if (Math.hypot(b.x - p.x, b.z - p.z) < BAG_PICKUP_RADIUS) {
      grantExperience(world, Math.round(b.bagXp * BAG_XP_RECOVERY));
      world.lootBags.splice(i, 1);
      world.death.bug = null;
    }
  }
}
