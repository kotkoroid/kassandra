// Death service — wraps systems/death.ts.
//
// Runs the troller pipeline (bag carrier between death + respawn),
// updates the attackers summary, fires the respawn flow when the
// player requests it. Uses world.rng for placement.

import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';

import { tickDeath as tickDeathImpl } from '../systems/death.ts';
import type { World } from '../types.ts';

export interface DeathShape {
  /** Advance the death pipeline (troller, bug, respawn request). */
  readonly tick: (world: World, dt: number) => Effect.Effect<void>;
}

export class Death extends Context.Service<Death, DeathShape>()(
  'kassandra/sim/Death',
) {}

export const makeDeath: Effect.Effect<DeathShape> = Effect.succeed({
  tick: Effect.fn('Death.tick')(function* (world, dt) {
    tickDeathImpl(world, dt);
  }),
});

export const DeathLayer = Layer.effect(Death)(makeDeath);
