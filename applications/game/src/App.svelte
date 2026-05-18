<script lang="ts">
  import { Canvas } from '@threlte/core';
  import Scene from './scene/Scene.svelte';
  import CharacterCreation from './ui/CharacterCreation.svelte';
  import Hud from './ui/Hud.svelte';

  // Show character creation first; the canvas only mounts after the
  // player clicks Create so game systems start with a fresh state.
  let view = $state<'creation' | 'game'>('creation');
</script>

<div class="stage">
  {#if view === 'creation'}
    <CharacterCreation onCreate={() => (view = 'game')} />
  {:else}
    <Canvas shadows>
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
