// WebSocket message envelopes for the client ↔ realm WS connection.
//
// ClientMessage: client → server, sent once per tick.
// ServerMessage: server → client, sent after every authoritative tick.

import * as Schema from 'effect/Schema';
import { SimEvent } from './simEvent';
import { Snapshot } from './snapshot';

export const ClientMessage = Schema.Struct({
  kind: Schema.Literal('inputs'),
  // Authoritative tick the client is responding to.
  tick: Schema.Number,
  // World-space movement vector (camera-transformed WASD).
  moveX: Schema.Number,
  moveZ: Schema.Number,
  // Discrete events that occurred since the last message.
  events: Schema.Array(SimEvent),
});

export const ServerMessage = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal('snapshot'),
    snapshot: Snapshot,
  }),
  // Acknowledgement that the server processed the client's input for `tick`.
  Schema.Struct({
    kind: Schema.Literal('ack'),
    tick: Schema.Number,
  }),
  // Sent right before the realm closes every socket and deletes DO
  // storage. Clients react by disconnecting and clearing ?party= from
  // the URL so the next refresh lands back on PartySetup.
  Schema.Struct({
    kind: Schema.Literal('disbanded'),
  }),
]);

export type ClientMessage = typeof ClientMessage.Type;
export type ServerMessage = typeof ServerMessage.Type;
