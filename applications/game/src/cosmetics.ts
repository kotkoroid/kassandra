// Character cosmetic palettes shared by CharacterCreation, the
// Player view, and any future portrait UI. Pure data — no state.

import type { ArmorColor, HairColor, PlayerClass } from '@kassandra/simulation-domain-library';

export const HAIR_COLORS: Record<HairColor, string> = {
  black: '#1a1a1a',
  brown: '#5a3a20',
  blonde: '#d9b35a',
  red: '#9c4426',
  gray: '#9a9a9a',
  white: '#e6e3d8',
};

// Each armor swatch maps to a primary fabric/dye colour for the
// skirt + a slightly darker leather/metal shade for the boots, so
// the two pieces read as a matching set without looking flat.
export const ARMOR_COLORS: Record<ArmorColor, { skirt: string; boot: string }> = {
  silver: { skirt: '#c0c0c8', boot: '#7a7a82' },
  gold: { skirt: '#d4a23a', boot: '#8a6618' },
  black: { skirt: '#1f1f24', boot: '#08080c' },
  brown: { skirt: '#6b4625', boot: '#3d2715' },
  red: { skirt: '#9c2c2c', boot: '#62181c' },
  green: { skirt: '#3a7c3a', boot: '#1e4220' },
  blue: { skirt: '#2c5fa0', boot: '#1a3a6b' },
  white: { skirt: '#e8e8ea', boot: '#b5b5bb' },
};

// Player classes. Each class will eventually get its own 3D model;
// for now they share the procedural model in scene/Player.svelte
// and only differ as a stored identity tag. The `label` field is
// what the creation UI renders.
export const PLAYER_CLASSES: Record<PlayerClass, { label: string }> = {
  warrior: { label: 'Warrior' },
  assassin: { label: 'Assassin' },
  mage: { label: 'Mage' },
  bruiser: { label: 'Bruiser' },
};

export type { ArmorColor, HairColor, PlayerClass };
