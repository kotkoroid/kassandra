// PR-D3e.2 — property-replay tests for the remaining pure-core
// modules. One file covers spawn / monsters / chat / npcChat to keep
// the suite tight; pure/death.test.ts holds the death-pipeline cases
// from PR-D3e.1.

import { expect, it } from '@effect/vitest';
import { Effect } from 'effect';
import {
  HEAL_CIRCLE_OFFSET_MAX,
  HEAL_CIRCLE_TTL,
  JANNA_HEAL_COOLDOWN,
} from '../constants.ts';
import { MONSTER_AZIR, MONSTER_BEAR, MONSTER_JANNA } from '../monsters.ts';
import { scatterSpawnsAroundPlayer } from './chat.ts';
import { tickJanna } from './monsters.ts';
import { tickNpcChat } from './npcChat.ts';
import { spawnEntity } from './spawn.ts';
import type { Entity, PlayerId, World } from '../types.ts';
import { createWorld } from '../world.ts';

const PID: PlayerId = 'test-player-spawn';

function fixedRng(values: readonly number[]): () => number {
  let i = 0;
  return () => {
    if (i >= values.length) {
      throw new Error(`rng sequence exhausted at call ${i + 1}`);
    }
    return values[i++]!;
  };
}

function makeWorld(): World {
  const world = createWorld(0);
  // Stabilise the placeholder player so spawn math is deterministic.
  world.players = {};
  world.localPlayerId = PID;
  world.players[PID] = {
    name: 'Tester',
    sex: 'male',
    hairColor: 'black',
    armor: 'silver',
    playerClass: 'warrior',
    level: 1,
    experience: 0,
    health: 100,
    mana: 50,
    stamina: 100,
    x: 0,
    z: 0,
    rotation: 0,
    attackSpeed: 1,
    healthRegen: 1,
    damage: 5,
    equippedWeaponId: '',
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
  return world;
}

// --- spawn -----------------------------------------------------------

it.effect('spawnEntity consumes 0 rng for non-staggering, non-janna kinds', () =>
  Effect.gen(function* () {
    const world = makeWorld();
    const noopRng = fixedRng([]);
    const e = spawnEntity(world, 'bear', 5, 5, undefined, undefined, noopRng);
    expect(e.monsterId).toBe(MONSTER_BEAR);
    expect(e.attackCooldown).toBe(0);
    expect(e.healCooldown).toBeUndefined();
    expect(world.entities).toContain(e);
  }),
);

it.effect('spawnEntity consumes 1 rng for janna (heal-cooldown initial)', () =>
  Effect.gen(function* () {
    const world = makeWorld();
    // rng=0.5 → healCooldown = 0.5 * 7 = 3.5
    const e = spawnEntity(world, 'janna', 5, 5, undefined, undefined, fixedRng([0.5]));
    expect(e.monsterId).toBe(MONSTER_JANNA);
    expect(e.healCooldown).toBeCloseTo(3.5, 6);
  }),
);

it.effect('spawnEntity consumes 1 rng for staggering kinds (swain)', () =>
  Effect.gen(function* () {
    const world = makeWorld();
    // rng=0.25 → attackCooldown = 0.25 / max(attackSpeed, 0.0001)
    const e = spawnEntity(world, 'swain', 5, 5, undefined, undefined, fixedRng([0.25]));
    expect(e.attackCooldown).toBeCloseTo(0.25 / Math.max(e.attackSpeed, 0.0001), 6);
  }),
);

// --- monsters --------------------------------------------------------

it.effect('tickJanna does not consume rng while cooldown is running', () =>
  Effect.gen(function* () {
    const world = makeWorld();
    const e = spawnEntity(world, 'janna', 5, 5, undefined, undefined, fixedRng([0.1]));
    // After spawn, healCooldown = 0.1 * 7 = 0.7 (still > 0 after a small dt).
    const before = world.healingCircles.length;
    tickJanna(world, e, 0.5, fixedRng([])); // empty seq → throws if consumed
    expect(world.healingCircles.length).toBe(before);
    expect(e.healCooldown).toBeCloseTo(0.2, 6);
  }),
);

it.effect('tickJanna consumes 2 rngs on cooldown expiry and drops a heal circle', () =>
  Effect.gen(function* () {
    const world = makeWorld();
    const e = spawnEntity(world, 'janna', 5, 5, undefined, undefined, fixedRng([0]));
    // Force the cooldown to expire this tick.
    e.healCooldown = 0;
    // rng=[0, 1] → angle=0 (cos=1, sin=0), offset=HEAL_CIRCLE_OFFSET_MAX → circle at (5+offset, 5)
    tickJanna(world, e, 0.1, fixedRng([0, 1]));
    expect(world.healingCircles.length).toBe(1);
    const circle = world.healingCircles[0]!;
    expect(circle.x).toBeCloseTo(5 + HEAL_CIRCLE_OFFSET_MAX, 6);
    expect(circle.z).toBeCloseTo(5, 6);
    expect(circle.ttl).toBe(HEAL_CIRCLE_TTL);
    expect(e.healCooldown).toBe(JANNA_HEAL_COOLDOWN);
  }),
);

// --- chat ------------------------------------------------------------

it.effect('scatterSpawnsAroundPlayer consumes 2 rngs per spawn', () =>
  Effect.gen(function* () {
    const world = makeWorld();
    world.players[PID]!.x = 10;
    world.players[PID]!.z = 20;
    // rng=[0, 0] × 3 spawns → angle=0, dist=4. All at (10+4, 20) = (14, 20).
    const result = scatterSpawnsAroundPlayer(
      world,
      MONSTER_BEAR,
      3,
      fixedRng([0, 0, 0, 0, 0, 0]),
    );
    expect(result).toEqual({ ok: true, spawned: 3 });
    const bears = world.entities.filter((e: Entity) => e.monsterId === MONSTER_BEAR);
    expect(bears).toHaveLength(3);
    for (const b of bears) {
      expect(b.x).toBeCloseTo(14, 6);
      expect(b.z).toBeCloseTo(20, 6);
    }
  }),
);

// --- npcChat ---------------------------------------------------------

it.effect('tickNpcChat lazy-inits a chatter without speaking (consumes 1 rng)', () =>
  Effect.gen(function* () {
    const world = makeWorld();
    world.time = 100;
    // Place an azir (the only registered chatter) directly to skip
    // spawn rng consumption.
    const azir: Entity = {
      id: 'a1',
      kind: 'azir',
      monsterId: MONSTER_AZIR,
      x: 0,
      z: 0,
      rotation: 0,
      hp: 100,
      maxHp: 100,
      damage: 0,
      attackSpeed: 0,
      healthRegen: 0,
      experience: 0,
      attackCooldown: 0,
    } as Entity;
    world.entities.push(azir);

    // rng=0 → first cadence = cadenceMin (25). No `saying`, no chat
    // log append on the lazy-init path.
    tickNpcChat(world, fixedRng([0]));
    expect(azir.nextSayAt).toBeCloseTo(100 + 25, 6);
    expect(azir.saying).toBeUndefined();
    expect(world.chat.messages).toHaveLength(0);
  }),
);

it.effect('tickNpcChat picks a line and reschedules (consumes 2 rngs)', () =>
  Effect.gen(function* () {
    const world = makeWorld();
    world.time = 200;
    const azir: Entity = {
      id: 'a1',
      kind: 'azir',
      monsterId: MONSTER_AZIR,
      x: 0,
      z: 0,
      rotation: 0,
      hp: 100,
      maxHp: 100,
      damage: 0,
      attackSpeed: 0,
      healthRegen: 0,
      experience: 0,
      attackCooldown: 0,
      nextSayAt: 200, // due this tick.
    } as Entity;
    world.entities.push(azir);

    // rng=[0, 1] → line=pool[floor(0 * len)]=pool[0]; next cadence = max (60).
    tickNpcChat(world, fixedRng([0, 1]));
    expect(azir.saying).toBe('Watch yourself out there, recruit.');
    expect(azir.nextSayAt).toBeCloseTo(200 + 60, 6);
    expect(world.chat.messages).toHaveLength(1);
    expect(world.chat.messages[0]!.author).toBe('City Guardian');
  }),
);
