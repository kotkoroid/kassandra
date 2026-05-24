// PlayerProfile DO — account-bound character storage.
//
// PR-G1: one DO instance per accountId. Holds at most one
// CharacterRecord, persisted in DO storage via ProfileStorage. The
// character is the player's "save game" — what they keep when they
// disconnect from one party and join another. Pre-PR-G it lived
// inside the PartyRoom's world snapshot and was lost the moment a
// party disbanded or the player joined a different one.
//
// Transport mirrors PartyRoom: RpcServer over `makeRealmRpcProtocol`
// over a single DurableWebSocket. The DO's fetch upgrades the socket,
// stamps a per-connection `accountid` header from the URL path, and
// the ProfileSession middleware exposes that as AccountSession to
// every handler.
//
// What's NOT here:
//   - Multi-character per account. The DO instance is single-record;
//     adding characters would need a `characterId` arg on the RPCs.
//
// PR-G2 trust model: this DO trusts the path's accountId because the
// realm Worker verified the bearer JWT's `sub` claim against the
// same path component before forwarding. DOs aren't publicly
// addressable on Cloudflare; the only entrypoint is the realm.

import {
  AccountSession,
  PlayerProfileRpc,
  ProfileSession,
} from '@kassandra/protocol-foundation-library';
import * as Cloudflare from 'alchemy/Cloudflare';
import * as Effect from 'effect/Effect';
import * as Headers from 'effect/unstable/http/Headers';
import { HttpServerRequest } from 'effect/unstable/http/HttpServerRequest';
import * as Layer from 'effect/Layer';
import * as Option from 'effect/Option';
import * as RpcSerialization from 'effect/unstable/rpc/RpcSerialization';
import * as RpcServer from 'effect/unstable/rpc/RpcServer';

import { makeRealmRpcProtocol } from '@kassandra/effect-conventions-foundation-library';

import { makeProfileStorage } from './services/ProfileStorage.ts';

interface SessionData {
  accountId: string;
}

export default class PlayerProfile extends Cloudflare.DurableObjectNamespace<PlayerProfile>()(
  'PlayerProfile',
  Effect.gen(function* () {
    return Effect.gen(function* () {
      const state = yield* Cloudflare.DurableObjectState;
      const profileStorage = yield* makeProfileStorage(state);

      // RPC bridge — same shape PartyRoom uses, just bound to a
      // different RpcGroup at mount time. The bridge is generic over
      // the group's wire shape (Schema-driven encode/decode).
      const bridge = yield* makeRealmRpcProtocol.pipe(
        Effect.provide(RpcSerialization.layerJson),
      );

      // wsToClientId map survives hibernation along with the per-socket
      // attachment carrying the accountId.
      const wsToClientId = new Map<Cloudflare.DurableWebSocket, number>();

      // Hibernation rehydrate. If the DO instance was unloaded and the
      // realm is bringing it back up to serve a stored socket, restore
      // the bridge's per-client state from the attachment.
      for (const socket of yield* state.getWebSockets()) {
        const data = socket.deserializeAttachment<SessionData>();
        if (data) {
          const clientId = yield* bridge.acceptSocket(socket, [
            ['accountid', data.accountId],
          ]);
          wsToClientId.set(socket, clientId);
        }
      }

      // ProfileSession middleware: pull `accountid` out of the synthesized
      // per-request headers and expose it as AccountSession to handlers.
      const profileSessionLayer = Layer.succeed(ProfileSession)(
        ProfileSession.of((effect, options) => {
          const accountId = Option.getOrElse(
            Headers.get(options.headers, 'accountid'),
            () => '',
          );
          return Effect.provideService(effect, AccountSession, { accountId });
        }),
      );

      // RPC handlers. Both delegate straight to ProfileStorage —
      // there's no in-memory state to keep coherent (the DO storage
      // is the source of truth and the DO is single-writer per
      // accountId by Cloudflare's contract).
      const handlersLayer = PlayerProfileRpc.toLayer(
        Effect.gen(function* () {
          return PlayerProfileRpc.of({
            LoadCharacter: () =>
              Effect.gen(function* () {
                // PR-G2: AccountSession.accountId === path accountId
                // === verified JWT sub, by realm-side verification.
                const stored = yield* profileStorage.load;
                return Option.getOrNull(stored);
              }),
            SaveCharacter: ({ character }) =>
              Effect.gen(function* () {
                yield* profileStorage.save(character);
              }),
          });
        }),
      );

      // Mount the server as a long-lived fiber. `Effect.never` keeps
      // the layer scope alive until the DO is unloaded.
      const rpcServerLayer = RpcServer.layer(PlayerProfileRpc, {
        disableFatalDefects: true,
      }).pipe(
        Layer.provide([
          handlersLayer,
          profileSessionLayer,
          Layer.succeed(RpcServer.Protocol)(bridge.protocol),
          RpcSerialization.layerJson,
        ]),
      );
      Effect.runFork(Effect.never.pipe(Effect.provide(rpcServerLayer)));

      // Lifecycle handlers.

      const onFetch = Effect.gen(function* () {
        const request = yield* HttpServerRequest;
        const url = new URL(request.url, 'http://localhost');
        // PR-G2: accountId comes from the path `/profiles/:accountId/rpc`;
        // the realm Worker has already verified that the bearer JWT's
        // sub claim matches this path component.
        const pathMatch = url.pathname.match(/^\/profiles\/([^/]+)\/rpc$/);
        const accountId = pathMatch?.[1] ?? '';
        if (!accountId) {
          return new Response('accountId required', { status: 400 });
        }

        const [response, socket] = yield* Cloudflare.upgrade();
        socket.serializeAttachment({ accountId } satisfies SessionData);

        const clientId = yield* bridge.acceptSocket(socket, [
          ['accountid', accountId],
        ]);
        wsToClientId.set(socket, clientId);
        return response;
      });

      const onMessage = (
        socket: Cloudflare.DurableWebSocket,
        message: string | ArrayBuffer,
      ) =>
        Effect.gen(function* () {
          const clientId = wsToClientId.get(socket);
          if (clientId === undefined) return;
          const data =
            typeof message === 'string' ? message : new Uint8Array(message);
          yield* bridge.onMessage(clientId, data);
        });

      const onClose = (
        ws: Cloudflare.DurableWebSocket,
        code: number,
        reason: string,
      ) =>
        Effect.gen(function* () {
          const clientId = wsToClientId.get(ws);
          if (clientId !== undefined) {
            yield* bridge.onClose(clientId);
            wsToClientId.delete(ws);
          }
          // Same RFC 6455 reserved-code clamp PartyRoom uses.
          const RESERVED = code === 1005 || code === 1006 || code === 1015;
          yield* ws.close(RESERVED ? 1000 : code, reason);
        });

      return {
        fetch: onFetch,
        webSocketMessage: Effect.fnUntraced(function* (
          socket: Cloudflare.DurableWebSocket,
          message: string | ArrayBuffer,
        ) {
          yield* onMessage(socket, message);
        }),
        webSocketClose: Effect.fnUntraced(function* (
          ws: Cloudflare.DurableWebSocket,
          code: number,
          reason: string,
        ) {
          yield* onClose(ws, code, reason);
        }),
      };
    });
  }),
) {}
