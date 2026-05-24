// Pattern: Reactive bridge — Effect SubscriptionRef ↔ Svelte 5 $state
// ----------------------------------------------------------------------
//
// The key client-side design call: Effect owns the truth (a
// `SubscriptionRef<World>`), Svelte mirrors a `$state` copy that's
// overwritten when the stream emits. Threlte / Three.js components
// subscribe to the Svelte mirror — they never see Effect.
//
// Why one-way (and not bidirectional):
//   World state mutates SERVER-SIDE only. The client receives full
//   snapshots and never edits the world locally. So we only ever push
//   server→Effect→Svelte. UI-only state (panel open/closed, chat draft,
//   selection) lives in standalone Svelte `$state` and never crosses
//   into Effect.
//
// What it enables in PR-C:
//   - `applications/game/src/lib/effect-bridge.svelte.ts` (file name
//     ends with `.svelte.ts` so Svelte's compiler runs and `$state`
//     is recognised). The function below is platform-agnostic — Svelte
//     types aren't imported here; we type `target` as
//     `{ value: A }` and let the consumer pass a `$state` proxy.
//
// Implementation note:
//   `Stream.runForEach(ref.changes, …)` only completes when the
//   SubscriptionRef itself is finalized. We fork it; the caller stops
//   the bridge by interrupting the returned fiber. In Svelte components
//   that means calling the unsubscribe in `onDestroy`.

import * as Effect from 'effect/Effect';
import * as Stream from 'effect/Stream';
import * as SubscriptionRef from 'effect/SubscriptionRef';

/**
 * Subscribe `target.value` to the SubscriptionRef's change stream. The
 * first emission happens synchronously (SubscriptionRef.changes starts
 * with the current value). Returns a teardown function — call from
 * `onDestroy` in Svelte, or anywhere a component is leaving the tree.
 *
 * The `target` is intentionally typed as a plain mutable holder so
 * this module doesn't pull in Svelte. Consumers pass a `$state` proxy.
 */
export const bindSubscriptionRef = <A>(
  ref: SubscriptionRef.SubscriptionRef<A>,
  target: { value: A },
): (() => void) => {
  const fiber = Effect.runFork(
    Stream.runForEach(SubscriptionRef.changes(ref), (a) =>
      Effect.sync(() => {
        target.value = a;
      }),
    ),
  );
  // `interruptUnsafe` is the synchronous counterpart of
  // `Fiber.interrupt(fiber)`; teardown callbacks can't yield Effects,
  // so we drop the (clean) interruption signal as fire-and-forget.
  return () => fiber.interruptUnsafe();
};
