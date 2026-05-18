<script lang="ts">
  import { T } from '@threlte/core';
  import { selection } from '../selection.svelte';
  import EntityNameplate from './EntityNameplate.svelte';

  interface Props {
    id: string;
    position: [number, number, number];
    rotation: number;
    hpPercent: number;
  }
  let { id, position, rotation, hpPercent }: Props = $props();

  const skin = '#f0d8c3';
  // Long blonde hair — saturated gold rather than the previous pale
  // cream so it reads clearly as "blonde" at a glance.
  const hair = '#e6c25a';
  const outfit = '#e8eaf0';
  const boot = '#c8cad0';
  const belt = '#d0a838';
  const glow = '#a3d8ff';
</script>

<T.Group
  {position}
  rotation.y={rotation}
  onclick={(e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    selection.value = { kind: 'healer', id };
  }}
>
  <!-- Title + health bar above the head. -->
  <EntityNameplate
    position={[0, 2.5, 0]}
    name="Janna"
    level={10}
    {hpPercent}
  />

  <!-- Boots -->
  <T.Mesh position={[-0.12, 0.1, 0]} castShadow>
    <T.BoxGeometry args={[0.2, 0.2, 0.25]} />
    <T.MeshStandardMaterial color={boot} />
  </T.Mesh>
  <T.Mesh position={[0.12, 0.1, 0]} castShadow>
    <T.BoxGeometry args={[0.2, 0.2, 0.25]} />
    <T.MeshStandardMaterial color={boot} />
  </T.Mesh>

  <!-- Bare legs -->
  <T.Mesh position={[-0.12, 0.5, 0]} castShadow>
    <T.CylinderGeometry args={[0.085, 0.085, 0.55, 8]} />
    <T.MeshStandardMaterial color={skin} />
  </T.Mesh>
  <T.Mesh position={[0.12, 0.5, 0]} castShadow>
    <T.CylinderGeometry args={[0.085, 0.085, 0.55, 8]} />
    <T.MeshStandardMaterial color={skin} />
  </T.Mesh>

  <!-- Short skirt -->
  <T.Mesh position={[0, 0.85, 0]} castShadow>
    <T.CylinderGeometry args={[0.26, 0.22, 0.18, 8]} />
    <T.MeshStandardMaterial color={outfit} />
  </T.Mesh>

  <!-- Gold belt -->
  <T.Mesh position={[0, 0.97, 0]} castShadow>
    <T.CylinderGeometry args={[0.22, 0.22, 0.05, 8]} />
    <T.MeshStandardMaterial color={belt} />
  </T.Mesh>

  <!-- Top (chest piece) -->
  <T.Mesh position={[0, 1.25, 0]} castShadow>
    <T.BoxGeometry args={[0.38, 0.45, 0.24]} />
    <T.MeshStandardMaterial color={outfit} />
  </T.Mesh>

  <!-- Breast bumps molded into the chest piece. Matched to the
       player's female silhouette so Janna reads consistently. -->
  <T.Mesh position={[-0.09, 1.3, 0.12]} castShadow>
    <T.SphereGeometry args={[0.085, 10, 10]} />
    <T.MeshStandardMaterial color={outfit} />
  </T.Mesh>
  <T.Mesh position={[0.09, 1.3, 0.12]} castShadow>
    <T.SphereGeometry args={[0.085, 10, 10]} />
    <T.MeshStandardMaterial color={outfit} />
  </T.Mesh>

  <!-- Arms -->
  <T.Mesh position={[-0.27, 1.15, 0]} castShadow>
    <T.CylinderGeometry args={[0.065, 0.065, 0.45, 8]} />
    <T.MeshStandardMaterial color={skin} />
  </T.Mesh>
  <T.Mesh position={[0.27, 1.15, 0]} castShadow>
    <T.CylinderGeometry args={[0.065, 0.065, 0.45, 8]} />
    <T.MeshStandardMaterial color={skin} />
  </T.Mesh>

  <!-- White gloves at wrists -->
  <T.Mesh position={[-0.27, 0.92, 0]} castShadow>
    <T.CylinderGeometry args={[0.085, 0.085, 0.16, 8]} />
    <T.MeshStandardMaterial color={outfit} />
  </T.Mesh>
  <T.Mesh position={[0.27, 0.92, 0]} castShadow>
    <T.CylinderGeometry args={[0.085, 0.085, 0.16, 8]} />
    <T.MeshStandardMaterial color={outfit} />
  </T.Mesh>

  <!-- Long flowing hair: a tall slab down the back plus a wider
       top-of-head cap so the blonde reads from any angle. -->
  <T.Mesh position={[0, 1.35, -0.1]} castShadow>
    <T.BoxGeometry args={[0.42, 0.95, 0.2]} />
    <T.MeshStandardMaterial color={hair} />
  </T.Mesh>
  <T.Mesh position={[0, 1.78, -0.02]} castShadow>
    <T.BoxGeometry args={[0.36, 0.16, 0.34]} />
    <T.MeshStandardMaterial color={hair} />
  </T.Mesh>

  <!-- Head -->
  <T.Mesh position={[0, 1.6, 0.03]} castShadow>
    <T.BoxGeometry args={[0.3, 0.3, 0.3]} />
    <T.MeshStandardMaterial color={skin} />
  </T.Mesh>

  <!-- Pointed elf ears -->
  <T.Mesh
    position={[-0.18, 1.62, 0.02]}
    rotation={[0, 0, -1.1]}
    castShadow
  >
    <T.ConeGeometry args={[0.05, 0.14, 5]} />
    <T.MeshStandardMaterial color={skin} />
  </T.Mesh>
  <T.Mesh
    position={[0.18, 1.62, 0.02]}
    rotation={[0, 0, 1.1]}
    castShadow
  >
    <T.ConeGeometry args={[0.05, 0.14, 5]} />
    <T.MeshStandardMaterial color={skin} />
  </T.Mesh>

  <!-- Glowing orb floating above outstretched hand (right) -->
  <T.Mesh position={[0.5, 1.5, 0.25]}>
    <T.SphereGeometry args={[0.12, 12, 12]} />
    <T.MeshStandardMaterial
      color={glow}
      emissive={glow}
      emissiveIntensity={1.5}
    />
  </T.Mesh>
</T.Group>
