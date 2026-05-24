// PR-C2: WebSocket lifecycle + snapshot ingest, now routed through
// effect/unstable/rpc + the RealmClient layer (libs/foundation/protocol).
// JSON parsing, the buildSnapshotShape duplicate type, and ad-hoc
// onmessage routing are gone. The exported API is unchanged so the
// rest of the codebase (Scene.svelte useTask, CharacterCreation,
// chat.svelte) keeps working without edits.

import type { SimEvent } from '@kassandra/simulation-domain-library';
import * as Effect from 'effect/Effect';
import * as ManagedRuntime from 'effect/ManagedRuntime';
import * as Stream from 'effect/Stream';

import { applySnapshot } from './lib/applySnapshot';
import { makeRealmClientLayer, RealmClient } from './lib/realm-client';
import { world } from './world.svelte';

export const realm = $state({
  connected: false,
  partyId: null as string | null,
  // Monotonic counter bumped each time the server signals a disband
  // (via the Disbanded RPC stream). App.svelte watches this to redirect
  // back to PartySetup.
  disbandCount: 0,
});

// One ManagedRuntime per party connection. Synchronous-constructed,
// holds the WebSocket + RPC client for its lifetime; `dispose()` closes
// everything. Module-scoped so `sendFrame` (called from Threlte's
// useTask, outside any Effect context) can drive it.
let runtime: ManagedRuntime.ManagedRuntime<RealmClient, never> | null = null;
// Events queued before the runtime is up (e.g. create_character sent
// right after connect()).
let pendingEvents: SimEvent[] = [];

export function connect(id: string) {
  if (runtime) disconnect();

  realm.partyId = id;

  runtime = ManagedRuntime.make(makeRealmClientLayer(id, world.localPlayerId));

  // Long-lived snapshot subscription: every emitted Snapshot updates
  // the local world mirror. The Stream completes when the WebSocket
  // closes, which makes the runFork fiber settle quietly on disconnect.
  runtime.runFork(
    Effect.gen(function* () {
      const client = yield* RealmClient;
      // First emission flips `connected` true — it's the proof the
      // socket handshake + RPC handshake both succeeded.
      yield* Stream.runForEach(client.SnapshotStream(), (snapshot) =>
        Effect.sync(() => {
          if (!realm.connected) {
            realm.connected = true;
            // Flush any events queued before we were ready.
            if (pendingEvents.length > 0) {
              const queued = pendingEvents.splice(0);
              sendFrame(0, 0, queued);
            }
          }
          applySnapshot(snapshot);
        }),
      );
    }),
  );

  // Disband subscription. Server publishes exactly one void item via
  // the PubSub when the owner disbands; the take(1) lives on the
  // server side so the client just runForEach.
  runtime.runFork(
    Effect.gen(function* () {
      const client = yield* RealmClient;
      yield* Stream.runForEach(client.Disbanded(), () =>
        Effect.sync(() => {
          realm.disbandCount += 1;
          disconnect();
          const url = new URL(window.location.href);
          url.searchParams.delete('party');
          window.history.replaceState(null, '', url.toString());
        }),
      );
    }),
  );
}

export function disconnect() {
  if (runtime) {
    // Fire-and-forget dispose — we don't need to await teardown to
    // mark the state changes; the user is already on their way out.
    void runtime.dispose();
    runtime = null;
  }
  pendingEvents = [];
  realm.connected = false;
  realm.partyId = null;
}

/**
 * Drain accumulated events + send the current movement vector. Called
 * once per animation frame from Scene.svelte's useTask. Splits the
 * old single-frame envelope into one SendInputs RPC + N SendEvent RPCs
 * so each is independently routable on the server.
 */
export function sendFrame(moveX: number, moveZ: number, events: SimEvent[]) {
  if (!runtime || !realm.connected) {
    // Socket not open yet — queue events so they fire once it opens.
    if (events.length > 0) pendingEvents.push(...events);
    return;
  }
  runtime.runFork(
    Effect.gen(function* () {
      const client = yield* RealmClient;
      yield* client.SendInputs({ moveX, moveZ });
      yield* Effect.forEach(events, (event) => client.SendEvent({ event }), {
        discard: true,
      });
    }),
  );
}

/**
 * Owner-only. Asks the realm to tear down the party. The server
 * verifies ownership and, if accepted, emits on the Disbanded stream
 * (which this client also subscribes to → triggers disconnect +
 * redirect via the subscription above). Non-owner senders get a typed
 * NotOwnerError, which we swallow because the Disband UI is itself
 * gated on `world.localPlayerId === world.ownerId` — only the rare
 * race where ownership changes between render and click can get here,
 * and silently ignoring is the right UX.
 */
export function disbandParty() {
  if (!runtime) return;
  runtime.runFork(
    Effect.gen(function* () {
      const client = yield* RealmClient;
      yield* client.Disband().pipe(
        Effect.catchTag('kassandra/realm/NotOwnerError', () => Effect.void),
      );
    }),
  );
}
