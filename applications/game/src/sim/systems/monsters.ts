// Per-kind AI dispatch. Despawn-by-distance, regen, target picking,
// movement, and attack apply in a uniform shape across every
// entity; the per-kind specifics (melee vs ranged vs ally) live in
// the small handlers below.

import { isInCity } from '../../city';
import { applyDamageToEntity } from '../combat';
import {
  HEAL_CIRCLE_OFFSET_MAX,
  HEAL_CIRCLE_TTL,
  JANNA_HEAL_COOLDOWN,
  PROJECTILE_SPEED,
} from '../constants';
import type { Entity, EntityKind, World } from '../types';
import { isInWaterAt, removeEntity } from '../util';
import { genId } from '../world.svelte';

// Movement / engagement profile for every entity kind. Kept here
// (not on the entity itself) so the same shape applies to every
// instance and a tweak to e.g. wolf speed is a one-line change.
const PROFILE: Record<
  EntityKind,
  { speed: number; attackRange: number; despawnDist: number }
> = {
  'spider-big':    { speed: 2.6, attackRange: 0.6, despawnDist: 40 },
  'spider-medium': { speed: 3.1, attackRange: 0.6, despawnDist: 40 },
  'spider-tiny':   { speed: 3.6, attackRange: 0.6, despawnDist: 40 },
  wolf:            { speed: 3.0, attackRange: 0.9, despawnDist: 40 },
  bear:            { speed: 1.8, attackRange: 0.9, despawnDist: 40 },
  // Ranged / stationary kinds — handled in their own handlers.
  swain:           { speed: 0,   attackRange: 0,   despawnDist: 35 },
  janna:           { speed: 0,   attackRange: 0,   despawnDist: 35 },
  // Troller pipeline runs in sim/systems/death.ts.
  troller:         { speed: 0,   attackRange: 0,   despawnDist: Infinity },
};

export function tickMonsters(world: World, dt: number) {
  // Iterate in reverse because handlers may splice.
  for (let i = world.entities.length - 1; i >= 0; i--) {
    const e = world.entities[i];
    if (!e) continue;
    if (e.kind === 'troller') continue;

    const profile = PROFILE[e.kind];

    // Despawn if wandered too far from the player.
    if (
      Math.hypot(e.x - world.player.x, e.z - world.player.z) >
      profile.despawnDist
    ) {
      removeEntity(world, i);
      continue;
    }

    // Passive regen toward each entity's locked-in max hp.
    if (e.hp < e.maxHp && e.healthRegen > 0) {
      e.hp = Math.min(e.maxHp, e.hp + e.healthRegen * dt);
    }

    switch (e.kind) {
      case 'spider-big':
      case 'spider-medium':
      case 'spider-tiny':
      case 'wolf':
      case 'bear':
        tickMelee(world, e, profile.speed, profile.attackRange, dt);
        break;
      case 'swain':
        tickSwain(world, e, dt);
        break;
      case 'janna':
        tickJanna(world, e, dt);
        break;
    }
  }
}

// Walk-toward-and-bite behaviour shared by every melee kind. Picks
// the nearest reachable target (player or Janna), respects the
// water + city no-go zones, and applies damage on contact.
function tickMelee(
  world: World,
  e: Entity,
  speed: number,
  attackRange: number,
  dt: number,
) {
  let bestX = 0;
  let bestZ = 0;
  let bestDist = Infinity;
  let bestEntityIndex = -1;
  let targetIsPlayer = false;

  // Player as candidate target. Water and the city both protect
  // them from melee aggro.
  const p = world.player;
  if (
    world.death.alive &&
    !isInWaterAt(p.x, p.z) &&
    !isInCity(p.x, p.z)
  ) {
    bestDist = Math.hypot(e.x - p.x, e.z - p.z);
    bestX = p.x;
    bestZ = p.z;
    targetIsPlayer = true;
  }

  // Janna as candidate target. Only one Janna at a time today, but
  // iterating handles multi-ally cleanly.
  for (let j = 0; j < world.entities.length; j++) {
    const t = world.entities[j];
    if (!t || t.kind !== 'janna') continue;
    if (isInWaterAt(t.x, t.z)) continue;
    const d = Math.hypot(e.x - t.x, e.z - t.z);
    if (d < bestDist) {
      bestDist = d;
      bestX = t.x;
      bestZ = t.z;
      bestEntityIndex = j;
      targetIsPlayer = false;
    }
  }

  if (bestDist === Infinity) {
    // No reachable target — wind down the attack timer so the first
    // contact after re-engage isn't free.
    e.attackCooldown = Math.max(0, e.attackCooldown - dt);
    return;
  }

  const dx = bestX - e.x;
  const dz = bestZ - e.z;
  const norm = Math.max(bestDist, 0.0001);
  const step = speed * dt;
  if (bestDist > attackRange) {
    const newX = e.x + (dx / norm) * step;
    const newZ = e.z + (dz / norm) * step;
    if (!isInWaterAt(newX, newZ) && !isInCity(newX, newZ)) {
      e.x = newX;
      e.z = newZ;
    }
  }
  e.rotation = Math.atan2(dx, dz);

  e.attackCooldown -= dt;
  if (bestDist <= attackRange && e.attackCooldown <= 0) {
    e.attackCooldown = 1 / Math.max(e.attackSpeed, 0.0001);
    if (targetIsPlayer) {
      world.player.health = Math.max(0, world.player.health - e.damage);
    } else if (bestEntityIndex >= 0) {
      applyDamageToEntity(world, bestEntityIndex, e.damage, false);
    }
  }
}

// Stationary ranged caster. Faces the player while engaged, fires
// projectiles on attack-speed cadence. The city shields the player
// here too — no targeting, no rotation tracking.
function tickSwain(world: World, e: Entity, dt: number) {
  const toPlayerX = world.player.x - e.x;
  const toPlayerZ = world.player.z - e.z;

  if (!world.death.alive || isInCity(world.player.x, world.player.z)) {
    // Freeze rotation alongside the fire gate so it doesn't keep
    // staring at the city wall.
    return;
  }

  e.rotation = Math.atan2(-toPlayerX, -toPlayerZ);

  e.attackCooldown -= dt;
  if (e.attackCooldown <= 0) {
    e.attackCooldown = 1 / Math.max(e.attackSpeed, 0.0001);
    const dist = Math.hypot(toPlayerX, toPlayerZ);
    const norm = Math.max(dist, 0.001);
    world.projectiles.push({
      id: genId(world, 'p'),
      ownerId: e.id,
      x: e.x,
      z: e.z,
      vx: (toPlayerX / norm) * PROJECTILE_SPEED,
      vz: (toPlayerZ / norm) * PROJECTILE_SPEED,
      traveled: 0,
      damage: e.damage,
    });
  }
}

// Janna stands still, faces the player, and periodically drops a
// healing circle somewhere near herself. The circle's actual
// effect lives in sim/systems/healingCircles.ts.
function tickJanna(world: World, e: Entity, dt: number) {
  const toPlayerX = world.player.x - e.x;
  const toPlayerZ = world.player.z - e.z;
  e.rotation = Math.atan2(-toPlayerX, -toPlayerZ);

  const cooldown = (e.healCooldown ?? 0) - dt;
  if (cooldown <= 0) {
    e.healCooldown = JANNA_HEAL_COOLDOWN;
    const angle = world.rng.next() * Math.PI * 2;
    const offset = world.rng.next() * HEAL_CIRCLE_OFFSET_MAX;
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
