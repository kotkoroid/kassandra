// Death pipeline.
//
//   alive=true  player.health hits 0
//       │      ──────────────────────────►  loseProgress(): stash XP, reset
//       │                                    stats, spawn Troller heading
//       │                                    for the corpse
//       │
//       ▼
//   alive=false  Troller phases (handled by `tickTroller`)
//       │            approach → collect → leave  → drop bag
//       │       (player can slash troller en-route; combat.ts
//       │        intercepts that path and drops the bag locally)
//       │
//       ▼
//   Hud "Respawn" button → SimEvent → pendingRespawn flag → respawn:
//                                     restore pools, teleport to city,
//                                     spawn indicator bug.

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
import { getEffectiveStat } from '../stats.ts';
import { pushSystem } from './chat.ts';
import { spawnTroller } from '../spawn.ts';
import { removeEntity } from '../util.ts';
import type { Entity, World } from '../types.ts';
import { localPlayer } from '../world.ts';

export function tickDeath(world: World, dt: number) {
  // 1. Detect a fresh death and kick off the pipeline.
  //    Pipeline state (troller, bag, summary, attackers) is still
  //    anchor-only in D3d.1 — per-player pipeline lands in D3d.2.
  //    `alive` itself is per-player; we read the anchor's flag here.
  const player = localPlayer(world);
  if (player.alive && player.health <= 0) {
    triggerDeath(world);
  }

  // 2. Honor any queued respawn intent for the anchor. Per-player
  //    pendingRespawn — only the anchor's respawn drives the pipeline
  //    today (D3d.2 fans out).
  if (player.pendingRespawn) {
    player.pendingRespawn = false;
    if (!player.alive) respawn(world);
  }

  // 3. Step troller(s) — there is normally only one, but the
  // pipeline tolerates duplicates rather than asserting.
  for (let i = world.entities.length - 1; i >= 0; i--) {
    const e = world.entities[i];
    if (!e || e.kind !== 'troller') continue;
    tickTroller(world, e, i, dt);
  }

  // 4. Indicator bug after respawn.
  tickIndicatorBug(world, dt);
}

function triggerDeath(world: World) {
  const p = localPlayer(world);
  // Lifecycle announce — fired once at the alive→dead transition.
  // Uses the player's name (set during create_character); falls back
  // to "A hero" so a kill before naming still reads.
  pushSystem(world, `${p.name || 'A hero'} died in a battle.`);
  p.alive = false;
  p.deathX = p.x;
  p.deathZ = p.z;

  // Freeze the death summary before clearing the running totals so
  // the Hud's death recap has stable, snapshot-frozen numbers.
  const total = world.death.attackers.reduce((n, a) => n + a.total, 0);
  const fightSeconds =
    world.death.fightStartedAt !== null ? Math.max(0, world.time - world.death.fightStartedAt) : 0;
  world.death.summary = {
    attackers: world.death.attackers.map((a) => ({ ...a })).sort((a, b) => b.total - a.total),
    totalDamage: total,
    fightSeconds,
  };
  world.death.attackers = [];
  world.death.fightStartedAt = null;

  // Stash lifetime XP into the bag-in-transit. Use the level + bar
  // remainder so cleared levels don't silently evaporate.
  world.death.bagXp = (p.level - 1) * EXP_PER_LEVEL + p.experience;

  // Reset progression back to base; the bag is the only way to claw
  // some of it back.
  p.experience = 0;
  p.level = 1;
  p.attackSpeed = BASE_ATTACK_SPEED;
  p.healthRegen = BASE_HEALTH_REGEN;
  p.damage = BASE_DAMAGE;
  p.modifiers = [];
  p.effects = [];

  // Detach anything that was tracking the live body.
  p.engageTargetId = null;
  p.navTargetX = null;
  p.navTargetZ = null;
  world.death.bug = null;

  // Spawn the troller a short distance away, walking toward the
  // corpse. carriesPlayerBag stays false until the collect phase
  // completes so a kill during approach doesn't drop a bag yet —
  // but a kill during leave does.
  const angle = world.rng.next() * Math.PI * 2;
  spawnTroller(world, p.x + Math.cos(angle) * 4, p.z + Math.sin(angle) * 4, false);
}

function respawn(world: World) {
  const p = localPlayer(world);
  // Lifecycle announce — fired once at the dead→alive transition.
  pushSystem(world, `${p.name || 'A hero'} respawned in the city.`);
  p.alive = true;
  // Clear the previous life's recap; the next life starts a fresh
  // attribution log.
  world.death.summary = null;
  world.death.attackers = [];
  world.death.fightStartedAt = null;
  p.health = getEffectiveStat(p, 'maxHealth');
  p.mana = getEffectiveStat(p, 'maxMana');
  p.stamina = getEffectiveStat(p, 'maxStamina');
  p.spellCooldowns = {};
  p.activeSpell = null;
  p.x = CITY_X;
  p.z = CITY_Z;
  p.rotation = 0;

  // Indicator bug appears near the respawned player so the
  // breadcrumb back to any pending bag is visible immediately.
  const angle = world.rng.next() * Math.PI * 2;
  world.death.bug = {
    x: p.x + Math.cos(angle) * 1.5,
    z: p.z + Math.sin(angle) * 1.5,
    rotation: 0,
    wanderTargetX: p.x,
    wanderTargetZ: p.z,
    retargetTimer: 0,
  };
}

function tickTroller(world: World, e: Entity, index: number, dt: number) {
  // D3d.1: troller pipeline is still anchor-only. Read the anchor's
  // deathX/deathZ for the corpse target — D3d.2 will key by which
  // player's death the troller is processing.
  const anchor = localPlayer(world);
  const phase = e.phase ?? 'approach';
  const targetX = e.trollerTargetX ?? anchor.deathX;
  const targetZ = e.trollerTargetZ ?? anchor.deathZ;
  const dx = targetX - e.x;
  const dz = targetZ - e.z;
  const dist = Math.hypot(dx, dz);

  if (phase === 'collect') {
    e.phaseTimer = (e.phaseTimer ?? 0) - dt;
    if ((e.phaseTimer ?? 0) <= 0) {
      // Pick a random direction and walk that far away from the
      // corpse. Bag travels with the troller from now on.
      const angle = world.rng.next() * Math.PI * 2;
      e.trollerTargetX = anchor.deathX + Math.cos(angle) * TROLLER_LEAVE_DISTANCE;
      e.trollerTargetZ = anchor.deathZ + Math.sin(angle) * TROLLER_LEAVE_DISTANCE;
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
      // Drop the bag and despawn the troller.
      dropPlayerDeathBag(world, e.x, e.z);
      removeEntity(world, index);
    }
    return;
  }

  const norm = Math.max(dist, 0.0001);
  e.x += (dx / norm) * TROLLER_SPEED * dt;
  e.z += (dz / norm) * TROLLER_SPEED * dt;
  e.rotation = Math.atan2(dx, dz);
}

function tickIndicatorBug(world: World, dt: number) {
  const bug = world.death.bug;
  // Anchor-only: indicator bug currently shown only when the anchor
  // is alive and has a pending bag (D3d.2 makes this per-player).
  if (!bug || !localPlayer(world).alive) return;

  bug.retargetTimer -= dt;
  if (bug.retargetTimer <= 0) {
    const angle = world.rng.next() * Math.PI * 2;
    const dist = world.rng.next() * BUG_WANDER_RADIUS;
    const bugPlayer = localPlayer(world);
    let tx = bugPlayer.x + Math.cos(angle) * dist;
    let tz = bugPlayer.z + Math.sin(angle) * dist;
    // Bias the wander target toward the most recent loot bag so
    // the bug visibly leads the player back to it.
    const bag = world.lootBags.find((b) => b.isDeathBag) ?? null;
    if (bag) {
      tx = tx * (1 - BUG_BAG_BIAS) + bag.x * BUG_BAG_BIAS;
      tz = tz * (1 - BUG_BAG_BIAS) + bag.z * BUG_BAG_BIAS;
    }
    bug.wanderTargetX = tx;
    bug.wanderTargetZ = tz;
    bug.retargetTimer = BUG_RETARGET_MIN + world.rng.next() * (BUG_RETARGET_MAX - BUG_RETARGET_MIN);
  }

  const dx = bug.wanderTargetX - bug.x;
  const dz = bug.wanderTargetZ - bug.z;
  const norm = Math.max(Math.hypot(dx, dz), 0.0001);
  bug.x += (dx / norm) * BUG_SPEED * dt;
  bug.z += (dz / norm) * BUG_SPEED * dt;
  bug.rotation = Math.atan2(dx, dz);
}
