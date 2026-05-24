// SessionsRef — wraps the per-DO connected-clients map.
//
// Replaces `const sessions = new Map<…>()` at old PartyRoom.ts:126
// plus the `broadcast(text)` helper at old PartyRoom.ts:140-145.
// Operations go through a Ref to serialize concurrent reads/writes from
// the tick fiber (which reads `all` once per tick) and the message
// handlers (which add/remove).

import type * as Cloudflare from 'alchemy/Cloudflare';
import type { PlayerId } from '@kassandra/simulation-domain-library';
import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Option from 'effect/Option';
import * as Ref from 'effect/Ref';

export type SessionId = string;

export interface Session {
  readonly socket: Cloudflare.DurableWebSocket;
  readonly playerId: PlayerId;
}

export interface SessionsRefShape {
  /** Register a freshly-accepted socket under its session id. */
  readonly add: (
    sessionId: SessionId,
    socket: Cloudflare.DurableWebSocket,
    playerId: PlayerId,
  ) => Effect.Effect<void>;
  /** Drop a session and return its prior value (`None` if unknown). */
  readonly remove: (sessionId: SessionId) => Effect.Effect<Option.Option<Session>>;
  /** Look up a session without removing it. */
  readonly get: (sessionId: SessionId) => Effect.Effect<Option.Option<Session>>;
  /** Snapshot every active session — used by the tick loop. */
  readonly all: Effect.Effect<ReadonlyArray<readonly [SessionId, Session]>>;
  /** Current session count. */
  readonly count: Effect.Effect<number>;
  /** Drop every session (used on disband). */
  readonly clear: Effect.Effect<void>;
  /**
   * Fan-out a text frame to every active socket. Per-socket send errors
   * are swallowed (best-effort broadcast) — workerd may have already
   * closed a socket between the snapshot decision and the actual write.
   */
  readonly broadcast: (text: string) => Effect.Effect<void>;
}

export class SessionsRef extends Context.Service<SessionsRef, SessionsRefShape>()(
  'kassandra/realm/SessionsRef',
) {}

export const makeSessionsRef: Effect.Effect<SessionsRefShape> = Effect.gen(function* () {
  const ref = yield* Ref.make<Map<SessionId, Session>>(new Map());
  return {
    add: (sessionId, socket, playerId) =>
      Ref.update(ref, (m) => {
        const next = new Map(m);
        next.set(sessionId, { socket, playerId });
        return next;
      }),
    remove: (sessionId) =>
      Ref.modify(ref, (m) => {
        const found = m.get(sessionId);
        if (!found) return [Option.none(), m];
        const next = new Map(m);
        next.delete(sessionId);
        return [Option.some(found), next];
      }),
    get: (sessionId) =>
      Effect.map(Ref.get(ref), (m) => Option.fromNullishOr(m.get(sessionId))),
    all: Effect.map(Ref.get(ref), (m) => Array.from(m.entries())),
    count: Effect.map(Ref.get(ref), (m) => m.size),
    clear: Ref.set(ref, new Map()),
    broadcast: (text) =>
      Effect.gen(function* () {
        const m = yield* Ref.get(ref);
        // Per-socket failures are swallowed; the snapshot will retry on
        // the next tick. `Effect.forEach` with `discard: true` runs
        // sequentially, mirroring the old `for…of` shape.
        yield* Effect.forEach(
          m.values(),
          (s) =>
            Effect.sync(() => {
              try {
                s.socket.ws.send(text);
              } catch {
                // Socket closed between snapshot and send. Next tick
                // will see the session removed via webSocketClose.
              }
            }),
          { discard: true },
        );
      }),
  };
});
