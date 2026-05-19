<script lang="ts">
  import { T } from '@threlte/core';
  import { getMonster, MONSTER_BOWMAIDEN, MONSTER_SPELLMAIDEN } from '../monsters';
  import { PROJECTILE_HEIGHT } from '../sim/constants';
  import { world } from '../sim/world.svelte';
  import Bowmaiden from './Bowmaiden.svelte';
  import Enemy from './Enemy.svelte';
  import Shadowmaiden from './Shadowmaiden.svelte';
  import Spellmaiden from './Spellmaiden.svelte';
  import Warmaiden from './Warmaiden.svelte';
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
  {:else if entity.kind === 'bowmaiden'}
    {@const monster = getMonster(entity.monsterId)}
    <Bowmaiden
      id={entity.id}
      position={[entity.x, 0, entity.z]}
      rotation={entity.rotation}
      name={monster.name}
      level={monster.level}
      hpPercent={entity.hp / entity.maxHp}
    />
  {:else if entity.kind === 'spellmaiden'}
    {@const monster = getMonster(entity.monsterId)}
    <Spellmaiden
      id={entity.id}
      position={[entity.x, 0, entity.z]}
      rotation={entity.rotation}
      name={monster.name}
      level={monster.level}
      hpPercent={entity.hp / entity.maxHp}
    />
  {:else if entity.kind === 'warmaiden'}
    {@const monster = getMonster(entity.monsterId)}
    <Warmaiden
      id={entity.id}
      position={[entity.x, 0, entity.z]}
      rotation={entity.rotation}
      name={monster.name}
      level={monster.level}
      hpPercent={entity.hp / entity.maxHp}
    />
  {:else if entity.kind === 'shadowmaiden'}
    {@const monster = getMonster(entity.monsterId)}
    <Shadowmaiden
      id={entity.id}
      position={[entity.x, 0, entity.z]}
      rotation={entity.rotation}
      name={monster.name}
      level={monster.level}
      hpPercent={entity.hp / entity.maxHp}
    />
  {/if}
{/each}

<!-- Projectile dispatch: Swain still fires the red emissive orb;
     Bowmaiden's arrows render as oriented wooden shafts and the
     Spellmaiden's bolts render as a glowing violet motelet, so
     the player can read who shot what at a glance. -->
{#each world.projectiles as p (p.id)}
  {#if p.ownerMonsterId === MONSTER_SPELLMAIDEN}
    <T.Group position={[p.x, PROJECTILE_HEIGHT, p.z]}>
      <!-- Bright violet core. -->
      <T.Mesh castShadow>
        <T.SphereGeometry args={[0.13, 12, 12]} />
        <T.MeshStandardMaterial
          color="#c050ff"
          emissive="#e090ff"
          emissiveIntensity={2.2}
        />
      </T.Mesh>
      <!-- Translucent halo around it for the arcane shimmer. -->
      <T.Mesh>
        <T.SphereGeometry args={[0.22, 12, 12]} />
        <T.MeshStandardMaterial
          color="#e090ff"
          emissive="#e090ff"
          emissiveIntensity={0.5}
          transparent
          opacity={0.25}
          depthWrite={false}
        />
      </T.Mesh>
    </T.Group>
  {:else if p.ownerMonsterId === MONSTER_BOWMAIDEN}
    {@const angle = Math.atan2(p.vx, p.vz)}
    <T.Group position={[p.x, PROJECTILE_HEIGHT, p.z]} rotation.y={angle}>
      <!-- Shaft (lying along local +Z). -->
      <T.Mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
        <T.CylinderGeometry args={[0.018, 0.018, 0.45, 6]} />
        <T.MeshStandardMaterial color="#3d2715" />
      </T.Mesh>
      <!-- Steel arrowhead at the front. -->
      <T.Mesh position={[0, 0, 0.27]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <T.ConeGeometry args={[0.03, 0.12, 8]} />
        <T.MeshStandardMaterial color="#c0c0c8" metalness={0.6} roughness={0.4} />
      </T.Mesh>
      <!-- Fletching cone at the tail. -->
      <T.Mesh position={[0, 0, -0.25]} rotation={[-Math.PI / 2, 0, 0]} castShadow>
        <T.ConeGeometry args={[0.05, 0.1, 4]} />
        <T.MeshStandardMaterial color="#d4b078" />
      </T.Mesh>
    </T.Group>
  {:else}
    <T.Mesh position={[p.x, PROJECTILE_HEIGHT, p.z]} castShadow>
      <T.SphereGeometry args={[0.16, 12, 12]} />
      <T.MeshStandardMaterial
        color="#ff3a3a"
        emissive="#c41a1a"
        emissiveIntensity={1.8}
      />
    </T.Mesh>
  {/if}
{/each}
