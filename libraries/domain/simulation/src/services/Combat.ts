// Combat service — first PR-D1 system migration.
//
// Wraps the existing sync combat.ts functions in Effect-returning
// methods. Inner math stays in combat.ts unchanged (will be extracted
// to pure/combat.ts in PR-D2); this layer adds the typed Service
// surface and the Effect.fn tracing spans without any behavior change.
//
// Why thin wrappers now: the per-system PR-D2 migration touches every
// `world.rng` call site and threads effect/Random through. That's a
// per-file rewrite. PR-D1 just stands up the *shape* — service tag,
// layer, naming convention — so callers can switch to the service
// API today and the internals migrate underneath them later.

import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';

import {
  applyDamageToEntity as applyDamageToEntityImpl,
  applyDamageToEntityRef as applyDamageToEntityRefImpl,
  applyDamageToPlayer as applyDamageToPlayerImpl,
  dropPlayerDeathBag as dropPlayerDeathBagImpl,
  grantExperience as grantExperienceImpl,
  slash as slashImpl,
} from '../combat.ts';
import type { Entity, World } from '../types.ts';

export interface CombatShape {
  /** Apply damage to an entity by its index in world.entities. */
  readonly applyDamageToEntity: (
    world: World,
    index: number,
    amount: number,
    byPlayer: boolean,
  ) => Effect.Effect<void>;
  /** Apply damage to an entity reference directly (skips index lookup). */
  readonly applyDamageToEntityRef: (
    world: World,
    entity: Entity,
    amount: number,
    byPlayer: boolean,
  ) => Effect.Effect<void>;
  /** Apply damage to the local player, attributed to the named attacker. */
  readonly applyDamageToPlayer: (
    world: World,
    amount: number,
    attacker: { monsterId: string; name: string },
  ) => Effect.Effect<void>;
  /** Spawn the death bag at the given position when the local player dies. */
  readonly dropPlayerDeathBag: (
    world: World,
    x: number,
    z: number,
  ) => Effect.Effect<void>;
  /** Award XP to the local player; handles level-up cascading. */
  readonly grantExperience: (
    world: World,
    amount: number,
  ) => Effect.Effect<void>;
  /** Trigger a slash from the local player against the current target. */
  readonly slash: (world: World) => Effect.Effect<void>;
}

export class Combat extends Context.Service<Combat, CombatShape>()(
  'kassandra/sim/Combat',
) {}

export const makeCombat: Effect.Effect<CombatShape> = Effect.succeed({
  applyDamageToEntity: Effect.fn('Combat.applyDamageToEntity')(
    function* (world, index, amount, byPlayer) {
      applyDamageToEntityImpl(world, index, amount, byPlayer);
    },
  ),
  applyDamageToEntityRef: Effect.fn('Combat.applyDamageToEntityRef')(
    function* (world, entity, amount, byPlayer) {
      applyDamageToEntityRefImpl(world, entity, amount, byPlayer);
    },
  ),
  applyDamageToPlayer: Effect.fn('Combat.applyDamageToPlayer')(
    function* (world, amount, attacker) {
      applyDamageToPlayerImpl(world, amount, attacker);
    },
  ),
  dropPlayerDeathBag: Effect.fn('Combat.dropPlayerDeathBag')(
    function* (world, x, z) {
      dropPlayerDeathBagImpl(world, x, z);
    },
  ),
  grantExperience: Effect.fn('Combat.grantExperience')(
    function* (world, amount) {
      grantExperienceImpl(world, amount);
    },
  ),
  slash: Effect.fn('Combat.slash')(function* (world) {
    slashImpl(world);
  }),
});

export const CombatLayer = Layer.effect(Combat)(makeCombat);
