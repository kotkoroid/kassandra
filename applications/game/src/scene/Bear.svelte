<script lang="ts">
  import { T } from '@threlte/core';
  import { selection } from '../selection.svelte';
  import EntityNameplate from './EntityNameplate.svelte';

  interface Props {
    id: string;
    position: [number, number, number];
    rotation: number;
    name: string;
    level: number;
    hpPercent: number;
  }
  let { id, position, rotation, name, level, hpPercent }: Props = $props();

  const fur = '#5a3a22';
  const furDark = '#3d2614';
  const muzzle = '#7a5436';
  const eye = '#1a1a1a';
  const claw = '#dad6c8';
  const nose = '#0d0d0d';
</script>

<T.Group
  {position}
  rotation.y={rotation}
  onclick={(e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    selection.value = { kind: 'beast', id };
  }}
>
  <EntityNameplate position={[0, 1.65, 0]} {name} {level} {hpPercent} />

  <!-- Bulky body. -->
  <T.Mesh position={[0, 0.72, 0]} castShadow>
    <T.BoxGeometry args={[0.7, 0.62, 1.1]} />
    <T.MeshStandardMaterial color={fur} />
  </T.Mesh>
  <!-- Shoulder hump just behind the head. -->
  <T.Mesh position={[0, 1.05, 0.2]} castShadow>
    <T.BoxGeometry args={[0.6, 0.18, 0.36]} />
    <T.MeshStandardMaterial color={fur} />
  </T.Mesh>

  <!-- Head, snout, nose. -->
  <T.Mesh position={[0, 1.0, 0.62]} castShadow>
    <T.BoxGeometry args={[0.46, 0.42, 0.42]} />
    <T.MeshStandardMaterial color={fur} />
  </T.Mesh>
  <T.Mesh position={[0, 0.92, 0.88]} castShadow>
    <T.BoxGeometry args={[0.26, 0.24, 0.22]} />
    <T.MeshStandardMaterial color={muzzle} />
  </T.Mesh>
  <T.Mesh position={[0, 0.98, 1.0]}>
    <T.BoxGeometry args={[0.09, 0.07, 0.06]} />
    <T.MeshStandardMaterial color={nose} />
  </T.Mesh>
  <!-- Beady eyes. -->
  <T.Mesh position={[-0.12, 1.1, 0.82]}>
    <T.SphereGeometry args={[0.03, 6, 6]} />
    <T.MeshStandardMaterial color={eye} />
  </T.Mesh>
  <T.Mesh position={[0.12, 1.1, 0.82]}>
    <T.SphereGeometry args={[0.03, 6, 6]} />
    <T.MeshStandardMaterial color={eye} />
  </T.Mesh>
  <!-- Round ears on top of the head. -->
  <T.Mesh position={[-0.18, 1.28, 0.55]} castShadow>
    <T.SphereGeometry args={[0.09, 8, 8]} />
    <T.MeshStandardMaterial color={fur} />
  </T.Mesh>
  <T.Mesh position={[0.18, 1.28, 0.55]} castShadow>
    <T.SphereGeometry args={[0.09, 8, 8]} />
    <T.MeshStandardMaterial color={fur} />
  </T.Mesh>

  <!-- Four thick legs. -->
  {#each [-1, 1] as sx (sx)}
    {#each [-1, 1] as sz (sz)}
      <T.Mesh position={[sx * 0.24, 0.26, sz * 0.4]} castShadow>
        <T.CylinderGeometry args={[0.12, 0.12, 0.5, 8]} />
        <T.MeshStandardMaterial color={furDark} />
      </T.Mesh>
      <!-- Pale claws as a flat slab under each paw. -->
      <T.Mesh position={[sx * 0.24, 0.02, sz * 0.4 + 0.06]} castShadow>
        <T.BoxGeometry args={[0.22, 0.04, 0.1]} />
        <T.MeshStandardMaterial color={claw} />
      </T.Mesh>
    {/each}
  {/each}

  <!-- Short stub tail. -->
  <T.Mesh position={[0, 0.78, -0.62]} castShadow>
    <T.SphereGeometry args={[0.1, 6, 6]} />
    <T.MeshStandardMaterial color={fur} />
  </T.Mesh>
</T.Group>
