// Inputs service — wraps input.ts dispatch.
//
// PR-D2 thin wrapper. The realm-side per-player input drain happens
// via InputBuffer (services/realm/src/services/InputBuffer.ts); this
// service is the SIM-side single-entry-point that pushes a SimEvent
// onto world.inputQueue (sync, same as today). PR-D3 may migrate the
// inputQueue to an Effect Queue but that's a wider sim restructure.

import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';

import { dispatch as dispatchImpl } from '../input.ts';
import type { SimEvent, World } from '../types.ts';

export interface InputsShape {
  /** Push a sim event onto world.inputQueue. */
  readonly dispatch: (world: World, event: SimEvent) => Effect.Effect<void>;
}

export class Inputs extends Context.Service<Inputs, InputsShape>()(
  'kassandra/sim/Inputs',
) {}

export const makeInputs: Effect.Effect<InputsShape> = Effect.succeed({
  dispatch: Effect.fn('Inputs.dispatch')(function* (world, event) {
    dispatchImpl(world, event);
  }),
});

export const InputsLayer = Layer.effect(Inputs)(makeInputs);
