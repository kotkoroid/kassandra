<script lang="ts">
  import { T } from '@threlte/core';
  import { getMonster } from '@kassandra/simulation-domain-library';
  import { world } from '../world.svelte';
  import Troller from './Troller.svelte';

  // Death.svelte is now a pure view: blood pool, troller(s), bug.
  // The pipeline (death trigger, troller phases, respawn) all
  // run inside the simulation — see sim/systems/death.ts.

  // Show the blood pool while the local player is dead OR while a
  // death-bag is still in the world (it sits over the pool).
  // PR-D3d.1: alive/deathX/Z moved from world.death to per-player.
  const localPlayer = $derived(world.players[world.localPlayerId]);
  const hasDeathBag = $derived(
    world.lootBags.some((b) => b.isDeathBag),
  );
</script>

{#if localPlayer && (!localPlayer.alive || hasDeathBag)}
  <T.Mesh
    position={[localPlayer.deathX, 0.045, localPlayer.deathZ]}
    rotation={[-Math.PI / 2, 0, 0]}
  >
    <T.CircleGeometry args={[1.1, 28]} />
    <T.MeshStandardMaterial
      color="#4a0606"
      emissive="#1a0202"
      emissiveIntensity={0.2}
      transparent
      opacity={0.85}
    />
  </T.Mesh>
{/if}

{#each world.entities as entity (entity.id)}
  {#if entity.kind === 'troller'}
    {@const troller = getMonster(entity.monsterId)}
    <Troller
      id={entity.id}
      position={[entity.x, 0, entity.z]}
      rotation={entity.rotation}
      name={troller.name}
      level={troller.level}
      hpPercent={entity.hp / entity.maxHp}
      carriesBag={Boolean(entity.carriesPlayerBag)}
    />
  {/if}
{/each}

{#if world.death.bug && localPlayer?.alive}
  {@const bu = world.death.bug}
  <T.Group position={[bu.x, 0.06, bu.z]} rotation.y={bu.rotation}>
    <T.Mesh castShadow>
      <T.SphereGeometry args={[0.07, 6, 6]} />
      <T.MeshStandardMaterial color="#1a0d12" />
    </T.Mesh>
    <T.Mesh position={[-0.02, 0.04, 0.05]}>
      <T.SphereGeometry args={[0.012, 4, 4]} />
      <T.MeshStandardMaterial
        color="#ffd040"
        emissive="#c08018"
        emissiveIntensity={2}
      />
    </T.Mesh>
    <T.Mesh position={[0.02, 0.04, 0.05]}>
      <T.SphereGeometry args={[0.012, 4, 4]} />
      <T.MeshStandardMaterial
        color="#ffd040"
        emissive="#c08018"
        emissiveIntensity={2}
      />
    </T.Mesh>
  </T.Group>
{/if}
