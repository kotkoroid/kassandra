<script lang="ts">
  // Single Lars coin: a thin golden disc with a slightly darker
  // rim torus so the edge reads as a milled coin instead of a flat
  // chip. Pure primitive geometry, no textures — match the rest of
  // the world's look. Callers stack/scatter several Coin meshes to
  // form a pile when more than one coin is meant to be visible.

  import { T } from '@threlte/core';

  interface Props {
    position?: [number, number, number];
    // World-space Y rotation so a stack can fan out.
    rotation?: number;
    // Diameter scale. 1 ≈ a typical world coin.
    scale?: number;
  }

  let { position = [0, 0, 0], rotation = 0, scale = 1 }: Props = $props();

  // Lying flat on the ground: tip a cylinder/torus onto its side
  // by rotating around X. Group wraps both so callers transform the
  // whole coin as one rigid object.
</script>

<T.Group {position} rotation.y={rotation} scale={scale}>
  <T.Group rotation.x={Math.PI / 2}>
    <T.Mesh castShadow>
      <T.CylinderGeometry args={[0.12, 0.12, 0.03, 18]} />
      <T.MeshStandardMaterial color="#e8c14a" metalness={0.6} roughness={0.35} />
    </T.Mesh>
    <T.Mesh>
      <T.TorusGeometry args={[0.12, 0.018, 8, 24]} />
      <T.MeshStandardMaterial color="#8a6618" metalness={0.5} roughness={0.5} />
    </T.Mesh>
  </T.Group>
</T.Group>
