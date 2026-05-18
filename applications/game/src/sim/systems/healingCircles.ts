// Janna's heal-circle auras: tick TTL, heal the player while inside.

import {
  HEAL_CIRCLE_RADIUS,
  HEAL_CIRCLE_RATE,
  PLAYER_MAX_HP,
} from '../constants';
import type { World } from '../types';

export function tickHealingCircles(world: World, dt: number) {
  const p = world.player;
  for (let i = world.healingCircles.length - 1; i >= 0; i--) {
    const c = world.healingCircles[i];
    if (!c) continue;
    c.ttl -= dt;
    if (c.ttl <= 0) {
      world.healingCircles.splice(i, 1);
      continue;
    }
    if (!world.death.alive) continue;
    if (
      Math.hypot(c.x - p.x, c.z - p.z) < HEAL_CIRCLE_RADIUS &&
      p.health < PLAYER_MAX_HP
    ) {
      p.health = Math.min(PLAYER_MAX_HP, p.health + HEAL_CIRCLE_RATE * dt);
    }
  }
}
