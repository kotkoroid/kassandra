// Shared reactive player state. `$state` in a `.svelte.ts` module
// gives every importer the same proxy — mutating a field from Scene
// (e.g. stamina drain) re-renders the HUD without prop plumbing.

import { getItem, type ItemId, STARTING_WEAPON_ID } from './items';

// Max stamina exposed so the HUD bar and combat restorations stay in
// sync with the simulation in Scene.svelte.
export const STAMINA_MAX = 300;

// Base player stats — the values a freshly created character starts
// with before any progression or equipment modifiers apply.
export const BASE_ATTACK_SPEED = 1; // hits per second
export const BASE_HEALTH_REGEN = 1; // hp per second
export const BASE_DAMAGE = 0; // flat damage before weapon

export const HAIR_COLORS = {
  black: '#1a1a1a',
  brown: '#5a3a20',
  blonde: '#d9b35a',
  red: '#9c4426',
  gray: '#9a9a9a',
  white: '#e6e3d8',
} as const;

export type HairColor = keyof typeof HAIR_COLORS;

// Each armor swatch maps to a primary fabric/dye colour for the
// skirt and a slightly darker leather/metal shade for the boots, so
// the two pieces read as a matching set without looking flat.
export const ARMOR_COLORS = {
  silver: { skirt: '#c0c0c8', boot: '#7a7a82' },
  gold: { skirt: '#d4a23a', boot: '#8a6618' },
  black: { skirt: '#1f1f24', boot: '#08080c' },
  brown: { skirt: '#6b4625', boot: '#3d2715' },
  red: { skirt: '#9c2c2c', boot: '#62181c' },
  green: { skirt: '#3a7c3a', boot: '#1e4220' },
  blue: { skirt: '#2c5fa0', boot: '#1a3a6b' },
  white: { skirt: '#e8e8ea', boot: '#b5b5bb' },
} as const;

export type ArmorColor = keyof typeof ARMOR_COLORS;

export const player = $state({
  name: '',
  sex: 'male' as 'male' | 'female',
  hairColor: 'black' as HairColor,
  armor: 'silver' as ArmorColor,
  level: 1,
  health: 100,
  mana: 100,
  stamina: STAMINA_MAX,
  experience: 0,
  // Base stats. The *effective* values used in combat are these plus
  // any contributions from the equipped weapon — see
  // getEffectiveAttackSpeed / getEffectiveDamage below.
  attackSpeed: BASE_ATTACK_SPEED,
  healthRegen: BASE_HEALTH_REGEN,
  damage: BASE_DAMAGE,
  // Currently equipped weapon id. Defaults to the wooden sword every
  // new character spawns with.
  equippedWeaponId: STARTING_WEAPON_ID as ItemId,
  // Increments once per level-up so visuals (pillar of light, HUD
  // banner) can latch onto the transition without polling.
  levelUpTrigger: 0,
  // World position, kept in sync by Scene each frame so the HUD
  // minimap can render the player + nearby entities.
  x: 0,
  z: 0,
});

// Effective-stat helpers: equipped-weapon attributes are *added* to
// the player's base stats, never overwriting. Callers read these each
// frame so reactivity falls out of the underlying $state proxy.
export function getEquippedWeapon() {
  return getItem(player.equippedWeaponId);
}

export function getEffectiveAttackSpeed(): number {
  return player.attackSpeed + (getEquippedWeapon()?.attributes.attackSpeed ?? 0);
}

export function getEffectiveDamage(): number {
  return player.damage + (getEquippedWeapon()?.attributes.damage ?? 0);
}
