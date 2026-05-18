<script lang="ts">
  // City lamp posts. Stand just inside the wall ring at evenly
  // spaced angles around the city, skipping any that would land
  // inside the gate opening. Each lamp's `lit` factor follows the
  // day/night clock so the lanterns fade on at dusk and off at dawn.

  import {
    CITY_GATE_ANGLE,
    CITY_GATE_HALF_WIDTH,
    CITY_RADIUS,
    CITY_X,
    CITY_Z,
    isGateAngle,
  } from '../city';
  import { isNightHour, currentHour } from '../sim/systems/time';
  import { NIGHT_END, NIGHT_START } from '../sim/constants';
  import { world } from '../sim/world.svelte';
  import Lamp from './Lamp.svelte';

  // Six lamps, offset by half-spacing so none of them sit on
  // angle 0 (= the gate).
  const COUNT = 8;
  const RING_R = CITY_RADIUS - 1.1;

  const positions = $derived.by(() => {
    const out: { x: number; z: number; rot: number }[] = [];
    for (let i = 0; i < COUNT; i++) {
      const theta = ((i + 0.5) / COUNT) * Math.PI * 2;
      // Defensive: also explicitly drop anything that lands inside
      // the gate gap, even if the offset already handled it.
      if (isGateAngle(theta)) continue;
      // Position just inside the wall ring; lantern faces toward
      // the city centre so the glow throws into town.
      const x = CITY_X + Math.cos(theta) * RING_R;
      const z = CITY_Z + Math.sin(theta) * RING_R;
      // The lantern hangs from the +X side of the post (see
      // Lamp.svelte), so rotating by `theta + π` aims the lantern
      // toward the city centre regardless of which side of the
      // ring the lamp sits on.
      const rot = -(theta + Math.PI);
      out.push({ x, z, rot });
    }
    return out;
  });

  // Smooth day→dusk→night→dawn ramp instead of a hard isNight flip.
  // 1 hour of fade on each end of NIGHT_START / NIGHT_END.
  const FADE_HOURS = 1;
  const lit = $derived.by(() => {
    const h = currentHour(world);
    if (isNightHour(h)) {
      // Edges first: ramping up just after dusk, ramping down just
      // before dawn. Anything in the deep-night middle is 1.
      const sinceDusk = (h - NIGHT_START + 24) % 24;
      const untilDawn = (NIGHT_END - h + 24) % 24;
      const into = Math.min(sinceDusk, untilDawn);
      return Math.min(1, into / FADE_HOURS);
    }
    // Sliver of dusk before NIGHT_START / dawn after NIGHT_END.
    const untilNight = (NIGHT_START - h + 24) % 24;
    const sinceDawn = (h - NIGHT_END + 24) % 24;
    const into = Math.min(untilNight, sinceDawn);
    if (into < FADE_HOURS) return 1 - into / FADE_HOURS;
    return 0;
  });
</script>

{#each positions as p (`${p.x},${p.z}`)}
  <Lamp position={[p.x, 0, p.z]} rotation={p.rot} {lit} />
{/each}
