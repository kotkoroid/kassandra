// RealmClient — typed effect/unstable/rpc client to the realm DO.
//
// PR-C2: replaces the hand-rolled `new WebSocket(...)` + JSON.stringify
// + applySnapshot pipeline in realm.svelte.ts. The wire protocol is
// now whatever RpcSerialization.layerJson + RpcClient negotiate; the
// client's typed methods are derived from libraries/foundation/protocol's
// RealmRpc group.

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
 *   client.SendInputs({ tick, moveX, moveZ })           // Effect<void>
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
const wsUrlFor = (partyId: string, playerId: string): string => {
  const base = import.meta.env.DEV
    ? `ws://${window.location.host}/realm`
    : import.meta.env.VITE_REALM_URL.replace(/\/$/, '')
        .replace(/^http:\/\//, 'ws://')
        .replace(/^https:\/\//, 'wss://');
  return `${base}/parties/${partyId}/ws?playerId=${encodeURIComponent(playerId)}`;
};

/**
 * Full layer stack for one party connection. Compose: serialization
 * (must match the server — JSON), WebSocket constructor (browser
 * global), Socket from the URL, RPC protocol over that Socket, then
 * the RealmClient itself.
 *
 * The returned layer is scoped: building it opens the WebSocket and
 * starts the protocol fiber; closing the scope closes both. Use with
 * a long-lived scope tied to the party's lifetime — typically an
 * `Effect.runFork` of a program piped through this layer.
 */
export const makeRealmClientLayer = (partyId: string, playerId: string) =>
  RealmClient.layer.pipe(
    Layer.provide(RpcClient.layerProtocolSocket()),
    Layer.provide(Socket.layerWebSocket(wsUrlFor(partyId, playerId))),
    Layer.provide(Socket.layerWebSocketConstructorGlobal),
    Layer.provide(RpcSerialization.layerJson),
  );
