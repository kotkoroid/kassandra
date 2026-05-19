<script lang="ts">
  // Azir — the city's bird-headed ally. Pure primitive geometry, no
  // animation; he stands in town as a permanent NPC. Silhouette cues
  // (gold beak, two red feather horns, purple coat + cape, tall
  // staff) follow the inspiration so he's identifiable at a glance.

  import { T } from '@threlte/core';
  import { HTML } from '@threlte/extras';
  import { AZIR_GREETING, openDialog } from '../dialog.svelte';
  import { selection } from '../selection.svelte';
  import EntityNameplate from './EntityNameplate.svelte';
  import {
    AZIR_BEAK_MAT,
    AZIR_BOOT_MAT,
    AZIR_CAPE_MAT,
    AZIR_COAT_MAT,
    AZIR_FEATHER_DARK_MAT,
    AZIR_STAFF_ORB_MAT,
    CRIMSON_MAT,
    DARK_WOOD_MAT,
    GOLD_TRIM_MAT,
    NEAR_BLACK_MAT,
  } from './materials';

  interface Props {
    id: string;
    position: [number, number, number];
    rotation: number;
    hpPercent: number;
    // Ambient line currently floating above the head (set by the
    // npcChat sim system, expires after SAY_TTL seconds).
    saying?: string;
  }
  let { id, position, rotation, hpPercent, saying }: Props = $props();
</script>

<T.Group
  {position}
  rotation.y={rotation}
  onclick={(e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    selection.value = id;
    openDialog(AZIR_GREETING);
  }}
>
  <EntityNameplate
    position={[0, 2.7, 0]}
    name="Azir"
    level={20}
    {hpPercent}
    entityX={position[0]}
    entityZ={position[2]}
  />

  <!-- Ambient speech bubble. Sits just under the nameplate (which
       lives at y=2.7) so it doesn't compete with the level/name
       readout. Pointer-events off so clicks still hit the body. -->
  {#if saying}
    <HTML position={[0, 2.45, 0]} center pointerEvents="none" zIndexRange={[40, 0]}>
      <div
        class="max-w-[240px] border border-amber-900/70 bg-black/85 px-2 py-0.5 text-xs whitespace-pre-wrap text-white [text-shadow:0_1px_2px_rgb(0_0_0_/_0.85)]"
      >
        {saying}
      </div>
    </HTML>
  {/if}

  <!-- Boots -->
  <T.Mesh position={[-0.13, 0.1, 0]} castShadow material={AZIR_BOOT_MAT}>
    <T.BoxGeometry args={[0.22, 0.2, 0.28]} />
  </T.Mesh>
  <T.Mesh position={[0.13, 0.1, 0]} castShadow material={AZIR_BOOT_MAT}>
    <T.BoxGeometry args={[0.22, 0.2, 0.28]} />
  </T.Mesh>

  <!-- Trouser legs (purple) -->
  <T.Mesh position={[-0.13, 0.55, 0]} castShadow material={AZIR_COAT_MAT}>
    <T.CylinderGeometry args={[0.1, 0.1, 0.6, 8]} />
  </T.Mesh>
  <T.Mesh position={[0.13, 0.55, 0]} castShadow material={AZIR_COAT_MAT}>
    <T.CylinderGeometry args={[0.1, 0.1, 0.6, 8]} />
  </T.Mesh>

  <!-- Long coat — wider at the shoulders, narrower at the hips. -->
  <T.Mesh position={[0, 1.05, 0]} castShadow material={AZIR_COAT_MAT}>
    <T.BoxGeometry args={[0.5, 0.7, 0.32]} />
  </T.Mesh>

  <!-- Gold trim down the front of the coat. -->
  <T.Mesh position={[0, 1.05, 0.165]} castShadow material={GOLD_TRIM_MAT}>
    <T.BoxGeometry args={[0.06, 0.7, 0.02]} />
  </T.Mesh>
  <!-- Gold buttons. -->
  {#each [0, 1, 2] as i (i)}
    <T.Mesh position={[0, 1.25 - i * 0.18, 0.18]} castShadow material={GOLD_TRIM_MAT}>
      <T.SphereGeometry args={[0.028, 8, 8]} />
    </T.Mesh>
  {/each}

  <!-- High collar / shoulder cape — flares out behind the head. -->
  <T.Mesh position={[0, 1.55, -0.05]} rotation={[0.25, 0, 0]} castShadow material={AZIR_CAPE_MAT}>
    <T.BoxGeometry args={[0.7, 0.32, 0.14]} />
  </T.Mesh>

  <!-- Tail of the cape down the back. -->
  <T.Mesh position={[0, 1.0, -0.2]} rotation={[0.1, 0, 0]} castShadow material={AZIR_CAPE_MAT}>
    <T.BoxGeometry args={[0.46, 1.0, 0.05]} />
  </T.Mesh>

  <!-- Arms in coat sleeves. -->
  <T.Mesh position={[-0.32, 1.15, 0]} castShadow material={AZIR_COAT_MAT}>
    <T.CylinderGeometry args={[0.08, 0.08, 0.55, 8]} />
  </T.Mesh>
  <T.Mesh position={[0.32, 1.15, 0]} castShadow material={AZIR_COAT_MAT}>
    <T.CylinderGeometry args={[0.08, 0.08, 0.55, 8]} />
  </T.Mesh>

  <!-- Gold cuffs at the wrists. -->
  <T.Mesh position={[-0.32, 0.88, 0]} castShadow material={GOLD_TRIM_MAT}>
    <T.CylinderGeometry args={[0.095, 0.095, 0.07, 8]} />
  </T.Mesh>
  <T.Mesh position={[0.32, 0.88, 0]} castShadow material={GOLD_TRIM_MAT}>
    <T.CylinderGeometry args={[0.095, 0.095, 0.07, 8]} />
  </T.Mesh>

  <!-- Feathered neck ruff between coat and head. -->
  <T.Mesh position={[0, 1.55, 0.06]} castShadow material={AZIR_FEATHER_DARK_MAT}>
    <T.CylinderGeometry args={[0.18, 0.13, 0.16, 10]} />
  </T.Mesh>

  <!-- Bird head: gold/tan boxy skull. -->
  <T.Mesh position={[0, 1.78, 0.04]} castShadow material={GOLD_TRIM_MAT}>
    <T.BoxGeometry args={[0.32, 0.32, 0.34]} />
  </T.Mesh>

  <!-- Beak — a short cone pointing forward from the face. -->
  <T.Mesh position={[0, 1.74, 0.27]} rotation={[Math.PI / 2, 0, 0]} castShadow material={AZIR_BEAK_MAT}>
    <T.ConeGeometry args={[0.07, 0.18, 6]} />
  </T.Mesh>

  <!-- Two small dark eyes on either side of the beak. -->
  <T.Mesh position={[-0.09, 1.82, 0.2]} material={NEAR_BLACK_MAT}>
    <T.SphereGeometry args={[0.025, 8, 8]} />
  </T.Mesh>
  <T.Mesh position={[0.09, 1.82, 0.2]} material={NEAR_BLACK_MAT}>
    <T.SphereGeometry args={[0.025, 8, 8]} />
  </T.Mesh>

  <!-- Two red feather "horns" sweeping back from the top of the head. -->
  <T.Mesh
    position={[-0.07, 2.05, -0.04]}
    rotation={[-0.4, 0, -0.2]}
    castShadow
    material={CRIMSON_MAT}
  >
    <T.ConeGeometry args={[0.045, 0.4, 5]} />
  </T.Mesh>
  <T.Mesh
    position={[0.07, 2.05, -0.04]}
    rotation={[-0.4, 0, 0.2]}
    castShadow
    material={CRIMSON_MAT}
  >
    <T.ConeGeometry args={[0.045, 0.4, 5]} />
  </T.Mesh>

  <!-- Staff in the right hand: long shaft + a glowing orb on top
       framed by a small crescent. -->
  <T.Mesh position={[0.42, 1.05, 0]} castShadow material={DARK_WOOD_MAT}>
    <T.CylinderGeometry args={[0.025, 0.025, 2.0, 6]} />
  </T.Mesh>
  <T.Mesh position={[0.42, 2.0, 0]} material={AZIR_STAFF_ORB_MAT}>
    <T.SphereGeometry args={[0.09, 12, 12]} />
  </T.Mesh>
  <T.Mesh position={[0.42, 2.0, 0]} rotation={[0, 0, Math.PI / 2]} material={GOLD_TRIM_MAT}>
    <T.TorusGeometry args={[0.13, 0.018, 6, 24, Math.PI]} />
  </T.Mesh>
</T.Group>
