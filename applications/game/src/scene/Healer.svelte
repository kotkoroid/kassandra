<script lang="ts">
  import { T } from '@threlte/core';
  import { selection } from '../selection.svelte';
  import EntityNameplate from './EntityNameplate.svelte';
  import {
    HEALER_BELT_MAT,
    HEALER_BOOT_MAT,
    HEALER_HAIR_MAT,
    HEALER_ORB_MAT,
    HEALER_OUTFIT_MAT,
    SKIN_FAIR_MAT,
  } from './materials';

  interface Props {
    id: string;
    position: [number, number, number];
    rotation: number;
    hpPercent: number;
  }
  let { id, position, rotation, hpPercent }: Props = $props();
</script>

<T.Group
  {position}
  rotation.y={rotation}
  onclick={(e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    selection.value = id;
  }}
>
  <!-- Title + health bar above the head. -->
  <EntityNameplate
    position={[0, 2.5, 0]}
    name="Janna"
    level={10}
    {hpPercent}
    entityX={position[0]}
    entityZ={position[2]}
  />

  <!-- Boots -->
  <T.Mesh position={[-0.12, 0.1, 0]} castShadow material={HEALER_BOOT_MAT}>
    <T.BoxGeometry args={[0.2, 0.2, 0.25]} />
  </T.Mesh>
  <T.Mesh position={[0.12, 0.1, 0]} castShadow material={HEALER_BOOT_MAT}>
    <T.BoxGeometry args={[0.2, 0.2, 0.25]} />
  </T.Mesh>

  <!-- Bare legs -->
  <T.Mesh position={[-0.12, 0.5, 0]} castShadow material={SKIN_FAIR_MAT}>
    <T.CylinderGeometry args={[0.085, 0.085, 0.55, 8]} />
  </T.Mesh>
  <T.Mesh position={[0.12, 0.5, 0]} castShadow material={SKIN_FAIR_MAT}>
    <T.CylinderGeometry args={[0.085, 0.085, 0.55, 8]} />
  </T.Mesh>

  <!-- Short skirt -->
  <T.Mesh position={[0, 0.85, 0]} castShadow material={HEALER_OUTFIT_MAT}>
    <T.CylinderGeometry args={[0.26, 0.22, 0.18, 8]} />
  </T.Mesh>

  <!-- Gold belt -->
  <T.Mesh position={[0, 0.97, 0]} castShadow material={HEALER_BELT_MAT}>
    <T.CylinderGeometry args={[0.22, 0.22, 0.05, 8]} />
  </T.Mesh>

  <!-- Top (chest piece) -->
  <T.Mesh position={[0, 1.25, 0]} castShadow material={HEALER_OUTFIT_MAT}>
    <T.BoxGeometry args={[0.38, 0.45, 0.24]} />
  </T.Mesh>

  <!-- Breast bumps molded into the chest piece. -->
  <T.Mesh position={[-0.09, 1.3, 0.12]} castShadow material={HEALER_OUTFIT_MAT}>
    <T.SphereGeometry args={[0.085, 10, 10]} />
  </T.Mesh>
  <T.Mesh position={[0.09, 1.3, 0.12]} castShadow material={HEALER_OUTFIT_MAT}>
    <T.SphereGeometry args={[0.085, 10, 10]} />
  </T.Mesh>

  <!-- Arms -->
  <T.Mesh position={[-0.27, 1.15, 0]} castShadow material={SKIN_FAIR_MAT}>
    <T.CylinderGeometry args={[0.065, 0.065, 0.45, 8]} />
  </T.Mesh>
  <T.Mesh position={[0.27, 1.15, 0]} castShadow material={SKIN_FAIR_MAT}>
    <T.CylinderGeometry args={[0.065, 0.065, 0.45, 8]} />
  </T.Mesh>

  <!-- White gloves at wrists -->
  <T.Mesh position={[-0.27, 0.92, 0]} castShadow material={HEALER_OUTFIT_MAT}>
    <T.CylinderGeometry args={[0.085, 0.085, 0.16, 8]} />
  </T.Mesh>
  <T.Mesh position={[0.27, 0.92, 0]} castShadow material={HEALER_OUTFIT_MAT}>
    <T.CylinderGeometry args={[0.085, 0.085, 0.16, 8]} />
  </T.Mesh>

  <!-- Long flowing hair: a tall slab down the back plus a wider
       top-of-head cap so the blonde reads from any angle. -->
  <T.Mesh position={[0, 1.35, -0.1]} castShadow material={HEALER_HAIR_MAT}>
    <T.BoxGeometry args={[0.42, 0.95, 0.2]} />
  </T.Mesh>
  <T.Mesh position={[0, 1.78, -0.02]} castShadow material={HEALER_HAIR_MAT}>
    <T.BoxGeometry args={[0.36, 0.16, 0.34]} />
  </T.Mesh>

  <!-- Head -->
  <T.Mesh position={[0, 1.6, 0.03]} castShadow material={SKIN_FAIR_MAT}>
    <T.BoxGeometry args={[0.3, 0.3, 0.3]} />
  </T.Mesh>

  <!-- Pointed elf ears -->
  <T.Mesh
    position={[-0.18, 1.62, 0.02]}
    rotation={[0, 0, -1.1]}
    castShadow
    material={SKIN_FAIR_MAT}
  >
    <T.ConeGeometry args={[0.05, 0.14, 5]} />
  </T.Mesh>
  <T.Mesh
    position={[0.18, 1.62, 0.02]}
    rotation={[0, 0, 1.1]}
    castShadow
    material={SKIN_FAIR_MAT}
  >
    <T.ConeGeometry args={[0.05, 0.14, 5]} />
  </T.Mesh>

  <!-- Glowing orb floating above outstretched hand (right) -->
  <T.Mesh position={[0.5, 1.5, 0.25]} material={HEALER_ORB_MAT}>
    <T.SphereGeometry args={[0.12, 12, 12]} />
  </T.Mesh>
</T.Group>
