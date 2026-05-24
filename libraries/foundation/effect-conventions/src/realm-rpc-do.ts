// DurableObject ↔ Socket ↔ RpcServer bridge.
// ----------------------------------------------------------------------
//
// Effect 4.0 ships several RpcServer protocols, but none fit a Cloudflare
// Durable Object's hibernating WebSocket model out of the box:
//
//   - `layerProtocolSocketServer` requires an `effect/unstable/socket`
//     `SocketServer` — a TCP / Unix accept loop. DOs don't accept; the
//     runtime delivers messages to us by calling `webSocketMessage(ws, …)`.
//   - `makeProtocolWithHttpEffectWebsocket` calls `request.upgrade()` and
//     drives the socket inline, which does not survive hibernation. DOs
//     require `state.acceptWebSocket(ws)` inside `fetch` so the runtime
//     can rehydrate the socket attachment after eviction.
//
// What this module provides:
//   `socketFromDurableWebSocket(ws)` — adapts ONE Cloudflare
//   `DurableWebSocket` into one `effect/unstable/socket/Socket`, with
//   `push` (call from `webSocketMessage`) and `end` (call from
//   `webSocketClose`) side-channels. The Socket can then be handed to
//   `onSocket` from RpcServer's `makeSocketProtocol` (see
//   `effect/unstable/rpc/RpcServer` source) to wire up the protocol.
//
// PR-B consumes this from `services/realm/src/PartyRoom.ts` to mount an
// `effect/unstable/rpc` server over the realm's WebSockets. The
// per-socket bookkeeping (mapping `DurableWebSocket` identity to its
// `AcceptedSocket`, surviving DO hibernation via socket attachments)
// lives in PartyRoom itself — this module stays pure adapter.

import type * as Cloudflare from 'alchemy/Cloudflare';
import * as Cause from 'effect/Cause';
import * as Effect from 'effect/Effect';
import * as Queue from 'effect/Queue';
import * as Scope from 'effect/Scope';
import * as Socket from 'effect/unstable/socket/Socket';

export interface AcceptedSocket {
  /**
   * Hand to `onSocket(socket, headers)` from
   * `effect/unstable/rpc/RpcServer`'s internal `makeSocketProtocol`,
   * or to any other consumer of `Socket`.
   */
  readonly socket: Socket.Socket;
  /**
   * Producer side of the inbound queue. Call from the DO's
   * `webSocketMessage` handler with the raw frame as delivered.
   */
  readonly push: (data: string | Uint8Array) => Effect.Effect<void>;
  /**
   * Signal that no more frames will arrive — the runRaw consumer fails
   * with `SocketError { reason: SocketCloseError }`, which RpcServer's
   * protocol loop catches and treats as a clean close. Call from the
   * DO's `webSocketClose` handler.
   */
  readonly end: Effect.Effect<void>;
}

/**
 * Adapt one `DurableWebSocket` into an `effect/unstable/socket` Socket.
 *
 * The adapter is `Scope.Scope`-requiring: the inbound queue is closed
 * automatically when the surrounding scope ends, so unhappy paths
 * (DO eviction mid-handler, fiber interruption) don't leak the queue.
 *
 * RFC 6455 reserved codes (1005/1006/1015) on outbound close events are
 * clamped to 1000 (Normal Closure). The Workers runtime rejects them
 * with `InvalidAccessError` otherwise — see the matching clamp in
 * `services/realm/src/PartyRoom.ts` webSocketClose handler (commit
 * a877205).
 */
export const socketFromDurableWebSocket = (
  ws: Cloudflare.DurableWebSocket,
): Effect.Effect<AcceptedSocket, never, Scope.Scope> =>
  Effect.gen(function* () {
    // Inbound queue. Producer = DO's webSocketMessage (via `push`),
    // consumer = the Socket's `runRaw` loop. Bounded would back-pressure
    // workerd, which already throttles per-isolate; unbounded is correct.
    const queue = yield* Queue.unbounded<string | Uint8Array, Cause.Done>();

    const scope = yield* Effect.scope;
    yield* Scope.addFinalizer(
      scope,
      // Safe to double-close — Queue.end is idempotent.
      Queue.end(queue).pipe(Effect.asVoid),
    );

    const socket = Socket.make({
      runRaw: (handler) =>
        Effect.gen(function* () {
          while (true) {
            // Queue.take fails with `Cause.Done` when ended. Translate to
            // a SocketCloseError so makeSocketProtocol's
            // `Effect.catchReason("SocketError", "SocketCloseError", …)`
            // swallows it as a clean shutdown.
            const data = yield* Queue.take(queue).pipe(
              Effect.catchTag('Done', () =>
                Effect.fail(
                  new Socket.SocketError({
                    reason: new Socket.SocketCloseError({ code: 1000 }),
                  }),
                ),
              ),
            );
            const out = handler(data);
            if (out !== undefined) yield* out;
          }
        }),

      // The writer is `Effect.succeed(fn)` because we have nothing to
      // initialize per-write — `fn` just dispatches to the underlying
      // DurableWebSocket's send/close. Both `ws.send` and `ws.close`
      // return `Effect<void>` (alchemy wraps them in `Effect.sync`), so
      // no error mapping is needed.
      writer: Effect.succeed((chunk) => {
        if (Socket.isCloseEvent(chunk)) {
          const RESERVED =
            chunk.code === 1005 || chunk.code === 1006 || chunk.code === 1015;
          return ws.close(RESERVED ? 1000 : chunk.code, chunk.reason ?? '');
        }
        return ws.send(chunk);
      }),
    });

    return {
      socket,
      push: (data) => Queue.offer(queue, data).pipe(Effect.asVoid),
      end: Queue.end(queue).pipe(Effect.asVoid),
    };
  });
