<script lang="ts">
  // Angendal Spellmaiden — the ranged magical sister. Same
  // stationary projectile AI as Swain/Bowmaiden; this file owns the
  // visual: hooded violet robes, gold trim, pale skin + silver
  // hair, a tall black staff capped with a glowing violet crystal.

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

  const skin = '#f1d8c4';
  const hair = '#dcd0c0';
  const robeOuter = '#3a1f5a';
  const robeOuterDark = '#1f0e36';
  const robeInner = '#1a0a30';
  const trim = '#d4a23a';
  const sashGem = '#b04ad8';
  const staffShaft = '#1a1418';
  const staffCap = '#d4a23a';
  const crystal = '#c050ff';
  const crystalGlow = '#e090ff';
</script>

<T.Group
  {position}
  rotation.y={rotation}
  onclick={(e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    selection.value = id;
  }}
>
  <EntityNameplate position={[0, 2.55, 0]} {name} {level} {hpPercent} />

  <!-- Long robe — a tapered cylinder from the shoulders down to
       the ground, no visible legs/feet so she reads as a floating
       robed caster. -->
  <T.Mesh position={[0, 0.7, 0]} castShadow>
    <T.CylinderGeometry args={[0.4, 0.22, 1.4, 14]} />
    <T.MeshStandardMaterial color={robeOuter} />
  </T.Mesh>
  <!-- Darker inner pleat down the front. -->
  <T.Mesh position={[0, 0.55, 0.18]} castShadow>
    <T.BoxGeometry args={[0.12, 1.1, 0.02]} />
    <T.MeshStandardMaterial color={robeInner} />
  </T.Mesh>
  <!-- Gold trim hem along the bottom of the robe. -->
  <T.Mesh position={[0, 0.04, 0]} castShadow>
    <T.CylinderGeometry args={[0.41, 0.41, 0.06, 14]} />
    <T.MeshStandardMaterial color={trim} metalness={0.5} roughness={0.4} />
  </T.Mesh>

  <!-- Sash at the waist with a small focusing gem. -->
  <T.Mesh position={[0, 1.08, 0]} castShadow>
    <T.CylinderGeometry args={[0.31, 0.31, 0.07, 14]} />
    <T.MeshStandardMaterial color={robeOuterDark} />
  </T.Mesh>
  <T.Mesh position={[0, 1.08, 0.31]}>
    <T.SphereGeometry args={[0.045, 10, 10]} />
    <T.MeshStandardMaterial
      color={sashGem}
      emissive={sashGem}
      emissiveIntensity={0.9}
    />
  </T.Mesh>

  <!-- Torso under the robe top (just the visible bit between sash
       and collar). -->
  <T.Mesh position={[0, 1.3, 0]} castShadow>
    <T.BoxGeometry args={[0.4, 0.32, 0.26]} />
    <T.MeshStandardMaterial color={robeOuter} />
  </T.Mesh>
  <!-- V-neck inner — a darker triangle just below the collar so
       the silhouette doesn't go flat. -->
  <T.Mesh position={[0, 1.36, 0.135]} rotation={[0, 0, Math.PI / 4]} castShadow>
    <T.BoxGeometry args={[0.12, 0.12, 0.01]} />
    <T.MeshStandardMaterial color={robeInner} />
  </T.Mesh>

  <!-- Wide pointed shoulder pauldrons (cloth). -->
  <T.Mesh position={[-0.28, 1.4, 0]} castShadow>
    <T.ConeGeometry args={[0.13, 0.16, 8]} />
    <T.MeshStandardMaterial color={robeOuterDark} />
  </T.Mesh>
  <T.Mesh position={[0.28, 1.4, 0]} castShadow>
    <T.ConeGeometry args={[0.13, 0.16, 8]} />
    <T.MeshStandardMaterial color={robeOuterDark} />
  </T.Mesh>

  <!-- Bare-skin arms emerging from the wide sleeves. -->
  <T.Mesh position={[-0.27, 1.18, 0]} castShadow>
    <T.CylinderGeometry args={[0.06, 0.06, 0.5, 8]} />
    <T.MeshStandardMaterial color={skin} />
  </T.Mesh>
  <T.Mesh position={[0.27, 1.18, 0]} castShadow>
    <T.CylinderGeometry args={[0.06, 0.06, 0.5, 8]} />
    <T.MeshStandardMaterial color={skin} />
  </T.Mesh>

  <!-- Head + long pale silver hair (slab down the back). -->
  <T.Mesh position={[0, 1.6, 0.03]} castShadow>
    <T.BoxGeometry args={[0.3, 0.3, 0.3]} />
    <T.MeshStandardMaterial color={skin} />
  </T.Mesh>
  <T.Mesh position={[0, 1.4, -0.1]} castShadow>
    <T.BoxGeometry args={[0.36, 0.72, 0.18]} />
    <T.MeshStandardMaterial color={hair} />
  </T.Mesh>
  <T.Mesh position={[0, 1.76, -0.02]} castShadow>
    <T.BoxGeometry args={[0.32, 0.16, 0.32]} />
    <T.MeshStandardMaterial color={hair} />
  </T.Mesh>

  <!-- Pointed hood sitting back from the brow — a cone tipped
       backward so the face stays visible. -->
  <T.Mesh position={[0, 1.92, -0.06]} rotation={[0.25, 0, 0]} castShadow>
    <T.ConeGeometry args={[0.22, 0.4, 8]} />
    <T.MeshStandardMaterial color={robeOuter} />
  </T.Mesh>
  <T.Mesh position={[0, 2.08, 0]} castShadow>
    <T.SphereGeometry args={[0.022, 8, 8]} />
    <T.MeshStandardMaterial color={trim} metalness={0.5} roughness={0.4} />
  </T.Mesh>

  <!-- Staff held at the right side. Long black shaft, gold cap,
       glowing violet crystal cluster on top. -->
  <T.Group position={[0.42, 0, 0]}>
    <T.Mesh position={[0, 1.05, 0]} castShadow>
      <T.CylinderGeometry args={[0.025, 0.025, 2.1, 8]} />
      <T.MeshStandardMaterial color={staffShaft} />
    </T.Mesh>
    <!-- Gold band wrap below the crystal. -->
    <T.Mesh position={[0, 2.0, 0]} castShadow>
      <T.CylinderGeometry args={[0.05, 0.05, 0.08, 10]} />
      <T.MeshStandardMaterial color={staffCap} metalness={0.5} roughness={0.4} />
    </T.Mesh>
    <!-- Main violet crystal — octahedral, glowing. -->
    <T.Mesh position={[0, 2.16, 0]} rotation={[0, Math.PI / 4, 0]}>
      <T.OctahedronGeometry args={[0.11, 0]} />
      <T.MeshStandardMaterial
        color={crystal}
        emissive={crystalGlow}
        emissiveIntensity={1.6}
      />
    </T.Mesh>
    <!-- Smaller orb haloing the main crystal so it reads as
         radiating arcane light. -->
    <T.Mesh position={[0, 2.16, 0]}>
      <T.SphereGeometry args={[0.18, 12, 12]} />
      <T.MeshStandardMaterial
        color={crystalGlow}
        emissive={crystalGlow}
        emissiveIntensity={0.4}
        transparent
        opacity={0.18}
        depthWrite={false}
      />
    </T.Mesh>
  </T.Group>
</T.Group>
