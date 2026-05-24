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
import type { Entity, PlayerId, World } from '../types.ts';

export interface CombatShape {
  /**
   * Apply damage to an entity by its index in world.entities.
   * `attribution` = the slayer's player id when damage came from a
   * player (XP + loot ownership flow to that player on kill); `null`
   * for environmental damage (NPC vs NPC, projectile from a monster).
   */
  readonly applyDamageToEntity: (
    world: World,
    index: number,
    amount: number,
    attribution: PlayerId | null,
  ) => Effect.Effect<void>;
  /** Apply damage to an entity reference directly (skips index lookup). */
  readonly applyDamageToEntityRef: (
    world: World,
    entity: Entity,
    amount: number,
    attribution: PlayerId | null,
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
  /** Award XP to `playerId`; handles level-up cascading. */
  readonly grantExperience: (
    world: World,
    playerId: PlayerId,
    amount: number,
  ) => Effect.Effect<void>;
  /** Trigger a slash from `playerId` against their current target. */
  readonly slash: (world: World, playerId: PlayerId) => Effect.Effect<void>;
}

export class Combat extends Context.Service<Combat, CombatShape>()(
  'kassandra/sim/Combat',
) {}

export const makeCombat: Effect.Effect<CombatShape> = Effect.succeed({
  applyDamageToEntity: Effect.fn('Combat.applyDamageToEntity')(
    function* (world, index, amount, attribution) {
      applyDamageToEntityImpl(world, index, amount, attribution);
    },
  ),
  applyDamageToEntityRef: Effect.fn('Combat.applyDamageToEntityRef')(
    function* (world, entity, amount, attribution) {
      applyDamageToEntityRefImpl(world, entity, amount, attribution);
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
    function* (world, playerId, amount) {
      grantExperienceImpl(world, playerId, amount);
    },
  ),
  slash: Effect.fn('Combat.slash')(function* (world, playerId) {
    slashImpl(world, playerId);
  }),
});

export const CombatLayer = Layer.effect(Combat)(makeCombat);
