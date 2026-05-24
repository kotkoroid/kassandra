// ProfileClient — typed effect/unstable/rpc client to the PlayerProfile DO.
//
// Mirror of realm-client.ts but bound to PlayerProfileRpc instead of
// RealmRpc, and the WS URL hits /profiles/:accountId/rpc. JWT travels
// the same way (Sec-WebSocket-Protocol: bearer.<jwt>) — the realm
// verifies that the token's `sub` claim matches the accountId in the
// path before forwarding to the DO.
//
// One PlayerProfile WS per browser session: opened during boot to
// LoadCharacter, kept open so SaveCharacter on the creation submit
// reuses the same connection. The PlayerProfileRpc group is
// request-response only (no streams), so the WS sits idle most of
// the time — Cloudflare hibernates idle DOs anyway, and the
// hibernation API keeps the socket open across that.

import { PlayerProfileRpc } from '@kassandra/protocol-foundation-library';
import * as Context from 'effect/Context';
import * as Layer from 'effect/Layer';
import * as Socket from 'effect/unstable/socket/Socket';
import * as RpcClient from 'effect/unstable/rpc/RpcClient';
import type { RpcClientError } from 'effect/unstable/rpc/RpcClientError';
import type * as RpcGroup from 'effect/unstable/rpc/RpcGroup';
import * as RpcSerialization from 'effect/unstable/rpc/RpcSerialization';

/**
 * Typed client service. After `yield* ProfileClient` inside any Effect
 * with the layer provided:
 *   client.LoadCharacter()              // Effect<CharacterRecord | null>
 *   client.SaveCharacter({ character }) // Effect<void>
 */
export class ProfileClient extends Context.Service<
  ProfileClient,
  RpcClient.RpcClient<RpcGroup.Rpcs<typeof PlayerProfileRpc>, RpcClientError>
>()('kassandra/game/ProfileClient') {
  static readonly layer = Layer.effect(ProfileClient)(RpcClient.make(PlayerProfileRpc));
}

/**
 * Build the WS URL for the PlayerProfile connection. Same dev/prod
 * pattern as realm-client.ts: dev routes through Vite's `/realm` proxy
 * to dodge the alchemy local-subdomain WebSocket bug; prod hits
 * VITE_REALM_URL directly.
 */
const wsUrlFor = (accountId: string): string => {
  const base = import.meta.env.DEV
    ? `ws://${window.location.host}/realm`
    : import.meta.env.VITE_REALM_URL.replace(/\/$/, '')
        .replace(/^http:\/\//, 'ws://')
        .replace(/^https:\/\//, 'wss://');
  return `${base}/profiles/${encodeURIComponent(accountId)}/rpc`;
};

/**
 * Full layer stack for the PlayerProfile connection. PR-G2 JWT
 * shipping: `bearer.<token>` subprotocol on the WS handshake; the
 * realm worker verifies the signature + the `sub`-vs-path match
 * before any DO message flows.
 */
export const makeProfileClientLayer = (accountId: string, token: string) =>
  ProfileClient.layer.pipe(
    Layer.provide(RpcClient.layerProtocolSocket()),
    Layer.provide(
      Socket.layerWebSocket(wsUrlFor(accountId), {
        protocols: [`bearer.${token}`],
      }),
    ),
    Layer.provide(Socket.layerWebSocketConstructorGlobal),
    Layer.provide(RpcSerialization.layerJson),
  );
