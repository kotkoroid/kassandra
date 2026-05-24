// Pattern: Layer composition
// ----------------------------------------------------------------------
//
// When to use:
//   Wiring services together. Every `Context.Service` has a `.layer`;
//   composing them is how you assemble a runtime. Per-environment
//   variation (server vs client vs test) is a different Layer feeding
//   the same Effect program.
//
// Rules:
//   - `Layer.mergeAll(A.layer, B.layer, ...)` — variadic sibling merge.
//     The runtime exposes all services from all layers.
//   - `Layer.provide(B, A)` — B's requirements are satisfied by A.
//     Use when B yields A in its `make`. Reads bottom-up: "B with A
//     provided".
//   - `Layer.merge(A, B)` — pairwise sibling merge. Prefer
//     `Layer.mergeAll(...)` when you have more than two.
//   - `Layer.fresh(Foo.layer)` — fork a clean instance. Test isolation.
//
// 4.0 memoization:
//   Layers memoize across `Effect.provide` calls via a shared MemoMap
//   (per migration/layer-memoization.md). Compose once anyway — the
//   memo is a safety net, not the design.
//
// Naming convention (repo-wide):
//   - `.layer` — canonical implementation, lowercase.
//   - `.layerTest` (or `.layerTest(opts)`) — test variant.
//   - NO v3 `.Default` or `.Live`.

import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';

// Reference shape: two services where B depends on A.
class Clock extends Context.Service<Clock, { readonly now: Effect.Effect<number> }>()(
  'patterns/Layer/Clock',
  { make: Effect.succeed({ now: Effect.sync(() => Date.now()) }) },
) {
  static readonly layer = Layer.effect(this, this.make);
}

class Timestamps extends Context.Service<
  Timestamps,
  { readonly stamp: Effect.Effect<string> }
>()('patterns/Layer/Timestamps', {
  // `make` yields Clock; the resulting Layer therefore REQUIRES Clock
  // unless we provide it (see _composedLayer below).
  make: Effect.gen(function* () {
    const clock = yield* Clock;
    return {
      stamp: Effect.map(clock.now, (n) => new Date(n).toISOString()),
    };
  }),
}) {
  static readonly layer = Layer.effect(this, this.make);
}

// Composition: provide Clock to Timestamps. The resulting Layer offers
// `Timestamps` to consumers; Clock is internal. Bottom-up reading:
// "Timestamps with Clock provided".
export const TimestampsRuntime = Timestamps.layer.pipe(Layer.provide(Clock.layer));

// Sibling merge: both services exposed to consumers. Use when callers
// might yield either independently.
export const FullRuntime = Layer.mergeAll(Clock.layer, Timestamps.layer);

// Reference usage — provide the merged runtime, then `yield*` either.
export const _exampleProgram = Effect.gen(function* () {
  const ts = yield* Timestamps;
  return yield* ts.stamp;
}).pipe(Effect.provide(TimestampsRuntime));
