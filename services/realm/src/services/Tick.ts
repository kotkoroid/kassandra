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

import type { Snapshot } from '@kassandra/protocol-foundation-library';
import {
  Tick as SimTick,
  type WorldRefShape,
} from '@kassandra/simulation-domain-library';
import * as Clock from 'effect/Clock';
import * as Context from 'effect/Context';
import * as Duration from 'effect/Duration';
import * as Effect from 'effect/Effect';
import type * as PubSub from 'effect/PubSub';
import * as PubSubMod from 'effect/PubSub';
import * as Ref from 'effect/Ref';
import * as Schedule from 'effect/Schedule';

import type { InputBufferShape } from './InputBuffer.ts';

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
 * Build a Tick orchestrator over the given services. Yields sim's
 * `Tick` service (the actual per-step orchestration); PartyRoom
 * provides it via SimLayer when constructing this.
 *
 * What this layer adds on top of sim's Tick:
 *   - Drain the per-player InputBuffer once per step.
 *   - After the sim step, build the wire-form snapshot and publish it
 *     to the PubSub that the RpcServer's SnapshotStream handler reads.
 *
 * Sim handles the actual simulation; realm handles the realm-specific
 * I/O (inputs from RPC handlers, snapshots fanned out to clients).
 */
export const makeTick = (deps: {
  readonly worldRef: WorldRefShape;
  readonly inputBuffer: InputBufferShape;
  readonly snapshotPubSub: PubSub.PubSub<Snapshot>;
}): Effect.Effect<TickShape, never, SimTick> =>
  Effect.gen(function* () {
    const simTick = yield* SimTick;
    const { worldRef, inputBuffer, snapshotPubSub } = deps;

    const step = (dt: number) =>
      Effect.gen(function* () {
        const { allInputs, allEvents } = yield* inputBuffer.drainFrame;
        yield* simTick.step(dt, allInputs, allEvents);
        const snapshot = yield* worldRef.snapshot;
        yield* PubSubMod.publish(snapshotPubSub, snapshot);
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
