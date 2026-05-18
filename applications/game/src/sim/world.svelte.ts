// The world. One `$state` proxy holds the entire simulation state
// so Svelte views can read it directly with normal reactivity. The
// shape itself is plain TypeScript (see ./types.ts) so it could be
// serialised, replayed, or shipped to a server unchanged.

import { CITY_X, CITY_Z } from '../city';
import { STARTING_WEAPON_ID } from '../items';
import { getMonster, MONSTER_AZIR } from '../monsters';
import {
  BASE_ATTACK_SPEED,
  BASE_DAMAGE,
  BASE_HEALTH_REGEN,
  PLAYER_MAX_HP,
  PLAYER_MAX_MANA,
  STAMINA_MAX,
} from './constants';
import { createRng } from './rng';
import type { Entity, Player, World } from './types';

function defaultPlayer(): Player {
  return {
    name: '',
    sex: 'male',
    hairColor: 'black',
    armor: 'silver',
    playerClass: 'warrior',
    level: 1,
    experience: 0,
    health: PLAYER_MAX_HP,
    mana: PLAYER_MAX_MANA,
    stamina: STAMINA_MAX,
    x: 0,
    z: 0,
    rotation: 0,
    attackSpeed: BASE_ATTACK_SPEED,
    healthRegen: BASE_HEALTH_REGEN,
    damage: BASE_DAMAGE,
    equippedWeaponId: STARTING_WEAPON_ID,
    modifiers: [],
    bag: [],
    lars: 0,
    abilities: [],
    skillPoints: 0,
    classSpellPoints: 0,
    activeQuests: [],
    autoAttack: true,
    engageTargetId: null,
    engageActive: true,
    navTargetX: null,
    navTargetZ: null,
    lastSlashTime: -Infinity,
    slashTrigger: 0,
    exhausted: false,
    saying: '',
    sayExpiresAt: 0,
    levelUpTrigger: 0,
  };
}

// One-time city NPC: Azir stands a few units off the city centre,
// turned to face the respawn point. Inlined here (instead of calling
// spawn.ts) to avoid a circular import — spawn.ts already imports
// genId from this module.
function spawnCityNpcs(world: World) {
  const azirDef = getMonster(MONSTER_AZIR);
  const azir: Entity = {
    id: 'azir',
    kind: 'azir',
    monsterId: MONSTER_AZIR,
    x: CITY_X + 2,
    z: CITY_Z + 1.5,
    // Face the city centre so the player sees the front of him on
    // respawn / on entering town.
    rotation: Math.atan2(-2, -1.5),
    hp: azirDef.attributes.health,
    maxHp: azirDef.attributes.health,
    damage: 0,
    attackSpeed: 0,
    healthRegen: 0,
    experience: 0,
    attackCooldown: 0,
  };
  world.entities.push(azir);
  world.entityById.set(azir.id, azir);
}

export function createWorld(seed: number = Date.now() >>> 0): World {
  const world: World = {
    rng: createRng(seed),
    time: 0,
    tick: 0,
    player: defaultPlayer(),
    entities: [],
    entityById: new Map(),
    projectiles: [],
    healingCircles: [],
    lootBags: [],
    death: {
      alive: true,
      deathX: 0,
      deathZ: 0,
      bagXp: 0,
      bug: null,
      attackers: [],
      fightStartedAt: null,
      summary: null,
    },
    chat: {
      messages: [],
    },
    spawnTimers: {
      spider: 0,
      swain: 0,
      wolf: 0,
      bear: 0,
      janna: 0,
    },
    nextId: 1,
    inputQueue: [],
    pending: {
      manualAttack: false,
      respawn: false,
    },
  };
  spawnCityNpcs(world);
  return world;
}

// Global world proxy. Every view + every sim system reaches into
// the same `$state` object — Svelte handles the reactivity for the
// UI side, and the sim treats it as plain mutable data.
export const world = $state<World>(createWorld());

// Reset the world in-place (preserves the proxy identity, so views
// already bound to `world` stay reactive). Used on character
// creation submit so each fresh run starts from a known state.
export function resetWorld(seed: number = Date.now() >>> 0) {
  const fresh = createWorld(seed);
  for (const key of Object.keys(world) as (keyof World)[]) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (world as any)[key] = (fresh as any)[key];
  }
}

// Cheap unique-id helper. Sim systems pass `world` and ask for an
// id when pushing a new entity / projectile / bag — the counter
// lives on the world so saves + replays roll forward consistently.
export function genId(world: World, prefix: string): string {
  return `${prefix}${world.nextId++}`;
}
