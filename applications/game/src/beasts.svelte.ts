// Generic melee-animal state (wolves, bears). Each beast carries a
// MonsterId pointing into the catalog for its stats and a `kind` flag
// the renderer uses to pick the right model.

import type { MonsterId } from './monsters';

export type BeastKind = 'wolf' | 'bear';

export interface Beast {
  id: string;
  kind: BeastKind;
  monsterId: MonsterId;
  x: number;
  z: number;
  rotation: number;
  hp: number;
  maxHp: number;
  attackCooldown: number;
}

export const beasts = $state<Beast[]>([]);
