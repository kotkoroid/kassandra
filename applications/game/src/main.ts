import { mount } from 'svelte';
import App from './App.svelte';
// Side-effect import: hooks console.error / warn + window error
// events to forward diagnostics into the in-game chat. Loaded first
// so it captures errors thrown during the rest of bootstrapping.
import './consoleBridge';
import './styles.css';

import { auth, initAuth } from './auth.svelte';
import { world } from './world.svelte';

const target = document.getElementById('app');

if (!target) {
  throw new Error('Mount target #app not found.');
}

// Settle the auth identity before the Svelte tree mounts. ADR-002:
// character identity lives per-realm inside each RealmRoom DO; the
// browser-side `auth.accountId` is just the cookie-backed identity
// used to gate realm WS upgrades. `world.localPlayerId` is rebound
// here so any pre-connect UI render reads from a player record keyed
// the same way the realm will key it (`?playerId=record.accountId`).
//
// `createWorld()` (in world.svelte.ts) populated `world.players` with
// a random-UUID placeholder. Move that placeholder onto the
// authoritative accountId key so `localPlayer(world)` doesn't throw
// the moment any component reads it.
await initAuth();
const placeholderId = world.localPlayerId;
if (placeholderId !== auth.accountId) {
  const placeholder = world.players[placeholderId];
  if (placeholder !== undefined) {
    delete world.players[placeholderId];
    world.players[auth.accountId] = placeholder;
  }
  world.localPlayerId = auth.accountId;
}

export default mount(App, { target });
