<script lang="ts">
  import { Canvas } from '@threlte/core';
  import { ACESFilmicToneMapping, PCFSoftShadowMap } from 'three';
  import { setLocalPlayerLocked } from './lib/applySnapshot';
  import { connect, realm } from './realm.svelte';
  import Scene from './scene/Scene.svelte';
  import CharacterCreation from './ui/CharacterCreation.svelte';
  import Hud from './ui/Hud.svelte';
  import PartySetup from './ui/PartySetup.svelte';
  import { world } from './world.svelte';

  type View = 'party' | 'connecting' | 'creation' | 'game';
  let view = $state<View>('party');

  // ADR-002: character is per-realm. The only way to know whether
  // THIS realm already has a character for THIS account is to connect
  // and inspect the first snapshot. Empty name on the local player =
  // PartyRoom just `addPlayer`'d a default record → show creation.
  // Non-empty name = PartyRoom restored a saved world (PR-E) → skip
  // straight to game.
  function onPartyReady(id: string) {
    view = 'connecting';
    connect(id);
  }

  // Decide creation-vs-game once the first snapshot lands. `realm.connected`
  // flips true *after* applySnapshot ingests the first server frame, so
  // by the time this effect re-runs with `connected === true`, the local
  // player record reflects the realm's authoritative view.
  $effect(() => {
    if (view !== 'connecting') return;
    if (!realm.connected) return;
    const me = world.players[world.localPlayerId];
    if (!me) return;
    view = me.name ? 'game' : 'creation';
  });

  // PR-H: lock the local player slot inside applySnapshot while the
  // creation form is mounted — otherwise the 20 Hz snapshot stream
  // overwrites every form mutation on the next tick. The lock is
  // released the moment the view leaves 'creation'; the snapshot that
  // follows the create_character SimEvent then rehydrates the player
  // record with the server's authoritative view (server-confirmed name
  // / cosmetics / starting pools).
  $effect(() => {
    setLocalPlayerLocked(view === 'creation');
  });

  // Cap render DPR. Low-poly art doesn't benefit from the 2-3x fill
  // cost of native pixel density on Retina/4K — 1.5 is the sweet
  // spot for sharp UI overlays without quartering the fragment budget.
  const dpr = Math.min(window.devicePixelRatio, 1.5);

  // Listen for disband events from the realm. realm.disbandCount is
  // bumped exactly once per 'disbanded' message; the local `seenDisbands`
  // cursor (plain `let`, intentionally NOT $state — writing to it must
  // not retrigger this effect) tracks which bumps we've already handled.
  let seenDisbands = 0;
  $effect(() => {
    if (realm.disbandCount > seenDisbands) {
      seenDisbands = realm.disbandCount;
      view = 'party';
    }
  });
</script>

<div class="stage">
  {#if view === 'party'}
    <PartySetup onReady={onPartyReady} />
  {:else if view === 'connecting'}
    <div class="connecting">Joining realm…</div>
  {:else if view === 'creation'}
    <CharacterCreation onCreate={() => (view = 'game')} />
  {:else}
    <Canvas shadows={PCFSoftShadowMap} toneMapping={ACESFilmicToneMapping} {dpr}>
      <Scene />
    </Canvas>
    <Hud />
  {/if}
</div>

<style>
  .stage {
    position: absolute;
    inset: 0;
  }

  .connecting {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #0a0a0f;
    color: #c9a84c;
    font-family: serif;
    font-size: 1rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }
</style>
