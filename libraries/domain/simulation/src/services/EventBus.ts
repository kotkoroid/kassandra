// EventBus service — Effect surface over the per-world event buffer.
//
// PR-D3d.3: the old Set<Handler> + `subscribe()` is gone. Events are
// emitted into `world.recentEvents` and shipped via the snapshot.
// Subscribers (UI) read out of the snapshot on the client side. This
// service is kept for parity with the master plan's service inventory
// — it exposes the sync `emit()` as an Effect for Effect-yielding
// call sites, and the tick-boundary `clear()`.

import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';

import type { GameEvent, World } from '../types.ts';
import { clearEvents as clearEventsImpl, emit as emitImpl } from '../world.ts';

export interface EventBusShape {
  /** Push an event onto `world.recentEvents`. */
  readonly emit: (world: World, event: GameEvent) => Effect.Effect<void>;
  /** Drain the per-tick buffer; call at the tick boundary after the snapshot is built. */
  readonly clear: (world: World) => Effect.Effect<void>;
}

export class EventBus extends Context.Service<EventBus, EventBusShape>()(
  'kassandra/sim/EventBus',
) {}

export const makeEventBus: Effect.Effect<EventBusShape> = Effect.succeed({
  emit: Effect.fn('EventBus.emit')(function* (world, event) {
    emitImpl(world, event);
  }),
  clear: Effect.fn('EventBus.clear')(function* (world) {
    clearEventsImpl(world);
  }),
});

export const EventBusLayer = Layer.effect(EventBus)(makeEventBus);
