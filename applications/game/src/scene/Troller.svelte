<script lang="ts">
  import { T } from '@threlte/core';
  import { selection } from '../selection.svelte';
  import { dispatch } from '@kassandra/simulation-domain-library';
  import { world } from '../world.svelte';
  import EntityNameplate from './EntityNameplate.svelte';
  import {
    SKIN_TAN_MAT,
    TROLLER_BEARD_MAT,
    TROLLER_BODY_MAT,
    TROLLER_HAT_MAT,
    TROLLER_LEGS_MAT,
    TROLLER_SACK_MAT,
  } from './materials';

  interface Props {
    id: string;
    position: [number, number, number];
    rotation: number;
    name: string;
    level: number;
    hpPercent: number;
    /** Shown while the troller is on the way out of the world. */
    carriesBag: boolean;
  }
  let {
    id,
    position,
    rotation,
    name,
    level,
    hpPercent,
    carriesBag,
  }: Props = $props();
</script>

<T.Group
  {position}
  rotation.y={rotation}
  onclick={(e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    selection.value = id;
    dispatch(world, { kind: 'engage', targetId: id });
  }}
>
  <EntityNameplate
    position={[0, 1.5, 0]}
    {name}
    {level}
    {hpPercent}
    barWidthPx={56}
    entityX={position[0]}
    entityZ={position[2]}
  />
  <!-- Legs -->
  <T.Mesh position={[-0.08, 0.18, 0]} castShadow material={TROLLER_LEGS_MAT}>
    <T.CylinderGeometry args={[0.06, 0.06, 0.32, 6]} />
  </T.Mesh>
  <T.Mesh position={[0.08, 0.18, 0]} castShadow material={TROLLER_LEGS_MAT}>
    <T.CylinderGeometry args={[0.06, 0.06, 0.32, 6]} />
  </T.Mesh>
  <!-- Body -->
  <T.Mesh position={[0, 0.55, 0]} castShadow material={TROLLER_BODY_MAT}>
    <T.CylinderGeometry args={[0.18, 0.2, 0.42, 8]} />
  </T.Mesh>
  <!-- Head -->
  <T.Mesh position={[0, 0.86, 0]} castShadow material={SKIN_TAN_MAT}>
    <T.SphereGeometry args={[0.14, 10, 10]} />
  </T.Mesh>
  <!-- Beard -->
  <T.Mesh position={[0, 0.78, 0.08]} castShadow material={TROLLER_BEARD_MAT}>
    <T.BoxGeometry args={[0.16, 0.14, 0.08]} />
  </T.Mesh>
  <!-- Pointed red hat -->
  <T.Mesh position={[0, 1.1, 0]} castShadow material={TROLLER_HAT_MAT}>
    <T.ConeGeometry args={[0.16, 0.32, 8]} />
  </T.Mesh>
  {#if carriesBag}
    <!-- Sack the troller carries while leaving with the bag. -->
    <T.Mesh position={[0.18, 0.55, 0.15]} castShadow material={TROLLER_SACK_MAT}>
      <T.SphereGeometry args={[0.14, 8, 8]} />
    </T.Mesh>
  {/if}
</T.Group>
