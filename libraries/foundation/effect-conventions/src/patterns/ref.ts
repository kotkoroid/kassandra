// Pattern: Shared state — Ref / SubscriptionRef / SynchronizedRef
// ----------------------------------------------------------------------
//
// Decision rule (pick the SIMPLEST that fits the access pattern):
//
//   Ref               — single owner, or already-serialized updates.
//                       Default choice. Server `WorldRef` (PR-B) uses
//                       this: the tick fiber owns all mutation.
//
//   SubscriptionRef   — multi-consumer reactive read. `.changes` exposes
//                       a `Stream<A>` that emits on every set. Client
//                       `ClientWorld` (PR-C) uses this so Svelte stores
//                       can mirror snapshots without polling.
//
//   SynchronizedRef   — async-effectful updates that must serialize
//                       against each other. Use when the update needs
//                       to `yield*` something (snapshot + persist +
//                       broadcast atomically).
//
// 4.0 gotcha (migration/yieldable.md):
//   `Ref` is NO LONGER an Effect subtype. `yield* ref` does not read
//   the value — that was a v3 affordance. Always `yield* Ref.get(ref)`
//   and `yield* Ref.set(ref, …)`. Same for `Deferred` and `Fiber`.

import * as Effect from 'effect/Effect';
import * as Ref from 'effect/Ref';
import * as Stream from 'effect/Stream';
import * as SubscriptionRef from 'effect/SubscriptionRef';
import * as SynchronizedRef from 'effect/SynchronizedRef';

// Ref — the workhorse.
const _ref = Effect.gen(function* () {
  const ref = yield* Ref.make(0);
  yield* Ref.update(ref, (n) => n + 1);
  return yield* Ref.get(ref);
});

// SubscriptionRef — broadcast updates.
const _subscriptionRef = Effect.gen(function* () {
  const ref = yield* SubscriptionRef.make<{ tick: number }>({ tick: 0 });
  // Consumer fiber: render every state change. SubscriptionRef.changes
  // is a FUNCTION returning a Stream (not a property — different from
  // some other reactive libraries).
  yield* Effect.forkScoped(
    Stream.runForEach(SubscriptionRef.changes(ref), (state) =>
      Effect.logDebug(`tick=${state.tick}`),
    ),
  );
  // Producer.
  yield* SubscriptionRef.set(ref, { tick: 1 });
});

// SynchronizedRef — atomic effectful updates.
const _synchronizedRef = Effect.gen(function* () {
  const ref = yield* SynchronizedRef.make({ tick: 0 });
  // The updater can yield Effects; the next update will queue until
  // this one finishes, preserving consistency across concurrent writers.
  yield* SynchronizedRef.updateEffect(ref, (state) =>
    Effect.gen(function* () {
      // ... persist to storage, broadcast, etc., before returning the new state.
      return { tick: state.tick + 1 };
    }),
  );
});

export const _exampleProgram = Effect.all([_ref, _subscriptionRef, _synchronizedRef]);
