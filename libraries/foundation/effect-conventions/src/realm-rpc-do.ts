// DurableObject ↔ effect/unstable/rpc bridge.
// ----------------------------------------------------------------------
//
// Effect 4.0 ships RpcServer protocols for HTTP, WebSocket-via-HttpRouter,
// and SocketServer-backed TCP. None of them fit a Cloudflare Durable
// Object's hibernating WebSocket lifecycle, where:
//
//   - The DO owns N WebSockets per instance.
//   - Sockets are accepted via `state.acceptWebSocket(ws)` (the alchemy
//     wrapper does this inside `Cloudflare.upgrade()`).
//   - Inbound frames arrive via `webSocketMessage(ws, data)` callbacks
//     from the runtime — there is no `ws.onmessage` we can subscribe to.
//   - Hibernation may evict the DO and rebuild it later; sockets survive
//     and their attachments come back via `state.getWebSockets()`.
//
// This module provides two adapters:
//
//   1. `socketFromDurableWebSocket(ws)` — adapts ONE DurableWebSocket
//      into one `effect/unstable/socket/Socket`. Useful for any Socket
//      consumer (Stream-based channel ops, custom protocols).
//
//   2. `makeRealmRpcProtocol(serialization)` — implements RpcServer's
//      `Protocol` interface directly against DurableWebSocket. Used by
//      RealmRoom (PR-B2) to mount an RpcServer over its many connected
//      sockets without going through Socket. Less indirection, fewer
//      moving parts; the same approach the upstream
//      `makeProtocolWithHttpEffect` takes for its HTTP transport.

import type * as Cloudflare from 'alchemy/Cloudflare';
import * as Cause from 'effect/Cause';
import * as Effect from 'effect/Effect';
import * as Queue from 'effect/Queue';
import * as Scope from 'effect/Scope';
import * as Socket from 'effect/unstable/socket/Socket';
import * as RpcMessage from 'effect/unstable/rpc/RpcMessage';
import * as RpcSerialization from 'effect/unstable/rpc/RpcSerialization';
import * as RpcServer from 'effect/unstable/rpc/RpcServer';

/**
 * Header entries — matches the wire shape RpcServer expects on
 * `RequestEncoded.headers`. Use `Object.entries(record)` to build, or
 * literal tuples like `[['playerid', playerId]]`.
 */
export type HeaderEntries = ReadonlyArray<[string, string]>;

// =====================================================================
// 1. Socket adapter — one DurableWebSocket → one effect Socket.
// =====================================================================

export interface AcceptedSocket {
  readonly socket: Socket.Socket;
  readonly push: (data: string | Uint8Array) => Effect.Effect<void>;
  readonly end: Effect.Effect<void>;
}

export const socketFromDurableWebSocket = (
  ws: Cloudflare.DurableWebSocket,
): Effect.Effect<AcceptedSocket, never, Scope.Scope> =>
  Effect.gen(function* () {
    const queue = yield* Queue.unbounded<string | Uint8Array, Cause.Done>();

    const scope = yield* Effect.scope;
    yield* Scope.addFinalizer(scope, Queue.end(queue).pipe(Effect.asVoid));

    const socket = Socket.make({
      runRaw: (handler) =>
        Effect.gen(function* () {
          while (true) {
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

// =====================================================================
// 2. Direct RpcServer Protocol — for RealmRoom in PR-B2.
// =====================================================================

/**
 * Operations the bridge exposes to the DO lifecycle handlers. Each
 * accepted DurableWebSocket produces a clientId; RealmRoom keeps a
 * `Map<DurableWebSocket, clientId>` so the runtime's three callbacks
 * (fetch's upgrade, webSocketMessage, webSocketClose) can drive the
 * protocol.
 */
export interface RealmRpcBridge {
  /** Mount as `RpcServer.Protocol` via `Layer.succeed(RpcServer.Protocol, …)`. */
  readonly protocol: typeof RpcServer.Protocol.Service;
  /**
   * Register a fresh DurableWebSocket. Call from inside `fetch` after
   * `Cloudflare.upgrade()`. Returns the assigned clientId so callers
   * can store the mapping for routing inbound messages.
   *
   * `headers` is concatenated onto every inbound RPC Request from this
   * connection — that's where per-connection identity (e.g., the
   * `playerid` header read by `RealmSession` middleware) lives.
   */
  readonly acceptSocket: (
    ws: Cloudflare.DurableWebSocket,
    headers: HeaderEntries,
  ) => Effect.Effect<number>;
  /**
   * Feed an inbound frame from `webSocketMessage(ws, data)` into the
   * protocol. Caller is responsible for looking up the clientId from
   * its own `Map<DurableWebSocket, clientId>`.
   */
  readonly onMessage: (
    clientId: number,
    data: string | Uint8Array,
  ) => Effect.Effect<void>;
  /**
   * Notify the protocol that the underlying socket has closed. Call
   * from `webSocketClose`. The RpcServer will see the disconnect via
   * the `disconnects` queue and clean up any pending streams.
   */
  readonly onClose: (clientId: number) => Effect.Effect<void>;
}

interface ClientEntry {
  readonly ws: Cloudflare.DurableWebSocket;
  readonly headers: HeaderEntries;
  readonly parser: RpcSerialization.Parser;
}

/**
 * Build a direct RpcServer.Protocol over Cloudflare DurableWebSockets.
 *
 * Mirrors the upstream `makeProtocolWithHttpEffect` pattern (see
 * effect/unstable/rpc/RpcServer.js:597) but with three differences:
 *
 *   - No HttpServerRequest — DOs don't have a per-request scope.
 *   - acceptSocket is callable from outside the protocol's Effect
 *     scope; the underlying state is held in module-scoped Maps so
 *     RealmRoom can drive the protocol from its imperative handlers.
 *   - Per-connection headers are passed at accept-time (synthesized
 *     from the WebSocket upgrade URL), not per-request.
 */
export const makeRealmRpcProtocol = Effect.gen(function* () {
  const serialization = yield* RpcSerialization.RpcSerialization;
  const disconnects = yield* Queue.unbounded<number>();
  const clients = new Map<number, ClientEntry>();
  let nextClientId = 0;
  let writeRequest:
    | ((clientId: number, message: RpcMessage.FromClientEncoded) => Effect.Effect<void>)
    | null = null;

  const protocol = yield* RpcServer.Protocol.make((writeRequest_) => {
    writeRequest = writeRequest_;
    return Effect.succeed({
      disconnects,
      send: (clientId, response) => {
        const client = clients.get(clientId);
        if (!client) return Effect.void;
        try {
          const encoded = client.parser.encode(response);
          if (encoded === undefined) return Effect.void;
          return client.ws.send(encoded);
        } catch (cause) {
          // Encoding failures should be impossible for well-typed RPCs,
          // but if they happen we want to surface them as a defect on
          // the wire so the client can react rather than hang.
          const fallback = client.parser.encode(RpcMessage.ResponseDefectEncoded(cause));
          if (fallback === undefined) return Effect.void;
          return client.ws.send(fallback);
        }
      },
      end: (clientId) =>
        Effect.sync(() => {
          const client = clients.get(clientId);
          if (!client) return;
          clients.delete(clientId);
        }),
      clientIds: Effect.sync(() => new Set(clients.keys())),
      initialMessage: Effect.succeedNone,
      supportsAck: true,
      supportsTransferables: false,
      supportsSpanPropagation: true,
    });
  });

  const acceptSocket: RealmRpcBridge['acceptSocket'] = (ws, headers) =>
    Effect.sync(() => {
      const clientId = nextClientId++;
      const parser = serialization.makeUnsafe();
      clients.set(clientId, { ws, headers, parser });
      return clientId;
    });

  const onMessage: RealmRpcBridge['onMessage'] = (clientId, data) =>
    Effect.gen(function* () {
      const client = clients.get(clientId);
      if (!client || writeRequest === null) return;
      let decoded: ReadonlyArray<unknown>;
      try {
        decoded = client.parser.decode(data);
      } catch (cause) {
        // Malformed frame on the wire. Reflect a defect back so the
        // client's per-request promise rejects rather than hanging.
        const encoded = client.parser.encode(RpcMessage.ResponseDefectEncoded(cause));
        if (encoded !== undefined) yield* client.ws.send(encoded);
        return;
      }
      for (const raw of decoded) {
        const message = raw as RpcMessage.FromClientEncoded;
        if (message._tag === 'Request') {
          // Synthesize per-connection headers onto every Request so the
          // middleware sees `playerid` (etc.) without the client having
          // to repeat it in every RPC. Headers on the wire are arrays
          // of [key, value] tuples (RequestEncoded.headers); concat
          // mirrors the upstream `makeProtocolWithHttpEffect` pattern.
          (message as unknown as { headers: HeaderEntries }).headers = [
            ...client.headers,
            ...message.headers,
          ];
        }
        yield* writeRequest(clientId, message);
      }
    });

  const onClose: RealmRpcBridge['onClose'] = (clientId) =>
    Effect.gen(function* () {
      const client = clients.get(clientId);
      if (!client) return;
      clients.delete(clientId);
      yield* Queue.offer(disconnects, clientId);
    });

  const bridge: RealmRpcBridge = { protocol, acceptSocket, onMessage, onClose };
  return bridge;
});
