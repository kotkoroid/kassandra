// In-sim event bus. Core systems emit events; cross-cutting features
// (achievements, quests, kill-feed, sound) subscribe without touching
// the emitting code.
//
// Usage:
//   const unsub = subscribe((world, ev) => { ... });
//   // later:
//   unsub();

import type { EntityKind, World } from './types.ts';
import type { MonsterId } from './monsters.ts';

export type GameEvent =
  | {
      kind: 'entity-killed';
      entityKind: EntityKind;
      monsterId: MonsterId;
      x: number;
      z: number;
      byPlayer: boolean;
    }
  | { kind: 'player-level-up'; level: number }
  | {
      // A discrete hit landed. The renderer turns these into floating
      // damage popups; new subscribers (sounds, screen shake, combat
      // log) can hook the same event without touching combat code.
      kind: 'damage-dealt';
      x: number;
      z: number;
      amount: number;
      // True = the player dealt the damage (popup colored "given").
      // False = the player received the damage (popup colored "taken").
      byPlayer: boolean;
    }
  | { kind: 'spell-cast'; spellId: string; x: number; z: number };

export type Handler = (world: World, event: GameEvent) => void;

const handlers = new Set<Handler>();

// Returns an unsubscribe function.
export function subscribe(handler: Handler): () => void {
  handlers.add(handler);
  return () => handlers.delete(handler);
}

export function emit(world: World, event: GameEvent): void {
  for (const h of handlers) h(world, event);
}
