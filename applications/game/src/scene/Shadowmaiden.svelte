<script lang="ts">
  // Angendal Shadowmaiden — heavier melee counterpart to the
  // Warmaiden. Same chase-and-bite AI; this file owns the visual:
  // olive-skinned warrior in a scaled chestpiece with a long
  // straight broadsword, a red apron sash, dark wrapped bracers,
  // and a tall ornate circlet capped with a single feather.

  import { T } from '@threlte/core';
  import { selection } from '../selection.svelte';
  import EntityNameplate from './EntityNameplate.svelte';
  import {
    CHARCOAL_LEATHER_MAT,
    DARK_WOOD_MAT,
    SHADOWMAIDEN_BOOT_MAT,
    SHADOWMAIDEN_CIRCLET_DARK_MAT,
    SHADOWMAIDEN_EMBROIDERY_MAT,
    SHADOWMAIDEN_FEATHER_MAT,
    SHADOWMAIDEN_FULLER_MAT,
    SHADOWMAIDEN_GOLD_MAT,
    SHADOWMAIDEN_LINEN_MAT,
    SHADOWMAIDEN_SASH_MAT,
    SHADOWMAIDEN_SCALE_DARK_MAT,
    SHADOWMAIDEN_SCALE_MAT,
    SHADOWMAIDEN_WRAPS_MAT,
    SKIN_DARK_MAT,
    STEEL_BLADE_MAT,
  } from './materials';

  interface Props {
    id: string;
    position: [number, number, number];
    rotation: number;
    name: string;
    level: number;
    hpPercent: number;
  }
  let { id, position, rotation, name, level, hpPercent }: Props = $props();
</script>

<T.Group
  {position}
  rotation.y={rotation}
  onclick={(e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    selection.value = id;
  }}
>
  <EntityNameplate position={[0, 2.5, 0]} {name} {level} {hpPercent} entityX={position[0]} entityZ={position[2]} />

  <!-- Boots — strapped sandals with cloth wraps up the calf. -->
  <T.Mesh position={[-0.12, 0.08, 0]} castShadow material={SHADOWMAIDEN_BOOT_MAT}>
    <T.BoxGeometry args={[0.22, 0.16, 0.28]} />
  </T.Mesh>
  <T.Mesh position={[0.12, 0.08, 0]} castShadow material={SHADOWMAIDEN_BOOT_MAT}>
    <T.BoxGeometry args={[0.22, 0.16, 0.28]} />
  </T.Mesh>
  <!-- Calf wraps. -->
  <T.Mesh position={[-0.12, 0.32, 0]} castShadow material={SHADOWMAIDEN_WRAPS_MAT}>
    <T.CylinderGeometry args={[0.1, 0.1, 0.3, 8]} />
  </T.Mesh>
  <T.Mesh position={[0.12, 0.32, 0]} castShadow material={SHADOWMAIDEN_WRAPS_MAT}>
    <T.CylinderGeometry args={[0.1, 0.1, 0.3, 8]} />
  </T.Mesh>

  <!-- Linen breeches above the wraps. -->
  <T.Mesh position={[-0.12, 0.7, 0]} castShadow material={SHADOWMAIDEN_LINEN_MAT}>
    <T.CylinderGeometry args={[0.105, 0.1, 0.46, 8]} />
  </T.Mesh>
  <T.Mesh position={[0.12, 0.7, 0]} castShadow material={SHADOWMAIDEN_LINEN_MAT}>
    <T.CylinderGeometry args={[0.105, 0.1, 0.46, 8]} />
  </T.Mesh>

  <!-- Red apron-sash hanging from the waist over the breeches. -->
  <T.Mesh position={[0, 0.78, 0.13]} castShadow material={SHADOWMAIDEN_SASH_MAT}>
    <T.BoxGeometry args={[0.22, 0.36, 0.02]} />
  </T.Mesh>
  <!-- Gold buckle/trim at the top of the sash. -->
  <T.Mesh position={[0, 0.96, 0.14]} castShadow material={SHADOWMAIDEN_GOLD_MAT}>
    <T.BoxGeometry args={[0.18, 0.04, 0.025]} />
  </T.Mesh>
  <!-- Hip belt across the back too so it wraps around. -->
  <T.Mesh position={[0, 0.99, 0]} castShadow material={SHADOWMAIDEN_GOLD_MAT}>
    <T.CylinderGeometry args={[0.24, 0.24, 0.06, 12]} />
  </T.Mesh>
  <!-- Tiny embroidery dabs on the breeches so the linen isn't flat. -->
  <T.Mesh position={[-0.12, 0.55, 0.11]} castShadow material={SHADOWMAIDEN_EMBROIDERY_MAT}>
    <T.BoxGeometry args={[0.03, 0.1, 0.005]} />
  </T.Mesh>
  <T.Mesh position={[0.12, 0.55, 0.11]} castShadow material={SHADOWMAIDEN_EMBROIDERY_MAT}>
    <T.BoxGeometry args={[0.03, 0.1, 0.005]} />
  </T.Mesh>

  <!-- Scaled chestpiece. -->
  <T.Mesh position={[0, 1.27, 0]} castShadow material={SHADOWMAIDEN_SCALE_MAT}>
    <T.BoxGeometry args={[0.38, 0.34, 0.24]} />
  </T.Mesh>
  <!-- Darker chest band along the bottom hem. -->
  <T.Mesh position={[0, 1.12, 0.005]} castShadow material={SHADOWMAIDEN_SCALE_DARK_MAT}>
    <T.BoxGeometry args={[0.39, 0.06, 0.25]} />
  </T.Mesh>
  <!-- Female bumps moulded into the mail. -->
  <T.Mesh position={[-0.09, 1.28, 0.12]} castShadow material={SHADOWMAIDEN_SCALE_MAT}>
    <T.SphereGeometry args={[0.085, 10, 10]} />
  </T.Mesh>
  <T.Mesh position={[0.09, 1.28, 0.12]} castShadow material={SHADOWMAIDEN_SCALE_MAT}>
    <T.SphereGeometry args={[0.085, 10, 10]} />
  </T.Mesh>

  <!-- Arms — bare skin upper, dark wrapped bracers below. -->
  <T.Mesh position={[-0.27, 1.18, 0]} castShadow material={SKIN_DARK_MAT}>
    <T.CylinderGeometry args={[0.065, 0.065, 0.5, 8]} />
  </T.Mesh>
  <T.Mesh position={[0.27, 1.18, 0]} castShadow material={SKIN_DARK_MAT}>
    <T.CylinderGeometry args={[0.065, 0.065, 0.5, 8]} />
  </T.Mesh>
  <T.Mesh position={[-0.27, 0.98, 0]} castShadow material={CHARCOAL_LEATHER_MAT}>
    <T.CylinderGeometry args={[0.08, 0.08, 0.34, 8]} />
  </T.Mesh>
  <T.Mesh position={[0.27, 0.98, 0]} castShadow material={CHARCOAL_LEATHER_MAT}>
    <T.CylinderGeometry args={[0.08, 0.08, 0.34, 8]} />
  </T.Mesh>

  <!-- Head + short dark hair. -->
  <T.Mesh position={[0, 1.58, 0.03]} castShadow material={SKIN_DARK_MAT}>
    <T.BoxGeometry args={[0.3, 0.3, 0.3]} />
  </T.Mesh>
  <T.Mesh position={[0, 1.71, -0.02]} castShadow material={CHARCOAL_LEATHER_MAT}>
    <T.BoxGeometry args={[0.32, 0.14, 0.32]} />
  </T.Mesh>

  <!-- Ornate circlet wrapping the brow + crown. -->
  <T.Mesh position={[0, 1.7, 0.05]} castShadow material={SHADOWMAIDEN_GOLD_MAT}>
    <T.CylinderGeometry args={[0.18, 0.18, 0.08, 12]} />
  </T.Mesh>
  <T.Mesh position={[0, 1.74, 0.05]} castShadow material={SHADOWMAIDEN_CIRCLET_DARK_MAT}>
    <T.CylinderGeometry args={[0.185, 0.185, 0.02, 12]} />
  </T.Mesh>
  <!-- Single tall feather rising from the back of the circlet. -->
  <T.Mesh position={[0, 1.96, -0.08]} rotation={[0.15, 0, 0]} castShadow material={SHADOWMAIDEN_FEATHER_MAT}>
    <T.ConeGeometry args={[0.04, 0.34, 4]} />
  </T.Mesh>

  <!-- Long straight broadsword held forward in both hands —
       modelled as a single right-side grip with a long blade
       angled across the body. -->
  <T.Group position={[0.38, 1.0, 0.1]} rotation={[0.1, 0, -0.25]}>
    <T.Mesh position={[0, 0.0, 0]} castShadow material={DARK_WOOD_MAT}>
      <T.CylinderGeometry args={[0.028, 0.028, 0.18, 8]} />
    </T.Mesh>
    <!-- Spherical gold pommel. -->
    <T.Mesh position={[0, 0.11, 0]} castShadow material={SHADOWMAIDEN_GOLD_MAT}>
      <T.SphereGeometry args={[0.038, 8, 8]} />
    </T.Mesh>
    <!-- Gold crossguard. -->
    <T.Mesh position={[0, -0.1, 0]} castShadow material={SHADOWMAIDEN_GOLD_MAT}>
      <T.BoxGeometry args={[0.18, 0.03, 0.04]} />
    </T.Mesh>
    <!-- Long straight blade extending downward from the guard. -->
    <T.Mesh position={[0, -0.55, 0]} castShadow material={STEEL_BLADE_MAT}>
      <T.BoxGeometry args={[0.05, 0.85, 0.02]} />
    </T.Mesh>
    <!-- Blade fuller (the central groove) as a slightly darker
         strip down the middle. -->
    <T.Mesh position={[0, -0.55, 0.012]} castShadow material={SHADOWMAIDEN_FULLER_MAT}>
      <T.BoxGeometry args={[0.015, 0.78, 0.002]} />
    </T.Mesh>
  </T.Group>
</T.Group>
