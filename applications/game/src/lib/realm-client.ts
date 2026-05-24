// RealmClient — typed effect/unstable/rpc client to the realm DO.
//
// PR-C2: replaced the hand-rolled `new WebSocket(...)` + JSON.stringify
// pipeline in realm.svelte.ts with effect/unstable/rpc derived from
// libraries/foundation/protocol's RealmRpc group.
//
// PR-G2: the WS now carries a JWT via the `bearer.<token>` subprotocol.
// The realm verifies it and rewrites the URL to inject `?playerId=<sub>`
// before forwarding to the PartyRoom DO — so the client no longer
// passes its own playerId (the JWT sub IS the playerId).

import { RealmRpc } from '@kassandra/protocol-foundation-library';
import * as Context from 'effect/Context';
import * as Layer from 'effect/Layer';
import * as Socket from 'effect/unstable/socket/Socket';
import * as RpcClient from 'effect/unstable/rpc/RpcClient';
import type { RpcClientError } from 'effect/unstable/rpc/RpcClientError';
import type * as RpcGroup from 'effect/unstable/rpc/RpcGroup';
import * as RpcSerialization from 'effect/unstable/rpc/RpcSerialization';

/**
 * Typed client service. After `yield* RealmClient` inside any Effect
 * that has the layer provided, every RPC method is a typed function
 * call:
 *   client.SendInputs({ moveX, moveZ })                  // Effect<void>
 *   client.SendEvent({ event })                          // Effect<void>
 *   client.SnapshotStream()                              // Stream<Snapshot>
 *   client.Disbanded()                                   // Stream<void>
 *   client.Disband()                                     // Effect<void, NotOwnerError>
 */
export class RealmClient extends Context.Service<
  RealmClient,
  RpcClient.RpcClient<RpcGroup.Rpcs<typeof RealmRpc>, RpcClientError>
>()('kassandra/game/RealmClient') {
  static readonly layer = Layer.effect(RealmClient)(RpcClient.make(RealmRpc));
}

/**
 * Build the WebSocket URL for a party connection. In dev we route through
 * the Vite proxy at `/realm` to dodge the alchemy@2.0.0-beta.44 local
 * subdomain proxy's WebSocket-upgrade bug (browser → workerd path).
 * In prod we hit VITE_REALM_URL directly.
 */
const wsUrlFor = (partyId: string): string => {
  const base = import.meta.env.DEV
    ? `ws://${window.location.host}/realm`
    : import.meta.env.VITE_REALM_URL.replace(/\/$/, '')
        .replace(/^http:\/\//, 'ws://')
        .replace(/^https:\/\//, 'wss://');
  return `${base}/parties/${partyId}/ws`;
};

/**
 * Full layer stack for one party connection. Compose: serialization
 * (must match the server — JSON), WebSocket constructor (browser
 * global), Socket from the URL, RPC protocol over that Socket, then
 * the RealmClient itself.
 *
 * The `token` is sent as the `bearer.<token>` WebSocket subprotocol
 * (PR-G2). Browsers are the only entity that can set
 * Sec-WebSocket-Protocol on a WS open, so this is functionally
 * equivalent to an Authorization header — and avoids cross-origin
 * cookie configuration between gateway and realm.
 *
 * The returned layer is scoped: building it opens the WebSocket and
 * starts the protocol fiber; closing the scope closes both. Use with
 * a long-lived scope tied to the party's lifetime — typically an
 * `Effect.runFork` of a program piped through this layer.
 */
export const makeRealmClientLayer = (partyId: string, token: string) =>
  RealmClient.layer.pipe(
    Layer.provide(RpcClient.layerProtocolSocket()),
    Layer.provide(
      Socket.layerWebSocket(wsUrlFor(partyId), {
        protocols: [`bearer.${token}`],
      }),
    ),
    Layer.provide(Socket.layerWebSocketConstructorGlobal),
    Layer.provide(RpcSerialization.layerJson),
  );
