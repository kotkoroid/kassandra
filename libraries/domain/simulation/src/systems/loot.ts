// World loot-bag bookkeeping: tick the TTL on every bag, despawn
// expired ones, and auto-pick-up each player's death-bag on
// proximity (granting the XP-recovery slice). Kill-loot bags stay
// in place until they expire — the player inspects them by clicking
// on the world model; inventory pickup isn't wired yet.

import { grantExperience } from '../combat.ts';
import { BAG_PICKUP_RADIUS, BAG_XP_RECOVERY } from '../constants.ts';
import type { World } from '../types.ts';

export function tickLootBags(world: World, dt: number) {
  for (let i = world.lootBags.length - 1; i >= 0; i--) {
    const b = world.lootBags[i];
    if (!b) continue;
    b.ttl -= dt;
    if (b.ttl <= 0) {
      // Bag expired in the world. If it was a player's death bag,
      // the bug pointer has nothing left to point at — drop it on
      // that player.
      if (b.isDeathBag && b.forPlayerId !== undefined) {
        const owner = world.players[b.forPlayerId];
        if (owner) owner.bug = null;
      }
      world.lootBags.splice(i, 1);
      continue;
    }

    // Auto-pickup applies only to a player walking onto their own
    // death bag — kill-loot stays until inventory lands.
    if (!b.isDeathBag) continue;
    if (b.forPlayerId === undefined) continue;
    const owner = world.players[b.forPlayerId];
    if (!owner || !owner.alive) continue;
    if (Math.hypot(b.x - owner.x, b.z - owner.z) < BAG_PICKUP_RADIUS) {
      grantExperience(world, b.forPlayerId, Math.round(b.bagXp * BAG_XP_RECOVERY));
      world.lootBags.splice(i, 1);
      owner.bug = null;
    }
  }
}
