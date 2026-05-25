// Pattern: Scope-based resource lifecycle (Effect.acquireRelease)
// ----------------------------------------------------------------------
//
// When to use:
//   Anything that MUST clean up on interruption — WebSocket connections,
//   tick fibers, alarm registrations, DO storage timers, audio contexts,
//   Three.js disposables.
//
// What it replaces in Kassandra:
//   - services/realm/src/RealmRoom.ts:316-318 manual sessions.delete()
//     cleanup at webSocketClose → becomes a Scope finalizer registered
//     at acquire-time. webSocketClose just closes the scope.
//   - applications/game/src/realm.svelte.ts:12-14,82-83 manual
//     `ws.onopen = ws.onmessage = … = null; ws.close()` → becomes a
//     scoped Effect that owns the WebSocket lifetime.
//
// Key property: finalizers run on interruption too. Drop a tab, kill a
// fiber, error out mid-handler — every acquired resource releases.
// This is the structural reason "no fire-and-forget" works.
//
// 4.0 detail:
//   `Scope` is a `Context.Reference`, so it threads automatically. You
//   rarely construct one yourself — `Effect.scoped` builds one, runs
//   the program, and closes it.

import * as Effect from 'effect/Effect';

// Reference shape: a "connection" we acquire (returns a handle) and
// release (closes it). In practice this might wrap a WebSocket, a file
// descriptor, an alarm registration, etc.
interface Connection {
  readonly id: string;
  readonly send: (msg: string) => void;
}

const openConnection = (id: string): Effect.Effect<Connection> =>
  Effect.sync(() => ({
    id,
    send: (msg) => {
      void msg; // would actually wire to the underlying transport
    },
  }));

const closeConnection = (conn: Connection): Effect.Effect<void> =>
  Effect.sync(() => {
    void conn; // would actually close the transport
  });

// Reference usage — acquireRelease ties open/close together. The
// returned Effect requires `Scope`; `Effect.scoped` provides one and
// runs the finalizer when the scope ends — including on interruption.
export const _exampleProgram = Effect.gen(function* () {
  const conn = yield* Effect.acquireRelease(
    openConnection('session-1'),
    (c) => closeConnection(c),
  );
  conn.send('hello');
}).pipe(Effect.scoped);
