<script lang="ts">
  import { Canvas } from '@threlte/core';
  import Scene from './scene/Scene.svelte';
  import CharacterCreation from './ui/CharacterCreation.svelte';
  import Hud from './ui/Hud.svelte';

  // Show character creation first; the canvas only mounts after the
  // player clicks Create so game systems start with a fresh state.
  let view = $state<'creation' | 'game'>('creation');

  // Cap render DPR. Low-poly art doesn't benefit from the 2-3x fill
  // cost of native pixel density on Retina/4K — 1.5 is the sweet
  // spot for sharp UI overlays without quartering the fragment budget.
  const dpr = Math.min(window.devicePixelRatio, 1.5);
</script>

<div class="stage">
  {#if view === 'creation'}
    <CharacterCreation onCreate={() => (view = 'game')} />
  {:else}
    <Canvas shadows {dpr}>
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
