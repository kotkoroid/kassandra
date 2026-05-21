<script lang="ts">
  import { T } from '@threlte/core';
  import { hover } from '../hover.svelte';
  import { selection } from '../selection.svelte';
  import { dispatch } from '@kassandra/simulation-domain-library';
  import { world } from '../world.svelte';
  import EntityNameplate from './EntityNameplate.svelte';
  import {
    CRIMSON_MAT,
    DARK_ARMOR_MAT,
    ENEMY_HAIR_MAT,
    ENEMY_LEATHER_MAT,
    NEAR_BLACK_MAT,
    SKIN_ASHEN_MAT,
  } from './materials';

  interface Props {
    id: string;
    position: [number, number, number];
    rotation: number;
    name: string;
    level: number;
    hpPercent: number;
  }
  let { id, position, rotation, name, level, hpPercent }: Props = $props();
</script>

<T.Group
  {position}
  rotation.y={rotation}
  onclick={(e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    selection.value = id;
    dispatch(world, { kind: 'engage', targetId: id });
  }}
  onpointerenter={(e: { stopPropagation: () => void }) => { e.stopPropagation(); hover.entityId = id; }}
  onpointerleave={() => { if (hover.entityId === id) hover.entityId = null; }}
>
  <EntityNameplate position={[0, 2.5, 0]} {name} {level} {hpPercent} entityX={position[0]} entityZ={position[2]} />
  <T.Mesh position={[0, 1.0, 0]}>
    <T.CylinderGeometry args={[0.4, 0.4, 2.0, 8]} />
    <T.MeshStandardMaterial transparent opacity={0} depthWrite={false} />
  </T.Mesh>

  <!-- Boots -->
  <T.Mesh position={[-0.13, 0.1, 0]} castShadow material={NEAR_BLACK_MAT}>
    <T.BoxGeometry args={[0.22, 0.2, 0.27]} />
  </T.Mesh>
  <T.Mesh position={[0.13, 0.1, 0]} castShadow material={NEAR_BLACK_MAT}>
    <T.BoxGeometry args={[0.22, 0.2, 0.27]} />
  </T.Mesh>

  <!-- Armored legs -->
  <T.Mesh position={[-0.13, 0.5, 0]} castShadow material={DARK_ARMOR_MAT}>
    <T.CylinderGeometry args={[0.1, 0.1, 0.55, 8]} />
  </T.Mesh>
  <T.Mesh position={[0.13, 0.5, 0]} castShadow material={DARK_ARMOR_MAT}>
    <T.CylinderGeometry args={[0.1, 0.1, 0.55, 8]} />
  </T.Mesh>

  <!-- Belt -->
  <T.Mesh position={[0, 0.92, 0]} castShadow material={ENEMY_LEATHER_MAT}>
    <T.CylinderGeometry args={[0.26, 0.26, 0.08, 8]} />
  </T.Mesh>

  <!-- Torso plate -->
  <T.Mesh position={[0, 1.3, 0]} castShadow material={DARK_ARMOR_MAT}>
    <T.BoxGeometry args={[0.5, 0.6, 0.3]} />
  </T.Mesh>

  <!-- Cape (red, hanging behind torso) -->
  <T.Mesh position={[0, 1.05, -0.18]} castShadow material={CRIMSON_MAT}>
    <T.BoxGeometry args={[0.55, 1.0, 0.04]} />
  </T.Mesh>

  <!-- Pauldrons -->
  <T.Mesh position={[-0.34, 1.5, 0]} castShadow material={DARK_ARMOR_MAT}>
    <T.BoxGeometry args={[0.26, 0.26, 0.32]} />
  </T.Mesh>
  <T.Mesh position={[0.34, 1.5, 0]} castShadow material={DARK_ARMOR_MAT}>
    <T.BoxGeometry args={[0.26, 0.26, 0.32]} />
  </T.Mesh>

  <!-- High collar -->
  <T.Mesh position={[0, 1.68, 0]} castShadow material={CRIMSON_MAT}>
    <T.BoxGeometry args={[0.32, 0.12, 0.28]} />
  </T.Mesh>

  <!-- Arms -->
  <T.Mesh position={[-0.32, 1.2, 0]} castShadow material={DARK_ARMOR_MAT}>
    <T.CylinderGeometry args={[0.08, 0.08, 0.5, 8]} />
  </T.Mesh>
  <T.Mesh position={[0.32, 1.2, 0]} castShadow material={DARK_ARMOR_MAT}>
    <T.CylinderGeometry args={[0.08, 0.08, 0.5, 8]} />
  </T.Mesh>

  <!-- Gauntlets -->
  <T.Mesh position={[-0.32, 0.92, 0]} castShadow material={DARK_ARMOR_MAT}>
    <T.CylinderGeometry args={[0.1, 0.1, 0.18, 8]} />
  </T.Mesh>
  <T.Mesh position={[0.32, 0.92, 0]} castShadow material={DARK_ARMOR_MAT}>
    <T.CylinderGeometry args={[0.1, 0.1, 0.18, 8]} />
  </T.Mesh>

  <!-- White hair -->
  <T.Mesh position={[0, 1.9, -0.05]} castShadow material={ENEMY_HAIR_MAT}>
    <T.BoxGeometry args={[0.34, 0.32, 0.22]} />
  </T.Mesh>

  <!-- Head -->
  <T.Mesh position={[0, 1.9, 0.02]} castShadow material={SKIN_ASHEN_MAT}>
    <T.BoxGeometry args={[0.3, 0.32, 0.3]} />
  </T.Mesh>
</T.Group>
