<script lang="ts">
  import { T } from '@threlte/core';
  import { HEAL_CIRCLE_RADIUS } from '../simulation/constants';
  import { world } from '../simulation/world.svelte';
  import Azir from './Azir.svelte';
  import Healer from './Healer.svelte';
</script>

{#each world.entities as entity (entity.id)}
  {#if entity.kind === 'janna'}
    <Healer
      id={entity.id}
      position={[entity.x, 0, entity.z]}
      rotation={entity.rotation}
      hpPercent={entity.hp / entity.maxHp}
    />
  {:else if entity.kind === 'azir'}
    <Azir
      id={entity.id}
      position={[entity.x, 0, entity.z]}
      rotation={entity.rotation}
      hpPercent={entity.hp / entity.maxHp}
      saying={entity.saying}
    />
  {/if}
{/each}

{#each world.healingCircles as c (c.id)}
  <T.Mesh
    position={[c.x, 0.05, c.z]}
    rotation={[-Math.PI / 2, 0, 0]}
    receiveShadow
  >
    <T.CircleGeometry args={[HEAL_CIRCLE_RADIUS, 24]} />
    <T.MeshStandardMaterial
      color="#a3d8ff"
      emissive="#6ab3ff"
      emissiveIntensity={0.9}
      transparent
      opacity={0.55}
    />
  </T.Mesh>
{/each}
