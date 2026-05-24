// PR-D3e.2 — pure-core extraction for the monsters system.
//
// Only `tickJanna` consumes rng in `systems/monsters.ts` (heal-circle
// drop angle + offset). The rest of the monster AI (melee, ranged
// projectiles, target picking) is rng-free and stays in
// `systems/monsters.ts`. Symmetric with pure/death.ts.

import { HEAL_CIRCLE_OFFSET_MAX, HEAL_CIRCLE_TTL, JANNA_HEAL_COOLDOWN } from '../constants.ts';
import type { Entity, World } from '../types.ts';
import { genId, localPlayer } from '../world.ts';

/**
 * Per-janna heal-circle cadence. The janna entity always rotates to
 * face the player, then drops a healing circle near herself when her
 * cooldown expires.
 *
 * Rng consumption: two calls iff the cooldown expired this tick
 * (angle for placement direction + offset for placement distance).
 * No rng on the common path (cooldown still running).
 */
export function tickJanna(world: World, e: Entity, dt: number, rng: () => number) {
  const jannaPlayer = localPlayer(world);
  const toPlayerX = jannaPlayer.x - e.x;
  const toPlayerZ = jannaPlayer.z - e.z;
  e.rotation = Math.atan2(-toPlayerX, -toPlayerZ);

  const cooldown = (e.healCooldown ?? 0) - dt;
  if (cooldown <= 0) {
    e.healCooldown = JANNA_HEAL_COOLDOWN;
    const angle = rng() * Math.PI * 2;
    const offset = rng() * HEAL_CIRCLE_OFFSET_MAX;
    world.healingCircles.push({
      id: genId(world, 'c'),
      ownerId: e.id,
      x: e.x + Math.cos(angle) * offset,
      z: e.z + Math.sin(angle) * offset,
      ttl: HEAL_CIRCLE_TTL,
    });
  } else {
    e.healCooldown = cooldown;
  }
}
