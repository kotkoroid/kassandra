<script lang="ts">
  import { T } from '@threlte/core';
  import { getVisibleWaters } from './world';

  interface Props {
    playerX: number;
    playerZ: number;
  }
  let { playerX, playerZ }: Props = $props();

  const waters = $derived(getVisibleWaters(playerX, playerZ));
</script>

{#each waters as w (w.id)}
  <T.Mesh
    position={[w.x, 0.06, w.z]}
    rotation={[-Math.PI / 2, 0, 0]}
  >
    <T.CircleGeometry args={[w.radius, 32]} />
    <T.MeshStandardMaterial
      color="#356f9c"
      emissive="#1c3f5e"
      emissiveIntensity={0.35}
      transparent
      opacity={0.78}
    />
  </T.Mesh>
{/each}
