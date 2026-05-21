<script lang="ts">
  import { Canvas } from '@threlte/core';
  import { ACESFilmicToneMapping, PCFSoftShadowMap } from 'three';
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
