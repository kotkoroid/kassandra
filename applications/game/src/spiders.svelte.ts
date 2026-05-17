// Spider state. Three size tiers map to catalog ids; per-instance
// state stays minimal — the live stats are pulled from the monster
// catalog at runtime via getMonster(monsterId).

import {
  MONSTER_SMALL_SPIDER,
  MONSTER_SPIDER,
  MONSTER_TINY_SPIDER,
  type MonsterId,
} from './monsters';

export type SpiderSize = 'big' | 'medium' | 'tiny';

export interface SpiderVisualConfig {
  scale: number;
  // Move speed (world units / sec). Visual / locomotion stat — not
  // part of the monster combat catalog.
  speed: number;
  monsterId: MonsterId;
  // What and how many to spawn when this spider dies. Terminal tier
  // (tiny) omits both fields.
  childSize?: SpiderSize;
  childCount?: number;
}

export const SPIDER_VISUALS: Record<SpiderSize, SpiderVisualConfig> = {
  big: {
    scale: 1,
    speed: 2.6,
    monsterId: MONSTER_SPIDER,
    childSize: 'medium',
    childCount: 3,
  },
  medium: {
    scale: 0.7,
    speed: 3.1,
    monsterId: MONSTER_SMALL_SPIDER,
    childSize: 'tiny',
    childCount: 3,
  },
  tiny: {
    scale: 0.45,
    speed: 3.6,
    monsterId: MONSTER_TINY_SPIDER,
  },
};

export interface Spider {
  id: string;
  size: SpiderSize;
  x: number;
  z: number;
  rotation: number;
  hp: number;
  maxHp: number;
  attackCooldown: number;
}

export const spiders = $state<Spider[]>([]);
