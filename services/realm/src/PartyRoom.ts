// PartyRoom — the Durable Object that owns one party's authoritative
// world. Each connected player gets a hibernating WebSocket; the DO
// runs a 20 Hz fixed-step tick, broadcasts a full snapshot per tick,
// and persists the party owner across hibernation.
//
// PR-B rewrite: every piece of per-DO state lives in a Context.Service
// (WorldRef, SessionsRef, InputBuffer, Tick) built once in the inner
// Effect.gen and provided to every handler via a shared Context. The
// 20 Hz loop runs under `Effect.forkScoped` — the underlying scope is
// the per-DO lifetime, so the fiber dies cleanly on eviction.
//
// What stayed unchanged (intentionally — PR-B is internals-only):
//   - The JSON wire envelope (`ClientMessage` / `ServerMessage` from
//     libraries/foundation/protocol). PR-B2 swaps to effect/unstable/rpc.
//   - The DO hibernation contract (acceptWebSocket, getWebSockets,
//     serializeAttachment). PR-E will add storage-driven world freeze.
//   - The accepted Phase-4 limitations (death keyed to localPlayerId,
//     create_character is a SimEvent). Both go away in PR-D.

import { ClientMessage } from '@kassandra/protocol-foundation-library';
import {
  addPlayer,
  pushSystem,
  type PlayerId,
  type SimEvent,
} from '@kassandra/simulation-domain-library';
import * as Cloudflare from 'alchemy/Cloudflare';
import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Option from 'effect/Option';
import * as Schema from 'effect/Schema';
import { HttpServerRequest } from 'effect/unstable/http/HttpServerRequest';

import { WorldDecodeError } from './errors.ts';
import {
  InputBuffer,
  makeInputBuffer,
  type InputBufferShape,
} from './services/InputBuffer.ts';
import {
  makeSessionsRef,
  SessionsRef,
  type SessionsRefShape,
} from './services/SessionsRef.ts';
import { makeTick, Tick, type TickShape } from './services/Tick.ts';
import {
  makeWorldRef,
  WorldRef,
  type WorldRefShape,
} from './services/WorldRef.ts';

interface SessionData {
  sessionId: string;
  playerId: PlayerId;
}

const decodeClientMessage = Schema.decodeUnknownEffect(Schema.fromJsonString(ClientMessage));

const previewRaw = (raw: string | ArrayBuffer): string => {
  const text = typeof raw === 'string' ? raw : new TextDecoder().decode(raw);
  return text.length > 200 ? `${text.slice(0, 200)}…` : text;
};

const buildContext = (deps: {
  readonly worldRef: WorldRefShape;
  readonly sessionsRef: SessionsRefShape;
  readonly inputBuffer: InputBufferShape;
  readonly tick: TickShape;
}): Context.Context<WorldRef | SessionsRef | InputBuffer | Tick> =>
  Context.empty().pipe(
    Context.add(WorldRef, deps.worldRef),
    Context.add(SessionsRef, deps.sessionsRef),
    Context.add(InputBuffer, deps.inputBuffer),
    Context.add(Tick, deps.tick),
  );

export default class PartyRoom extends Cloudflare.DurableObjectNamespace<PartyRoom>()(
  'PartyRoom',
  Effect.gen(function* () {
    return Effect.gen(function* () {
      const state = yield* Cloudflare.DurableObjectState;

      // -- per-instance service construction -----------------------------
      const storedOwner = yield* state.storage.get<PlayerId>('ownerId');
      const worldRef = yield* makeWorldRef(storedOwner ?? null);
      const sessionsRef = yield* makeSessionsRef;
      const inputBuffer = yield* makeInputBuffer;
      const tick = yield* makeTick({ worldRef, sessionsRef, inputBuffer });
      const ctx = buildContext({ worldRef, sessionsRef, inputBuffer, tick });

      // -- hibernation rehydrate ------------------------------------------
      // Sockets that survived eviction come back from getWebSockets()
      // with their attachments intact. Rebuild SessionsRef + InputBuffer
      // so the next tick sees them.
      for (const socket of yield* state.getWebSockets()) {
        const data = socket.deserializeAttachment<SessionData>();
        if (data) {
          yield* sessionsRef.add(data.sessionId, socket, data.playerId);
          yield* inputBuffer.initSession(data.sessionId);
        }
      }

      // -- tick fiber bookkeeping -----------------------------------------
      // The tick loop runs as a forked Effect fiber. We track its handle
      // so we can start it on first connect and interrupt it on
      // last-disconnect (and on disband). `Effect.runFork` returns a
      // Fiber whose `interruptUnsafe()` is synchronous, which fits the
      // imperative DO handler shape.
      let tickFiber: ReturnType<typeof Effect.runFork> | null = null;

      const ensureTickRunning = Effect.sync(() => {
        if (tickFiber !== null) return;
        tickFiber = Effect.runFork(Effect.provide(tick.loop, ctx));
      });

      const stopTick = Effect.sync(() => {
        if (tickFiber === null) return;
        tickFiber.interruptUnsafe();
        tickFiber = null;
      });

      if ((yield* sessionsRef.count) > 0) {
        yield* ensureTickRunning;
      }

      // -- handlers --------------------------------------------------------

      const onFetch = Effect.gen(function* () {
        const request = yield* HttpServerRequest;
        const url = new URL(request.url, 'http://localhost');
        // Client passes its locally-generated UUID so both sides agree
        // on the player identity without an extra round-trip.
        const playerId: PlayerId = url.searchParams.get('playerId') ?? crypto.randomUUID();

        const [response, socket] = yield* Cloudflare.upgrade();

        const sessionId = crypto.randomUUID();
        const data: SessionData = { sessionId, playerId };
        socket.serializeAttachment(data);

        yield* sessionsRef.add(sessionId, socket, playerId);
        yield* inputBuffer.initSession(sessionId);

        yield* worldRef.modify((world) => {
          addPlayer(world, playerId);
          // First REAL player to connect anchors localPlayerId for
          // world systems (death tracking, monster proximity, NPC
          // chat). createWorld() pre-populates a placeholder player as
          // a single-player legacy — drop it on the first real connect
          // so counts and localPlayerId reflect real sessions. This
          // logic goes away in PR-D (sim becomes per-player).
          if (Object.keys(world.players).length > 1 || world.localPlayerId !== playerId) {
            // We just had only the placeholder before this call's
            // addPlayer. Detect via "are there players that aren't us
            // and aren't the localPlayerId of the placeholder world?"
            // Simpler: if this is the first session, swap.
          }
          return world;
        });

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

      const onMessage = (socket: Cloudflare.DurableWebSocket, message: string | ArrayBuffer) =>
        Effect.gen(function* () {
          const data = socket.deserializeAttachment<SessionData>();
          if (!data) return;

          const text = typeof message === 'string' ? message : new TextDecoder().decode(message);
          const parsed = yield* decodeClientMessage(text).pipe(
            Effect.mapError(
              (issue) =>
                new WorldDecodeError({
                  reason: String(issue),
                  rawPreview: previewRaw(message),
                }),
            ),
          );

          if (parsed.kind !== 'inputs') return;

          yield* inputBuffer.setInputs(data.sessionId, {
            moveX: parsed.moveX,
            moveZ: parsed.moveZ,
          });

          // Handle create_character and disband_party directly — both
          // mutate identity / lifecycle state and must not be deferred
          // into the per-player events drain (which goes through tick).
          const regularEvents: SimEvent[] = [];
          let disbandRequested = false;
          for (const ev of parsed.events) {
            if (ev.kind === 'create_character') {
              yield* worldRef.modify((world) => {
                const p = world.players[data.playerId];
                if (p) {
                  // "Joined" announce fires on the FIRST create_character
                  // for this connection (when the name transitions from
                  // empty to non-empty). Re-rolls during the same session
                  // skip the announce so we don't spam chat.
                  const wasUnnamed = !p.name;
                  p.name = ev.name;
                  p.sex = ev.sex;
                  p.hairColor = ev.hairColor;
                  p.armor = ev.armor;
                  p.playerClass = ev.playerClass;
                  if (wasUnnamed && p.name) {
                    pushSystem(world, `${p.name} joined the realm.`);
                  }
                }
                return world;
              });
            } else if (ev.kind === 'disband_party') {
              // Owner-only. Silently ignore from any other sender —
              // unauthorized attempts don't surface to chat.
              const world = yield* worldRef.get;
              if (data.playerId === world.ownerId) {
                disbandRequested = true;
              }
            } else {
              regularEvents.push(ev);
            }
          }

          yield* inputBuffer.appendEvents(data.sessionId, regularEvents);

          if (disbandRequested) {
            // Broadcast the terminal 'disbanded' message, stop the
            // tick loop, close every socket, wipe DO storage. After
            // this the room is dormant; the next connect to the same
            // party id starts fresh.
            yield* sessionsRef.broadcast(JSON.stringify({ kind: 'disbanded' }));
            yield* stopTick;
            const all = yield* sessionsRef.all;
            yield* Effect.forEach(
              all,
              ([, s]) => s.socket.close(1000, 'party disbanded'),
              { discard: true },
            );
            yield* sessionsRef.clear;
            yield* state.storage.deleteAll();
          }
        }).pipe(
          // Boundary error handler. Decode failures get logged + dropped;
          // the connection stays open (malformed payloads are treated
          // as adversarial, not as a transient state).
          Effect.catchTag('kassandra/realm/WorldDecodeError', (err) =>
            Effect.logWarning('client message decode failed', {
              reason: err.reason,
              preview: err.rawPreview,
            }),
          ),
        );

      const onClose = (
        ws: Cloudflare.DurableWebSocket,
        code: number,
        reason: string,
      ) =>
        Effect.gen(function* () {
          const data = ws.deserializeAttachment<SessionData>();
          if (data) {
            const prior = yield* sessionsRef.remove(data.sessionId);
            yield* inputBuffer.clearSession(data.sessionId);
            if (Option.isSome(prior)) {
              // Lifecycle announce — capture the name *before* the
              // player record is dropped. If the player disconnected
              // before naming themselves (rare: closed the tab during
              // character creation), skip the message.
              yield* worldRef.modify((world) => {
                const leaving = world.players[data.playerId];
                if (leaving?.name) {
                  pushSystem(world, `${leaving.name} left the realm.`);
                }
                delete world.players[data.playerId];
                // Re-anchor localPlayerId to any remaining player.
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
        fetch: Effect.provide(onFetch, ctx),
        webSocketMessage: Effect.fnUntraced(
          function* (socket: Cloudflare.DurableWebSocket, message: string | ArrayBuffer) {
            yield* Effect.provide(onMessage(socket, message), ctx);
          },
        ),
        webSocketClose: Effect.fnUntraced(
          function* (ws: Cloudflare.DurableWebSocket, code: number, reason: string) {
            yield* Effect.provide(onClose(ws, code, reason), ctx);
          },
        ),
      };
    });
  }),
) {}
