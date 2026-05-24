// Pattern: Tagged error (Schema.TaggedErrorClass)
// ----------------------------------------------------------------------
//
// When to use:
//   Every error that crosses a fiber, layer, or transport boundary.
//   These appear in the Effect type as `Effect<A, E, R>`'s E channel and
//   are recoverable via `Effect.catchTag`. Pure programming errors
//   (assertion violations, "this can't happen") stay as defects via
//   `Effect.die`.
//
// What it replaces in Kassandra:
//   - services/realm/src/PartyRoom.ts:226-230 silent JSON.parse try/catch
//   - applications/game/src/realm.svelte.ts:53-57 warn-and-continue parse
//   Both become `Schema.fromJsonString(ClientMessage)` returning
//   `Effect<…, WorldDecodeError>`, handled with `Effect.catchTag`.
//
// 4.0 rename:
//   v3 `Schema.TaggedError` → v4 `Schema.TaggedErrorClass`. The outer
//   `<Self>()` paren is required (it's how the TS inference threads the
//   class type back into the schema).

import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

// Reference shape: a NotFound error with a typed id field. The class is
// simultaneously a Schema (for wire decode), a constructor (for `new`
// from server code), and a Yieldable error (for `yield* new NotFound(...)`).
export class NotFoundError extends Schema.TaggedErrorClass<NotFoundError>()(
  'patterns/TaggedError/NotFound',
  { id: Schema.String },
) {}

// Reference usage — boundary code maps unknown failures into a tagged
// error, then specific handlers catch by tag. Type inference flows the
// error tag through `catchTag` so a missed handler is a compile error.
export const _exampleProgram = Effect.gen(function* () {
  // Simulated I/O that may fail.
  const id = 'user-42';
  yield* new NotFoundError({ id });
}).pipe(
  Effect.catchTag('patterns/TaggedError/NotFound', (e) =>
    Effect.logWarning(`absent: ${e.id}`),
  ),
);
