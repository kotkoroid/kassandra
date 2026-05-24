// Swain orbs: integrate motion, check ally → player hits, expire on
// max range. Ally hits intercept the projectile so a player hiding
// behind Janna still gets blocked.

import { getMonster } from '../monsters.ts';
import { localPlayer } from '../world.ts';
import { applyDamageToEntityRef, applyDamageToPlayer } from '../combat.ts';
import { PROJECTILE_HIT_RADIUS, PROJECTILE_MAX_DISTANCE } from '../constants.ts';
import { grid } from '../spatialGrid.ts';
import type { World } from '../types.ts';

export function tickProjectiles(world: World, dt: number) {
  for (let i = world.projectiles.length - 1; i >= 0; i--) {
    const p = world.projectiles[i];
    if (!p) continue;

    const stepX = p.vx * dt;
    const stepZ = p.vz * dt;
    p.x += stepX;
    p.z += stepZ;
    p.traveled += Math.hypot(stepX, stepZ);

    // Allies first — they intercept by standing between the caster
    // and the player. Grid query replaces the full entity scan:
    // PROJECTILE_HIT_RADIUS is small so at most 1-4 cells are visited.
    let consumed = false;
    for (const t of grid.queryRadius(p.x, p.z, PROJECTILE_HIT_RADIUS)) {
      if (t.kind !== 'janna') continue;
      applyDamageToEntityRef(world, t, p.damage, null);
      world.projectiles.splice(i, 1);
      consumed = true;
      break;
    }
    if (consumed) continue;

    const lp = localPlayer(world);
    if (
      lp.alive &&
      Math.hypot(p.x - lp.x, p.z - lp.z) < PROJECTILE_HIT_RADIUS
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
