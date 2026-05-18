// Per-class spell catalog. Each class gets up to six signature
// spells that show up in the Abilities tab's "Class Spells"
// section. The kits aren't designed yet — every array is empty
// until each class's gameplay identity lands. The 6-slot ceiling
// is enforced by the UI, not the type.

import type { Ability, PlayerClass } from './sim/types';

export const MAX_CLASS_SPELLS = 6;

export const CLASS_SPELLS: Record<PlayerClass, Ability[]> = {
  warrior: [],
  assassin: [],
  mage: [],
  bruiser: [],
};
