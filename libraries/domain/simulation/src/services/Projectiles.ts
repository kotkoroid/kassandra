// Projectiles service — wraps pure/projectiles.ts.

import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';

import { tickProjectiles as tickProjectilesImpl } from '../pure/projectiles.ts';
import type { World } from '../types.ts';

export interface ProjectilesShape {
  /** Advance every projectile (movement + hit detection). */
  readonly tick: (world: World, dt: number) => Effect.Effect<void>;
}

export class Projectiles extends Context.Service<Projectiles, ProjectilesShape>()(
  'kassandra/sim/Projectiles',
) {}

export const makeProjectiles: Effect.Effect<ProjectilesShape> = Effect.succeed({
  tick: Effect.fn('Projectiles.tick')(function* (world, dt) {
    tickProjectilesImpl(world, dt);
  }),
});

export const ProjectilesLayer = Layer.effect(Projectiles)(makeProjectiles);
