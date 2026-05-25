// Pattern: Typed RPC over WebSocket (effect/unstable/rpc)
// ----------------------------------------------------------------------
//
// What it replaces in Kassandra (PR-B + PR-C):
//   - libraries/foundation/protocol/src/messages.ts (the entire
//     hand-rolled ClientMessage / ServerMessage envelope) → an
//     RpcGroup with typed contracts.
//   - applications/game/src/realm.svelte.ts WS code → `RpcClient.make`
//     over an Effect Socket.
//   - services/realm/src/RealmRoom.ts message handling → a handler
//     layer attached to RpcServer.
//
// Anatomy of an RPC:
//   - `payload`  — schema for the request body.
//   - `success`  — schema for the response. Pair with `stream: true`
//                  for a server-streamed reply (one request, many
//                  responses) — exactly how Realm.SnapshotStream works.
//   - `error`    — schema for the typed error channel.
//
// Group composition:
//   An `RpcGroup` is just a tagged collection of `Rpc`. The client and
//   server share the SAME group definition (in
//   libraries/foundation/protocol/src/rpc.ts) — single source of truth
//   for the contract.
//
// 4.0 detail:
//   Lives at `effect/unstable/rpc`. The "unstable" prefix means the
//   API can break in minor releases; pin `effect` exactly (no `^`).

import * as Schema from 'effect/Schema';
import { Rpc, RpcGroup } from 'effect/unstable/rpc';

// Tagged error: the typed failure channel for these RPCs.
export class NotOwnerError extends Schema.TaggedErrorClass<NotOwnerError>()(
  'patterns/RpcGroup/NotOwnerError',
  { actual: Schema.String, expected: Schema.String },
) {}

// Streaming success: the snapshot frame schema. In production this is
// imported from libraries/foundation/protocol; the inline shape here
// keeps the pattern self-contained.
const Snapshot = Schema.Struct({
  tick: Schema.Number,
  ownerId: Schema.NullOr(Schema.String),
});

// Reference RPC group with the three shapes the realm needs:
//   - SendFrame  : request/response (typed input payload, void success).
//   - SnapshotStream : server-streamed snapshots.
//   - Disband    : request/response with a typed error.
export class RealmRpc extends RpcGroup.make(
  Rpc.make('SendFrame', {
    payload: Schema.Struct({
      tick: Schema.Number,
      moveX: Schema.Number,
      moveZ: Schema.Number,
    }),
    success: Schema.Void,
  }),
  Rpc.make('SnapshotStream', {
    payload: Schema.Void,
    success: Snapshot,
    stream: true,
  }),
  Rpc.make('Disband', {
    payload: Schema.Void,
    success: Schema.Void,
    error: NotOwnerError,
  }),
) {}
