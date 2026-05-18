<script lang="ts">
  import { getMonster } from '../monsters';
  import { world } from '../sim/world.svelte';
  import Bear from './Bear.svelte';
  import Wolf from './Wolf.svelte';
</script>

{#each world.entities as entity (entity.id)}
  {#if entity.kind === 'wolf'}
    {@const monster = getMonster(entity.monsterId)}
    <Wolf
      id={entity.id}
      position={[entity.x, 0, entity.z]}
      rotation={entity.rotation}
      name={monster.name}
      level={monster.level}
      hpPercent={entity.hp / entity.maxHp}
    />
  {:else if entity.kind === 'bear'}
    {@const monster = getMonster(entity.monsterId)}
    <Bear
      id={entity.id}
      position={[entity.x, 0, entity.z]}
      rotation={entity.rotation}
      name={monster.name}
      level={monster.level}
      hpPercent={entity.hp / entity.maxHp}
    />
  {/if}
{/each}
