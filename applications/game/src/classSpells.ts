// Per-class spell catalog. Each class gets up to six signature
// spells that show up in the Abilities tab's "Class Spells"
// section. The kits aren't designed yet — every array is empty
// until each class's gameplay identity lands. The 6-slot ceiling
// is enforced by the UI, not the type.

import type { Ability, PlayerClass } from './sim/types';

export const MAX_CLASS_SPELLS = 6;

export const CLASS_SPELLS: Record<PlayerClass, Ability[]> = {
  warrior: [
    {
      id: 'rush',
      name: 'Rush',
      description: 'Dash to your target and stun it for 1.5s.',
      kind: 'active',
      level: 1,
      maxLevel: 5,
    },
    {
      id: 'mayhem',
      name: 'Mayhem',
      description: 'Buff: +50% damage, +40% attack speed, +30% move speed for 8s.',
      kind: 'active',
      level: 1,
      maxLevel: 5,
    },
    {
      id: 'hail-of-blades',
      name: 'Hail of Blades',
      description: 'Spin for 1.5s, hitting all enemies within 2.6 units repeatedly.',
      kind: 'active',
      level: 1,
      maxLevel: 5,
    },
    {
      id: 'blade-whip',
      name: 'Blade Whip',
      description: 'Whip your blade at the target for 2.2× damage. Slows for 2s.',
      kind: 'active',
      level: 1,
      maxLevel: 5,
    },
  ],
  assassin: [],
  mage: [],
  bruiser: [],
};
