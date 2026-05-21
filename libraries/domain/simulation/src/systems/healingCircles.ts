// Janna's heal-circle auras: tick TTL, heal the player while inside.

import { HEAL_CIRCLE_RADIUS, HEAL_CIRCLE_RATE } from '../constants.ts';
import { getEffectiveStat } from '../stats.ts';
import type { World } from '../types.ts';
import { localPlayer } from '../world.ts';

export function tickHealingCircles(world: World, dt: number) {
  const p = localPlayer(world);
  for (let i = world.healingCircles.length - 1; i >= 0; i--) {
    const c = world.healingCircles[i];
    if (!c) continue;
    c.ttl -= dt;
    if (c.ttl <= 0) {
      world.healingCircles.splice(i, 1);
      continue;
    }
    if (!world.death.alive) continue;
    const maxHp = getEffectiveStat(p, 'maxHealth');
    if (Math.hypot(c.x - p.x, c.z - p.z) < HEAL_CIRCLE_RADIUS && p.health < maxHp) {
      p.health = Math.min(maxHp, p.health + HEAL_CIRCLE_RATE * dt);
    }
  }
}
