// Warrior spell system. castSpell() is the single entry point called
// from the event handler in tick.ts; tickSpells() advances channelled
// spells (Rush dash, Hail of Blades spin) every frame.

import { applyDamageToEntityRef } from './combat.ts';
import { genId, playerById } from './world.ts';
import { emit } from './events.ts';
import { grid } from './spatialGrid.ts';
import { getEffectiveStat } from './stats.ts';
import type { Player, PlayerId, World } from './types.ts';
import { findEntity, isHostile } from './util.ts';

// Spell levels span 1..MAX. Level 0 = locked (uncastable, hasn't been
// learned yet — `level_up_spell` raises it from 0 to 1 for the first
// purchase, then 1→2, ..., capped at MAX_SPELL_LEVEL).
export const MAX_SPELL_LEVEL = 10;

// Mana cost scales linearly with spell level. Each level grants a 5%
// discount on the base cost (L1 = full cost, L10 = 55% of base = ~45%
// discount). Clamped at 1 so a hypothetical zero-cost cast still feels
// like it consumed something.
export function getSpellManaCost(spellId: string, level: number): number {
  const def = SPELLS[spellId];
  if (!def) return 0;
  if (level <= 0) return def.manaCost;
  const multiplier = Math.max(0, 1 - (level - 1) * 0.05);
  return Math.max(1, Math.round(def.manaCost * multiplier));
}

export function getSpellLevel(p: Player, spellId: string): number {
  return p.spellLevels[spellId] ?? 0;
}

// Push a one-shot system line to chat. Used for soft-fail feedback
// (no target, locked spell, etc.) so the player isn't left guessing
// why the cast didn't fire. Chat is part of the broadcast snapshot,
// so in multiplayer every player sees it — fine for now (rare event,
// system-tagged); revisit when per-player UI feedback exists.
function sayToChat(world: World, text: string): void {
  world.chat.messages.push({
    id: genId(world, 'm'),
    author: 'System',
    text,
    channel: 'Normal',
  });
}

// Spend one classSpellPoint to raise this spell's level by 1. Handles
// both unlocking (0 → 1) and leveling (n → n+1) uniformly. Validates:
// spell exists for the player's class, current level < MAX, and the
// player has at least one classSpellPoint.
export function levelUpSpell(
  world: World,
  playerId: PlayerId,
  spellId: string,
): void {
  const p = playerById(world, playerId);
  if (!p.alive) return;
  const def = SPELLS[spellId];
  if (!def) {
    sayToChat(world, 'Unknown spell.');
    return;
  }
  const current = getSpellLevel(p, spellId);
  if (current >= MAX_SPELL_LEVEL) {
    sayToChat(world, 'Spell is already at max level.');
    return;
  }
  if (p.classSpellPoints <= 0) {
    sayToChat(world, 'Not enough class spell points.');
    return;
  }
  p.classSpellPoints -= 1;
  p.spellLevels = { ...p.spellLevels, [spellId]: current + 1 };
}

// --- Spell constants ---

const SPELLS: Record<string, { manaCost: number; cooldown: number }> = {
  rush: { manaCost: 20, cooldown: 8 },
  mayhem: { manaCost: 30, cooldown: 15 },
  'hail-of-blades': { manaCost: 25, cooldown: 12 },
  'blade-whip': { manaCost: 15, cooldown: 6 },
};

const RUSH_DURATION = 0.35; // seconds to travel to target
const RUSH_DAMAGE_MUL = 2.5;
const RUSH_STUN_DURATION = 1.5;

const HAIL_DURATION = 1.5;
const HAIL_TICK_RATE = 0.25; // seconds between damage ticks
const HAIL_RADIUS = 2.6;
const HAIL_DAMAGE_MUL = 0.6;

const WHIP_RANGE = 4;
const WHIP_DAMAGE_MUL = 2.2;
const WHIP_SLOW_DURATION = 2.0;

const MAYHEM_DURATION = 8;

export function castSpell(
  world: World,
  playerId: PlayerId,
  spellId: string,
  targetId: string | null,
): void {
  const p = playerById(world, playerId);

  // Only warrior can use these spells.
  if (p.playerClass !== 'warrior') return;

  // Dead players cannot cast.
  if (!p.alive) return;

  // Channel already running — don't interrupt with another cast.
  if (p.activeSpell !== null) return;

  const def = SPELLS[spellId];
  if (!def) return;

  // Learn-gate. Level 0 means the player hasn't spent a classSpellPoint
  // on this spell yet — the slot is still in their quickbar but the
  // cast is rejected with a chat hint. (No cooldown is started, no mana
  // is spent.)
  const level = getSpellLevel(p, spellId);
  if (level < 1) {
    sayToChat(world, `Spell not learned. Spend a class spell point in Character → Abilities.`);
    return;
  }

  // Cooldown gate.
  const readyAt = p.spellCooldowns[spellId] ?? 0;
  if (world.time < readyAt) return;

  // Mana gate — uses the level-scaled cost (linear -5%/level, clamped
  // at 1). castSpell will spend the same scaled value below.
  const manaCost = getSpellManaCost(spellId, level);
  if (p.mana < manaCost) return;

  // Prefer the explicitly passed target (from selection ring), fall back
  // to the current engage target if none was passed.
  const resolvedTargetId = targetId ?? p.engageTargetId;

  // Validate spell-specific preconditions before spending any resources.
  let canFire = false;
  switch (spellId) {
    case 'rush': {
      if (!resolvedTargetId) {
        sayToChat(world, 'Select target first.');
        return;
      }
      const target = findEntity(world, resolvedTargetId);
      if (target && isHostile(target.kind) && target.hp > 0) canFire = true;
      break;
    }
    case 'mayhem':
    case 'hail-of-blades':
      canFire = true;
      break;
    case 'blade-whip': {
      if (!resolvedTargetId) {
        sayToChat(world, 'Select target first.');
        return;
      }
      const target = findEntity(world, resolvedTargetId);
      if (!target || !isHostile(target.kind) || target.hp <= 0) break;
      if (Math.hypot(target.x - p.x, target.z - p.z) <= WHIP_RANGE) canFire = true;
      break;
    }
  }
  if (!canFire) return;

  p.mana = Math.max(0, p.mana - manaCost);
  p.spellCooldowns[spellId] = world.time + def.cooldown;
  p.spellAnimTrigger += 1;
  emit(world, { kind: 'spell-cast', spellId, x: p.x, z: p.z });

  switch (spellId) {
    case 'rush': {
      const target = findEntity(world, resolvedTargetId!)!;
      const dx = p.x - target.x;
      const dz = p.z - target.z;
      const dist = Math.hypot(dx, dz);
      const safe = Math.max(dist, 0.001);
      const toX = target.x + (dx / safe) * 1.0;
      const toZ = target.z + (dz / safe) * 1.0;
      p.activeSpell = {
        kind: 'rush',
        targetId: target.id,
        startedAt: world.time,
        endsAt: world.time + RUSH_DURATION,
        fromX: p.x,
        fromZ: p.z,
        toX,
        toZ,
      };
      break;
    }

    case 'mayhem': {
      const effectId = 'mayhem';
      const expiresAt = world.time + MAYHEM_DURATION;
      p.modifiers = p.modifiers.filter((m) => m.effectId !== effectId);
      p.effects = p.effects.filter((e) => e.id !== effectId);
      p.modifiers.push(
        { stat: 'damage', kind: 'mul', value: 1.5, effectId, expiresAt },
        { stat: 'attackSpeed', kind: 'mul', value: 1.4, effectId, expiresAt },
        { stat: 'moveSpeed', kind: 'mul', value: 1.3, effectId, expiresAt },
      );
      p.effects.push({
        id: effectId,
        name: 'Mayhem',
        icon: '⚔️',
        kind: 'buff',
        appliedAt: world.time,
        expiresAt,
        source: p.name,
        stats: [
          { label: 'Damage', delta: 50, unit: '%' },
          { label: 'Attack Speed', delta: 40, unit: '%' },
          { label: 'Move Speed', delta: 30, unit: '%' },
        ],
      });
      break;
    }

    case 'hail-of-blades': {
      p.activeSpell = {
        kind: 'hail-of-blades',
        startedAt: world.time,
        endsAt: world.time + HAIL_DURATION,
        lastTickAt: world.time,
      };
      break;
    }

    case 'blade-whip': {
      const target = findEntity(world, resolvedTargetId!)!;
      const damage = getEffectiveStat(p, 'damage') * WHIP_DAMAGE_MUL;
      applyDamageToEntityRef(world, target, damage, playerId);
      target.slowedUntil = world.time + WHIP_SLOW_DURATION;
      break;
    }
  }
}

export function tickSpells(
  world: World,
  playerId: PlayerId,
  dt: number,
): void {
  const p = playerById(world, playerId);
  const spell = p.activeSpell;
  if (!spell) return;

  if (spell.kind === 'rush') {
    const elapsed = world.time - spell.startedAt;
    const t = Math.min(elapsed / RUSH_DURATION, 1);
    p.x = spell.fromX + (spell.toX - spell.fromX) * t;
    p.z = spell.fromZ + (spell.toZ - spell.fromZ) * t;

    // Face the destination.
    const dx = spell.toX - spell.fromX;
    const dz = spell.toZ - spell.fromZ;
    if (Math.hypot(dx, dz) > 0.001) p.rotation = Math.atan2(dx, dz);

    if (world.time >= spell.endsAt) {
      // Apply damage + stun on arrival.
      const target = findEntity(world, spell.targetId);
      if (target && isHostile(target.kind) && target.hp > 0) {
        const damage = getEffectiveStat(p, 'damage') * RUSH_DAMAGE_MUL;
        applyDamageToEntityRef(world, target, damage, playerId);
        target.stunnedUntil = world.time + RUSH_STUN_DURATION;
      }
      p.activeSpell = null;
    }
    return;
  }

  if (spell.kind === 'hail-of-blades') {
    if (world.time >= spell.endsAt) {
      p.activeSpell = null;
      return;
    }

    if (world.time - spell.lastTickAt >= HAIL_TICK_RATE) {
      spell.lastTickAt = world.time;
      const damage = getEffectiveStat(p, 'damage') * HAIL_DAMAGE_MUL;
      for (const e of grid.queryRadius(p.x, p.z, HAIL_RADIUS)) {
        if (!isHostile(e.kind)) continue;
        if (e.hp <= 0) continue;
        applyDamageToEntityRef(world, e, damage, playerId);
      }
    }
  }
}
