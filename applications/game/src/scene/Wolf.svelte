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

  const fur = '#5b5552';
  const furDark = '#3a3633';
  const belly = '#7a7472';
  const eye = '#f4d33a';
  const fang = '#e8e6df';
  const nose = '#1a1a1a';
</script>

<T.Group
  {position}
  rotation.y={rotation}
  onclick={(e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    selection.value = { kind: 'beast', id };
  }}
>
  <EntityNameplate position={[0, 1.2, 0]} {name} {level} {hpPercent} />

  <!-- Body: lengthwise box with a paler belly slab underneath. -->
  <T.Mesh position={[0, 0.5, 0]} castShadow>
    <T.BoxGeometry args={[0.42, 0.4, 0.85]} />
    <T.MeshStandardMaterial color={fur} />
  </T.Mesh>
  <T.Mesh position={[0, 0.32, 0]} castShadow>
    <T.BoxGeometry args={[0.38, 0.12, 0.78]} />
    <T.MeshStandardMaterial color={belly} />
  </T.Mesh>

  <!-- Neck + head on the +Z side (forward). -->
  <T.Mesh position={[0, 0.62, 0.38]} rotation={[0.3, 0, 0]} castShadow>
    <T.BoxGeometry args={[0.26, 0.24, 0.22]} />
    <T.MeshStandardMaterial color={fur} />
  </T.Mesh>
  <T.Mesh position={[0, 0.72, 0.55]} castShadow>
    <T.BoxGeometry args={[0.3, 0.28, 0.3]} />
    <T.MeshStandardMaterial color={fur} />
  </T.Mesh>
  <!-- Snout -->
  <T.Mesh position={[0, 0.66, 0.74]} castShadow>
    <T.BoxGeometry args={[0.18, 0.16, 0.18]} />
    <T.MeshStandardMaterial color={furDark} />
  </T.Mesh>
  <!-- Nose -->
  <T.Mesh position={[0, 0.7, 0.84]}>
    <T.BoxGeometry args={[0.07, 0.06, 0.05]} />
    <T.MeshStandardMaterial color={nose} />
  </T.Mesh>
  <!-- Eyes -->
  <T.Mesh position={[-0.08, 0.8, 0.66]}>
    <T.SphereGeometry args={[0.025, 6, 6]} />
    <T.MeshStandardMaterial color={eye} emissive={eye} emissiveIntensity={0.6} />
  </T.Mesh>
  <T.Mesh position={[0.08, 0.8, 0.66]}>
    <T.SphereGeometry args={[0.025, 6, 6]} />
    <T.MeshStandardMaterial color={eye} emissive={eye} emissiveIntensity={0.6} />
  </T.Mesh>
  <!-- Triangular ears as small pyramids (cones with 4 segments). -->
  <T.Mesh position={[-0.1, 0.92, 0.5]} castShadow>
    <T.ConeGeometry args={[0.06, 0.14, 4]} />
    <T.MeshStandardMaterial color={fur} />
  </T.Mesh>
  <T.Mesh position={[0.1, 0.92, 0.5]} castShadow>
    <T.ConeGeometry args={[0.06, 0.14, 4]} />
    <T.MeshStandardMaterial color={fur} />
  </T.Mesh>
  <!-- Lower fangs -->
  <T.Mesh position={[-0.04, 0.6, 0.82]}>
    <T.ConeGeometry args={[0.012, 0.05, 4]} />
    <T.MeshStandardMaterial color={fang} />
  </T.Mesh>
  <T.Mesh position={[0.04, 0.6, 0.82]}>
    <T.ConeGeometry args={[0.012, 0.05, 4]} />
    <T.MeshStandardMaterial color={fang} />
  </T.Mesh>

  <!-- Four legs at the corners. -->
  {#each [-1, 1] as sx (sx)}
    {#each [-1, 1] as sz (sz)}
      <T.Mesh position={[sx * 0.15, 0.18, sz * 0.3]} castShadow>
        <T.CylinderGeometry args={[0.06, 0.06, 0.36, 6]} />
        <T.MeshStandardMaterial color={furDark} />
      </T.Mesh>
    {/each}
  {/each}

  <!-- Tail angled up-back. -->
  <T.Mesh position={[0, 0.62, -0.5]} rotation={[-0.5, 0, 0]} castShadow>
    <T.CylinderGeometry args={[0.04, 0.07, 0.36, 6]} />
    <T.MeshStandardMaterial color={fur} />
  </T.Mesh>
</T.Group>
