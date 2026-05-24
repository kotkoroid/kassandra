// InputBuffer — per-session inputs + events buffer drained per tick.
//
// Replaces the two parallel Maps at old PartyRoom.ts:127-128
// (`pendingInputs` + `pendingEvents`) AND the manual zero-out loop at
// old PartyRoom.ts:160-165 (`pendingInputs.set(sid, {0,0}); pendingEvents.set(sid, [])`).
//
// Semantics preserved exactly:
//   - inputs:  LATEST-WINS. Each frame's webSocketMessage overwrites
//              the per-session move vector. Drained per tick.
//   - events:  ACCUMULATING. Each frame's events append to the per-
//              session list. Drained per tick.
//
// `drainFrame` reads the current sessions list (built by SessionsRef)
// to know how to key the output by `PlayerId`. It atomically swaps the
// internal state to empty, so concurrent message handlers running
// between drain calls land in the next frame.

import type {
  FrameInputs,
  PlayerId,
  SimEvent,
} from '@kassandra/simulation-domain-library';
import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Ref from 'effect/Ref';

import type { Session, SessionId } from './SessionsRef.ts';

interface PerSession {
  readonly inputs: FrameInputs;
  readonly events: ReadonlyArray<SimEvent>;
}

const EMPTY: PerSession = { inputs: { moveX: 0, moveZ: 0 }, events: [] };

export interface DrainedFrame {
  readonly allInputs: Record<PlayerId, FrameInputs>;
  readonly allEvents: Record<PlayerId, ReadonlyArray<SimEvent>>;
}

export interface InputBufferShape {
  /** Seed a freshly-accepted session's slot. */
  readonly initSession: (sessionId: SessionId) => Effect.Effect<void>;
  /** Drop a closed session's slot. */
  readonly clearSession: (sessionId: SessionId) => Effect.Effect<void>;
  /** Replace this session's latest movement vector. */
  readonly setInputs: (sessionId: SessionId, inputs: FrameInputs) => Effect.Effect<void>;
  /** Append these events to this session's frame buffer. */
  readonly appendEvents: (
    sessionId: SessionId,
    events: ReadonlyArray<SimEvent>,
  ) => Effect.Effect<void>;
  /**
   * Atomically take everything accumulated since the last drain and
   * reset to empty. The current sessions list (from SessionsRef.all)
   * is passed in so we can key the output by `PlayerId`.
   */
  readonly drainFrame: (
    sessions: ReadonlyArray<readonly [SessionId, Session]>,
  ) => Effect.Effect<DrainedFrame>;
}

export class InputBuffer extends Context.Service<InputBuffer, InputBufferShape>()(
  'kassandra/realm/InputBuffer',
) {}

export const makeInputBuffer: Effect.Effect<InputBufferShape> = Effect.gen(function* () {
  const ref = yield* Ref.make<Map<SessionId, PerSession>>(new Map());
  return {
    initSession: (sessionId) =>
      Ref.update(ref, (m) => {
        const next = new Map(m);
        next.set(sessionId, EMPTY);
        return next;
      }),
    clearSession: (sessionId) =>
      Ref.update(ref, (m) => {
        const next = new Map(m);
        next.delete(sessionId);
        return next;
      }),
    setInputs: (sessionId, inputs) =>
      Ref.update(ref, (m) => {
        const next = new Map(m);
        const prev = next.get(sessionId) ?? EMPTY;
        next.set(sessionId, { inputs, events: prev.events });
        return next;
      }),
    appendEvents: (sessionId, events) =>
      Ref.update(ref, (m) => {
        if (events.length === 0) return m;
        const next = new Map(m);
        const prev = next.get(sessionId) ?? EMPTY;
        next.set(sessionId, { inputs: prev.inputs, events: [...prev.events, ...events] });
        return next;
      }),
    drainFrame: (sessions) =>
      Ref.modify(ref, (m) => {
        const allInputs: Record<PlayerId, FrameInputs> = {};
        const allEvents: Record<PlayerId, ReadonlyArray<SimEvent>> = {};
        for (const [sid, { playerId }] of sessions) {
          const slot = m.get(sid) ?? EMPTY;
          allInputs[playerId] = slot.inputs;
          allEvents[playerId] = slot.events;
        }
        // Reset to empty slots for every still-active session. Closed
        // sessions get GC'd when SessionsRef removes them, then
        // clearSession follows in the close handler.
        const next = new Map<SessionId, PerSession>();
        for (const [sid] of sessions) next.set(sid, EMPTY);
        return [{ allInputs, allEvents }, next];
      }),
  };
});
