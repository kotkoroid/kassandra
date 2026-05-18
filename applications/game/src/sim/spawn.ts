// Entity factories. Every place that creates an entity (spawners,
// chat /m command, spider split, death pipeline's troller) routes
// through here so stat-locking + id generation stay consistent.

import {
  getMonster,
  MONSTER_BEAR,
  MONSTER_JANNA,
  MONSTER_SMALL_SPIDER,
  MONSTER_SPIDER,
  MONSTER_SWAIN,
  MONSTER_TINY_SPIDER,
  MONSTER_TROLLER,
  MONSTER_WOLF,
  type MonsterAttributes,
  type MonsterId,
} from '../monsters';
import { nightStatMultiplier } from './systems/time';
import type { Entity, EntityKind, World } from './types';
import { genId } from './world.svelte';

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

const SPIDER_KIND_TO_MONSTER: Record<SpiderKind, MonsterId> = {
  'spider-big': MONSTER_SPIDER,
  'spider-medium': MONSTER_SMALL_SPIDER,
  'spider-tiny': MONSTER_TINY_SPIDER,
};

export function spawnSpider(
  world: World,
  kind: SpiderKind,
  x: number,
  z: number,
  rotation = 0,
): Entity {
  const monsterId = SPIDER_KIND_TO_MONSTER[kind];
  const stats = snapshot(world, getMonster(monsterId).attributes);
  const e: Entity = {
    id: genId(world, 's'),
    kind,
    monsterId,
    x,
    z,
    rotation,
    hp: stats.health,
    maxHp: stats.health,
    damage: stats.damage,
    attackSpeed: stats.attackSpeed,
    healthRegen: stats.healthRegen,
    attackCooldown: 0,
  };
  world.entities.push(e);
  return e;
}

export function spawnBeast(
  world: World,
  kind: 'wolf' | 'bear',
  x: number,
  z: number,
): Entity {
  const monsterId = kind === 'wolf' ? MONSTER_WOLF : MONSTER_BEAR;
  const stats = snapshot(world, getMonster(monsterId).attributes);
  const e: Entity = {
    id: genId(world, 'b'),
    kind,
    monsterId,
    x,
    z,
    rotation: Math.atan2(world.player.x - x, world.player.z - z),
    hp: stats.health,
    maxHp: stats.health,
    damage: stats.damage,
    attackSpeed: stats.attackSpeed,
    healthRegen: stats.healthRegen,
    attackCooldown: 0,
  };
  world.entities.push(e);
  return e;
}

export function spawnSwain(world: World, x: number, z: number): Entity {
  const stats = snapshot(world, getMonster(MONSTER_SWAIN).attributes);
  const e: Entity = {
    id: genId(world, 'e'),
    kind: 'swain',
    monsterId: MONSTER_SWAIN,
    x,
    z,
    // Same facing convention as the legacy Enemy view (-Z forward).
    rotation: Math.atan2(-(world.player.x - x), -(world.player.z - z)),
    hp: stats.health,
    maxHp: stats.health,
    damage: stats.damage,
    attackSpeed: stats.attackSpeed,
    healthRegen: stats.healthRegen,
    // Stagger first shot so a clustered respawn doesn't volley.
    attackCooldown:
      world.rng.next() / Math.max(stats.attackSpeed, 0.0001),
  };
  world.entities.push(e);
  return e;
}

export function spawnJanna(world: World, x: number, z: number): Entity {
  const monster = getMonster(MONSTER_JANNA);
  // Janna's catalog values are flat (no night-scaling for an ally),
  // so we still call snapshot — at night it'd just multiply zeros.
  const stats = snapshot(world, monster.attributes);
  const e: Entity = {
    id: genId(world, 'j'),
    kind: 'janna',
    monsterId: MONSTER_JANNA,
    x,
    z,
    rotation: Math.atan2(-(world.player.x - x), -(world.player.z - z)),
    hp: stats.health,
    maxHp: stats.health,
    damage: stats.damage,
    attackSpeed: stats.attackSpeed,
    healthRegen: stats.healthRegen,
    attackCooldown: 0,
    // Initial random cooldown matches the legacy spawn behaviour so
    // a single visible Janna doesn't drop circles in perfect lockstep
    // with another.
    healCooldown: world.rng.next() * 7,
  };
  world.entities.push(e);
  return e;
}

export function spawnTroller(
  world: World,
  x: number,
  z: number,
  carriesPlayerBag: boolean,
): Entity {
  const monster = getMonster(MONSTER_TROLLER);
  // Troller doesn't scale with night — it's a delivery NPC, not a
  // combat threat.
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
    attackCooldown: 0,
    phase: 'approach',
    phaseTimer: 0,
    carriesPlayerBag,
    trollerTargetX: world.death.deathX,
    trollerTargetZ: world.death.deathZ,
  };
  world.entities.push(e);
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
    case MONSTER_WOLF: return spawnBeast(world, 'wolf', x, z);
    case MONSTER_BEAR: return spawnBeast(world, 'bear', x, z);
    case MONSTER_SWAIN: return spawnSwain(world, x, z);
    case MONSTER_SPIDER: return spawnSpider(world, 'spider-big', x, z);
    case MONSTER_SMALL_SPIDER: return spawnSpider(world, 'spider-medium', x, z);
    case MONSTER_TINY_SPIDER: return spawnSpider(world, 'spider-tiny', x, z);
    case MONSTER_JANNA: return spawnJanna(world, x, z);
    case MONSTER_TROLLER: return spawnTroller(world, x, z, false);
    default: return null;
  }
}

// Re-export the kind list so consumers can iterate.
export { MONSTER_BEAR, MONSTER_JANNA, MONSTER_SWAIN, MONSTER_TROLLER, MONSTER_WOLF };
export type { EntityKind };
