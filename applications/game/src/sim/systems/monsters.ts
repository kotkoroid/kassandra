// Per-kind AI dispatch. Regen, target picking, movement, and attack
// apply in a uniform shape across every entity; the per-kind
// specifics (melee vs ranged vs ally) live in the small handlers
// below. Distance-based despawn is intentionally gone — entities
// are pinned to fixed spawn points, so they persist wherever the
// catalog placed them regardless of where the player roams.

import { isInCity } from '../../city';
import { getMonster } from '../../monsters';
import { applyDamageToEntityRef, applyDamageToPlayer } from '../combat';
import {
  HEAL_CIRCLE_OFFSET_MAX,
  HEAL_CIRCLE_TTL,
  JANNA_HEAL_COOLDOWN,
  PROJECTILE_SPEED,
} from '../constants';
import type { Entity, EntityKind, World } from '../types';
import { isInWaterAt } from '../util';
import { genId } from '../world.svelte';

// Movement / engagement profile for every entity kind. Kept here
// (not on the entity itself) so the same shape applies to every
// instance and a tweak to e.g. wolf speed is a one-line change.
const PROFILE: Record<EntityKind, { speed: number; attackRange: number }> = {
  'spider-big':    { speed: 2.6, attackRange: 0.6 },
  'spider-medium': { speed: 3.1, attackRange: 0.6 },
  'spider-tiny':   { speed: 3.6, attackRange: 0.6 },
  wolf:            { speed: 3.0, attackRange: 0.9 },
  bear:            { speed: 1.8, attackRange: 0.9 },
  warmaiden:       { speed: 2.4, attackRange: 0.9 },
  shadowmaiden:    { speed: 2.1, attackRange: 1.0 },
  // Ranged / stationary kinds — handled in their own handlers.
  swain:           { speed: 0, attackRange: 0 },
  bowmaiden:       { speed: 0, attackRange: 0 },
  spellmaiden:     { speed: 0, attackRange: 0 },
  janna:           { speed: 0, attackRange: 0 },
  azir:            { speed: 0, attackRange: 0 },
  // Troller pipeline runs in sim/systems/death.ts.
  troller:         { speed: 0, attackRange: 0 },
};

export function tickMonsters(world: World, dt: number) {
  // Pre-find the single Janna so tickMelee doesn't scan O(N) entities
  // per melee entity per tick (was O(N²) across the whole monster loop).
  const janna = world.entities.find(e => e.kind === 'janna') ?? null;

  // Iterate in reverse because handlers may splice.
  for (let i = world.entities.length - 1; i >= 0; i--) {
    const e = world.entities[i];
    if (!e) continue;
    if (e.kind === 'troller') continue;

    const profile = PROFILE[e.kind];

    // Passive regen toward each entity's locked-in max hp.
    if (e.hp < e.maxHp && e.healthRegen > 0) {
      e.hp = Math.min(e.maxHp, e.hp + e.healthRegen * dt);
    }

    // Stunned entities skip their AI entirely.
    if ((e.stunnedUntil ?? 0) > world.time) continue;

    switch (e.kind) {
      case 'spider-big':
      case 'spider-medium':
      case 'spider-tiny':
      case 'wolf':
      case 'bear':
      case 'warmaiden':
      case 'shadowmaiden':
        tickMelee(world, e, profile.speed, profile.attackRange, dt, janna);
        break;
      case 'swain':
      case 'bowmaiden':
      case 'spellmaiden':
        // Same stationary-ranged AI for the whole ranged roster;
        // the projectile renderer paints orbs / arrows / motes
        // differently per `ownerMonsterId`.
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
// janna is pre-found once in tickMonsters to avoid an O(N) scan here.
function tickMelee(
  world: World,
  e: Entity,
  speed: number,
  attackRange: number,
  dt: number,
  janna: Entity | null,
) {
  let bestX = 0;
  let bestZ = 0;
  let bestDist = Infinity;
  let bestEntity: Entity | null = null;
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

  // Janna as candidate target — passed in so we don't scan O(N) here.
  if (janna && !isInWaterAt(janna.x, janna.z)) {
    const d = Math.hypot(e.x - janna.x, e.z - janna.z);
    if (d < bestDist) {
      bestDist = d;
      bestX = janna.x;
      bestZ = janna.z;
      bestEntity = janna;
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
  const slowMul = (e.slowedUntil ?? 0) > world.time ? 0.5 : 1;
  const step = speed * slowMul * dt;
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
      applyDamageToPlayer(world, e.damage, {
        monsterId: e.monsterId,
        name: getMonster(e.monsterId).name,
      });
    } else if (bestEntity) {
      applyDamageToEntityRef(world, bestEntity, e.damage, false);
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
      ownerMonsterId: e.monsterId,
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
