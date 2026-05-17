<script lang="ts">
  import { T } from '@threlte/core';
  import { HTML } from '@threlte/extras';

  interface Props {
    position: [number, number, number];
    rotation: number;
    scale: number;
    name: string;
    level: number;
    hpPercent: number;
  }
  let { position, rotation, scale, name, level, hpPercent }: Props = $props();

  const body = '#15090f';
  const leg = '#0a0408';
  const eye = '#ff2020';
  const eyeGlow = '#a01010';

  // 8 legs evenly around the body; each one is a group rotated around
  // Y so the cylinder inside it points outward and slightly downward.
  const LEG_ANGLES = [
    0,
    Math.PI / 4,
    Math.PI / 2,
    (3 * Math.PI) / 4,
    Math.PI,
    (5 * Math.PI) / 4,
    (3 * Math.PI) / 2,
    (7 * Math.PI) / 4,
  ];
</script>

<T.Group {position} rotation.y={rotation} {scale}>
  <!-- Name + level + hp bar above the spider. Height is scaled into
       local space so the label sits at a consistent world distance
       regardless of spider tier. -->
  <HTML position={[0, 0.6 / scale, 0]} center pointerEvents="none">
    <div
      class="flex flex-col items-center gap-0.5 [text-shadow:0_1px_2px_rgb(0_0_0_/_0.85)]"
    >
      <div
        class="flex items-baseline gap-1 text-xs font-semibold whitespace-nowrap"
      >
        <span class="text-amber-400">Level {level}</span>
        <span class="text-white/50">|</span>
        <span class="text-white">{name}</span>
      </div>
      <div class="h-1.5 w-14 border border-red-950 bg-black/70">
        <div
          class="h-full bg-red-600"
          style:width="{Math.max(0, Math.min(1, hpPercent)) * 100}%"
        ></div>
      </div>
    </div>
  </HTML>

  <!-- Body -->
  <T.Mesh position={[0, 0.15, 0]} castShadow>
    <T.SphereGeometry args={[0.16, 10, 10]} />
    <T.MeshStandardMaterial color={body} />
  </T.Mesh>

  <!-- Eyes on the +Z face (matches the +Z forward convention so
       rotation aligns with movement direction). -->
  <T.Mesh position={[-0.05, 0.19, 0.13]}>
    <T.SphereGeometry args={[0.025, 6, 6]} />
    <T.MeshStandardMaterial
      color={eye}
      emissive={eyeGlow}
      emissiveIntensity={1.8}
    />
  </T.Mesh>
  <T.Mesh position={[0.05, 0.19, 0.13]}>
    <T.SphereGeometry args={[0.025, 6, 6]} />
    <T.MeshStandardMaterial
      color={eye}
      emissive={eyeGlow}
      emissiveIntensity={1.8}
    />
  </T.Mesh>

  {#each LEG_ANGLES as angle (angle)}
    <T.Group position={[0, 0.15, 0]} rotation.y={angle}>
      <T.Mesh position={[0.18, -0.06, 0]} rotation={[0, 0, -1.0]} castShadow>
        <T.CylinderGeometry args={[0.016, 0.016, 0.32, 4]} />
        <T.MeshStandardMaterial color={leg} />
      </T.Mesh>
    </T.Group>
  {/each}
</T.Group>
