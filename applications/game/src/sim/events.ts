// In-sim event bus. Core systems emit events; cross-cutting features
// (achievements, quests, kill-feed, sound) subscribe without touching
// the emitting code.
//
// Usage:
//   const unsub = subscribe((world, ev) => { ... });
//   // later:
//   unsub();

import type { EntityKind, World } from './types';
import type { MonsterId } from '../monsters';

export type GameEvent =
  | {
      kind: 'entity-killed';
      entityKind: EntityKind;
      monsterId: MonsterId;
      x: number;
      z: number;
      byPlayer: boolean;
    }
  | { kind: 'player-level-up'; level: number };

type Handler = (world: World, event: GameEvent) => void;

const handlers = new Set<Handler>();

// Returns an unsubscribe function.
export function subscribe(handler: Handler): () => void {
  handlers.add(handler);
  return () => handlers.delete(handler);
}

export function emit(world: World, event: GameEvent): void {
  for (const h of handlers) h(world, event);
}
