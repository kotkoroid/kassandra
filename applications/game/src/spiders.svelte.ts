// Spider state + tier config. `$state` array is deeply reactive so
// position/hp mutations from the AI loop re-render the meshes.

export type SpiderSize = 'big' | 'medium' | 'tiny';

export interface SpiderConfig {
  hp: number;
  damage: number;
  scale: number;
  speed: number;
  // What and how many to spawn when this spider dies. `tiny` is
  // terminal — no spawn on death.
  childSize?: SpiderSize;
  childCount?: number;
}

export const SPIDER_CONFIGS: Record<SpiderSize, SpiderConfig> = {
  big: {
    hp: 5,
    damage: 3,
    scale: 1,
    speed: 2.6,
    childSize: 'medium',
    childCount: 3,
  },
  medium: {
    hp: 3,
    damage: 2,
    scale: 0.7,
    speed: 3.1,
    childSize: 'tiny',
    childCount: 3,
  },
  tiny: {
    hp: 3,
    damage: 1,
    scale: 0.45,
    speed: 3.6,
  },
};

export interface Spider {
  id: string;
  size: SpiderSize;
  x: number;
  z: number;
  rotation: number;
  hp: number;
  attackCooldown: number;
}

export const spiders = $state<Spider[]>([]);
