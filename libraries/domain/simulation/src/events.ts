// In-sim event bus. Core systems emit cross-cutting events (damage
// popups, kill feed, level-up announce, spell cast); the events flow
// out of the simulation via the snapshot, not via in-process handlers.
//
// PR-D3d.3 rewrite: the old `Set<Handler>` lived module-side, which
// meant the *client's* copy of the Set was the one any UI subscriber
// landed on — but the sim runs in the DO, so client-side subscribers
// never fired. Now `emit()` pushes onto `world.recentEvents`; the
// realm tick ships those in the snapshot; the client's
// `applySnapshot` dispatches them to UI consumers.
//
// `GameEvent` lives in types.ts to avoid an events.ts ↔ types.ts
// import cycle (World needs the event shape for `recentEvents`).

import type { GameEvent, World } from './types.ts';

// Re-export for callers that import the event union from this module.
export type { GameEvent };

// Hard cap so a runaway emission loop can't unbounded the buffer in a
// single tick. Old events fall out first. 256 covers a heavy fight
// frame (a swarm of damage popups + several kills) with headroom.
const MAX_EVENTS_PER_TICK = 256;

export function emit(world: World, event: GameEvent): void {
  const buf = world.recentEvents;
  buf.push(event);
  if (buf.length > MAX_EVENTS_PER_TICK) {
    buf.splice(0, buf.length - MAX_EVENTS_PER_TICK);
  }
}

// Tick-boundary helper: clear the per-tick buffer after the snapshot
// has been built. Called once per tick from the realm's Tick.step
// (between snapshot publish and the next sim step).
export function clearEvents(world: World): void {
  // Mutate in place; the snapshot has already copied the array.
  world.recentEvents.length = 0;
}
