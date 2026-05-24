// Monsters service — wraps systems/monsters.ts.
//
// Drives monster AI (aggro, pursuit, ranged casts). Uses world.rng
// for variance; the rng-as-context migration happens in PR-D3.

import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';

import { tickMonsters as tickMonstersImpl } from '../systems/monsters.ts';
import type { World } from '../types.ts';

export interface MonstersShape {
  /** Advance every monster's AI for one frame. */
  readonly tick: (world: World, dt: number) => Effect.Effect<void>;
}

export class Monsters extends Context.Service<Monsters, MonstersShape>()(
  'kassandra/sim/Monsters',
) {}

export const makeMonsters: Effect.Effect<MonstersShape> = Effect.succeed({
  tick: Effect.fn('Monsters.tick')(function* (world, dt) {
    tickMonstersImpl(world, dt);
  }),
});

export const MonstersLayer = Layer.effect(Monsters)(makeMonsters);
