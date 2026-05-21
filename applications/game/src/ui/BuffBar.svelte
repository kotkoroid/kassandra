<script lang="ts">
  // Buff / debuff bar. Renders one BuffTile per active effect on the
  // player, in a row pinned to the top-left of the HUD. The per-tile
  // animation logic (countdown fill + last-second fade) lives in
  // BuffTile.svelte so each tile can own its own $effect.

  import BuffTile from './BuffTile.svelte';
  import { localPlayer } from '@kassandra/simulation-domain-library';
  import { world } from '../world.svelte';

  const player = $derived(localPlayer(world));
</script>

<div class="absolute top-4 left-4 flex gap-1">
  {#each player.effects as effect (effect.id)}
    <BuffTile {effect} />
  {/each}
</div>
