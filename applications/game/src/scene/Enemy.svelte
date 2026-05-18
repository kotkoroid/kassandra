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

  const skin = '#dcc7b8';
  const hair = '#bcbcbc';
  const armor = '#1f2025';
  const trim = '#9c2c2c';
  const leather = '#4a3020';
  const boot = '#16171a';
</script>

<T.Group
  {position}
  rotation.y={rotation}
  onclick={(e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    selection.value = { kind: 'enemy', id };
  }}
>
  <!-- Title + health bar above the head. center anchors the projected
       pixel so the stack stays horizontally centred over the model. -->
  <EntityNameplate position={[0, 2.5, 0]} {name} {level} {hpPercent} />

  <!-- Boots -->
  <T.Mesh position={[-0.13, 0.1, 0]} castShadow>
    <T.BoxGeometry args={[0.22, 0.2, 0.27]} />
    <T.MeshStandardMaterial color={boot} />
  </T.Mesh>
  <T.Mesh position={[0.13, 0.1, 0]} castShadow>
    <T.BoxGeometry args={[0.22, 0.2, 0.27]} />
    <T.MeshStandardMaterial color={boot} />
  </T.Mesh>

  <!-- Armored legs -->
  <T.Mesh position={[-0.13, 0.5, 0]} castShadow>
    <T.CylinderGeometry args={[0.1, 0.1, 0.55, 8]} />
    <T.MeshStandardMaterial color={armor} />
  </T.Mesh>
  <T.Mesh position={[0.13, 0.5, 0]} castShadow>
    <T.CylinderGeometry args={[0.1, 0.1, 0.55, 8]} />
    <T.MeshStandardMaterial color={armor} />
  </T.Mesh>

  <!-- Belt -->
  <T.Mesh position={[0, 0.92, 0]} castShadow>
    <T.CylinderGeometry args={[0.26, 0.26, 0.08, 8]} />
    <T.MeshStandardMaterial color={leather} />
  </T.Mesh>

  <!-- Torso plate -->
  <T.Mesh position={[0, 1.3, 0]} castShadow>
    <T.BoxGeometry args={[0.5, 0.6, 0.3]} />
    <T.MeshStandardMaterial color={armor} />
  </T.Mesh>

  <!-- Cape (red, hanging behind torso) -->
  <T.Mesh position={[0, 1.05, -0.18]} castShadow>
    <T.BoxGeometry args={[0.55, 1.0, 0.04]} />
    <T.MeshStandardMaterial color={trim} />
  </T.Mesh>

  <!-- Pauldrons -->
  <T.Mesh position={[-0.34, 1.5, 0]} castShadow>
    <T.BoxGeometry args={[0.26, 0.26, 0.32]} />
    <T.MeshStandardMaterial color={armor} />
  </T.Mesh>
  <T.Mesh position={[0.34, 1.5, 0]} castShadow>
    <T.BoxGeometry args={[0.26, 0.26, 0.32]} />
    <T.MeshStandardMaterial color={armor} />
  </T.Mesh>

  <!-- High collar -->
  <T.Mesh position={[0, 1.68, 0]} castShadow>
    <T.BoxGeometry args={[0.32, 0.12, 0.28]} />
    <T.MeshStandardMaterial color={trim} />
  </T.Mesh>

  <!-- Arms -->
  <T.Mesh position={[-0.32, 1.2, 0]} castShadow>
    <T.CylinderGeometry args={[0.08, 0.08, 0.5, 8]} />
    <T.MeshStandardMaterial color={armor} />
  </T.Mesh>
  <T.Mesh position={[0.32, 1.2, 0]} castShadow>
    <T.CylinderGeometry args={[0.08, 0.08, 0.5, 8]} />
    <T.MeshStandardMaterial color={armor} />
  </T.Mesh>

  <!-- Gauntlets -->
  <T.Mesh position={[-0.32, 0.92, 0]} castShadow>
    <T.CylinderGeometry args={[0.1, 0.1, 0.18, 8]} />
    <T.MeshStandardMaterial color={armor} />
  </T.Mesh>
  <T.Mesh position={[0.32, 0.92, 0]} castShadow>
    <T.CylinderGeometry args={[0.1, 0.1, 0.18, 8]} />
    <T.MeshStandardMaterial color={armor} />
  </T.Mesh>

  <!-- White hair -->
  <T.Mesh position={[0, 1.9, -0.05]} castShadow>
    <T.BoxGeometry args={[0.34, 0.32, 0.22]} />
    <T.MeshStandardMaterial color={hair} />
  </T.Mesh>

  <!-- Head -->
  <T.Mesh position={[0, 1.9, 0.02]} castShadow>
    <T.BoxGeometry args={[0.3, 0.32, 0.3]} />
    <T.MeshStandardMaterial color={skin} />
  </T.Mesh>
</T.Group>
