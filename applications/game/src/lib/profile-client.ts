// ProfileClient — typed effect/unstable/rpc client to the PlayerProfile DO.
//
// Mirror of realm-client.ts but bound to PlayerProfileRpc instead of
// RealmRpc, and the WS URL hits /profiles/:accountId/rpc. PR-G5: the
// HttpOnly session cookie travels with the WS upgrade automatically;
// the realm parses it, looks the session up in KV, and forwards to
// the PlayerProfile DO only if `session.accountId === pathAccountId`.
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
 * pattern as realm-client.ts: dev hits the Bun WS proxy on
 * `localhost:5555`; prod hits VITE_REALM_URL under the same eTLD+1
 * as the app so the cookie travels same-site.
 *
 * Override with `VITE_REALM_WS_OVERRIDE` if you have a different
 * dev proxy / port setup.
 */
const wsUrlFor = (accountId: string): string => {
  const base = import.meta.env.DEV
    ? (import.meta.env['VITE_REALM_WS_OVERRIDE'] ?? 'ws://localhost:5555')
    : import.meta.env.VITE_REALM_URL.replace(/\/$/, '')
        .replace(/^http:\/\//, 'ws://')
        .replace(/^https:\/\//, 'wss://');
  return `${base}/profiles/${encodeURIComponent(accountId)}/rpc`;
};

/**
 * Full layer stack for the PlayerProfile connection. The session
 * cookie travels with the WS upgrade automatically; the realm reads
 * it, looks up the KV record, and enforces `record.accountId === path`
 * before any DO message flows.
 */
export const makeProfileClientLayer = (accountId: string) =>
  ProfileClient.layer.pipe(
    Layer.provide(RpcClient.layerProtocolSocket()),
    Layer.provide(Socket.layerWebSocket(wsUrlFor(accountId))),
    Layer.provide(Socket.layerWebSocketConstructorGlobal),
    Layer.provide(RpcSerialization.layerJson),
  );
