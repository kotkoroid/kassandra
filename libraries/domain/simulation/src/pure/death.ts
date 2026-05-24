// PR-D3e.1 — pure-core extraction for the death pipeline.
//
// Each helper in `systems/death.ts` that previously called
// `world.rng.next()` has a pure twin here. The twin takes a
// `rng: () => number` callable parameter so the function's rng
// dependency is explicit in its type signature — tests can inject a
// fixed-sequence callable and get deterministic mutation.
//
// "Pure" in this codebase means: no hidden dependency on `world.rng`,
// no I/O, no `Math.random`. Mutation of the passed `world` argument
// is allowed (the sim uses an in-place style for performance — every
// system mutates the world in place rather than allocating a new
// snapshot per tick).
//
// rngFloat semantics: every callable invocation returns a fresh value
// in [0, 1) — the same contract `Mulberry32.next()` and
// `effect/Random.nextDoubleUnsafe()` honour. Conditional consumption
// (e.g. `tickTroller` only pulls on the collect→leave transition)
// is preserved so this PR doesn't shift the rng-stream consumption
// pattern of existing saved worlds.

import { CITY_X, CITY_Z } from '../city.ts';
import { dropPlayerDeathBag } from '../combat.ts';
import {
  BASE_ATTACK_SPEED,
  BASE_DAMAGE,
  BASE_HEALTH_REGEN,
  BUG_BAG_BIAS,
  BUG_RETARGET_MAX,
  BUG_RETARGET_MIN,
  BUG_SPEED,
  BUG_WANDER_RADIUS,
  EXP_PER_LEVEL,
  TROLLER_COLLECT_TIME,
  TROLLER_LEAVE_DISTANCE,
  TROLLER_SPEED,
} from '../constants.ts';
import { spawnTroller } from '../spawn.ts';
import { getEffectiveStat } from '../stats.ts';
import { pushSystem } from '../systems/chat.ts';
import type { Entity, PlayerId, World } from '../types.ts';
import { removeEntity } from '../util.ts';
import { playerById } from '../world.ts';

/**
 * Apply the alive→dead transition for one player. Stashes XP into
 * the troller's bag, resets progression to base, detaches body
 * trackers, and spawns the troller heading toward the corpse.
 *
 * `rng` is consumed exactly once (for the troller's spawn angle).
 */
export function triggerDeath(world: World, playerId: PlayerId, rng: () => number) {
  const p = playerById(world, playerId);
  pushSystem(world, `${p.name || 'A hero'} died in a battle.`);
  p.alive = false;
  p.deathX = p.x;
  p.deathZ = p.z;

  const total = p.attackers.reduce((n, a) => n + a.total, 0);
  const fightSeconds =
    p.fightStartedAt !== null ? Math.max(0, world.time - p.fightStartedAt) : 0;
  p.summary = {
    attackers: p.attackers.map((a) => ({ ...a })).sort((a, b) => b.total - a.total),
    totalDamage: total,
    fightSeconds,
  };
  p.attackers = [];
  p.fightStartedAt = null;

  const bagXp = (p.level - 1) * EXP_PER_LEVEL + p.experience;

  p.experience = 0;
  p.level = 1;
  p.attackSpeed = BASE_ATTACK_SPEED;
  p.healthRegen = BASE_HEALTH_REGEN;
  p.damage = BASE_DAMAGE;
  p.modifiers = [];
  p.effects = [];

  p.engageTargetId = null;
  p.navTargetX = null;
  p.navTargetZ = null;
  p.bug = null;

  const angle = rng() * Math.PI * 2;
  spawnTroller(
    world,
    p.x + Math.cos(angle) * 4,
    p.z + Math.sin(angle) * 4,
    false,
    playerId,
    bagXp,
  );
}

/**
 * Apply the dead→alive transition. Restores pools, teleports to the
 * city, spawns the indicator bug.
 *
 * `rng` is consumed exactly once (for the indicator bug's initial
 * offset angle).
 */
export function respawn(world: World, playerId: PlayerId, rng: () => number) {
  const p = playerById(world, playerId);
  pushSystem(world, `${p.name || 'A hero'} respawned in the city.`);
  p.alive = true;
  p.summary = null;
  p.attackers = [];
  p.fightStartedAt = null;
  p.health = getEffectiveStat(p, 'maxHealth');
  p.mana = getEffectiveStat(p, 'maxMana');
  p.stamina = getEffectiveStat(p, 'maxStamina');
  p.spellCooldowns = {};
  p.activeSpell = null;
  p.x = CITY_X;
  p.z = CITY_Z;
  p.rotation = 0;

  const angle = rng() * Math.PI * 2;
  p.bug = {
    x: p.x + Math.cos(angle) * 1.5,
    z: p.z + Math.sin(angle) * 1.5,
    rotation: 0,
    wanderTargetX: p.x,
    wanderTargetZ: p.z,
    retargetTimer: 0,
  };
}

/**
 * Step one troller entity. Walks toward the corpse (approach), then
 * sits there briefly (collect), then walks away in a random
 * direction (leave) before dropping the death bag and despawning.
 *
 * `rng` is consumed iff this tick triggers the collect→leave
 * transition (which fires once per troller's lifetime). All other
 * ticks return without touching `rng`.
 */
export function tickTroller(
  world: World,
  e: Entity,
  index: number,
  dt: number,
  rng: () => number,
) {
  const ownerId = e.forPlayerId;
  const owner = ownerId ? world.players[ownerId] : undefined;
  const cornerX = owner?.deathX ?? e.x;
  const cornerZ = owner?.deathZ ?? e.z;
  const phase = e.phase ?? 'approach';
  const targetX = e.trollerTargetX ?? cornerX;
  const targetZ = e.trollerTargetZ ?? cornerZ;
  const dx = targetX - e.x;
  const dz = targetZ - e.z;
  const dist = Math.hypot(dx, dz);

  if (phase === 'collect') {
    e.phaseTimer = (e.phaseTimer ?? 0) - dt;
    if ((e.phaseTimer ?? 0) <= 0) {
      const angle = rng() * Math.PI * 2;
      e.trollerTargetX = cornerX + Math.cos(angle) * TROLLER_LEAVE_DISTANCE;
      e.trollerTargetZ = cornerZ + Math.sin(angle) * TROLLER_LEAVE_DISTANCE;
      e.phase = 'leave';
      e.carriesPlayerBag = true;
    }
    return;
  }

  if (dist < 0.15) {
    if (phase === 'approach') {
      e.phase = 'collect';
      e.phaseTimer = TROLLER_COLLECT_TIME;
    } else if (phase === 'leave') {
      if (e.forPlayerId !== undefined) {
        dropPlayerDeathBag(world, e.x, e.z, e.bagXp ?? 0, e.forPlayerId);
      }
      removeEntity(world, index);
    }
    return;
  }

  const norm = Math.max(dist, 0.0001);
  e.x += (dx / norm) * TROLLER_SPEED * dt;
  e.z += (dz / norm) * TROLLER_SPEED * dt;
  e.rotation = Math.atan2(dx, dz);
}

/**
 * Step one player's indicator bug. Wanders around the player and
 * biases toward that player's own death bag (if any).
 *
 * `rng` is consumed three times iff this tick triggers a retarget
 * (the bug picks a new wander target — angle, dist, retarget
 * window). All other ticks return without touching `rng`.
 */
export function tickIndicatorBug(
  world: World,
  playerId: PlayerId,
  player: World['players'][string],
  dt: number,
  rng: () => number,
) {
  const bug = player.bug;
  if (!bug || !player.alive) return;

  bug.retargetTimer -= dt;
  if (bug.retargetTimer <= 0) {
    const angle = rng() * Math.PI * 2;
    const dist = rng() * BUG_WANDER_RADIUS;
    let tx = player.x + Math.cos(angle) * dist;
    let tz = player.z + Math.sin(angle) * dist;
    const bag =
      world.lootBags.find((b) => b.isDeathBag && b.forPlayerId === playerId) ?? null;
    if (bag) {
      tx = tx * (1 - BUG_BAG_BIAS) + bag.x * BUG_BAG_BIAS;
      tz = tz * (1 - BUG_BAG_BIAS) + bag.z * BUG_BAG_BIAS;
    }
    bug.wanderTargetX = tx;
    bug.wanderTargetZ = tz;
    bug.retargetTimer = BUG_RETARGET_MIN + rng() * (BUG_RETARGET_MAX - BUG_RETARGET_MIN);
  }

  const dx = bug.wanderTargetX - bug.x;
  const dz = bug.wanderTargetZ - bug.z;
  const norm = Math.max(Math.hypot(dx, dz), 0.0001);
  bug.x += (dx / norm) * BUG_SPEED * dt;
  bug.z += (dz / norm) * BUG_SPEED * dt;
  bug.rotation = Math.atan2(dx, dz);
}
