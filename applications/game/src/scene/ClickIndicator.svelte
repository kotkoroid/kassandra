<script lang="ts">
  // Transient "you clicked here" marker: a flat blue ring that
  // appears at the ground click point, expands slightly, and fades
  // out over CLICK_INDICATOR_LIFETIME seconds. Driven imperatively
  // off `performance.now()` so the animation is independent of the
  // sim clock (and stays smooth if the sim ticks slowly).
  //
  // The ring is rendered every frame regardless of expiry — `count`
  // is one mesh, so the cost is negligible — and just clamps to
  // opacity 0 once the lifetime has elapsed. Cheaper than mounting
  // / unmounting the Three.js objects per click.

  import { T, useTask } from '@threlte/core';
  import { DoubleSide, MeshBasicMaterial } from 'three';
  import {
    CLICK_INDICATOR_LIFETIME,
    clickIndicator,
  } from '../clickIndicator.svelte';

  // Inner / outer radii in world units. Tuned so the ring sits
  // comfortably around the player's feet without obscuring them.
  const INNER_R = 0.25;
  const OUTER_R = 0.4;
  // Slight Y lift so the ring doesn't z-fight with the ground mesh.
  const LIFT_Y = 0.04;
  // Final scale at the end of the lifetime — the ring grows outward
  // as it fades for a subtle "ping" feel.
  const SCALE_END = 1.6;

  // Shared material instance so re-clicks don't churn GC. The
  // material's opacity is mutated each frame; Three.js picks the
  // change up via `transparent: true`.
  const ringMaterial = new MeshBasicMaterial({
    color: '#5cb8ff',
    transparent: true,
    opacity: 0,
    depthWrite: false,
    side: DoubleSide,
  });

  let scale = $state(1);

  useTask(() => {
    const ageMs = performance.now() - clickIndicator.spawnedAt;
    const t = ageMs / 1000 / CLICK_INDICATOR_LIFETIME;
    if (t >= 1) {
      ringMaterial.opacity = 0;
      return;
    }
    // Ease-out fade: opacity drops faster at the end so the ring
    // doesn't linger as a faint smudge.
    ringMaterial.opacity = (1 - t) * (1 - t);
    scale = 1 + (SCALE_END - 1) * t;
  });
</script>

<T.Mesh
  position={[clickIndicator.x, LIFT_Y, clickIndicator.z]}
  rotation={[-Math.PI / 2, 0, 0]}
  {scale}
  material={ringMaterial}
>
  <T.RingGeometry args={[INNER_R, OUTER_R, 32]} />
</T.Mesh>
