<script lang="ts">
  import { useTask } from '@threlte/core';
  import { HTML } from '@threlte/extras';
  import { DAMAGE_TTL, damageNumbers, pruneDamageNumbers } from '../damageNumbers.svelte';
  import { world } from '../world.svelte';

  // Total vertical rise (world units) over a popup's lifetime.
  const RISE = 1.4;
  // World-space spawn height above the target's feet so the number
  // appears around chest level instead of clipping the ground.
  const SPAWN_HEIGHT = 1.6;

  // Match EntityNameplate's cull radius — beyond 40 units a floating
  // number would be off-screen or a few pixels and unreadable, and the
  // <HTML> portal overhead is pure waste.
  const CULL_DIST_SQ = 40 * 40;

  const visiblePops = $derived.by(() => {
    const dnp = world.players.get(world.localPlayerId)!;
    return damageNumbers.list.filter((pop) => {
      const dx = pop.x - dnp.x;
      const dz = pop.z - dnp.z;
      return dx * dx + dz * dz <= CULL_DIST_SQ;
    });
  });

  useTask(() => {
    pruneDamageNumbers(world.time);
  });
</script>

{#each visiblePops as pop (pop.id)}
  {@const age = world.time - pop.spawnedAt}
  {@const t = Math.max(0, Math.min(1, age / DAMAGE_TTL))}
  {@const y = SPAWN_HEIGHT + t * RISE}
  {@const opacity = 1 - t * t}
  <HTML
    position={[pop.x, y, pop.z]}
    center
    pointerEvents="none"
    zIndexRange={[45, 0]}
  >
    <div
      class="font-bold text-2xl [text-shadow:0_2px_4px_rgb(0_0_0_/_0.9),_0_0_8px_rgb(0_0_0_/_0.6)] {pop.color ===
      'yellow'
        ? 'text-amber-300'
        : 'text-red-500'}"
      style:opacity={opacity}
    >
      {pop.amount}
    </div>
  </HTML>
{/each}
