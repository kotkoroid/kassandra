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
  makeRandomLayer,
  makeWorldRef,
  pushSystem,
  RandomState,
  SimLayer,
  WorldRef,
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
import { makePartyStorage } from './services/PartyStorage.ts';
import { makeSessionsRef } from './services/SessionsRef.ts';
import { makeTick } from './services/Tick.ts';

// PR-E: save cadence while the party is occupied. 30 s is short enough
// that a crash / DO-eviction loses at most ~600 ticks (30 s × 20 Hz)
// of progression and long enough that storage I/O isn't a hot path.
const SAVE_ALARM_INTERVAL_MS = 30_000;

interface SessionData {
  sessionId: string;
  playerId: PlayerId;
  // PR-G5 fix: alchemy hands a fresh `DurableWebSocket` wrapper to
  // `webSocketMessage` each call, so a `Map<DurableWebSocket,
  // clientId>` keyed by reference always misses. The bridge clientId
  // lives in the attachment instead — survives both wrapper
  // recreation and DO hibernation.
  clientId: number;
}

export default class PartyRoom extends Cloudflare.DurableObjectNamespace<PartyRoom>()(
  'PartyRoom',
  Effect.gen(function* () {
    return Effect.gen(function* () {
      const state = yield* Cloudflare.DurableObjectState;

      // -- per-instance state --------------------------------------------
      // PR-E: persistence. PartyStorage wraps state.storage.put/get for
      // the world payload. On boot we try restore (returns None on
      // first-ever construction or a schema-bumped payload); fall back
      // to a fresh world. The legacy single-key `state.storage.get('ownerId')`
      // is gone — ownerId now travels inside the persisted world.
      const partyStorage = yield* makePartyStorage(state);
      const restored = yield* partyStorage.restore;
      const initialWorld = Option.match(restored, {
        onNone: () => createWorld(),
        onSome: (r) => r.world,
      });
      // PR-D3e.3: Mulberry32 state lives in `RandomState` (sim service),
      // not on `world.rng` directly. Build the Layer with the
      // persisted seed (or a fresh one on first-ever boot) and rebind
      // `world.rng` to the shared callable so sync sim impls and the
      // `effect/Random` Reference advance the same stream.
      const initialSeed = Option.match(restored, {
        onNone: () => Date.now() >>> 0,
        onSome: (r) => r.rngSeed,
      });
      const randomLayer = makeRandomLayer(initialSeed);
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

      // Tick orchestrator: realm wrapper around sim's Tick service.
      // SimLayer is provided here with our WorldRef instance plumbed
      // through so sim's services (Combat, Spawner, …) see the same
      // world the realm is mutating. PR-D3e.3: `randomLayer` provides
      // the shared Mulberry32-backed `effect/Random.Random` Reference
      // + `RandomState` service; merged into SimLayer so every
      // Effect-yielding sim site sees the same rng stream `world.rng`
      // exposes synchronously.
      const tick = yield* makeTick({ worldRef, inputBuffer, snapshotPubSub }).pipe(
        Effect.provide(
          SimLayer.pipe(
            Layer.provide(Layer.succeed(WorldRef)(worldRef)),
            Layer.provideMerge(randomLayer),
          ),
        ),
      );

      // Bind `world.rng` to the same Mulberry32 stream that
      // `RandomState`/`Random` advance. Effect.provide is only valid
      // inside an Effect, but we want the callable here so the boot
      // path can drop it onto the world.
      yield* Effect.gen(function* () {
        const rs = yield* RandomState;
        yield* worldRef.modify((world) => {
          world.rng = rs.next;
          return world;
        });
      }).pipe(Effect.provide(randomLayer));

      // RPC bridge: direct Protocol over DurableWebSocket. The bridge
      // owns the per-client parsers and the disconnects queue; we feed
      // it lifecycle events from the DO callbacks.
      const bridge = yield* makeRealmRpcProtocol.pipe(
        Effect.provide(RpcSerialization.layerJson),
      );

      // -- hibernation rehydrate ------------------------------------------
      // PR-G5 fix: the bridge clientId lives in the per-socket
      // attachment (see SessionData) rather than a reference-keyed
      // Map — alchemy hands a fresh DurableWebSocket wrapper to
      // every webSocketMessage call, so a Map lookup never matches.
      for (const socket of yield* state.getWebSockets()) {
        const data = socket.deserializeAttachment<SessionData>();
        if (data) {
          yield* sessionsRef.add(data.sessionId, socket, data.playerId);
          yield* inputBuffer.initPlayer(data.playerId);
          const clientId = yield* bridge.acceptSocket(socket, [
            ['playerid', data.playerId],
          ]);
          // Bridge clientIds are per-DO-instance — re-stamp the
          // attachment with the freshly-assigned one.
          socket.serializeAttachment({
            sessionId: data.sessionId,
            playerId: data.playerId,
            clientId,
          } satisfies SessionData);
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
                // PR-E: clear persisted world + cancel the alarm so a
                // dormant disbanded DO doesn't wake up to re-save.
                // `deleteAll` covers any forgotten side keys and any
                // future ScheduledEvents bookkeeping.
                yield* state.storage.deleteAlarm();
                yield* partyStorage.clear;
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
        // PR-G2: `playerId` is the JWT `sub` claim, written into the
        // forwarded URL by the realm Worker after verifying the
        // bearer subprotocol. DOs aren't publicly addressable, so
        // the only way a request reaches here is through that
        // realm-controlled rewrite — the fallback below is just
        // defence-in-depth in case the contract drifts.
        const playerId: PlayerId = url.searchParams.get('playerId') ?? crypto.randomUUID();

        const [response, socket] = yield* Cloudflare.upgrade();

        const sessionId = crypto.randomUUID();

        yield* sessionsRef.add(sessionId, socket, playerId);
        yield* inputBuffer.initPlayer(playerId);

        // Register the socket with the RPC bridge. The synthesized
        // `playerid` header threads through every inbound Request so
        // the PartySession middleware can provide PlayerSession to
        // every handler invocation.
        const clientId = yield* bridge.acceptSocket(socket, [
          ['playerid', playerId],
        ]);
        // PR-G5 fix: stash clientId in the attachment so
        // webSocketMessage / webSocketClose can find it without a
        // reference-keyed Map (alchemy reissues the wrapper).
        socket.serializeAttachment({
          sessionId,
          playerId,
          clientId,
        } satisfies SessionData);

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

        // Anchor the party owner on first-ever connect. PR-E: the
        // owner travels inside the persisted world (ownerId is a
        // field on the World struct), so we no longer need a separate
        // 'ownerId' key in storage — `partyStorage.save` writes the
        // whole world on disconnect + alarm.
        const currentWorld = yield* worldRef.get;
        if (!currentWorld.ownerId) {
          yield* worldRef.modify((world) => {
            world.ownerId = playerId;
            return world;
          });
        }

        yield* ensureTickRunning;
        // PR-E: schedule the next periodic save. setAlarm is idempotent
        // on the same scheduledTime; repeated connects just refresh it.
        yield* state.storage.setAlarm(Date.now() + SAVE_ALARM_INTERVAL_MS);
        return response;
      });

      const onMessage = (
        socket: Cloudflare.DurableWebSocket,
        message: string | ArrayBuffer,
      ) =>
        Effect.gen(function* () {
          // Read clientId from the attachment — alchemy hands a
          // fresh DurableWebSocket wrapper each call, so a
          // reference-keyed lookup never matches.
          const data = socket.deserializeAttachment<SessionData>();
          if (!data || data.clientId === undefined) return;
          const payload =
            typeof message === 'string' ? message : new Uint8Array(message);
          yield* bridge.onMessage(data.clientId, payload);
        });

      const onClose = (
        ws: Cloudflare.DurableWebSocket,
        code: number,
        reason: string,
      ) =>
        Effect.gen(function* () {
          const data = ws.deserializeAttachment<SessionData>();

          // Notify the RPC bridge first so any in-flight streams unwind.
          if (data?.clientId !== undefined) {
            yield* bridge.onClose(data.clientId);
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
          if ((yield* sessionsRef.count) === 0) {
            yield* stopTick;
            // PR-E: last-disconnect save. The world has just finished
            // its last tick (stopTick interrupted the loop *before*
            // this point), so the snapshot here is consistent. Also
            // drop the periodic alarm — nothing to save while empty.
            const world = yield* worldRef.get;
            yield* Effect.gen(function* () {
              const rs = yield* RandomState;
              yield* partyStorage.save(world, rs.getSeed());
            }).pipe(Effect.provide(randomLayer));
            yield* state.storage.deleteAlarm();
          }

          // RFC 6455 reserved-code clamp — see commit a877205.
          const RESERVED = code === 1005 || code === 1006 || code === 1015;
          yield* ws.close(RESERVED ? 1000 : code, reason);
        });

      // PR-E: periodic save handler. The DO runtime invokes `alarm`
      // when state.storage.setAlarm fires; we save the world and
      // reschedule the next save iff the party is still occupied
      // (the alarm chain self-terminates when the last socket closes).
      const onAlarm = Effect.gen(function* () {
        const count = yield* sessionsRef.count;
        if (count === 0) return;
        const world = yield* worldRef.get;
        yield* Effect.gen(function* () {
          const rs = yield* RandomState;
          yield* partyStorage.save(world, rs.getSeed());
        }).pipe(Effect.provide(randomLayer));
        yield* state.storage.setAlarm(Date.now() + SAVE_ALARM_INTERVAL_MS);
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
        alarm: Effect.fnUntraced(function* (_alarmInfo?: unknown) {
          yield* onAlarm;
        }),
      };
    });
  }),
) {}

