// HealingCircles service — wraps pure/healingCircles.ts.

import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';

import { tickHealingCircles as tickHealingCirclesImpl } from '../pure/healingCircles.ts';
import type { World } from '../types.ts';

export interface HealingCirclesShape {
  /** Advance every healing circle (heal pulses + TTL expiry). */
  readonly tick: (world: World, dt: number) => Effect.Effect<void>;
}

export class HealingCircles extends Context.Service<
  HealingCircles,
  HealingCirclesShape
>()('kassandra/sim/HealingCircles') {}

export const makeHealingCircles: Effect.Effect<HealingCirclesShape> = Effect.succeed({
  tick: Effect.fn('HealingCircles.tick')(function* (world, dt) {
    tickHealingCirclesImpl(world, dt);
  }),
});

export const HealingCirclesLayer = Layer.effect(HealingCircles)(makeHealingCircles);
