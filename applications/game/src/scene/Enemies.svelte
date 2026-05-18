<script lang="ts">
  import { T } from '@threlte/core';
  import { getMonster } from '../monsters';
  import { PROJECTILE_HEIGHT } from '../sim/constants';
  import { world } from '../sim/world.svelte';
  import Enemy from './Enemy.svelte';
</script>

{#each world.entities as entity (entity.id)}
  {#if entity.kind === 'swain'}
    {@const monster = getMonster(entity.monsterId)}
    <Enemy
      id={entity.id}
      position={[entity.x, 0, entity.z]}
      rotation={entity.rotation}
      name={monster.name}
      level={monster.level}
      hpPercent={entity.hp / entity.maxHp}
    />
  {/if}
{/each}

{#each world.projectiles as p (p.id)}
  <T.Mesh position={[p.x, PROJECTILE_HEIGHT, p.z]} castShadow>
    <T.SphereGeometry args={[0.16, 12, 12]} />
    <T.MeshStandardMaterial
      color="#ff3a3a"
      emissive="#c41a1a"
      emissiveIntensity={1.8}
    />
  </T.Mesh>
{/each}
