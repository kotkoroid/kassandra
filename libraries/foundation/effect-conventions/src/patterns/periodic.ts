// Pattern: Periodic work (Effect.repeat + Schedule.spaced)
// ----------------------------------------------------------------------
//
// When to use:
//   Any `setInterval` / `setTimeout` loop. Effect schedules are
//   composable (combine spacings, attach jitter, bound by retries),
//   interrupt-safe (cancellation propagates through `Scope`), and
//   testable (swap in a virtual clock).
//
// What it replaces in Kassandra:
//   - services/realm/src/RealmRoom.ts:148-178 setInterval(…, 50) for the
//     20 Hz tick → `Effect.forkScoped(tickLoop)` with
//     `Schedule.spaced(Duration.millis(50))`. Closing the DO scope kills
//     the fiber automatically — no manual `stopTickLoop()` needed.
//
// Schedule taxonomy (most-used):
//   - `Schedule.spaced(d)`        — fixed delay between completions.
//   - `Schedule.fixed(d)`         — fixed delay between starts (drift-free).
//   - `Schedule.exponential(d)`   — exponential backoff (for retries).
//   - `Schedule.jittered`         — wrap any schedule with randomized jitter.
//
// 4.0 detail:
//   `Effect.forkScoped(eff)` is preferred over `Effect.fork(eff)` (which
//   is now `Effect.forkChild`). Scoped forks are interrupt-safe by
//   construction — the surrounding `Scope` owns the fiber's lifetime.

import * as Duration from 'effect/Duration';
import * as Effect from 'effect/Effect';
import * as Schedule from 'effect/Schedule';

// Reference shape: a tick fn whose body advances some state and a loop
// that runs it every 50 ms forever, forked under the surrounding scope.
const tickOnce = Effect.gen(function* () {
  // ... advance world by dt, broadcast snapshot, etc.
  yield* Effect.logDebug('tick');
});

export const tickLoop = tickOnce.pipe(
  Effect.repeat(Schedule.spaced(Duration.millis(50))),
);

// Reference usage — run the loop as a child fiber whose lifetime is
// bounded by the surrounding scope. `Effect.scoped` closes the scope
// (and interrupts the fiber) when this Effect completes or fails.
export const _exampleProgram = Effect.scoped(
  Effect.gen(function* () {
    yield* Effect.forkScoped(tickLoop);
    // ... do other work; tickLoop runs in the background ...
    yield* Effect.sleep(Duration.millis(200));
  }),
);
