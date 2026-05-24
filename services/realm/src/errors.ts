// Tagged errors used inside services/realm.
//
// These are E-channel errors — they appear in `Effect<A, E, R>` and are
// recoverable via `Effect.catchTag`. Pure bugs (assertion violations,
// schema-shape mismatches that should be impossible) stay as defects
// via `Effect.die`.

import * as Schema from 'effect/Schema';

/**
 * Inbound WebSocket payload failed to decode against the wire schema.
 * Raised by `Schema.fromJsonString(ClientMessage)` at the boundary,
 * caught with `Effect.catchTag('kassandra/realm/WorldDecodeError', …)`
 * and logged + dropped (we never reflect parse errors back to the
 * client today — malformed input is treated as adversarial, not as a
 * recoverable transient state).
 */
export class WorldDecodeError extends Schema.TaggedErrorClass<WorldDecodeError>()(
  'kassandra/realm/WorldDecodeError',
  {
    /** Short description of the schema/parse failure. */
    reason: Schema.String,
    /** First 200 chars of the offending payload, for log triage. */
    rawPreview: Schema.String,
  },
) {}
