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
import type { Entity, PlayerId, World } from '../types.ts';
import { playerById } from '../world.ts';

export function tickDeath(world: World, dt: number) {
  // PR-D3d.2: every player runs their own death pipeline. Multiple
  // trollers can coexist (one per dying player), tagged by
  // entity.forPlayerId; each player's indicator bug + summary +
  // attackers list lives on their Player record.

  // 1. Detect fresh deaths and kick off per-player pipelines.
  for (const [pid, p] of Object.entries(world.players)) {
    if (p.alive && p.health <= 0) {
      triggerDeath(world, pid);
    }
  }

  // 2. Honor each player's queued respawn intent.
  for (const [pid, p] of Object.entries(world.players)) {
    if (p.pendingRespawn) {
      p.pendingRespawn = false;
      if (!p.alive) respawn(world, pid);
    }
  }

  // 3. Step troller(s) — one per dying player. The troller carries
  //    its own bagXp + forPlayerId so dropping the bag doesn't need
  //    any cross-reference to a global pipeline.
  for (let i = world.entities.length - 1; i >= 0; i--) {
    const e = world.entities[i];
    if (!e || e.kind !== 'troller') continue;
    tickTroller(world, e, i, dt);
  }

  // 4. Indicator bugs — one per player with an active bug pointer.
  for (const [pid, p] of Object.entries(world.players)) {
    tickIndicatorBug(world, pid, p, dt);
  }
}

function triggerDeath(world: World, playerId: PlayerId) {
  const p = playerById(world, playerId);
  // Lifecycle announce — fired once at the alive→dead transition.
  pushSystem(world, `${p.name || 'A hero'} died in a battle.`);
  p.alive = false;
  p.deathX = p.x;
  p.deathZ = p.z;

  // Freeze the death summary before clearing the running totals so
  // the Hud's death recap has stable, snapshot-frozen numbers.
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

  // Lifetime XP this player carries into the bag-in-transit.
  // Travels with the troller (entity.bagXp) until drop, then lands
  // on the WorldLootBag's bagXp. Use the level + bar remainder so
  // cleared levels don't silently evaporate.
  const bagXp = (p.level - 1) * EXP_PER_LEVEL + p.experience;

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
  p.bug = null;

  // Spawn the troller a short distance away, walking toward the
  // corpse. Tagged with forPlayerId so future ticks know whose
  // death position it's heading for.
  const angle = world.rng.next() * Math.PI * 2;
  spawnTroller(
    world,
    p.x + Math.cos(angle) * 4,
    p.z + Math.sin(angle) * 4,
    false,
    playerId,
    bagXp,
  );
}

function respawn(world: World, playerId: PlayerId) {
  const p = playerById(world, playerId);
  // Lifecycle announce — fired once at the dead→alive transition.
  pushSystem(world, `${p.name || 'A hero'} respawned in the city.`);
  p.alive = true;
  // Clear the previous life's recap; the next life starts a fresh
  // attribution log.
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

  // Indicator bug appears near the respawned player so the
  // breadcrumb back to any pending bag is visible immediately.
  const angle = world.rng.next() * Math.PI * 2;
  p.bug = {
    x: p.x + Math.cos(angle) * 1.5,
    z: p.z + Math.sin(angle) * 1.5,
    rotation: 0,
    wanderTargetX: p.x,
    wanderTargetZ: p.z,
    retargetTimer: 0,
  };
}

function tickTroller(world: World, e: Entity, index: number, dt: number) {
  // PR-D3d.2: troller carries its forPlayerId + bagXp on the entity
  // itself. The death position comes from that player's deathX/Z —
  // multiple trollers chase multiple corpses independently.
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
      // Pick a random direction and walk that far away from the
      // corpse. Bag travels with the troller from now on.
      const angle = world.rng.next() * Math.PI * 2;
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
      // Drop the bag (carrying this troller's stashed bagXp) and
      // despawn the troller.
      dropPlayerDeathBag(world, e.x, e.z, e.bagXp ?? 0);
      removeEntity(world, index);
    }
    return;
  }

  const norm = Math.max(dist, 0.0001);
  e.x += (dx / norm) * TROLLER_SPEED * dt;
  e.z += (dz / norm) * TROLLER_SPEED * dt;
  e.rotation = Math.atan2(dx, dz);
}

function tickIndicatorBug(
  world: World,
  playerId: PlayerId,
  player: World['players'][string],
  dt: number,
) {
  const bug = player.bug;
  // Per-player indicator bug — shown only when the player is alive
  // (after respawn) and has a non-null bug pointer.
  if (!bug || !player.alive) return;

  bug.retargetTimer -= dt;
  if (bug.retargetTimer <= 0) {
    const angle = world.rng.next() * Math.PI * 2;
    const dist = world.rng.next() * BUG_WANDER_RADIUS;
    let tx = player.x + Math.cos(angle) * dist;
    let tz = player.z + Math.sin(angle) * dist;
    // Bias the wander target toward this player's own death bag so
    // the bug visibly leads them back to it. PR-D3d.2: bags carry
    // forPlayerId now — only match the bag stamped for this player.
    const bag =
      world.lootBags.find((b) => b.isDeathBag && b.forPlayerId === playerId) ?? null;
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
