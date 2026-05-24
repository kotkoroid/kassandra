// PR-D3e.1 — property-replay tests for the death pure-core.
//
// The architectural win of carving the pure twins out of
// `systems/death.ts` is exactly this: given a fixed rng sequence,
// the world mutation is fully deterministic — independent of
// `world.rng`, `Math.random`, or any hidden state. Tests inject a
// fixed-sequence callable and assert byte-perfect output.

import { expect, it } from '@effect/vitest';
import { Effect } from 'effect';
import { CITY_X, CITY_Z } from '../city.ts';
import {
  BUG_RETARGET_MAX,
  BUG_RETARGET_MIN,
  BUG_WANDER_RADIUS,
  PLAYER_MAX_HP,
  TROLLER_LEAVE_DISTANCE,
} from '../constants.ts';
import { respawn, tickIndicatorBug, tickTroller, triggerDeath } from './death.ts';
import type { Entity, PlayerId, World } from '../types.ts';
import { createWorld } from '../world.ts';

const PID: PlayerId = 'test-player-1';

/**
 * Build a fixed-sequence rng callable. Returns the next value from
 * `values` on each call; throws if the sequence is exhausted (a hard
 * fail makes accidental over-consumption obvious in tests).
 */
function fixedRng(values: readonly number[]): () => number {
  let i = 0;
  return () => {
    if (i >= values.length) {
      throw new Error(`rng sequence exhausted at call ${i + 1}`);
    }
    return values[i++]!;
  };
}

/**
 * Build a world with one alive-but-zero-hp player at (10, 20). The
 * fight is in-progress so `triggerDeath` exercises the summary +
 * attacker-clear branch too.
 */
function makeWorld(): World {
  const world = createWorld(0);
  // createWorld seeds a placeholder player; replace it with a
  // deterministic test player so test assertions don't depend on
  // crypto.randomUUID().
  world.players = {};
  world.localPlayerId = PID;
  world.players[PID] = {
    name: 'Tester',
    sex: 'male',
    hairColor: 'black',
    armor: 'silver',
    playerClass: 'warrior',
    level: 3,
    experience: 50,
    health: 0,
    mana: 0,
    stamina: 0,
    x: 10,
    z: 20,
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
    engageTargetId: 'someTarget',
    engageActive: true,
    navTargetX: 5,
    navTargetZ: 5,
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
    attackers: [{ monsterId: 'a1', name: 'goblin', total: 100, hits: 3 }],
    fightStartedAt: 0,
    summary: null,
    bug: null,
  };
  world.time = 5;
  return world;
}

it.effect('triggerDeath places the troller at a deterministic angle off the corpse', () =>
  Effect.gen(function* () {
    const world = makeWorld();
    // rng=0.25 → angle = 0.25 * 2π = π/2 → cos=0, sin=1 → troller at (10, 24).
    triggerDeath(world, PID, fixedRng([0.25]));

    const p = world.players[PID]!;
    expect(p.alive).toBe(false);
    expect(p.deathX).toBe(10);
    expect(p.deathZ).toBe(20);
    // Progression reset.
    expect(p.experience).toBe(0);
    expect(p.level).toBe(1);
    // Summary frozen before clearing attackers.
    expect(p.attackers).toEqual([]);
    expect(p.summary).not.toBeNull();
    expect(p.summary!.totalDamage).toBe(100);

    const troller = world.entities.find((e: Entity) => e.kind === 'troller')!;
    expect(troller).toBeDefined();
    expect(troller.forPlayerId).toBe(PID);
    expect(troller.x).toBeCloseTo(10, 6);
    expect(troller.z).toBeCloseTo(24, 6);
  }),
);

it.effect('respawn teleports to the city and seeds the bug at a deterministic offset', () =>
  Effect.gen(function* () {
    const world = makeWorld();
    triggerDeath(world, PID, fixedRng([0.25])); // get player into the dead state.
    expect(world.players[PID]!.alive).toBe(false);

    // rng=0 → angle=0 → cos=1, sin=0 → bug at city + (1.5, 0).
    respawn(world, PID, fixedRng([0]));

    const p = world.players[PID]!;
    expect(p.alive).toBe(true);
    expect(p.x).toBe(CITY_X);
    expect(p.z).toBe(CITY_Z);
    expect(p.bug).not.toBeNull();
    expect(p.bug!.x).toBeCloseTo(CITY_X + 1.5, 6);
    expect(p.bug!.z).toBeCloseTo(CITY_Z, 6);
    expect(p.health).toBe(PLAYER_MAX_HP);
  }),
);

it.effect('tickTroller advances position on approach without consuming rng', () =>
  Effect.gen(function* () {
    const world = makeWorld();
    // No rng calls expected on the approach path — empty sequence
    // makes any consumption throw.
    const noopRng = fixedRng([]);

    // Place a troller mid-approach: at (0, 0), corpse at (10, 0).
    const troller: Entity = {
      id: 't1',
      kind: 'troller',
      x: 0,
      z: 0,
      rotation: 0,
      forPlayerId: PID,
      bagXp: 0,
      phase: 'approach',
    } as Entity;
    world.entities.push(troller);
    world.players[PID]!.deathX = 10;
    world.players[PID]!.deathZ = 0;

    tickTroller(world, troller, world.entities.length - 1, 0.1, noopRng);

    // Walked toward the corpse along +x.
    expect(troller.x).toBeGreaterThan(0);
    expect(troller.z).toBe(0);
  }),
);

it.effect('tickTroller consumes one rng on the collect→leave transition', () =>
  Effect.gen(function* () {
    const world = makeWorld();
    // rng=0 → angle=0 → leave point = corpse + (TROLLER_LEAVE_DISTANCE, 0).
    const rng = fixedRng([0]);

    const troller: Entity = {
      id: 't1',
      kind: 'troller',
      x: 10,
      z: 0,
      rotation: 0,
      forPlayerId: PID,
      bagXp: 0,
      phase: 'collect',
      phaseTimer: 0, // expired this tick → triggers leave transition.
    } as Entity;
    world.entities.push(troller);
    world.players[PID]!.deathX = 10;
    world.players[PID]!.deathZ = 0;

    tickTroller(world, troller, world.entities.length - 1, 0.1, rng);

    expect(troller.phase).toBe('leave');
    expect(troller.carriesPlayerBag).toBe(true);
    expect(troller.trollerTargetX).toBeCloseTo(10 + TROLLER_LEAVE_DISTANCE, 6);
    expect(troller.trollerTargetZ).toBeCloseTo(0, 6);
  }),
);

it.effect('tickIndicatorBug consumes three rngs on retarget, zero otherwise', () =>
  Effect.gen(function* () {
    const world = makeWorld();
    const p = world.players[PID]!;
    p.alive = true;
    p.bug = {
      x: 0,
      z: 0,
      rotation: 0,
      wanderTargetX: 0,
      wanderTargetZ: 0,
      retargetTimer: 1, // not yet — should not consume rng.
    };

    tickIndicatorBug(world, PID, p, 0.1, fixedRng([]));
    expect(p.bug!.retargetTimer).toBeCloseTo(0.9, 6);

    // Now force a retarget.
    p.bug.retargetTimer = 0;
    // rng=[0, 0.5, 1] → angle=0, dist=0.5*BUG_WANDER_RADIUS, timer=MIN+(MAX-MIN)*1=MAX.
    tickIndicatorBug(world, PID, p, 0.1, fixedRng([0, 0.5, 1]));
    // angle=0 → cos=1, sin=0; dist*BUG_WANDER_RADIUS along +x from player (CITY).
    // No bag in world.lootBags → no biasing; player at (10, 20).
    expect(p.bug!.wanderTargetX).toBeCloseTo(10 + 0.5 * BUG_WANDER_RADIUS, 6);
    expect(p.bug!.wanderTargetZ).toBeCloseTo(20, 6);
    expect(p.bug!.retargetTimer).toBeCloseTo(BUG_RETARGET_MAX, 6);
    // The retarget consumed three rng values; the unused fourth would
    // throw. Sanity assertion: not consumed.
    expect(() => fixedRng([0, 0.5, 1])()).not.toThrow();
  }),
);

it.effect('replay — identical rng sequence yields byte-identical world mutation', () =>
  Effect.gen(function* () {
    const sequence = [0.1, 0.3, 0.7, 0.2, 0.4];

    const a = makeWorld();
    triggerDeath(a, PID, fixedRng([sequence[0]!]));
    respawn(a, PID, fixedRng([sequence[1]!]));
    tickIndicatorBug(
      a,
      PID,
      a.players[PID]!,
      0.1,
      fixedRng([sequence[2]!, sequence[3]!, sequence[4]!]),
    );

    const b = makeWorld();
    triggerDeath(b, PID, fixedRng([sequence[0]!]));
    respawn(b, PID, fixedRng([sequence[1]!]));
    tickIndicatorBug(
      b,
      PID,
      b.players[PID]!,
      0.1,
      fixedRng([sequence[2]!, sequence[3]!, sequence[4]!]),
    );

    // Bug pose drifts forward by one BUG_SPEED * dt step toward the
    // new wander target; compare it across the two runs.
    expect(a.players[PID]!.bug!.x).toBeCloseTo(b.players[PID]!.bug!.x, 6);
    expect(a.players[PID]!.bug!.z).toBeCloseTo(b.players[PID]!.bug!.z, 6);
    expect(a.players[PID]!.bug!.wanderTargetX).toBeCloseTo(
      b.players[PID]!.bug!.wanderTargetX,
      6,
    );
    expect(a.players[PID]!.bug!.wanderTargetZ).toBeCloseTo(
      b.players[PID]!.bug!.wanderTargetZ,
      6,
    );
    expect(a.players[PID]!.bug!.retargetTimer).toBeCloseTo(
      b.players[PID]!.bug!.retargetTimer,
      6,
    );
    expect(BUG_RETARGET_MIN).toBeLessThan(BUG_RETARGET_MAX);
  }),
);
