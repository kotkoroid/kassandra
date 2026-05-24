// Movement service — wraps systems/player.ts tickPlayer.
//
// Named "Movement" (per the master plan §6.2) because that's its real
// responsibility — the player.ts file accumulated movement + cooldowns
// + nav over time, but the orchestrator-visible entry point is "tick
// the player's movement for this frame." PR-D3 may split nav and
// movement into separate cores if the boundaries get cleaner.

import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';

import { tickPlayer as tickPlayerImpl } from '../systems/player.ts';
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
