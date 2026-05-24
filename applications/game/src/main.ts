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

// PR-G2: settle the auth identity before the Svelte tree mounts.
// `world.localPlayerId` becomes the verified accountId (= JWT.sub),
// matching the realm's view of the player. Doing this synchronously
// (top-level await) avoids the half-mounted state where components
// race against an unfinished `auth` object.
await initAuth();
world.localPlayerId = auth.accountId;

export default mount(App, { target });
