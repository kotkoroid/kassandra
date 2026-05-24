// InputBuffer — per-player inputs + events buffer drained per tick.
//
// PR-B2: rekeyed from sessionId to playerId. RPC handlers receive
// PlayerSession (playerId) directly; there's no remaining need to
// translate sessionId → playerId in the hot path. Multi-tab-same-player
// collides into one buffer (last writer wins for inputs, append for
// events) — that's a known acceptable behaviour and matches "one player
// has one set of inputs."
//
// Semantics preserved exactly from PR-B:
//   - inputs:  LATEST-WINS. Each frame's RPC overwrites the per-player
//              move vector. Drained per tick.
//   - events:  ACCUMULATING. Each frame's events append to the per-
//              player list. Drained per tick.
//
// Lifecycle:
//   - initPlayer(pid)  — called on connect so the player appears in
//                       drainFrame's output even before they've sent
//                       anything (preserves the "tick all connected
//                       players with default {0,0}" behaviour from the
//                       pre-RPC handler).
//   - clearPlayer(pid) — called on disconnect.

import type {
  FrameInputs,
  PlayerId,
  SimEvent,
} from '@kassandra/simulation-domain-library';
import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Ref from 'effect/Ref';

interface PerPlayer {
  readonly inputs: FrameInputs;
  readonly events: ReadonlyArray<SimEvent>;
}

const EMPTY: PerPlayer = { inputs: { moveX: 0, moveZ: 0 }, events: [] };

export interface DrainedFrame {
  readonly allInputs: Record<PlayerId, FrameInputs>;
  readonly allEvents: Record<PlayerId, ReadonlyArray<SimEvent>>;
}

export interface InputBufferShape {
  /** Seed a freshly-connected player's slot (defaults to EMPTY). */
  readonly initPlayer: (playerId: PlayerId) => Effect.Effect<void>;
  /** Drop a disconnected player's slot. */
  readonly clearPlayer: (playerId: PlayerId) => Effect.Effect<void>;
  /** Replace this player's latest movement vector. */
  readonly setInputs: (playerId: PlayerId, inputs: FrameInputs) => Effect.Effect<void>;
  /** Append events to this player's frame buffer. */
  readonly appendEvents: (
    playerId: PlayerId,
    events: ReadonlyArray<SimEvent>,
  ) => Effect.Effect<void>;
  /**
   * Atomically take everything accumulated since the last drain and
   * reset each player's slot to EMPTY. Only currently-tracked players
   * appear in the output — disconnected players are gone (the close
   * handler is responsible for clearPlayer before the next drain).
   */
  readonly drainFrame: Effect.Effect<DrainedFrame>;
}

export class InputBuffer extends Context.Service<InputBuffer, InputBufferShape>()(
  'kassandra/realm/InputBuffer',
) {}

export const makeInputBuffer: Effect.Effect<InputBufferShape> = Effect.gen(function* () {
  const ref = yield* Ref.make<Map<PlayerId, PerPlayer>>(new Map());
  return {
    initPlayer: (playerId) =>
      Ref.update(ref, (m) => {
        const next = new Map(m);
        next.set(playerId, EMPTY);
        return next;
      }),
    clearPlayer: (playerId) =>
      Ref.update(ref, (m) => {
        const next = new Map(m);
        next.delete(playerId);
        return next;
      }),
    setInputs: (playerId, inputs) =>
      Ref.update(ref, (m) => {
        const next = new Map(m);
        const prev = next.get(playerId) ?? EMPTY;
        next.set(playerId, { inputs, events: prev.events });
        return next;
      }),
    appendEvents: (playerId, events) =>
      Ref.update(ref, (m) => {
        if (events.length === 0) return m;
        const next = new Map(m);
        const prev = next.get(playerId) ?? EMPTY;
        next.set(playerId, { inputs: prev.inputs, events: [...prev.events, ...events] });
        return next;
      }),
    drainFrame: Ref.modify(ref, (m) => {
      const allInputs: Record<PlayerId, FrameInputs> = {};
      const allEvents: Record<PlayerId, ReadonlyArray<SimEvent>> = {};
      const next = new Map<PlayerId, PerPlayer>();
      for (const [pid, slot] of m) {
        allInputs[pid] = slot.inputs;
        allEvents[pid] = slot.events;
        next.set(pid, EMPTY);
      }
      return [{ allInputs, allEvents }, next];
    }),
  };
});
