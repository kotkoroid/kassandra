// PR-G3: PlayerProfile client lifecycle on the game app.
// PR-G4: progression save-back (client-side debounced).
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
//
// PR-G4: `notifyWorldUpdate(world)` is called after each PartyRoom
// snapshot lands; it computes a fresh CharacterRecord from the local
// player's progression, compares to the last-saved record, and
// schedules a debounced SaveCharacter if anything meaningful
// changed. `flushSave(world)` is called on disconnect to drain any
// pending debounce — `realm.svelte.disconnect()` awaits it before
// tearing the WS down so the final progression delta isn't dropped
// when the user closes the tab gracefully.

import type { CharacterRecord } from '@kassandra/protocol-foundation-library';
import { PlayerProfileRpc } from '@kassandra/protocol-foundation-library';
import * as Effect from 'effect/Effect';
import * as ManagedRuntime from 'effect/ManagedRuntime';

import { auth } from './auth.svelte';
import { makeProfileClientLayer, ProfileClient } from './lib/profile-client';
import type { World } from '@kassandra/simulation-domain-library';

export const profile = $state({
  character: null as CharacterRecord | null,
});

// Module-scoped runtime — built once at `initProfile()` and reused for
// every SaveCharacter call. PR-G5: no token is captured; the WS
// upgrade carries the HttpOnly session cookie automatically and the
// realm verifies it server-side on every connection.
let runtime: ManagedRuntime.ManagedRuntime<ProfileClient, never> | null = null;

// PR-G4: debounce bookkeeping. `lastSaved` is the source of truth
// for the dirty check — equals `profile.character` after a successful
// SaveCharacter and on initial LoadCharacter. `pendingTimer` is the
// outstanding debounce timer; cleared on flushSave or fresh schedule.
const SAVE_DEBOUNCE_MS = 10_000;
let lastSaved: CharacterRecord | null = null;
let pendingTimer: ReturnType<typeof setTimeout> | null = null;
let pendingRecord: CharacterRecord | null = null;
// Resolved when the next save (queued or in-flight) completes. Used
// by flushSave to await drain on disconnect.
let pendingPromise: Promise<void> | null = null;
let pendingPromiseResolve: (() => void) | null = null;

/**
 * Called once from `main.ts` after `initAuth()`. Opens the
 * PlayerProfile WS, awaits LoadCharacter, and seeds `profile.character`.
 * Throws on network/auth failure — same fail-loud stance as initAuth().
 */
export async function initProfile(): Promise<void> {
  if (!auth.accountId) {
    throw new Error('initProfile called before auth bootstrap completed');
  }
  runtime = ManagedRuntime.make(makeProfileClientLayer(auth.accountId));
  const loaded = await runtime.runPromise(
    Effect.gen(function* () {
      const client = yield* ProfileClient;
      return yield* client.LoadCharacter();
    }),
  );
  profile.character = loaded;
  lastSaved = loaded;
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
  lastSaved = record;
}

/**
 * Build a CharacterRecord from the live world's local player. Returns
 * null if the local player isn't ready yet (placeholder world, or
 * `create_character` hasn't been processed). Identity fields are
 * sourced from the current `profile.character` if the player record
 * doesn't carry them — needed during the brief window between
 * `connect()` and the first snapshot that confirms the player's
 * server-side identity.
 */
function buildRecord(world: World): CharacterRecord | null {
  const p = world.players[world.localPlayerId];
  if (!p) return null;
  // Empty name = pre-create_character placeholder; don't save garbage.
  if (!p.name) return null;
  return {
    name: p.name,
    sex: p.sex,
    hairColor: p.hairColor,
    armor: p.armor,
    playerClass: p.playerClass,
    level: p.level,
    experience: p.experience,
    bag: [...p.bag],
    lars: p.lars,
    equippedWeaponId: p.equippedWeaponId,
    abilities: p.abilities.map((a) => ({ ...a })),
    skillPoints: p.skillPoints,
    classSpellPoints: p.classSpellPoints,
    spellLevels: { ...p.spellLevels },
  };
}

/**
 * JSON-stringify equality is good enough for CharacterRecord — the
 * schema is JSON-friendly (no Maps, no functions, no Dates) and any
 * field reordering would be a Schema change worth catching. Cheaper
 * than a structural deep-equal helper.
 */
function recordsEqual(a: CharacterRecord, b: CharacterRecord): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function ensurePendingPromise(): Promise<void> {
  if (pendingPromise === null) {
    pendingPromise = new Promise((resolve) => {
      pendingPromiseResolve = resolve;
    });
  }
  return pendingPromise;
}

function resolvePending() {
  if (pendingPromiseResolve) {
    pendingPromiseResolve();
    pendingPromiseResolve = null;
    pendingPromise = null;
  }
}

async function flushDebouncedSave() {
  if (pendingTimer !== null) {
    clearTimeout(pendingTimer);
    pendingTimer = null;
  }
  const record = pendingRecord;
  pendingRecord = null;
  if (!record) {
    resolvePending();
    return;
  }
  try {
    await saveCharacter(record);
  } catch (err) {
    // Don't crash the snapshot loop on a transient save failure —
    // the next dirty notify will re-schedule. Log so the in-game
    // console bridge picks it up.
    console.warn('SaveCharacter (debounced) failed', err);
  } finally {
    resolvePending();
  }
}

/**
 * Called after every PartyRoom snapshot lands. Computes a fresh
 * CharacterRecord from the local player and, if it differs from the
 * last-saved record, debounces a SaveCharacter for SAVE_DEBOUNCE_MS.
 * The debounce timer resets on each subsequent change so a stretch
 * of mutation collapses to a single write at the trailing edge.
 */
export function notifyWorldUpdate(world: World): void {
  if (!runtime) return; // pre-initProfile — nothing to save into.
  const current = buildRecord(world);
  if (!current) return;
  if (lastSaved && recordsEqual(current, lastSaved)) {
    // No-op: progression matches the last successfully-saved snapshot.
    return;
  }
  pendingRecord = current;
  ensurePendingPromise();
  if (pendingTimer !== null) {
    clearTimeout(pendingTimer);
  }
  pendingTimer = setTimeout(() => {
    void flushDebouncedSave();
  }, SAVE_DEBOUNCE_MS);
}

/**
 * Cancel any pending debounce and save the current world's local
 * player immediately. Called from `realm.svelte.disconnect()` so the
 * final progression delta lands even if the user closes the tab a
 * second after gaining xp. Resolves once the save has completed
 * (or immediately if nothing was pending).
 */
export async function flushSave(world: World): Promise<void> {
  if (!runtime) return;
  // Re-evaluate state-of-the-world rather than trusting the queued
  // pendingRecord — the user may have continued playing for the
  // last 9 seconds and pendingRecord could be stale by a fraction.
  const current = buildRecord(world);
  if (current && (!lastSaved || !recordsEqual(current, lastSaved))) {
    pendingRecord = current;
    ensurePendingPromise();
  }
  await flushDebouncedSave();
}
