// Pattern: Service (Context.Service)
// ----------------------------------------------------------------------
//
// When to use:
//   Any unit of behaviour with dependencies — sim state, sockets,
//   broadcasters, RPC handlers, anything that today lives as a
//   module-level `let` / `Set<Handler>` / `Map`.
//
// What it replaces in Kassandra (as of this PR):
//   - services/realm/src/PartyRoom.ts:125 `const world = createWorld()`
//   - services/realm/src/PartyRoom.ts:126-128 three `new Map()` lines
//   - libraries/domain/simulation/src/events.ts `Set<Handler>` —
//     replaced in PR-D3d.3 by per-world `world.recentEvents` shipped
//     via snapshot
//   - applications/game/src/realm.svelte.ts:6-9 module-level `let ws`
//
// Convention:
//   - The class body holds NO instance state. Construction is the `make`
//     Effect, which may yield other services to compose them. The shape
//     this Effect returns IS the service interface.
//   - Static `.layer` attaches the canonical implementation. Naming is
//     always lowercase `.layer` (NOT v3's `.Default` or `.Live`).
//   - Optional static `.layerTest` (or `.layerTest(seed)`) provides a
//     variant whose `make` swaps mocks or seeds for tests.
//
// 4.0 gotcha:
//   v3's static proxy accessors (`Database.notify("msg")`) are removed.
//   Reach the shape via `yield* Database` inside a generator, or use
//   `Database.use((d) => …)` for one-liners.

import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Ref from 'effect/Ref';

// Reference shape: a tiny Counter service with effectful get + increment.
// The `make` Effect builds the underlying Ref and returns the API. In a
// real service this is where you'd `yield* OtherService` for dependencies.
export class Counter extends Context.Service<
  Counter,
  {
    readonly get: Effect.Effect<number>;
    readonly increment: Effect.Effect<void>;
  }
>()('patterns/Service/Counter', {
  make: Effect.gen(function* () {
    const ref = yield* Ref.make(0);
    return {
      get: Ref.get(ref),
      increment: Ref.update(ref, (n) => n + 1),
    };
  }),
}) {
  // Canonical implementation. Use everywhere by default.
  static readonly layer = Layer.effect(this, this.make);

  // Test variant seeded to a known starting value. Same shape, swapped
  // `make`. Property tests can layer this in to start from a fixture.
  static readonly layerTest = (start: number) =>
    Layer.effect(
      this,
      Effect.gen(function* () {
        const ref = yield* Ref.make(start);
        return {
          get: Ref.get(ref),
          increment: Ref.update(ref, (n) => n + 1),
        };
      }),
    );
}

// Reference usage — proves the pattern composes end-to-end.
// `yield* Counter` resolves the shape; calls go through the shape's
// effectful methods. No static proxy needed.
export const _exampleProgram = Effect.gen(function* () {
  const counter = yield* Counter;
  yield* counter.increment;
  yield* counter.increment;
  return yield* counter.get; // 2 with the default layer
}).pipe(Effect.provide(Counter.layer));
