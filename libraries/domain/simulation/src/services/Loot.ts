// Loot service — wraps systems/loot.ts.

import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';

import { tickLootBags as tickLootBagsImpl } from '../systems/loot.ts';
import type { World } from '../types.ts';

export interface LootShape {
  /** Decrement every loot bag's TTL; expire empties. */
  readonly tick: (world: World, dt: number) => Effect.Effect<void>;
}

export class Loot extends Context.Service<Loot, LootShape>()(
  'kassandra/sim/Loot',
) {}

export const makeLoot: Effect.Effect<LootShape> = Effect.succeed({
  tick: Effect.fn('Loot.tick')(function* (world, dt) {
    tickLootBagsImpl(world, dt);
  }),
});

export const LootLayer = Layer.effect(Loot)(makeLoot);
