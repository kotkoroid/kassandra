// Pattern: Cloudflare DurableObject integration (alchemy/Cloudflare)
// ----------------------------------------------------------------------
//
// What it replaces in Kassandra:
//   - services/realm/src/RealmRoom.ts current shape — Effect.gen
//     scaffold but with mutable Maps + setInterval inside. PR-B rewrites
//     this to the template below: services for state, forkScoped for
//     timers, scope-based session lifecycle.
//
// Alchemy's contract:
//   `Cloudflare.DurableObjectNamespace<Self>()(name, Effect.gen)`
//   returns the DO class. Inside, the outer `Effect.gen` runs ONCE
//   per-namespace (or rebuild); the inner `Effect.gen` runs per-DO-instance
//   and returns the handler object {fetch, webSocketMessage,
//   webSocketClose, alarm}.
//
// Hibernation:
//   `Cloudflare.DurableObjectState.getWebSockets()` returns sockets
//   that survived eviction. Each socket carries a serialized attachment
//   (`socket.serializeAttachment(data)` on accept;
//   `socket.deserializeAttachment<T>()` on rehydrate). PR-B uses this
//   to rebuild `SessionsRef` after the runtime brings the DO back.
//
// Alarms:
//   `state.storage.setAlarm(timestampMs)` schedules a wake-up.
//   `state.storage.getAlarm` / `deleteAlarm` round it out. The DO's
//   `alarm?: (info?) => Effect<void>` handler fires when the time hits.
//   PR-E uses this for periodic world-snapshot persistence.

import * as Cloudflare from 'alchemy/Cloudflare';
import * as Effect from 'effect/Effect';
import * as HttpServerResponse from 'effect/unstable/http/HttpServerResponse';

// Reference shape: a minimal DO with all four lifecycle handlers wired.
// Real services compose service layers around this; the skeleton stays
// thin so the lifecycle is legible.
export default class ExampleDO extends Cloudflare.DurableObjectNamespace<ExampleDO>()(
  'ExampleDO',
  Effect.gen(function* () {
    // Outer phase: shared deps initialized once per namespace
    // (rarely used — usually empty Effect.succeed).
    return Effect.gen(function* () {
      // Inner phase: per-instance setup. Yield the state service to
      // access storage, alarms, sockets.
      const state = yield* Cloudflare.DurableObjectState;

      // Rehydrate any state we persisted in `storage` here:
      //   const saved = yield* state.storage.get<X>('key');
      void state;

      return {
        fetch: Effect.gen(function* () {
          // Upgrade and accept inside this handler. PR-B builds an
          // RpcServer Protocol from the upgraded socket via the
          // realm-rpc-do bridge.
          return HttpServerResponse.text('hello from ExampleDO');
        }),

        webSocketMessage: Effect.fnUntraced(function* (
          socket: Cloudflare.DurableWebSocket,
          message: string | ArrayBuffer,
        ) {
          // PR-B: route into the per-session inbound queue via
          // realm-rpc-do's `push`.
          void socket;
          void message;
        }),

        webSocketClose: Effect.fnUntraced(function* (
          socket: Cloudflare.DurableWebSocket,
          code: number,
          reason: string,
        ) {
          // RFC 6455 reserved-code clamp — see commit a877205.
          const RESERVED = code === 1005 || code === 1006 || code === 1015;
          yield* socket.close(RESERVED ? 1000 : code, reason);
        }),

        alarm: Effect.gen(function* () {
          // PR-E: persist a world snapshot, reschedule, etc.
        }),
      };
    });
  }),
) {}
