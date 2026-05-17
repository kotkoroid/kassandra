<script lang="ts">
  import { Canvas } from '@threlte/core';
  import Hud from './ui/Hud.svelte';
  import Scene from './scene/Scene.svelte';
</script>

<div class="stage">
  <Canvas>
    <Scene />
  </Canvas>
  <Hud />
</div>

<style>
  .stage {
    position: absolute;
    inset: 0;
  }
</style>
