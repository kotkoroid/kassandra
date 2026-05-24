// PR-G3: PlayerProfile client lifecycle on the game app.
//
// One PlayerProfile WebSocket per browser session, brought up after
// the auth bootstrap. The ManagedRuntime holds the WS for the page's
// lifetime; `profile.character` is the reactive cache of whatever
// LoadCharacter returned at boot (or what the most recent
// SaveCharacter wrote). Components read `profile.character` to:
//   - decide whether to skip CharacterCreation on party-ready (App.svelte)
//   - source identity for the `create_character` SimEvent sent to
//     PartyRoom on connect.
//
// Save semantics: `saveCharacter(record)` is awaited synchronously
// from CharacterCreation's submit handler so a SaveCharacter failure
// surfaces *before* the client opens the PartyRoom WS. The order is
// deliberate — PlayerProfile is the save vault, PartyRoom is a live
// session, and we don't want a half-state where the player is in a
// party with an identity the profile DO never persisted.

import type { CharacterRecord } from '@kassandra/protocol-foundation-library';
import { PlayerProfileRpc } from '@kassandra/protocol-foundation-library';
import * as Effect from 'effect/Effect';
import * as ManagedRuntime from 'effect/ManagedRuntime';

import { auth } from './auth.svelte';
import { makeProfileClientLayer, ProfileClient } from './lib/profile-client';

export const profile = $state({
  character: null as CharacterRecord | null,
});

// Module-scoped runtime — built once at `initProfile()` and reused for
// every SaveCharacter call. `auth.token` is captured at construction;
// PR-G3 doesn't refresh tokens mid-session (the 24 h TTL covers a
// single play session), so the static capture is safe.
let runtime: ManagedRuntime.ManagedRuntime<ProfileClient, never> | null = null;

/**
 * Called once from `main.ts` after `initAuth()`. Opens the
 * PlayerProfile WS, awaits LoadCharacter, and seeds `profile.character`.
 * Throws on network/auth failure — same fail-loud stance as initAuth().
 */
export async function initProfile(): Promise<void> {
  if (!auth.token) {
    throw new Error('initProfile called before auth bootstrap completed');
  }
  runtime = ManagedRuntime.make(makeProfileClientLayer(auth.accountId, auth.token));
  const loaded = await runtime.runPromise(
    Effect.gen(function* () {
      const client = yield* ProfileClient;
      return yield* client.LoadCharacter();
    }),
  );
  profile.character = loaded;
}

/**
 * Persist a character record. Returns once the DO has acked the
 * SaveCharacter RPC. Updates `profile.character` so subsequent
 * reads in the same session see the saved value without re-loading.
 */
export async function saveCharacter(record: CharacterRecord): Promise<void> {
  if (!runtime) {
    throw new Error('saveCharacter called before initProfile completed');
  }
  await runtime.runPromise(
    Effect.gen(function* () {
      const client = yield* ProfileClient;
      yield* client.SaveCharacter({ character: record });
    }),
  );
  profile.character = record;
}
