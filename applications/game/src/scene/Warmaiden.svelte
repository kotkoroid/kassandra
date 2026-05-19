<script lang="ts">
  // Angendal Warmaiden — melee counterpart to the Bowmaiden.
  // Reuses the wolf/bear chase-and-bite AI; this file only owns the
  // visual: female warrior in a leather bandeau + tan breeches with
  // bronze knee plates, brown bracers, red headband, short curved
  // scimitar in the right hand.

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

  const skin = '#f0c8a8';
  const hair = '#5a3018';
  const headband = '#c43a2a';
  const bandeau = '#7a4a2a';
  const bandeauTrim = '#3a1f10';
  const sigil = '#a85a28';
  const bracer = '#2a1810';
  const pants = '#b89a72';
  const pantsTrim = '#7a5a36';
  const kneePlate = '#a8884c';
  const kneePlateDark = '#6a522c';
  const boot = '#5a3a20';
  const blade = '#d4d4dc';
  const grip = '#3d2715';
  const pommel = '#7a5a30';
</script>

<T.Group
  {position}
  rotation.y={rotation}
  onclick={(e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    selection.value = id;
  }}
>
  <EntityNameplate position={[0, 2.4, 0]} {name} {level} {hpPercent} />

  <!-- Boots — brown leather. -->
  <T.Mesh position={[-0.12, 0.1, 0]} castShadow>
    <T.BoxGeometry args={[0.22, 0.2, 0.28]} />
    <T.MeshStandardMaterial color={boot} />
  </T.Mesh>
  <T.Mesh position={[0.12, 0.1, 0]} castShadow>
    <T.BoxGeometry args={[0.22, 0.2, 0.28]} />
    <T.MeshStandardMaterial color={boot} />
  </T.Mesh>

  <!-- Knee-high shin plates (bronze + darker rim). -->
  <T.Mesh position={[-0.12, 0.4, 0]} castShadow>
    <T.CylinderGeometry args={[0.1, 0.1, 0.32, 8]} />
    <T.MeshStandardMaterial color={kneePlate} metalness={0.35} roughness={0.55} />
  </T.Mesh>
  <T.Mesh position={[0.12, 0.4, 0]} castShadow>
    <T.CylinderGeometry args={[0.1, 0.1, 0.32, 8]} />
    <T.MeshStandardMaterial color={kneePlate} metalness={0.35} roughness={0.55} />
  </T.Mesh>
  <!-- Dark rim where the plate ends. -->
  <T.Mesh position={[-0.12, 0.56, 0]} castShadow>
    <T.CylinderGeometry args={[0.105, 0.105, 0.05, 8]} />
    <T.MeshStandardMaterial color={kneePlateDark} />
  </T.Mesh>
  <T.Mesh position={[0.12, 0.56, 0]} castShadow>
    <T.CylinderGeometry args={[0.105, 0.105, 0.05, 8]} />
    <T.MeshStandardMaterial color={kneePlateDark} />
  </T.Mesh>

  <!-- Breeches above the knee plates. -->
  <T.Mesh position={[-0.12, 0.78, 0]} castShadow>
    <T.CylinderGeometry args={[0.095, 0.095, 0.4, 8]} />
    <T.MeshStandardMaterial color={pants} />
  </T.Mesh>
  <T.Mesh position={[0.12, 0.78, 0]} castShadow>
    <T.CylinderGeometry args={[0.095, 0.095, 0.4, 8]} />
    <T.MeshStandardMaterial color={pants} />
  </T.Mesh>
  <!-- Hip-band where the bandeau meets the breeches. -->
  <T.Mesh position={[0, 1.02, 0]} castShadow>
    <T.CylinderGeometry args={[0.24, 0.22, 0.08, 8]} />
    <T.MeshStandardMaterial color={pantsTrim} />
  </T.Mesh>

  <!-- Leather bandeau chestpiece with a bronze sigil disc. -->
  <T.Mesh position={[0, 1.25, 0]} castShadow>
    <T.BoxGeometry args={[0.38, 0.3, 0.24]} />
    <T.MeshStandardMaterial color={bandeau} />
  </T.Mesh>
  <!-- Bandeau top trim. -->
  <T.Mesh position={[0, 1.4, 0]} castShadow>
    <T.BoxGeometry args={[0.4, 0.05, 0.26]} />
    <T.MeshStandardMaterial color={bandeauTrim} />
  </T.Mesh>
  <!-- Female silhouette bumps. -->
  <T.Mesh position={[-0.09, 1.27, 0.12]} castShadow>
    <T.SphereGeometry args={[0.085, 10, 10]} />
    <T.MeshStandardMaterial color={bandeau} />
  </T.Mesh>
  <T.Mesh position={[0.09, 1.27, 0.12]} castShadow>
    <T.SphereGeometry args={[0.085, 10, 10]} />
    <T.MeshStandardMaterial color={bandeau} />
  </T.Mesh>
  <!-- Sigil emblem on the front. -->
  <T.Mesh position={[0, 1.25, 0.13]} rotation={[Math.PI / 2, 0, 0]} castShadow>
    <T.CylinderGeometry args={[0.07, 0.07, 0.01, 12]} />
    <T.MeshStandardMaterial color={sigil} metalness={0.3} roughness={0.7} />
  </T.Mesh>

  <!-- Bracers — dark leather forearms. -->
  <T.Mesh position={[-0.27, 1.18, 0]} castShadow>
    <T.CylinderGeometry args={[0.065, 0.065, 0.5, 8]} />
    <T.MeshStandardMaterial color={skin} />
  </T.Mesh>
  <T.Mesh position={[0.27, 1.18, 0]} castShadow>
    <T.CylinderGeometry args={[0.065, 0.065, 0.5, 8]} />
    <T.MeshStandardMaterial color={skin} />
  </T.Mesh>
  <!-- Dark bracer overlays. -->
  <T.Mesh position={[-0.27, 0.98, 0]} castShadow>
    <T.CylinderGeometry args={[0.075, 0.075, 0.32, 8]} />
    <T.MeshStandardMaterial color={bracer} />
  </T.Mesh>
  <T.Mesh position={[0.27, 0.98, 0]} castShadow>
    <T.CylinderGeometry args={[0.075, 0.075, 0.32, 8]} />
    <T.MeshStandardMaterial color={bracer} />
  </T.Mesh>

  <!-- Head + short brown hair. -->
  <T.Mesh position={[0, 1.6, 0.03]} castShadow>
    <T.BoxGeometry args={[0.3, 0.3, 0.3]} />
    <T.MeshStandardMaterial color={skin} />
  </T.Mesh>
  <T.Mesh position={[0, 1.74, 0]} castShadow>
    <T.BoxGeometry args={[0.32, 0.16, 0.32]} />
    <T.MeshStandardMaterial color={hair} />
  </T.Mesh>
  <!-- Red headband across the forehead. -->
  <T.Mesh position={[0, 1.66, 0.12]} castShadow>
    <T.BoxGeometry args={[0.33, 0.06, 0.1]} />
    <T.MeshStandardMaterial color={headband} />
  </T.Mesh>

  <!-- Short curved scimitar held at the right hip, blade tipped
       slightly forward so it reads as drawn-and-ready rather than
       sheathed. -->
  <T.Group position={[0.36, 0.78, 0]} rotation={[0.1, 0, -0.15]}>
    <!-- Grip + pommel. -->
    <T.Mesh position={[0, 0.18, 0]} castShadow>
      <T.CylinderGeometry args={[0.025, 0.025, 0.16, 8]} />
      <T.MeshStandardMaterial color={grip} />
    </T.Mesh>
    <T.Mesh position={[0, 0.28, 0]} castShadow>
      <T.SphereGeometry args={[0.035, 8, 8]} />
      <T.MeshStandardMaterial color={pommel} metalness={0.4} roughness={0.5} />
    </T.Mesh>
    <!-- Crossguard. -->
    <T.Mesh position={[0, 0.1, 0]} castShadow>
      <T.BoxGeometry args={[0.14, 0.025, 0.04]} />
      <T.MeshStandardMaterial color={pommel} metalness={0.4} roughness={0.5} />
    </T.Mesh>
    <!-- Blade — long flat box tilted forward. -->
    <T.Mesh position={[0.02, -0.18, 0]} rotation={[0, 0, -0.18]} castShadow>
      <T.BoxGeometry args={[0.04, 0.6, 0.015]} />
      <T.MeshStandardMaterial color={blade} metalness={0.7} roughness={0.3} />
    </T.Mesh>
  </T.Group>
</T.Group>
