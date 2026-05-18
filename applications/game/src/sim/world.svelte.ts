// The world. One `$state` proxy holds the entire simulation state
// so Svelte views can read it directly with normal reactivity. The
// shape itself is plain TypeScript (see ./types.ts) so it could be
// serialised, replayed, or shipped to a server unchanged.

import { STARTING_WEAPON_ID } from '../items';
import {
  BASE_ATTACK_SPEED,
  BASE_DAMAGE,
  BASE_HEALTH_REGEN,
  PLAYER_MAX_HP,
  PLAYER_MAX_MANA,
  STAMINA_MAX,
} from './constants';
import { createRng } from './rng';
import type { Player, World } from './types';

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

export function createWorld(seed: number = Date.now() >>> 0): World {
  return {
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
