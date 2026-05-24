// Tick — the authoritative 20 Hz simulation loop.
//
// Replaces the setInterval-driven loop at old PartyRoom.ts:148-178
// (startTickLoop/stopTickLoop). One Effect-native loop: drain the
// input buffer, run one sim step, broadcast the new snapshot.
//
// In PR-D the inner `tick()` call becomes Effect-native too (the sim
// library converts to services). For now `Effect.sync(() => tick(...))`
// is the only seam — keeps PR-B a pure refactor of the orchestration
// layer without touching simulation internals.

import {
  tick,
  type FrameInputs,
  type PlayerId,
  type SimEvent,
} from '@kassandra/simulation-domain-library';
import * as Clock from 'effect/Clock';
import * as Context from 'effect/Context';
import * as Duration from 'effect/Duration';
import * as Effect from 'effect/Effect';
import * as Ref from 'effect/Ref';
import * as Schedule from 'effect/Schedule';

import type { InputBufferShape } from './InputBuffer.ts';
import type { SessionsRefShape } from './SessionsRef.ts';
import type { WorldRefShape } from './WorldRef.ts';

const TICK_INTERVAL = Duration.millis(50); // 20 Hz
const MAX_DT_SECONDS = 1 / 5; // cap on a single step's dt (200 ms)

export interface TickShape {
  /** Run exactly one tick using the provided wall-clock delta. */
  readonly step: (dt: number) => Effect.Effect<void>;
  /**
   * The forever-loop. Fork with `Effect.forkScoped(loop)` from inside
   * a Scope so closing the scope interrupts the fiber cleanly.
   */
  readonly loop: Effect.Effect<void>;
}

export class Tick extends Context.Service<Tick, TickShape>()(
  'kassandra/realm/Tick',
) {}

/**
 * Build a Tick orchestrator over the given services. Pure factory —
 * the result depends only on the service shapes passed in, not on the
 * Context, so PartyRoom can construct everything in its own per-DO
 * setup without going through Layer.
 */
export const makeTick = (deps: {
  readonly worldRef: WorldRefShape;
  readonly sessionsRef: SessionsRefShape;
  readonly inputBuffer: InputBufferShape;
}): Effect.Effect<TickShape> =>
  Effect.gen(function* () {
    const { worldRef, sessionsRef, inputBuffer } = deps;

    const step = (dt: number) =>
      Effect.gen(function* () {
        const sessions = yield* sessionsRef.all;
        const { allInputs, allEvents } = yield* inputBuffer.drainFrame(sessions);
        yield* worldRef.modify((w) => {
          // Same mutate-in-place pattern as the old code path. The Ref
          // is set to the same reference; downstream consumers `yield*
          // worldRef.get` and see the new state. tick becomes pure /
          // Effect-native in PR-D. The cast turns ReadonlyArray into
          // the mutable shape `tick()` still accepts — sim library
          // signature widens in PR-D2.
          tick(
            w,
            dt,
            allInputs as Record<PlayerId, FrameInputs>,
            allEvents as Record<PlayerId, SimEvent[]>,
          );
          return w;
        });
        const snapshot = yield* worldRef.snapshot;
        yield* sessionsRef.broadcast(JSON.stringify(snapshot));
      });

    // The loop uses `effect/Clock` for wall-clock dt — same source as
    // setInterval's `Date.now()` but testable (a virtual clock swaps in
    // for free in `@effect/vitest`).
    const loop = Effect.gen(function* () {
      const lastRef = yield* Ref.make(yield* Clock.currentTimeMillis);
      const oneTick = Effect.gen(function* () {
        const now = yield* Clock.currentTimeMillis;
        const last = yield* Ref.getAndSet(lastRef, now);
        const dt = Math.min((now - last) / 1000, MAX_DT_SECONDS);
        yield* step(dt);
      });
      yield* oneTick.pipe(Effect.repeat(Schedule.spaced(TICK_INTERVAL)));
    });

    return { step, loop };
  });
