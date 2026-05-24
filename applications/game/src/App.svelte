<script lang="ts">
  import { Canvas } from '@threlte/core';
  import { ACESFilmicToneMapping, PCFSoftShadowMap } from 'three';
  import { realm } from './realm.svelte';
  import Scene from './scene/Scene.svelte';
  import CharacterCreation from './ui/CharacterCreation.svelte';
  import Hud from './ui/Hud.svelte';
  import PartySetup from './ui/PartySetup.svelte';

  type View = 'party' | 'creation' | 'game';
  let view = $state<View>('party');
  let activePartyId = $state('');

  // Cap render DPR. Low-poly art doesn't benefit from the 2-3x fill
  // cost of native pixel density on Retina/4K — 1.5 is the sweet
  // spot for sharp UI overlays without quartering the fragment budget.
  const dpr = Math.min(window.devicePixelRatio, 1.5);

  // Listen for disband events from the realm. realm.disbandCount is
  // bumped exactly once per 'disbanded' message; the local `seenDisbands`
  // cursor (plain `let`, intentionally NOT $state — writing to it must
  // not retrigger this effect) tracks which bumps we've already handled.
  // Don't derive from realm.partyId here: it's null during normal
  // create-party flow too (the brief window after PartySetup.onReady
  // before CharacterCreation calls connect()), which would loop the
  // effect back to 'party' on every fresh party.
  let seenDisbands = 0;
  $effect(() => {
    if (realm.disbandCount > seenDisbands) {
      seenDisbands = realm.disbandCount;
      view = 'party';
      activePartyId = '';
    }
  });
</script>

<div class="stage">
  {#if view === 'party'}
    <PartySetup onReady={(id) => { activePartyId = id; view = 'creation'; }} />
  {:else if view === 'creation'}
    <CharacterCreation {activePartyId} onCreate={() => (view = 'game')} />
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
</style>
