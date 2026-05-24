// Spawner service — wraps spawn.ts + systems/spawners.ts.
//
// Spawning is currently rng-dependent (placement, child spawns), but
// the rng flows through `world.rng` (Mulberry32) — PR-D3 migrates that
// to effect/Random. PR-D2 keeps the surface stable and the impl
// unchanged.

import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';

import {
  spawnByMonsterId as spawnByMonsterIdImpl,
  spawnEntity as spawnEntityImpl,
  spawnTroller as spawnTrollerImpl,
} from '../spawn.ts';
import { tickSpawners as tickSpawnersImpl } from '../systems/spawners.ts';
import type { Entity, World } from '../types.ts';

export interface SpawnerShape {
  /** Spawn a generic entity at a position. Returns the inserted entity. */
  readonly spawnEntity: (
    world: World,
    ...args: Parameters<typeof spawnEntityImpl> extends [World, ...infer Rest] ? Rest : never
  ) => Effect.Effect<Entity | undefined>;
  /** Spawn the death-bag troller. */
  readonly spawnTroller: (
    world: World,
    ...args: Parameters<typeof spawnTrollerImpl> extends [World, ...infer Rest] ? Rest : never
  ) => Effect.Effect<ReturnType<typeof spawnTrollerImpl>>;
  /** Spawn by monster id; resolves the right factory internally. */
  readonly spawnByMonsterId: (
    world: World,
    ...args: Parameters<typeof spawnByMonsterIdImpl> extends [World, ...infer Rest] ? Rest : never
  ) => Effect.Effect<ReturnType<typeof spawnByMonsterIdImpl>>;
  /** Refresh fixed-point spawners (per-tick scheduling + initial seeding). */
  readonly tick: (world: World) => Effect.Effect<void>;
}

export class Spawner extends Context.Service<Spawner, SpawnerShape>()(
  'kassandra/sim/Spawner',
) {}

export const makeSpawner: Effect.Effect<SpawnerShape> = Effect.succeed({
  spawnEntity: ((world, ...rest) =>
    Effect.sync(() => spawnEntityImpl(world, ...rest))) as SpawnerShape['spawnEntity'],
  spawnTroller: ((world, ...rest) =>
    Effect.sync(() => spawnTrollerImpl(world, ...rest))) as SpawnerShape['spawnTroller'],
  spawnByMonsterId: ((world, ...rest) =>
    Effect.sync(() => spawnByMonsterIdImpl(world, ...rest))) as SpawnerShape['spawnByMonsterId'],
  tick: Effect.fn('Spawner.tick')(function* (world) {
    tickSpawnersImpl(world);
  }),
});

export const SpawnerLayer = Layer.effect(Spawner)(makeSpawner);
