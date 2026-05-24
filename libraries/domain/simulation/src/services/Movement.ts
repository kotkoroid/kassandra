// Movement service — wraps pure/movement.ts tickPlayer.
//
// PR-D3e.3: the pure core lives at `pure/movement.ts` (renamed from
// the earlier `systems/player.ts`). Named "Movement" per master plan
// §6.2 because that's the orchestrator-visible responsibility — the
// pure file accumulated movement + cooldowns + nav over time.

import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';

import { tickPlayer as tickPlayerImpl } from '../pure/movement.ts';
import type { FrameInputs, PlayerId, World } from '../types.ts';

export interface MovementShape {
  /** Advance `playerId` for one frame using the given inputs. */
  readonly tickPlayer: (
    world: World,
    playerId: PlayerId,
    dt: number,
    inputs: FrameInputs,
  ) => Effect.Effect<void>;
}

export class Movement extends Context.Service<Movement, MovementShape>()(
  'kassandra/sim/Movement',
) {}

export const makeMovement: Effect.Effect<MovementShape> = Effect.succeed({
  tickPlayer: Effect.fn('Movement.tickPlayer')(function* (world, playerId, dt, inputs) {
    tickPlayerImpl(world, playerId, dt, inputs);
  }),
});

export const MovementLayer = Layer.effect(Movement)(makeMovement);
