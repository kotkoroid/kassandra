// PartyRoom — the Durable Object that owns one party's authoritative
// world. Each connected player gets a hibernating WebSocket; the DO
// runs a 20 Hz fixed-step tick, broadcasts a full snapshot per tick
// via effect/unstable/rpc, and persists the party owner across
// hibernation.
//
// PR-B2 rewrite: the JSON wire envelope is gone. Inbound traffic flows
// through `RpcServer.Protocol` (the direct bridge in
// libraries/foundation/effect-conventions/src/realm-rpc-do.ts) into
// typed handlers defined here. Snapshots fan out via a per-DO
// `PubSub<Snapshot>` consumed by `SnapshotStream`; disband signals fan
// out via `PubSub<void>` consumed by `Disbanded`. The
// previously-special-cased `disband_party` SimEvent is replaced by the
// owner-only `Disband` RPC (which raises `NotOwnerError` instead of
// silently dropping non-owner requests).
//
// What stayed unchanged:
//   - DO hibernation contract (acceptWebSocket, getWebSockets,
//     serializeAttachment). PR-E adds storage-driven world freeze.
//   - Accepted Phase-4 limitations (death keyed to localPlayerId,
//     create_character is a SimEvent inside SendEvent). Both go away
//     in PR-D when the sim library becomes Effect-native.

import {
  NotOwnerError,
  PartySession,
  PlayerSession,
  RealmRpc,
  type Snapshot,
} from '@kassandra/protocol-foundation-library';
import {
  addPlayer,
  createWorld,
  makeWorldRef,
  pushSystem,
  type PlayerId,
} from '@kassandra/simulation-domain-library';
import * as Cloudflare from 'alchemy/Cloudflare';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Option from 'effect/Option';
import * as PubSub from 'effect/PubSub';
import * as Stream from 'effect/Stream';
import * as Headers from 'effect/unstable/http/Headers';
import { HttpServerRequest } from 'effect/unstable/http/HttpServerRequest';
import * as RpcSerialization from 'effect/unstable/rpc/RpcSerialization';
import * as RpcServer from 'effect/unstable/rpc/RpcServer';

import { makeRealmRpcProtocol } from '@kassandra/effect-conventions-foundation-library';

import { makeInputBuffer } from './services/InputBuffer.ts';
import { makeSessionsRef } from './services/SessionsRef.ts';
import { makeTick } from './services/Tick.ts';

interface SessionData {
  sessionId: string;
  playerId: PlayerId;
}

export default class PartyRoom extends Cloudflare.DurableObjectNamespace<PartyRoom>()(
  'PartyRoom',
  Effect.gen(function* () {
    return Effect.gen(function* () {
      const state = yield* Cloudflare.DurableObjectState;

      // -- per-instance state --------------------------------------------
      const storedOwner = yield* state.storage.get<PlayerId>('ownerId');
      const initialWorld = createWorld();
      if (storedOwner) initialWorld.ownerId = storedOwner;
      const worldRef = yield* makeWorldRef(initialWorld);
      const sessionsRef = yield* makeSessionsRef;
      const inputBuffer = yield* makeInputBuffer;

      // Fan-out PubSubs.
      //   snapshotPubSub — published per tick; subscribers come and go
      //     as clients open/close SnapshotStream. PubSub semantics drop
      //     messages without subscribers, so no backlog accumulates.
      //   disbandPubSub  — published exactly once when an owner disbands;
      //     every Disbanded subscriber pulls one item then completes.
      const snapshotPubSub = yield* PubSub.unbounded<Snapshot>();
      const disbandPubSub = yield* PubSub.unbounded<void>();

      // Tick orchestrator now publishes to snapshotPubSub.
      const tick = yield* makeTick({ worldRef, inputBuffer, snapshotPubSub });

      // RPC bridge: direct Protocol over DurableWebSocket. The bridge
      // owns the per-client parsers and the disconnects queue; we feed
      // it lifecycle events from the DO callbacks.
      const bridge = yield* makeRealmRpcProtocol.pipe(
        Effect.provide(RpcSerialization.layerJson),
      );

      // wsToClientId maps the DO's webSocketMessage callback's `socket`
      // arg back to the bridge's per-connection clientId. Survives
      // hibernation alongside the SessionsRef rehydrate below.
      const wsToClientId = new Map<Cloudflare.DurableWebSocket, number>();

      // -- hibernation rehydrate ------------------------------------------
      for (const socket of yield* state.getWebSockets()) {
        const data = socket.deserializeAttachment<SessionData>();
        if (data) {
          yield* sessionsRef.add(data.sessionId, socket, data.playerId);
          yield* inputBuffer.initPlayer(data.playerId);
          const clientId = yield* bridge.acceptSocket(socket, [
            ['playerid', data.playerId],
          ]);
          wsToClientId.set(socket, clientId);
        }
      }

      // -- tick fiber bookkeeping -----------------------------------------
      let tickFiber: ReturnType<typeof Effect.runFork> | null = null;
      const ensureTickRunning = Effect.sync(() => {
        if (tickFiber !== null) return;
        tickFiber = Effect.runFork(tick.loop);
      });
      const stopTick = Effect.sync(() => {
        if (tickFiber === null) return;
        tickFiber.interruptUnsafe();
        tickFiber = null;
      });
      if ((yield* sessionsRef.count) > 0) {
        yield* ensureTickRunning;
      }

      // -- middleware impl -------------------------------------------------
      // PartySession reads `playerid` from per-request headers (set by
      // the bridge at acceptSocket time) and provides PlayerSession to
      // every handler downstream.
      const partySessionLayer = Layer.succeed(PartySession)(
        PartySession.of((effect, options) => {
          const playerId = Option.getOrElse(
            Headers.get(options.headers, 'playerid'),
            () => '',
          );
          return Effect.provideService(effect, PlayerSession, {
            playerId,
          });
        }),
      );

      // -- handlers --------------------------------------------------------
      const handlersLayer = RealmRpc.toLayer(
        Effect.gen(function* () {
          return RealmRpc.of({
            // Hot path: replace the player's movement vector. Returns
            // void; the tick fiber drains the buffer on its own schedule.
            SendInputs: ({ moveX, moveZ }) =>
              Effect.gen(function* () {
                const session = yield* PlayerSession;
                yield* inputBuffer.setInputs(session.playerId, { moveX, moveZ });
              }),

            // Cold path: discrete sim event. create_character mutates
            // player identity inline (same logic as PR-B's webSocketMessage
            // had); everything else appends to the per-player event queue
            // for the next tick to consume.
            SendEvent: ({ event }) =>
              Effect.gen(function* () {
                const session = yield* PlayerSession;
                if (event.kind === 'create_character') {
                  yield* worldRef.modify((world) => {
                    const p = world.players[session.playerId];
                    if (p) {
                      const wasUnnamed = !p.name;
                      p.name = event.name;
                      p.sex = event.sex;
                      p.hairColor = event.hairColor;
                      p.armor = event.armor;
                      p.playerClass = event.playerClass;
                      if (wasUnnamed && p.name) {
                        pushSystem(world, `${p.name} joined the realm.`);
                      }
                    }
                    return world;
                  });
                  return;
                }
                yield* inputBuffer.appendEvents(session.playerId, [event]);
              }),

            // Server-streamed snapshots. Subscribing creates a new
            // subscription to the PubSub; closing the stream
            // (client unsubscribes) tears it down.
            SnapshotStream: () => Stream.fromPubSub(snapshotPubSub),

            // Server-streamed disband signal. Emits exactly once then
            // completes — clients use this as a "redirect to setup" cue.
            Disbanded: () =>
              Stream.fromPubSub(disbandPubSub).pipe(Stream.take(1)),

            // Owner-only. Verify, broadcast, close everything, wipe storage.
            Disband: () =>
              Effect.gen(function* () {
                const session = yield* PlayerSession;
                const world = yield* worldRef.get;
                if (world.ownerId !== session.playerId) {
                  return yield* new NotOwnerError({ ownerId: world.ownerId });
                }
                yield* PubSub.publish(disbandPubSub, undefined);
                yield* stopTick;
                const all = yield* sessionsRef.all;
                yield* Effect.forEach(
                  all,
                  ([, s]) => s.socket.close(1000, 'party disbanded'),
                  { discard: true },
                );
                yield* sessionsRef.clear;
                yield* state.storage.deleteAll();
              }),
          });
        }),
      );

      // -- mount RpcServer as a long-lived fiber ---------------------------
      // The `Effect.never` keeps the layer scope alive for as long as
      // the fiber runs. Interrupt the fiber → scope closes → server
      // teardown. The DO has no natural eviction signal we can hook,
      // so the fiber lives until the DO process is unloaded.
      const rpcServerLayer = RpcServer.layer(RealmRpc, {
        disableFatalDefects: true,
      }).pipe(
        Layer.provide([
          handlersLayer,
          partySessionLayer,
          Layer.succeed(RpcServer.Protocol)(bridge.protocol),
          RpcSerialization.layerJson,
        ]),
      );
      Effect.runFork(Effect.never.pipe(Effect.provide(rpcServerLayer)));

      // -- DO lifecycle handlers ------------------------------------------

      const onFetch = Effect.gen(function* () {
        const request = yield* HttpServerRequest;
        const url = new URL(request.url, 'http://localhost');
        // Client passes its locally-generated UUID so both sides agree
        // on the player identity without an extra round-trip.
        const playerId: PlayerId = url.searchParams.get('playerId') ?? crypto.randomUUID();

        const [response, socket] = yield* Cloudflare.upgrade();

        const sessionId = crypto.randomUUID();
        socket.serializeAttachment({ sessionId, playerId } satisfies SessionData);

        yield* sessionsRef.add(sessionId, socket, playerId);
        yield* inputBuffer.initPlayer(playerId);

        // Register the socket with the RPC bridge. The synthesized
        // `playerid` header threads through every inbound Request so
        // the PartySession middleware can provide PlayerSession to
        // every handler invocation.
        const clientId = yield* bridge.acceptSocket(socket, [
          ['playerid', playerId],
        ]);
        wsToClientId.set(socket, clientId);

        yield* worldRef.modify((world) => {
          addPlayer(world, playerId);
          return world;
        });

        // First REAL player to connect anchors localPlayerId for world
        // systems (death tracking, monster proximity, NPC chat).
        // createWorld() pre-populates a placeholder player; drop it on
        // the first real connect. Goes away in PR-D.
        const sessionCount = yield* sessionsRef.count;
        if (sessionCount === 1) {
          yield* worldRef.modify((world) => {
            for (const pid of Object.keys(world.players)) {
              if (pid !== playerId) delete world.players[pid];
            }
            world.localPlayerId = playerId;
            return world;
          });
        }

        // Anchor the party owner on first-ever connect. Persisted in
        // DO storage so it survives hibernation — see makeWorldRef
        // for the matching restore path.
        const currentWorld = yield* worldRef.get;
        if (!currentWorld.ownerId) {
          yield* worldRef.modify((world) => {
            world.ownerId = playerId;
            return world;
          });
          yield* state.storage.put('ownerId', playerId);
        }

        yield* ensureTickRunning;
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
          const data = ws.deserializeAttachment<SessionData>();

          // Notify the RPC bridge first so any in-flight streams unwind.
          const clientId = wsToClientId.get(ws);
          if (clientId !== undefined) {
            yield* bridge.onClose(clientId);
            wsToClientId.delete(ws);
          }

          if (data) {
            const prior = yield* sessionsRef.remove(data.sessionId);
            yield* inputBuffer.clearPlayer(data.playerId);
            if (Option.isSome(prior)) {
              yield* worldRef.modify((world) => {
                const leaving = world.players[data.playerId];
                if (leaving?.name) {
                  pushSystem(world, `${leaving.name} left the realm.`);
                }
                delete world.players[data.playerId];
                const remaining = Object.keys(world.players)[0];
                if (remaining) world.localPlayerId = remaining;
                return world;
              });
            }
          }
          if ((yield* sessionsRef.count) === 0) yield* stopTick;

          // RFC 6455 reserved-code clamp — see commit a877205.
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

