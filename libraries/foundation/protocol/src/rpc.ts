// Typed RPC contract between the game client and the realm DO.
//
// Single source of truth for the wire surface. Both PartyRoom (server)
// and applications/game/src/lib/realm-client (client) import this group
// and the matching schemas; framing, serialization, and routing are
// all derived from these definitions.
//
// Design notes:
//   - 5 RPCs is the pragmatic granularity: SendInputs (hot path, every
//     animation frame), SendEvent (cold path, discrete actions),
//     SnapshotStream + Disbanded (server-pushed streams), Disband
//     (owner-only request/response). The original 13 SimEvent variants
//     ride through SendEvent's discriminated payload — each variant
//     stays typed, but we don't need 13 handler functions doing the
//     same "look up the player, push into their queue" boilerplate.
//   - SimEvent's `disband_party` variant is REPLACED by the dedicated
//     `Disband` RPC (which surfaces `NotOwnerError` on the error
//     channel — much cleaner than silently ignoring non-owner sends).
//   - All RPCs are gated by `PartySession` middleware, which reads the
//     `?playerId=` query param at WebSocket upgrade time and exposes a
//     `PlayerSession` service to every handler.

import * as Context from 'effect/Context';
import * as Schema from 'effect/Schema';
import { Rpc, RpcGroup } from 'effect/unstable/rpc';
import * as RpcMiddleware from 'effect/unstable/rpc/RpcMiddleware';

import { SimEvent } from './simEvent';
import { Snapshot } from './snapshot';

// ---------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------

/**
 * Raised by `Disband` when the calling player is not the party owner.
 * Silently-ignored-on-server is the wrong default — turning this into
 * a typed error makes "who can disband?" part of the client contract.
 */
export class NotOwnerError extends Schema.TaggedErrorClass<NotOwnerError>()(
  'kassandra/realm/NotOwnerError',
  { ownerId: Schema.NullOr(Schema.String) },
) {}

// ---------------------------------------------------------------------
// Per-connection context
// ---------------------------------------------------------------------

/**
 * Per-WebSocket session identity. The bridge populates this from the
 * `?playerId=` URL query param when accepting a socket; every RPC
 * handler can `yield* PlayerSession` to know which player is calling.
 */
export class PlayerSession extends Context.Service<
  PlayerSession,
  { readonly playerId: string }
>()('kassandra/realm/PlayerSession') {}

/**
 * Middleware that resolves `PlayerSession` per request. Reads the
 * `playerid` header (lowercase per HTTP convention) — the bridge
 * synthesizes this from the WebSocket upgrade URL on accept and
 * threads it through `onSocket(socket, headers)`.
 */
export class PartySession extends RpcMiddleware.Service<
  PartySession,
  { provides: PlayerSession }
>()('kassandra/realm/PartySession') {}

// ---------------------------------------------------------------------
// RPC group
// ---------------------------------------------------------------------

export class RealmRpc extends RpcGroup.make(
  /**
   * Hot path: movement vector for the current animation frame.
   * Fire-and-forget; latest wins on the server side. No client tick
   * is sent — the realm runs the authoritative clock and the client
   * has no prediction layer to reconcile against.
   */
  Rpc.make('SendInputs', {
    payload: {
      moveX: Schema.Number,
      moveZ: Schema.Number,
    },
    success: Schema.Void,
  }),

  /**
   * Cold path: a discrete sim event (chat, click, cast, etc.). The
   * payload IS the existing SimEvent union — each variant remains
   * typed, but server-side routing happens via the kind discriminator
   * in one handler rather than per-variant RPC handlers.
   */
  Rpc.make('SendEvent', {
    payload: { event: SimEvent },
    success: Schema.Void,
  }),

  /**
   * Server-streamed snapshots. Each tick (~20 Hz) emits one snapshot
   * to every subscribed client. Backed by a per-DO `PubSub<Snapshot>`
   * on the server side.
   */
  Rpc.make('SnapshotStream', {
    payload: Schema.Void,
    success: Snapshot,
    stream: true,
  }),

  /**
   * Server-streamed disband signal. Emits exactly once when the room
   * is disbanded (by the owner via `Disband`, or — in future PRs — by
   * automatic expiry). Every connected client subscribes; on emit they
   * disconnect and bounce back to PartySetup.
   */
  Rpc.make('Disbanded', {
    payload: Schema.Void,
    success: Schema.Void,
    stream: true,
  }),

  /**
   * Owner-only. Triggers the disband flow:
   *   1. Verify caller is the party owner; reject with NotOwnerError otherwise.
   *   2. Emit on the `Disbanded` stream (every client wakes up).
   *   3. Server closes every socket, wipes DO storage.
   */
  Rpc.make('Disband', {
    payload: Schema.Void,
    success: Schema.Void,
    error: NotOwnerError,
  }),
).middleware(PartySession) {}
