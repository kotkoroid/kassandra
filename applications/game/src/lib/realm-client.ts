// RealmClient — typed effect/unstable/rpc client to the realm DO.
//
// PR-G5: the WS handshake no longer carries a `bearer.<jwt>`
// subprotocol — the browser ships the HttpOnly session cookie
// automatically on the upgrade (same-site, same-eTLD+1 between app
// and realm in prod; same `localhost` in dev). The realm parses the
// `Cookie` header, looks the session up in KV, and forwards to the
// PartyRoom DO with `?playerId=<accountId>` derived from the verified
// session record.

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
 * Build the WebSocket URL for a party connection. In dev we hit the
 * Bun WS proxy (`scripts/ws-proxy.ts`) directly on `localhost:5555`.
 * The proxy forwards the upgrade — including the session cookie — to
 * `realm.localhost:1337`. In prod we hit VITE_REALM_URL directly,
 * which lives under the same eTLD+1 as the app so the cookie travels
 * same-site without any cross-origin trickery.
 */
const wsUrlFor = (partyId: string): string => {
  const base = import.meta.env.DEV
    ? (import.meta.env['VITE_REALM_WS_OVERRIDE'] ?? 'ws://localhost:5555')
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
 * The session cookie travels automatically with the WS upgrade — no
 * subprotocol, no Authorization header, no client-side token state.
 *
 * The returned layer is scoped: building it opens the WebSocket and
 * starts the protocol fiber; closing the scope closes both. Use with
 * a long-lived scope tied to the party's lifetime — typically an
 * `Effect.runFork` of a program piped through this layer.
 */
export const makeRealmClientLayer = (partyId: string) =>
  RealmClient.layer.pipe(
    Layer.provide(RpcClient.layerProtocolSocket()),
    Layer.provide(Socket.layerWebSocket(wsUrlFor(partyId))),
    Layer.provide(Socket.layerWebSocketConstructorGlobal),
    Layer.provide(RpcSerialization.layerJson),
  );
