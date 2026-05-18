<script lang="ts">
  import { getMonster } from '../monsters';
  import { world } from '../sim/world.svelte';
  import Spider from './Spider.svelte';

  // Render-only mapping from spider tier → mesh scale. The sim
  // doesn't care about visual scale; it lives here so a tweak to
  // the model stays in the view layer.
  const SCALE: Record<'spider-big' | 'spider-medium' | 'spider-tiny', number> = {
    'spider-big': 1,
    'spider-medium': 0.7,
    'spider-tiny': 0.45,
  };
</script>

{#each world.entities as entity (entity.id)}
  {#if entity.kind === 'spider-big' || entity.kind === 'spider-medium' || entity.kind === 'spider-tiny'}
    {@const monster = getMonster(entity.monsterId)}
    <Spider
      id={entity.id}
      position={[entity.x, 0, entity.z]}
      rotation={entity.rotation}
      scale={SCALE[entity.kind]}
      name={monster.name}
      level={monster.level}
      hpPercent={entity.hp / entity.maxHp}
    />
  {/if}
{/each}
