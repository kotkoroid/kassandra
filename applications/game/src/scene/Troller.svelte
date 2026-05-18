<script lang="ts">
  import { T } from '@threlte/core';
  import { selection } from '../selection.svelte';
  import { dispatch } from '../sim/input';
  import { world } from '../sim/world.svelte';
  import EntityNameplate from './EntityNameplate.svelte';

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
  />
  <!-- Legs -->
  <T.Mesh position={[-0.08, 0.18, 0]} castShadow>
    <T.CylinderGeometry args={[0.06, 0.06, 0.32, 6]} />
    <T.MeshStandardMaterial color="#3a2614" />
  </T.Mesh>
  <T.Mesh position={[0.08, 0.18, 0]} castShadow>
    <T.CylinderGeometry args={[0.06, 0.06, 0.32, 6]} />
    <T.MeshStandardMaterial color="#3a2614" />
  </T.Mesh>
  <!-- Body -->
  <T.Mesh position={[0, 0.55, 0]} castShadow>
    <T.CylinderGeometry args={[0.18, 0.2, 0.42, 8]} />
    <T.MeshStandardMaterial color="#2c5fa0" />
  </T.Mesh>
  <!-- Head -->
  <T.Mesh position={[0, 0.86, 0]} castShadow>
    <T.SphereGeometry args={[0.14, 10, 10]} />
    <T.MeshStandardMaterial color="#f0c8a8" />
  </T.Mesh>
  <!-- Beard -->
  <T.Mesh position={[0, 0.78, 0.08]} castShadow>
    <T.BoxGeometry args={[0.16, 0.14, 0.08]} />
    <T.MeshStandardMaterial color="#e8e3d4" />
  </T.Mesh>
  <!-- Pointed red hat -->
  <T.Mesh position={[0, 1.1, 0]} castShadow>
    <T.ConeGeometry args={[0.16, 0.32, 8]} />
    <T.MeshStandardMaterial color="#a82424" />
  </T.Mesh>
  {#if carriesBag}
    <!-- Sack the troller carries while leaving with the bag. -->
    <T.Mesh position={[0.18, 0.55, 0.15]} castShadow>
      <T.SphereGeometry args={[0.14, 8, 8]} />
      <T.MeshStandardMaterial color="#6b4625" />
    </T.Mesh>
  {/if}
</T.Group>
