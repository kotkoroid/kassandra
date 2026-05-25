// Pattern: Schema validation at boundaries
// ----------------------------------------------------------------------
//
// Rule (whole-repo):
//   Wire-shaped data is decoded ONCE at the transport boundary into
//   branded domain types, then never re-validated internally. Anywhere
//   you see `as never`, `as any`, or a hand-rolled type guard on data
//   that came off the wire, it's a missing schema decode.
//
// What it replaces in Kassandra:
//   - services/realm/src/RealmRoom.ts:226-230 silent `JSON.parse` +
//     `as ClientMessageType` cast → `Schema.fromJsonString(ClientMessage)`
//     piped to a tagged error.
//   - applications/game/src/realm.svelte.ts:184-251 applySnapshot with
//     30 hand-written field copies and 3 `as never` casts →
//     `Schema.decodeUnknownEffect(Snapshot)` once at the RPC boundary,
//     then `ClientWorld.applySnapshot(decoded)` is type-safe.
//
// 4.0 renames (migration/schema.md):
//   - `Schema.parseJson(s)`       → `Schema.fromJsonString(s)`
//   - `Schema.TaggedError`        → `Schema.TaggedErrorClass`
//   - `Schema.decodeUnknown(s)`   → `Schema.decodeUnknownEffect(s)`
//   - `Schema.Literal('a','b')`   → `Schema.Literals(['a','b'])`
//   - `nonEmptyString`            → `isNonEmpty`
//
// Returned-Effect family:
//   `decodeUnknownEffect` returns Effect — composes with `.pipe` and
//   `Effect.mapError`. Use this at boundaries. `decodeUnknownExit` /
//   `decodeUnknownSync` / `decodeUnknownPromise` exist for non-Effect
//   call sites (rare in this codebase).

import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

// A wire-format schema and its matching tagged error. In Kassandra the
// schemas live in libraries/foundation/protocol; the tagged errors live
// next to whoever owns the boundary (server- or client-side service).
const Message = Schema.Struct({
  kind: Schema.Literal('inputs'),
  tick: Schema.Number,
  moveX: Schema.Number,
  moveZ: Schema.Number,
});

export class DecodeError extends Schema.TaggedErrorClass<DecodeError>()(
  'patterns/SchemaBoundary/DecodeError',
  { reason: Schema.String },
) {}

const decode = Schema.decodeUnknownEffect(Message);
const decodeJson = Schema.decodeUnknownEffect(Schema.fromJsonString(Message));

// Reference usage — decode at the boundary, map error to a tagged
// shape, hand off the typed value to internal code.
export const _exampleProgram = (raw: string) =>
  decodeJson(raw).pipe(
    Effect.mapError((e) => new DecodeError({ reason: e.toString() })),
    Effect.flatMap((msg) => Effect.logDebug(`tick=${msg.tick}`)),
    Effect.catchTag('patterns/SchemaBoundary/DecodeError', (e) =>
      Effect.logWarning('decode failed', e.reason),
    ),
  );

// Reference usage — typed-shape decode for already-parsed JSON.
export const _exampleProgramTyped = (raw: unknown) =>
  decode(raw).pipe(Effect.mapError((e) => new DecodeError({ reason: e.toString() })));
