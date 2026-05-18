// Swain orbs: integrate motion, check ally → player hits, expire on
// max range. Ally hits intercept the projectile so a player hiding
// behind Janna still gets blocked.

import { getMonster } from '../../monsters';
import { applyDamageToEntity, applyDamageToPlayer } from '../combat';
import {
  PROJECTILE_HIT_RADIUS,
  PROJECTILE_MAX_DISTANCE,
} from '../constants';
import type { World } from '../types';

export function tickProjectiles(world: World, dt: number) {
  for (let i = world.projectiles.length - 1; i >= 0; i--) {
    const p = world.projectiles[i];
    if (!p) continue;

    const stepX = p.vx * dt;
    const stepZ = p.vz * dt;
    p.x += stepX;
    p.z += stepZ;
    p.traveled += Math.hypot(stepX, stepZ);

    // Allies first — they intercept by standing between Swain and
    // the player. Iterate backward because applyDamageToEntity may
    // splice the entity on death.
    let consumed = false;
    for (let j = world.entities.length - 1; j >= 0; j--) {
      const t = world.entities[j];
      if (!t || t.kind !== 'janna') continue;
      if (Math.hypot(p.x - t.x, p.z - t.z) < PROJECTILE_HIT_RADIUS) {
        applyDamageToEntity(world, j, p.damage, false);
        world.projectiles.splice(i, 1);
        consumed = true;
        break;
      }
    }
    if (consumed) continue;

    if (
      world.death.alive &&
      Math.hypot(p.x - world.player.x, p.z - world.player.z) <
        PROJECTILE_HIT_RADIUS
    ) {
      applyDamageToPlayer(world, p.damage, {
        monsterId: p.ownerMonsterId,
        name: getMonster(p.ownerMonsterId).name,
      });
      world.projectiles.splice(i, 1);
      continue;
    }

    if (p.traveled >= PROJECTILE_MAX_DISTANCE) {
      world.projectiles.splice(i, 1);
    }
  }
}
