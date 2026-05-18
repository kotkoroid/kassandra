<script lang="ts">
  // Single wooden lamp post with a hanging lantern. Lights up at
  // night via an emissive material on the bulb cube — no real
  // light source, just a stylised glow that reads from any angle.

  import { T } from '@threlte/core';

  interface Props {
    position: [number, number, number];
    // Rotation around Y so the lantern can face into the city
    // rather than into the wall.
    rotation?: number;
    // 0 = unlit, 1 = fully lit. Comes from the night clock so the
    // lamps fade in around dusk instead of snapping on.
    lit?: number;
  }
  let { position, rotation = 0, lit = 0 }: Props = $props();

  const wood = '#3d2715';
  const woodTrim = '#2a1810';
  const frame = '#1a1a1a';
  const bulb = '#f0c060';
</script>

<T.Group {position} rotation.y={rotation}>
  <!-- Post: tall thin cylinder, slightly tapered. -->
  <T.Mesh position={[0, 1.4, 0]} castShadow>
    <T.CylinderGeometry args={[0.05, 0.07, 2.8, 8]} />
    <T.MeshStandardMaterial color={wood} />
  </T.Mesh>
  <!-- Dark wraps near the base + neck so the post reads as banded
       carved wood. -->
  <T.Mesh position={[0, 0.25, 0]} castShadow>
    <T.CylinderGeometry args={[0.075, 0.075, 0.18, 8]} />
    <T.MeshStandardMaterial color={woodTrim} />
  </T.Mesh>
  <T.Mesh position={[0, 2.55, 0]} castShadow>
    <T.CylinderGeometry args={[0.06, 0.06, 0.12, 8]} />
    <T.MeshStandardMaterial color={woodTrim} />
  </T.Mesh>

  <!-- Small horizontal bracket arm projecting from the post that the
       lantern hangs off. -->
  <T.Mesh position={[0.15, 2.45, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
    <T.CylinderGeometry args={[0.022, 0.022, 0.3, 6]} />
    <T.MeshStandardMaterial color={wood} />
  </T.Mesh>

  <!-- Lantern body. Outer dark frame + inner glowing cube — emissive
       intensity scales with `lit` so dusk/dawn fade smoothly. -->
  <T.Group position={[0.3, 2.2, 0]}>
    <!-- Cap on top of the lantern. -->
    <T.Mesh position={[0, 0.2, 0]} castShadow>
      <T.BoxGeometry args={[0.22, 0.05, 0.22]} />
      <T.MeshStandardMaterial color={frame} />
    </T.Mesh>
    <!-- Glowing core. -->
    <T.Mesh>
      <T.BoxGeometry args={[0.18, 0.28, 0.18]} />
      <T.MeshStandardMaterial
        color={bulb}
        emissive={bulb}
        emissiveIntensity={lit * 1.8}
      />
    </T.Mesh>
    <!-- Frame bars: thin black boxes hugging the four vertical edges
         so the lantern reads as caged. -->
    {#each [
      [-0.085, 0, -0.085],
      [0.085, 0, -0.085],
      [-0.085, 0, 0.085],
      [0.085, 0, 0.085],
    ] as p (`${p[0]},${p[2]}`)}
      <T.Mesh position={[p[0], p[1], p[2]]} castShadow>
        <T.BoxGeometry args={[0.025, 0.32, 0.025]} />
        <T.MeshStandardMaterial color={frame} />
      </T.Mesh>
    {/each}
    <!-- Floor of the lantern. -->
    <T.Mesh position={[0, -0.18, 0]} castShadow>
      <T.BoxGeometry args={[0.22, 0.04, 0.22]} />
      <T.MeshStandardMaterial color={frame} />
    </T.Mesh>
  </T.Group>
</T.Group>
