<script lang="ts">
  import { T, useTask } from '@threlte/core';
  import { MeshStandardMaterial } from 'three';
  import { getVisibleWaters } from './world';

  interface Props {
    playerX: number;
    playerZ: number;
  }
  let { playerX, playerZ }: Props = $props();

  const waters = $derived(getVisibleWaters(playerX, playerZ));

  // Single shared material so one useTask write updates every pool
  // simultaneously — no per-mesh state needed.
  const waterMat = new MeshStandardMaterial({
    color: '#356f9c',
    emissive: '#1c3f5e',
    emissiveIntensity: 0.35,
    transparent: true,
    opacity: 0.78,
  });

  let elapsed = 0;
  useTask((delta) => {
    elapsed += delta;
    waterMat.emissiveIntensity = 0.25 + Math.sin(elapsed * 1.2) * 0.12;
  });
</script>

{#each waters as w (w.id)}
  <T.Mesh
    position={[w.x, 0.06, w.z]}
    rotation={[-Math.PI / 2, 0, 0]}
    material={waterMat}
  >
    <T.CircleGeometry args={[w.radius, 32]} />
  </T.Mesh>
{/each}
