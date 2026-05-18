// Stat resolution. Every read of an effective player stat goes through
// getEffectiveStat so all sources (base, weapon, buffs) combine in one place.

import { getItem } from '../items';
import {
  PLAYER_MAX_HP,
  PLAYER_MAX_MANA,
  STAMINA_MAX,
} from './constants';
import type { Player, StatKey, World } from './types';

function baseValue(player: Player, stat: StatKey): number {
  switch (stat) {
    case 'damage':      return player.damage;
    case 'attackSpeed': return player.attackSpeed;
    case 'healthRegen': return player.healthRegen;
    case 'maxHealth':   return PLAYER_MAX_HP;
    case 'maxMana':     return PLAYER_MAX_MANA;
    case 'maxStamina':  return STAMINA_MAX;
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

// Remove modifiers whose expiresAt has passed. Call once per tick.
export function tickModifiers(world: World) {
  const mods = world.player.modifiers;
  for (let i = mods.length - 1; i >= 0; i--) {
    const m = mods[i];
    if (m && m.expiresAt !== undefined && m.expiresAt <= world.time) {
      mods.splice(i, 1);
    }
  }
}
