// Entity factories. Every place that creates an entity (spawners,
// chat /m command, spider split, death pipeline's troller) routes
// through here so stat-locking + id generation stay consistent.
//
// PR-D3e.2: the rng-consuming `spawnEntity` math lives in
// `pure/spawn.ts`. This module keeps the same public surface; only
// thing changed is that `spawnEntity` is now a thin wrapper that
// binds `world.rng.next` as the rng callable.

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
  type MonsterId,
} from './monsters.ts';
import { spawnEntity as spawnEntityPure } from './pure/spawn.ts';
import type { Entity, EntityKind, PlayerId, World } from './types.ts';
import { genId } from './world.ts';

export function spawnEntity(
  world: World,
  kind: Exclude<EntityKind, 'troller'>,
  x: number,
  z: number,
  rotation?: number,
  spawnPointId?: string,
): Entity {
  return spawnEntityPure(world, kind, x, z, rotation, spawnPointId, () => world.rng());
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

export type SpiderKind = 'spider-big' | 'spider-medium' | 'spider-tiny';

// Re-export the kind list so consumers can iterate.
export { MONSTER_BEAR, MONSTER_JANNA, MONSTER_SWAIN, MONSTER_TROLLER, MONSTER_WOLF };
export type { EntityKind };
