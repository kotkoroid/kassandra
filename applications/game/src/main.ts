import { mount } from 'svelte';
import App from './App.svelte';
// Side-effect import: hooks console.error / warn + window error
// events to forward diagnostics into the in-game chat. Loaded first
// so it captures errors thrown during the rest of bootstrapping.
import './consoleBridge';
import './styles.css';

import { auth, initAuth } from './auth.svelte';
import { initProfile } from './profile.svelte';
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

// PR-G3: load the persisted CharacterRecord (if any) before mount so
// App.svelte can decide whether to show CharacterCreation or skip
// straight to game on PartySetup.onReady. Failure here is fatal —
// without a known load state we can't decide which view to render.
await initProfile();

export default mount(App, { target });
