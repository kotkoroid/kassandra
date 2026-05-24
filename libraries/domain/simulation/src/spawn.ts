// Entity factories. Every place that creates an entity (spawners,
// chat /m command, spider split, death pipeline's troller) routes
// through here so stat-locking + id generation stay consistent.

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
  MONSTER_TROLLER,
  MONSTER_WARMAIDEN,
  MONSTER_WOLF,
  type MonsterAttributes,
  type MonsterId,
} from './monsters.ts';
import { nightStatMultiplier } from './systems/time.ts';
import type { Entity, EntityKind, PlayerId, World } from './types.ts';
import { genId, localPlayer } from './world.ts';

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

export type SpiderKind = 'spider-big' | 'spider-medium' | 'spider-tiny';

// 'toward' = +Z forward (beast convention); 'away' = −Z forward (swain/janna convention).
type FacingMode = 'none' | 'toward' | 'away';

type KindConfig = {
  idPrefix: string;
  monsterId: MonsterId;
  facing: FacingMode;
  staggerAttack: boolean;
};

const KIND_CONFIG: Record<Exclude<EntityKind, 'troller'>, KindConfig> = {
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

export function spawnEntity(
  world: World,
  kind: Exclude<EntityKind, 'troller'>,
  x: number,
  z: number,
  rotation?: number,
  spawnPointId?: string,
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
    attackCooldown: cfg.staggerAttack ? world.rng.next() / Math.max(stats.attackSpeed, 0.0001) : 0,
    ...(spawnPointId !== undefined && { spawnPointId }),
    ...(kind === 'janna' && { healCooldown: world.rng.next() * 7 }),
  };
  world.entities.push(e);
  world.entityById.set(e.id, e);
  return e;
}

// PR-D3d.2: forPlayerId + bagXp are optional because chat-spawned
// trollers (`/m troller`) don't carry a bag and aren't tied to a
// dying player. Death-pipeline spawns always pass both; chat spawns
// pass neither and the troller wanders harmlessly.
export function spawnTroller(
  world: World,
  x: number,
  z: number,
  carriesPlayerBag: boolean,
  forPlayerId?: PlayerId,
  bagXp?: number,
): Entity {
  const monster = getMonster(MONSTER_TROLLER);
  // Troller doesn't scale with night — it's a delivery NPC, not a
  // combat threat.
  const owner = forPlayerId !== undefined ? world.players[forPlayerId] : undefined;
  const e: Entity = {
    id: genId(world, 't'),
    kind: 'troller',
    monsterId: MONSTER_TROLLER,
    x,
    z,
    rotation: 0,
    hp: monster.attributes.health,
    maxHp: monster.attributes.health,
    damage: 0,
    attackSpeed: 0,
    healthRegen: 0,
    experience: monster.attributes.experience,
    attackCooldown: 0,
    phase: 'approach',
    phaseTimer: 0,
    carriesPlayerBag,
    // PR-D3d.2: troller is tagged with the dying player's id and
    // carries their stashed bagXp until drop. Both undefined for
    // chat-spawn (carriesPlayerBag = false in that case).
    ...(forPlayerId !== undefined ? { forPlayerId } : {}),
    ...(bagXp !== undefined ? { bagXp } : {}),
    trollerTargetX: owner?.deathX ?? x,
    trollerTargetZ: owner?.deathZ ?? z,
  };
  world.entities.push(e);
  world.entityById.set(e.id, e);
  return e;
}

// Generic dispatcher used by chat commands (/m) and any other
// caller that knows a MonsterId but not the spawn shape.
export function spawnByMonsterId(
  world: World,
  monsterId: MonsterId,
  x: number,
  z: number,
): Entity | null {
  switch (monsterId) {
    case MONSTER_WOLF:
      return spawnEntity(world, 'wolf', x, z);
    case MONSTER_BEAR:
      return spawnEntity(world, 'bear', x, z);
    case MONSTER_SWAIN:
      return spawnEntity(world, 'swain', x, z);
    case MONSTER_SPIDER:
      return spawnEntity(world, 'spider-big', x, z);
    case MONSTER_SMALL_SPIDER:
      return spawnEntity(world, 'spider-medium', x, z);
    case MONSTER_TINY_SPIDER:
      return spawnEntity(world, 'spider-tiny', x, z);
    case MONSTER_JANNA:
      return spawnEntity(world, 'janna', x, z);
    case MONSTER_AZIR:
      return spawnEntity(world, 'azir', x, z);
    case MONSTER_BOWMAIDEN:
      return spawnEntity(world, 'bowmaiden', x, z);
    case MONSTER_SPELLMAIDEN:
      return spawnEntity(world, 'spellmaiden', x, z);
    case MONSTER_WARMAIDEN:
      return spawnEntity(world, 'warmaiden', x, z);
    case MONSTER_SHADOWMAIDEN:
      return spawnEntity(world, 'shadowmaiden', x, z);
    case MONSTER_TROLLER:
      return spawnTroller(world, x, z, false);
    default:
      return null;
  }
}

// Re-export the kind list so consumers can iterate.
export { MONSTER_BEAR, MONSTER_JANNA, MONSTER_SWAIN, MONSTER_TROLLER, MONSTER_WOLF };
export type { EntityKind };
