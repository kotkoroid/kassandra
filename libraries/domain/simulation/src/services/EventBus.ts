// EventBus service — wraps events.ts.
//
// Currently events.ts holds a module-level `Set<Handler>` (which the
// PR-A1 pattern doc flagged as "replace with PubSub"). PR-D3 swaps the
// internal impl to PubSub<GameEvent>; PR-D2 keeps the existing impl
// and just adds the Service surface so callers can yield `EventBus`
// instead of importing emit/subscribe directly.

import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';

import {
  emit as emitImpl,
  subscribe as subscribeImpl,
  type GameEvent,
  type Handler,
} from '../events.ts';
import type { World } from '../types.ts';

export interface EventBusShape {
  /** Register a handler; returns the unsubscribe function. */
  readonly subscribe: (handler: Handler) => Effect.Effect<() => void>;
  /** Emit an event to every subscriber. */
  readonly emit: (world: World, event: GameEvent) => Effect.Effect<void>;
}

export class EventBus extends Context.Service<EventBus, EventBusShape>()(
  'kassandra/sim/EventBus',
) {}

export const makeEventBus: Effect.Effect<EventBusShape> = Effect.succeed({
  subscribe: (handler) => Effect.sync(() => subscribeImpl(handler)),
  emit: Effect.fn('EventBus.emit')(function* (world, event) {
    emitImpl(world, event);
  }),
});

export const EventBusLayer = Layer.effect(EventBus)(makeEventBus);
