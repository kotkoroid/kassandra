<script lang="ts">
  import { death } from '../death.svelte';
  import { enemies } from '../enemies.svelte';
  import { healers } from '../healers.svelte';
  import { spiders } from '../spiders.svelte';
  import { player } from '../state.svelte';

  // World units visible in either direction from the player. Half the
  // viewBox (200 / 2 = 100) maps to RANGE world units, so 1 world unit
  // = 100/RANGE map units.
  const RANGE = 30;
  const SCALE = 100 / RANGE;

  // Plot a world point relative to the player on the minimap's
  // -100..+100 viewBox. Z maps to Y so +Z (world south) goes down.
  function mapX(x: number): number {
    return (x - player.x) * SCALE;
  }
  function mapY(z: number): number {
    return (z - player.z) * SCALE;
  }
</script>

<div
  class="pointer-events-none absolute top-4 right-4 h-48 w-48 overflow-hidden border-2 border-amber-700/70 bg-black/80"
>
  <svg viewBox="-100 -100 200 200" class="h-full w-full">
    <!-- Range rings for spatial reference. -->
    <circle cx="0" cy="0" r={SCALE * 10} class="fill-none stroke-amber-700/30" stroke-width="0.5" />
    <circle cx="0" cy="0" r={SCALE * 20} class="fill-none stroke-amber-700/20" stroke-width="0.5" />

    <!-- Healers (allies) — cyan. -->
    {#each healers as h (h.id)}
      <circle cx={mapX(h.x)} cy={mapY(h.z)} r="3" fill="#5dd6ff" />
    {/each}

    <!-- Enemies — red. -->
    {#each enemies as e (e.id)}
      <circle cx={mapX(e.x)} cy={mapY(e.z)} r="3" fill="#e44141" />
    {/each}

    <!-- Spiders — dark purple-red, sized by tier. -->
    {#each spiders as s (s.id)}
      <circle
        cx={mapX(s.x)}
        cy={mapY(s.z)}
        r={s.size === 'big' ? 3 : s.size === 'medium' ? 2.2 : 1.5}
        fill="#9c2a55"
      />
    {/each}

    <!-- Loot bag — gold with a faint glow ring. -->
    {#if death.bag}
      {@const bx = mapX(death.bag.x)}
      {@const by = mapY(death.bag.z)}
      <circle cx={bx} cy={by} r="6" fill="#d4a23a" opacity="0.3" />
      <circle cx={bx} cy={by} r="3.5" fill="#ffd040" />
    {/if}

    <!-- Player — center, yellow with white ring. -->
    <circle cx="0" cy="0" r="4.5" fill="#ffeb80" stroke="#ffffff" stroke-width="1" />
  </svg>
</div>
