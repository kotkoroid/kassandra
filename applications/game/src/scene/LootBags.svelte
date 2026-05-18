<script lang="ts">
  import { T, useTask } from '@threlte/core';
  import { HTML } from '@threlte/extras';
  import { lootBagOpen, lootBags } from '../lootBags.svelte';

  // Pulse shared across every bag so they breathe together.
  let pulse = $state(0);

  useTask((delta) => {
    if (delta <= 0) return;
    pulse += delta;
    // Tick down TTL; despawn bags whose timer runs out.
    for (let i = lootBags.length - 1; i >= 0; i--) {
      const b = lootBags[i];
      if (!b) continue;
      b.ttl -= delta;
      if (b.ttl <= 0) {
        // If the player happened to be inspecting this bag when it
        // expired, drop the panel so we don't reference a stale row.
        if (lootBagOpen.value?.id === b.id) lootBagOpen.value = null;
        lootBags.splice(i, 1);
      }
    }
  });

  function format(ttl: number) {
    const s = Math.max(0, Math.ceil(ttl));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${r.toString().padStart(2, '0')}`;
  }
</script>

{#each lootBags as b (b.id)}
  {@const pulseScale = 1 + Math.sin(pulse * 3) * 0.15}
  {@const pulseOpacity = 0.45 + Math.sin(pulse * 3) * 0.25}
  <!-- Pulsing ring under the bag, matches the death-bag visual so
       both kinds of drops read the same way. -->
  <T.Mesh
    position={[b.x, 0.06, b.z]}
    rotation={[-Math.PI / 2, 0, 0]}
    scale={pulseScale}
  >
    <T.RingGeometry args={[0.5, 0.7, 32]} />
    <T.MeshBasicMaterial
      color="#d4a23a"
      transparent
      opacity={pulseOpacity}
      depthWrite={false}
    />
  </T.Mesh>
  <T.Group position={[b.x, 0, b.z]}>
    <T.Mesh position={[0, 0.16, 0]} castShadow>
      <T.SphereGeometry args={[0.2, 10, 10]} />
      <T.MeshStandardMaterial color="#6b4625" />
    </T.Mesh>
    <T.Mesh position={[0, 0.32, 0]} castShadow>
      <T.CylinderGeometry args={[0.05, 0.07, 0.08, 6]} />
      <T.MeshStandardMaterial color="#3d2715" />
    </T.Mesh>
  </T.Group>
  <!-- Clickable countdown floating above the bag. Pointer-events
       auto on the inner button so the click reaches it; the HTML
       wrapper itself stays inert. -->
  <HTML
    position={[b.x, 0.85, b.z]}
    center
    pointerEvents="none"
    zIndexRange={[40, 0]}
  >
    <button
      type="button"
      class="pointer-events-auto cursor-pointer border border-amber-700/70 bg-black/85 px-2 py-0.5 text-xs font-semibold text-amber-200 hover:border-amber-400 hover:text-amber-100 [text-shadow:0_1px_2px_rgb(0_0_0_/_0.85)]"
      onclick={() => (lootBagOpen.value = b)}
    >
      {format(b.ttl)}
    </button>
  </HTML>
{/each}
