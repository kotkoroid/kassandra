// Pattern: Inbound queue (Queue.bounded / Queue.unbounded)
// ----------------------------------------------------------------------
//
// When to use:
//   Any producer/consumer hand-off where the producer is event-driven
//   (callback, socket message, WS frame) and the consumer is a fiber
//   that pulls on its own schedule.
//
// What it replaces in Kassandra:
//   - services/realm/src/PartyRoom.ts:129-130 `pendingInputs` +
//     `pendingEvents` Maps → per-session `Queue<ClientMessage>`,
//     drained at the top of each tick. The manual reset at lines
//     163-164 disappears — Queue.takeAll empties atomically.
//   - libraries/foundation/effect-conventions/src/realm-rpc-do.ts —
//     unbounded inbound queue bridging DurableWebSocket frames to the
//     Socket's runRaw loop.
//
// Bounded vs unbounded:
//   - `Queue.bounded(n)`  — back-pressure: offer blocks when full.
//                          Use when the producer can be slowed down.
//   - `Queue.unbounded()` — no back-pressure. Use when the producer
//                          is already throttled upstream (workerd
//                          itself), or when dropping is unacceptable.
//
// 4.0 detail:
//   `Queue.end(q)` causes pending takes to fail with `Cause.Done`.
//   Catch with `Effect.catchTag('Done', …)` (or `Effect.catchCause`).

import * as Cause from 'effect/Cause';
import * as Effect from 'effect/Effect';
import * as Queue from 'effect/Queue';

// Reference shape: a bounded queue with one producer and one consumer.
export const _exampleProgram = Effect.scoped(
  Effect.gen(function* () {
    const q = yield* Queue.bounded<string, Cause.Done>(64);

    // Consumer fiber. takeAll drains every available item in one call —
    // ideal for tick-rate batch processing (every 50 ms, process whatever
    // has accumulated).
    yield* Effect.forkScoped(
      Effect.gen(function* () {
        while (true) {
          const batch = yield* Queue.takeAll(q).pipe(
            Effect.catchTag('Done', () => Effect.succeed([])),
          );
          for (const msg of batch) {
            yield* Effect.logDebug(`consumed: ${msg}`);
          }
        }
      }),
    );

    // Producer (would normally be an event handler).
    yield* Queue.offer(q, 'hello');
    yield* Queue.offer(q, 'world');
    yield* Queue.end(q); // signals consumer to stop blocking
  }),
);
