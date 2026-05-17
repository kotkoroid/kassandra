<script lang="ts">
  import { T } from '@threlte/core';
  import { HTML } from '@threlte/extras';

  interface Props {
    position: [number, number, number];
    rotation: number;
    hpPercent: number;
  }
  let { position, rotation, hpPercent }: Props = $props();

  const skin = '#f0d8c3';
  const hair = '#f5edc8';
  const outfit = '#e8eaf0';
  const boot = '#c8cad0';
  const belt = '#d0a838';
  const glow = '#a3d8ff';
</script>

<T.Group {position} rotation.y={rotation}>
  <!-- Title + health bar above the head. -->
  <HTML position={[0, 2.5, 0]} center pointerEvents="none">
    <div
      class="flex flex-col items-center gap-0.5 [text-shadow:0_1px_2px_rgb(0_0_0_/_0.85)]"
    >
      <div
        class="flex items-baseline gap-1 text-xs font-semibold whitespace-nowrap"
      >
        <span class="text-amber-400">Level 1</span>
        <span class="text-white/50">|</span>
        <span class="text-white">Ally</span>
      </div>
      <div class="h-1.5 w-16 border border-red-950 bg-black/70">
        <div
          class="h-full bg-red-600"
          style:width="{Math.max(0, Math.min(1, hpPercent)) * 100}%"
        ></div>
      </div>
    </div>
  </HTML>

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

  <!-- Long flowing hair (taller slab behind head) -->
  <T.Mesh position={[0, 1.55, -0.08]} castShadow>
    <T.BoxGeometry args={[0.38, 0.5, 0.22]} />
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
