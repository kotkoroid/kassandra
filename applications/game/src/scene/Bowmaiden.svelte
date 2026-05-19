<script lang="ts">
  // Angendal Bowmaiden — stationary ranged archer. Behaviour reuses
  // Swain's stationary-projectile AI; this file only owns the
  // visual: female silhouette with a red headband, ranger leathers,
  // green pants, a quiver of arrows over the shoulder, and a curved
  // bow held at her side.

  import { T } from '@threlte/core';
  import { selection } from '../selection.svelte';
  import EntityNameplate from './EntityNameplate.svelte';
  import {
    BOWMAIDEN_BANDAGE_MAT,
    BOWMAIDEN_BOOT_MAT,
    BOWMAIDEN_BOWSTRING_MAT,
    BOWMAIDEN_FLETCH_MAT,
    BOWMAIDEN_HAIR_MAT,
    BOWMAIDEN_LEATHER_MAT,
    BOWMAIDEN_PANTS_MAT,
    BOWMAIDEN_SASH_MAT,
    DARK_WOOD_MAT,
    OAK_MAT,
    RED_HEADBAND_MAT,
    SKIN_TAN_MAT,
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
  }}
>
  <EntityNameplate position={[0, 2.4, 0]} {name} {level} {hpPercent} entityX={position[0]} entityZ={position[2]} />

  <!-- Boots — wraps + sole. -->
  <T.Mesh position={[-0.12, 0.1, 0]} castShadow material={BOWMAIDEN_BOOT_MAT}>
    <T.BoxGeometry args={[0.22, 0.22, 0.28]} />
  </T.Mesh>
  <T.Mesh position={[0.12, 0.1, 0]} castShadow material={BOWMAIDEN_BOOT_MAT}>
    <T.BoxGeometry args={[0.22, 0.22, 0.28]} />
  </T.Mesh>
  <!-- Boot cuffs. -->
  <T.Mesh position={[-0.12, 0.27, 0]} castShadow material={OAK_MAT}>
    <T.CylinderGeometry args={[0.12, 0.12, 0.1, 8]} />
  </T.Mesh>
  <T.Mesh position={[0.12, 0.27, 0]} castShadow material={OAK_MAT}>
    <T.CylinderGeometry args={[0.12, 0.12, 0.1, 8]} />
  </T.Mesh>

  <!-- Long ranger pants. -->
  <T.Mesh position={[-0.12, 0.6, 0]} castShadow material={BOWMAIDEN_PANTS_MAT}>
    <T.CylinderGeometry args={[0.095, 0.095, 0.55, 8]} />
  </T.Mesh>
  <T.Mesh position={[0.12, 0.6, 0]} castShadow material={BOWMAIDEN_PANTS_MAT}>
    <T.CylinderGeometry args={[0.095, 0.095, 0.55, 8]} />
  </T.Mesh>

  <!-- Short leather skirt-flap over the hips. -->
  <T.Mesh position={[0, 0.92, 0]} castShadow material={BOWMAIDEN_LEATHER_MAT}>
    <T.CylinderGeometry args={[0.26, 0.22, 0.2, 8]} />
  </T.Mesh>
  <!-- Dark sash at the waist. -->
  <T.Mesh position={[0, 1.04, 0]} castShadow material={BOWMAIDEN_SASH_MAT}>
    <T.CylinderGeometry args={[0.24, 0.24, 0.06, 8]} />
  </T.Mesh>

  <!-- Leather chestpiece. -->
  <T.Mesh position={[0, 1.3, 0]} castShadow material={BOWMAIDEN_LEATHER_MAT}>
    <T.BoxGeometry args={[0.38, 0.4, 0.24]} />
  </T.Mesh>
  <!-- Chest bumps — same female silhouette cue Player + Janna use. -->
  <T.Mesh position={[-0.09, 1.33, 0.12]} castShadow material={BOWMAIDEN_LEATHER_MAT}>
    <T.SphereGeometry args={[0.08, 10, 10]} />
  </T.Mesh>
  <T.Mesh position={[0.09, 1.33, 0.12]} castShadow material={BOWMAIDEN_LEATHER_MAT}>
    <T.SphereGeometry args={[0.08, 10, 10]} />
  </T.Mesh>

  <!-- Arms — skin showing. -->
  <T.Mesh position={[-0.27, 1.18, 0]} castShadow material={SKIN_TAN_MAT}>
    <T.CylinderGeometry args={[0.065, 0.065, 0.5, 8]} />
  </T.Mesh>
  <T.Mesh position={[0.27, 1.18, 0]} castShadow material={SKIN_TAN_MAT}>
    <T.CylinderGeometry args={[0.065, 0.065, 0.5, 8]} />
  </T.Mesh>
  <!-- Forearm bandage wraps on the bow-hand. -->
  <T.Mesh position={[0.27, 0.93, 0]} castShadow material={BOWMAIDEN_BANDAGE_MAT}>
    <T.CylinderGeometry args={[0.075, 0.075, 0.18, 8]} />
  </T.Mesh>

  <!-- Head + short cropped red hair. -->
  <T.Mesh position={[0, 1.6, 0.03]} castShadow material={SKIN_TAN_MAT}>
    <T.BoxGeometry args={[0.3, 0.3, 0.3]} />
  </T.Mesh>
  <T.Mesh position={[0, 1.74, 0]} castShadow material={BOWMAIDEN_HAIR_MAT}>
    <T.BoxGeometry args={[0.32, 0.18, 0.32]} />
  </T.Mesh>
  <!-- Red headband across the forehead. -->
  <T.Mesh position={[0, 1.66, 0.12]} castShadow material={RED_HEADBAND_MAT}>
    <T.BoxGeometry args={[0.33, 0.06, 0.1]} />
  </T.Mesh>

  <!-- Quiver: a leather tube on the back with arrow shafts and
       fletching poking above the shoulder. -->
  <T.Mesh position={[0, 1.35, -0.18]} castShadow material={OAK_MAT}>
    <T.CylinderGeometry args={[0.09, 0.09, 0.5, 10]} />
  </T.Mesh>
  {#each [-0.04, 0, 0.04] as ox (ox)}
    <T.Mesh position={[ox, 1.78, -0.18]} castShadow material={DARK_WOOD_MAT}>
      <T.CylinderGeometry args={[0.012, 0.012, 0.4, 6]} />
    </T.Mesh>
    <T.Mesh position={[ox, 1.97, -0.18]} castShadow material={BOWMAIDEN_FLETCH_MAT}>
      <T.ConeGeometry args={[0.04, 0.1, 6]} />
    </T.Mesh>
  {/each}

  <!-- Bow held at the right hip, mostly vertical with a slight tilt.
       Two slim cylinders form a flat C-curve; a thin string runs
       between the tips. -->
  <T.Group position={[0.42, 0.95, 0.05]} rotation={[0, 0, 0.15]}>
    <T.Mesh position={[-0.04, 0.18, 0]} rotation={[0, 0, -0.5]} castShadow material={OAK_MAT}>
      <T.CylinderGeometry args={[0.015, 0.015, 0.4, 8]} />
    </T.Mesh>
    <T.Mesh position={[-0.04, -0.18, 0]} rotation={[0, 0, 0.5]} castShadow material={OAK_MAT}>
      <T.CylinderGeometry args={[0.015, 0.015, 0.4, 8]} />
    </T.Mesh>
    <!-- Bowstring -->
    <T.Mesh position={[0.06, 0, 0]} material={BOWMAIDEN_BOWSTRING_MAT}>
      <T.CylinderGeometry args={[0.004, 0.004, 0.72, 4]} />
    </T.Mesh>
  </T.Group>
</T.Group>
