// The world. Pure TypeScript — no $state, no Svelte. The shape is
// plain data so it can be serialised, replayed, or shipped to a
// server unchanged.
//
// The Svelte-reactive wrapper (`world.svelte.ts` in the game app)
// wraps `createWorld()` in a `$state` proxy and provides `resetWorld`
// for the character-creation flow.

import { STARTING_WEAPON_ID } from './items.ts';
import {
  BASE_ATTACK_SPEED,
  BASE_DAMAGE,
  BASE_HEALTH_REGEN,
  PLAYER_MAX_HP,
  PLAYER_MAX_MANA,
  STAMINA_MAX,
} from './constants.ts';
import { createRng } from './rng.ts';
import type { Player, PlayerId, World } from './types.ts';

export function localPlayer(world: World): Player {
  const p = world.players[world.localPlayerId];
  if (p === undefined) throw new Error('World invariant violated: local player not found');
  return p;
}

/**
 * Look up a player by id. Throws if the id isn't a known player —
 * caller responsibility to validate the player is connected before
 * calling. Use in per-player loops where the calling code already
 * knows which player it's processing (instead of mutating
 * `world.localPlayerId` to fake the "current player" context).
 */
export function playerById(world: World, playerId: PlayerId): Player {
  const p = world.players[playerId];
  if (p === undefined) throw new Error(`World invariant violated: unknown player ${playerId}`);
  return p;
}

export function defaultPlayer(): Player {
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
    effects: [],
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
    spellCooldowns: {},
    spellLevels: {},
    activeSpell: null,
    spellAnimTrigger: 0,
    alive: true,
    deathX: 0,
    deathZ: 0,
    pendingManualAttack: false,
    pendingRespawn: false,
    attackers: [],
    fightStartedAt: null,
    summary: null,
    bug: null,
  };
}

export function createWorld(seed: number = Date.now() >>> 0): World {
  const localPlayerId: PlayerId = crypto.randomUUID();
  const world: World = {
    rng: createRng(seed),
    time: 0,
    tick: 0,
    localPlayerId,
    ownerId: null,
    players: { [localPlayerId]: defaultPlayer() },
    entities: [],
    entityById: new Map(),
    projectiles: [],
    healingCircles: [],
    lootBags: [],
    chat: {
      messages: [],
    },
    // Fixed spawn-point bookkeeping. tickSpawners flips the flag and
    // seeds every catalog entry on the first tick; combat.ts pushes
    // entries into the map when a respawning entity dies.
    spawnPointsInitialized: false,
    spawnPointRespawnAt: new Map(),
    nextId: 1,
    inputQueue: [],
  };
  return world;
}

export function addPlayer(world: World, playerId: PlayerId): void {
  if (!world.players[playerId]) {
    world.players[playerId] = defaultPlayer();
  }
}

// Cheap unique-id helper. Sim systems pass `world` and ask for an
// id when pushing a new entity / projectile / bag — the counter
// lives on the world so saves + replays roll forward consistently.
export function genId(world: World, prefix: string): string {
  return `${prefix}${world.nextId++}`;
}
