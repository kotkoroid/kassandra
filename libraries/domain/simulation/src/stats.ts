// Stat resolution. Every read of an effective player stat goes through
// getEffectiveStat so all sources (base, weapon, buffs) combine in one place.

import { getItem } from './items.ts';
import { PLAYER_MAX_HP, PLAYER_MAX_MANA, STAMINA_MAX } from './constants.ts';
import { localPlayer } from './world.ts';
import type { Player, StatKey, World } from './types.ts';

function baseValue(player: Player, stat: StatKey): number {
  switch (stat) {
    case 'damage':
      return player.damage;
    case 'attackSpeed':
      return player.attackSpeed;
    case 'healthRegen':
      return player.healthRegen;
    case 'maxHealth':
      return PLAYER_MAX_HP;
    case 'maxMana':
      return PLAYER_MAX_MANA;
    case 'maxStamina':
      return STAMINA_MAX;
    case 'moveSpeed':
      return 1; // pure multiplier; base 1 = no change
  }
}

// Weapon contributes additive bonuses to damage and attackSpeed only.
function weaponAdd(player: Player, stat: StatKey): number {
  if (stat !== 'damage' && stat !== 'attackSpeed') return 0;
  const w = getItem(player.equippedWeaponId);
  return w?.attributes[stat] ?? 0;
}

// Formula: (base + weaponAdd + Σ add-modifiers) × Π mul-modifiers.
// Expired modifiers must be pruned by tickModifiers before calling.
export function getEffectiveStat(player: Player, stat: StatKey): number {
  let addTotal = baseValue(player, stat) + weaponAdd(player, stat);
  let mulProduct = 1;
  for (const m of player.modifiers) {
    if (m.stat !== stat) continue;
    if (m.kind === 'add') addTotal += m.value;
    else mulProduct *= m.value;
  }
  return addTotal * mulProduct;
}

// Remove expired effects + modifiers. Effects are the presentation
// layer (HUD icon + tooltip); modifiers are the math layer. When an
// effect expires, every modifier carrying its `effectId` is dropped
// alongside it so the two stay in lockstep. Plain modifiers with
// their own `expiresAt` are still pruned independently — equipment
// procs or quest rewards that never showed an icon still time out.
export function tickModifiers(world: World) {
  const p = localPlayer(world);
  const now = world.time;

  // Pass 1: prune expired effects, remembering their ids.
  let expiredEffectIds: Set<string> | null = null;
  for (let i = p.effects.length - 1; i >= 0; i--) {
    const eff = p.effects[i];
    if (eff && eff.expiresAt !== undefined && eff.expiresAt <= now) {
      (expiredEffectIds ??= new Set()).add(eff.id);
      p.effects.splice(i, 1);
    }
  }

  // Pass 2: prune modifier rows whose own expiry passed OR whose
  // owning effect was removed in pass 1.
  for (let i = p.modifiers.length - 1; i >= 0; i--) {
    const m = p.modifiers[i];
    if (!m) continue;
    if (m.expiresAt !== undefined && m.expiresAt <= now) {
      p.modifiers.splice(i, 1);
      continue;
    }
    if (m.effectId !== undefined && expiredEffectIds !== null && expiredEffectIds.has(m.effectId)) {
      p.modifiers.splice(i, 1);
    }
  }
}
