// PR-D3e.2 — pure-core extraction for the spawn factory.
//
// `spawn.ts` exposes spawnEntity / spawnTroller / spawnByMonsterId as
// the canonical entity-creation surface; they're called from combat
// (spider split), chat (/m command), spawners, and the death pipeline.
// Of those, only `spawnEntity` consumes rng (for `attackCooldown`
// stagger on swain/bowmaiden/spellmaiden, and the janna heal-cooldown
// offset). The pure twin here takes `rng: () => number`; the wrapper
// in spawn.ts binds `world.rng.next` as the rng so existing callers
// don't change.
//
// Pattern note: as with pure/death.ts, the callable preserves
// conditional consumption — non-staggering/non-janna spawns don't
// call rng at all.

import {
  getMonster,
  MONSTER_AZIR,
  MONSTER_BEAR,
  MONSTER_BOWMAIDEN,
  MONSTER_JANNA,
  MONSTER_SHADOWMAIDEN,
  MONSTER_SMALL_SPIDER,
  MONSTER_SPELLMAIDEN,
  MONSTER_SPIDER,
  MONSTER_SWAIN,
  MONSTER_TINY_SPIDER,
  MONSTER_WARMAIDEN,
  MONSTER_WOLF,
  type MonsterAttributes,
  type MonsterId,
} from '../monsters.ts';
import { nightStatMultiplier } from '../systems/time.ts';
import type { Entity, EntityKind, World } from '../types.ts';
import { genId, localPlayer } from '../world.ts';

// Apply the night multiplier once at spawn and freeze the result on
// the entity. A daytime spawn keeps its baseline stats even if night
// falls mid-fight; a night spawn keeps its boosted stats into dawn.
function snapshot(world: World, base: MonsterAttributes) {
  const mul = nightStatMultiplier(world);
  return {
    damage: base.damage * mul,
    attackSpeed: base.attackSpeed * mul,
    health: base.health * mul,
    healthRegen: base.healthRegen * mul,
  };
}

// 'toward' = +Z forward (beast convention); 'away' = −Z forward (swain/janna convention).
type FacingMode = 'none' | 'toward' | 'away';

type KindConfig = {
  idPrefix: string;
  monsterId: MonsterId;
  facing: FacingMode;
  staggerAttack: boolean;
};

export const KIND_CONFIG: Record<Exclude<EntityKind, 'troller'>, KindConfig> = {
  'spider-big': { idPrefix: 's', monsterId: MONSTER_SPIDER, facing: 'none', staggerAttack: false },
  'spider-medium': {
    idPrefix: 's',
    monsterId: MONSTER_SMALL_SPIDER,
    facing: 'none',
    staggerAttack: false,
  },
  'spider-tiny': {
    idPrefix: 's',
    monsterId: MONSTER_TINY_SPIDER,
    facing: 'none',
    staggerAttack: false,
  },
  wolf: { idPrefix: 'b', monsterId: MONSTER_WOLF, facing: 'toward', staggerAttack: false },
  bear: { idPrefix: 'b', monsterId: MONSTER_BEAR, facing: 'toward', staggerAttack: false },
  warmaiden: {
    idPrefix: 'b',
    monsterId: MONSTER_WARMAIDEN,
    facing: 'toward',
    staggerAttack: false,
  },
  shadowmaiden: {
    idPrefix: 'b',
    monsterId: MONSTER_SHADOWMAIDEN,
    facing: 'toward',
    staggerAttack: false,
  },
  swain: { idPrefix: 'e', monsterId: MONSTER_SWAIN, facing: 'away', staggerAttack: true },
  bowmaiden: { idPrefix: 'e', monsterId: MONSTER_BOWMAIDEN, facing: 'away', staggerAttack: true },
  spellmaiden: {
    idPrefix: 'e',
    monsterId: MONSTER_SPELLMAIDEN,
    facing: 'away',
    staggerAttack: true,
  },
  janna: { idPrefix: 'j', monsterId: MONSTER_JANNA, facing: 'away', staggerAttack: false },
  azir: { idPrefix: 'a', monsterId: MONSTER_AZIR, facing: 'toward', staggerAttack: false },
};

/**
 * Pure twin of `spawnEntity` from spawn.ts. Rng consumption:
 *   - `attackCooldown` stagger: one call iff `KIND_CONFIG[kind].staggerAttack`.
 *   - `healCooldown` initial offset: one call iff `kind === 'janna'`.
 *   - Other kinds consume nothing.
 */
export function spawnEntity(
  world: World,
  kind: Exclude<EntityKind, 'troller'>,
  x: number,
  z: number,
  rotation: number | undefined,
  spawnPointId: string | undefined,
  rng: () => number,
): Entity {
  const cfg = KIND_CONFIG[kind];
  const monster = getMonster(cfg.monsterId);
  const stats = snapshot(world, monster.attributes);
  const spawnPlayer = localPlayer(world);
  const dx = spawnPlayer.x - x;
  const dz = spawnPlayer.z - z;
  const r =
    rotation ??
    (cfg.facing === 'toward'
      ? Math.atan2(dx, dz)
      : cfg.facing === 'away'
        ? Math.atan2(-dx, -dz)
        : 0);
  const e: Entity = {
    id: genId(world, cfg.idPrefix),
    kind,
    monsterId: cfg.monsterId,
    x,
    z,
    rotation: r,
    hp: stats.health,
    maxHp: stats.health,
    damage: stats.damage,
    attackSpeed: stats.attackSpeed,
    healthRegen: stats.healthRegen,
    experience: monster.attributes.experience,
    attackCooldown: cfg.staggerAttack ? rng() / Math.max(stats.attackSpeed, 0.0001) : 0,
    ...(spawnPointId !== undefined && { spawnPointId }),
    ...(kind === 'janna' && { healCooldown: rng() * 7 }),
  };
  world.entities.push(e);
  world.entityById.set(e.id, e);
  return e;
}
