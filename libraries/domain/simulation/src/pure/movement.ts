// PR-D3e.3: pure-core for player input + movement + engage + slash
// cadence. Every per-tick decision the local character makes lives
// here — WASD vs nav vs auto-engage resolution, city-night seal,
// tree collisions, stamina, passive health regen, slash clock.
// `slash` is imported from `combat.ts` (the top-level re-export over
// pure/combat.ts); this module has no rng usage of its own.

import { isInCity } from '../city.ts';
import { getVisibleProps } from '../worldGen.ts';
import { slash } from '../combat.ts';
import {
  ARRIVE_RADIUS,
  ENGAGE_RANGE,
  PLAYER_RADIUS,
  SPEED_EXHAUSTED,
  SPEED_NORMAL,
  STAMINA_DRAIN,
  STAMINA_MAX,
  STAMINA_REGEN_EMPTY,
  STAMINA_REGEN_PARTIAL,
  STAMINA_WATER_DRAIN_MULT,
  TREE_RADIUS,
  WATER_SPEED_FACTOR,
} from '../constants.ts';
import { getEffectiveStat } from '../stats.ts';
import type { FrameInputs, PlayerId, World } from '../types.ts';
import { findEntity, isHostile, isInWaterAt } from '../util.ts';
import { isNight } from './time.ts';
import { playerById } from '../world.ts';

export function tickPlayer(
  world: World,
  playerId: PlayerId,
  dt: number,
  inputs: FrameInputs,
) {
  const p = playerById(world, playerId);

  // Passive health regen runs whether moving or idle, but only while
  // alive. Tied to stat, capped at PLAYER_MAX_HP.
  if (p.alive && p.healthRegen > 0) {
    const maxHp = getEffectiveStat(p, 'maxHealth');
    if (p.health < maxHp) {
      p.health = Math.min(maxHp, p.health + getEffectiveStat(p, 'healthRegen') * dt);
    }
  }

  // Bubble expiry — once world.time crosses the threshold the chat
  // bubble disappears. Set when sendMessage queues a message in
  // sim/systems/chat.ts.
  if (p.saying && world.time >= p.sayExpiresAt) p.saying = '';

  // While dead, body lies frozen. Drain the manual-attack flag so a
  // queued slash doesn't fire on respawn.
  if (!p.alive) {
    p.pendingManualAttack = false;
    return;
  }

  // While a channelled spell is running (Rush dash, Hail spin) the
  // player cannot move or slash — tickSpells owns position this tick.
  if (p.activeSpell !== null) {
    p.pendingManualAttack = false;
    return;
  }

  // --- Engage block --------------------------------------------

  const hasManualInput = inputs.moveX !== 0 || inputs.moveZ !== 0;

  // Pressing WASD permanently disengages until the player picks a
  // new target — without this, releasing the keys would snap straight
  // back into chasing the same enemy.
  if (hasManualInput) p.engageActive = false;

  if (!hasManualInput && p.engageActive && p.engageTargetId !== null) {
    const target = findEntity(world, p.engageTargetId);
    if (!target || !isHostile(target.kind) || target.hp <= 0) {
      // Target gone or no longer a valid hostile — drop chase.
      p.engageTargetId = null;
      p.navTargetX = null;
      p.navTargetZ = null;
    } else {
      const tdx = target.x - p.x;
      const tdz = target.z - p.z;
      const dist = Math.hypot(tdx, tdz);
      if (dist > ENGAGE_RANGE) {
        // Out of reach: refresh the chase target each tick so the
        // movement code below steers toward the latest position.
        p.navTargetX = target.x;
        p.navTargetZ = target.z;
      } else {
        // In reach: stop, face the target, slash on cadence.
        p.navTargetX = null;
        p.navTargetZ = null;
        p.rotation = Math.atan2(tdx, tdz);
        const minGap = 1 / Math.max(getEffectiveStat(p, 'attackSpeed'), 0.0001);
        if (world.time - p.lastSlashTime >= minGap) {
          slash(world, playerId);
          // One-attack mode: stop after this swing; selection stays
          // so the panel still shows.
          if (!p.autoAttack) p.engageActive = false;
        }
      }
    }
  }

  // --- Resolve movement direction -------------------------------

  let dirX = 0;
  let dirZ = 0;
  let moving = false;
  if (hasManualInput) {
    p.navTargetX = null;
    p.navTargetZ = null;
    const len = Math.hypot(inputs.moveX, inputs.moveZ);
    dirX = inputs.moveX / len;
    dirZ = inputs.moveZ / len;
    moving = true;
  } else if (p.navTargetX !== null && p.navTargetZ !== null) {
    const tdx = p.navTargetX - p.x;
    const tdz = p.navTargetZ - p.z;
    const dist = Math.hypot(tdx, tdz);
    if (dist <= ARRIVE_RADIUS) {
      p.navTargetX = null;
      p.navTargetZ = null;
    } else {
      dirX = tdx / dist;
      dirZ = tdz / dist;
      moving = true;
    }
  }

  // --- Speed determination --------------------------------------

  const inWater = isInWaterAt(p.x, p.z);
  const empty = p.stamina <= 0;
  let speed: number;
  if (empty) speed = SPEED_EXHAUSTED;
  else if (inWater) speed = SPEED_NORMAL * WATER_SPEED_FACTOR;
  else speed = SPEED_NORMAL;
  speed *= getEffectiveStat(p, 'moveSpeed');

  // --- Apply movement + stamina ---------------------------------

  if (moving) {
    const newX = p.x + dirX * speed * dt;
    const newZ = p.z + dirZ * speed * dt;
    // City night-seal: only blocks fresh entry from outside.
    // Already-inside players stay inside but can still leave.
    const cityClosed = isNight(world) && !isInCity(p.x, p.z) && isInCity(newX, newZ);
    if (cityClosed) {
      p.navTargetX = null;
      p.navTargetZ = null;
    } else {
      p.x = newX;
      p.z = newZ;
    }
    p.rotation = Math.atan2(dirX, dirZ);

    if (p.stamina > 0) {
      const drain = STAMINA_DRAIN * (inWater ? STAMINA_WATER_DRAIN_MULT : 1);
      p.stamina = Math.max(0, p.stamina - drain * dt);
      if (p.stamina === 0) p.exhausted = true;
    }
  } else {
    if (p.stamina < STAMINA_MAX) {
      const rate = p.exhausted ? STAMINA_REGEN_EMPTY : STAMINA_REGEN_PARTIAL;
      p.stamina = Math.min(STAMINA_MAX, p.stamina + rate * dt);
    }
  }
  if (p.stamina >= STAMINA_MAX) p.exhausted = false;

  // --- Tree collisions ------------------------------------------

  for (const prop of getVisibleProps(p.x, p.z)) {
    if (prop.type !== 'tree') continue;
    const dxTree = p.x - prop.x;
    const dzTree = p.z - prop.z;
    const dist = Math.hypot(dxTree, dzTree);
    const minDist = TREE_RADIUS * prop.scale + PLAYER_RADIUS;
    if (dist < minDist) {
      const norm = Math.max(dist, 0.0001);
      const push = minDist - dist;
      p.x += (dxTree / norm) * push;
      p.z += (dzTree / norm) * push;
    }
  }

  // --- Manual attack (space-bar) --------------------------------

  if (p.pendingManualAttack) {
    p.pendingManualAttack = false;
    // Cancel click-to-move navigation so the character plants and
    // slashes in place instead of continuing to walk through the swing.
    p.navTargetX = null;
    p.navTargetZ = null;
    const minGap = 1 / Math.max(getEffectiveStat(p, 'attackSpeed'), 0.0001);
    if (world.time - p.lastSlashTime >= minGap) {
      slash(world, playerId);
    }
  }
}
