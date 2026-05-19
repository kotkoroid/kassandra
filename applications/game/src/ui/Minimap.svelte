<script lang="ts">
  import { CITY_RADIUS, CITY_X, CITY_Z, currentHour, isNightHour } from '@kassandra/simulation';
  import { world } from '../world.svelte';

  const player = world.player;

  // Overall clock dial size in CSS pixels. The inner circular
  // minimap is centered inside the ring of hours. SVG viewBox below
  // stays at its original 260×260 user units, so shrinking SIZE
  // (and the radar inset accordingly) rescales the whole widget —
  // ring, ticks, labels, font — uniformly without touching the SVG.
  const SIZE = 182;
  // One pixel smaller than the ring's inner edge so a single-pixel
  // amber border sits between the radar and the hour ring (filled by
  // a circle in the SVG below, matching the outer rim color).
  const MINIMAP_PX = 141;
  const MINIMAP_INSET = (SIZE - MINIMAP_PX) / 2;

  // SVG coordinates for the outer clock face. The ring sits between
  // RING_INNER and RING_OUTER; the hour labels float at LABEL_RADIUS
  // just inside the outermost tick.
  const SVG_HALF = 130;
  const RING_OUTER = 122;
  const RING_INNER = 102;
  const RING_MID = (RING_OUTER + RING_INNER) / 2;
  const LABEL_RADIUS = 112;

  // World units visible in either direction from the player. Half the
  // viewBox (200 / 2 = 100) maps to RANGE world units, so 1 world unit
  // = 100/RANGE map units.
  const RANGE = 15;
  const SCALE = 100 / RANGE;

  function mapX(x: number): number {
    return (x - player.x) * SCALE;
  }
  function mapY(z: number): number {
    return (z - player.z) * SCALE;
  }

  // Position on a circle for a given (possibly fractional) hour.
  // Hour 0 sits at the top of the dial, hours advance clockwise.
  function ringPoint(hour: number, R: number) {
    const rad = (hour * 15 * Math.PI) / 180;
    return { x: Math.sin(rad) * R, y: -Math.cos(rad) * R };
  }

  // The night band wraps midnight (22 → 06). Span = 8h = 120°, so
  // large-arc-flag = 0. sweep-flag = 1 because we're going clockwise.
  const NIGHT_ARC_PATH = (() => {
    const s = ringPoint(22, RING_MID);
    const e = ringPoint(6, RING_MID);
    return `M ${s.x} ${s.y} A ${RING_MID} ${RING_MID} 0 0 1 ${e.x} ${e.y}`;
  })();

  // Major labels every 3 hours. Reads like a clock without crowding.
  const LABEL_HOURS = [0, 3, 6, 9, 12, 15, 18, 21];

  // Reading world.time keeps these reactive to the cycle advancing
  // in the sim tick.
  const hour = $derived(world.time >= 0 ? currentHour(world) : 0);
  const indicatorInner = $derived(ringPoint(hour, RING_INNER));
  const indicatorOuter = $derived(ringPoint(hour, RING_OUTER + 6));
</script>

<div
  class="pointer-events-none absolute top-4 right-4"
  style:width="{SIZE}px"
  style:height="{SIZE}px"
>
  <!-- Clock dial: day/night arcs, hour ticks, sparse labels, and a
       bright amber sweep showing the current hour. -->
  <svg
    viewBox="-{SVG_HALF} -{SVG_HALF} {SVG_HALF * 2} {SVG_HALF * 2}"
    class="absolute inset-0 h-full w-full"
  >
    <!-- Backing under the 1-px gap between the radar and the ring.
         Same amber as the outer rim so the dial reads as bracketed
         by matching borders on both sides of the band. -->
    <circle cx="0" cy="0" r={RING_INNER} fill="rgba(180, 83, 9, 0.7)" />

    <!-- Day band: a thick mauve ring under everything else. -->
    <circle
      cx="0"
      cy="0"
      r={RING_MID}
      fill="none"
      stroke="#8a6b6e"
      stroke-width={RING_OUTER - RING_INNER}
    />
    <!-- Night band overlays the day band between 22 → 06. -->
    <path
      d={NIGHT_ARC_PATH}
      fill="none"
      stroke="#3a2e34"
      stroke-width={RING_OUTER - RING_INNER}
    />

    <!-- Hour ticks. Skipped at labelled positions so the number sits
         alone without a divider cutting through it. -->
    {#each Array.from({ length: 24 }, (_, h) => h) as h (h)}
      {#if h % 3 !== 0}
        {@const inner = ringPoint(h, RING_INNER)}
        {@const outer = ringPoint(h, RING_OUTER)}
        <line
          x1={inner.x}
          y1={inner.y}
          x2={outer.x}
          y2={outer.y}
          stroke="rgba(0,0,0,0.5)"
          stroke-width="0.7"
        />
      {/if}
    {/each}

    <!-- Hour labels around the dial, single digit when < 10. -->
    {#each LABEL_HOURS as h (h)}
      {@const p = ringPoint(h, LABEL_RADIUS)}
      <text
        x={p.x}
        y={p.y}
        text-anchor="middle"
        dominant-baseline="central"
        font-size="11"
        font-weight="700"
        fill="#ffffff"
      >
        {h}
      </text>
    {/each}

    <!-- Current-hour pointer: amber bar that crosses the ring at the
         live hour angle. Fractional hours move it smoothly. -->
    <line
      x1={indicatorInner.x}
      y1={indicatorInner.y}
      x2={indicatorOuter.x}
      y2={indicatorOuter.y}
      stroke="#ffd040"
      stroke-width="3.5"
      stroke-linecap="round"
    />

    <!-- Outer border of the whole dial. Lives here (instead of on the
         minimap) so it traces the rim of the clock, not the radar. -->
    <circle
      cx="0"
      cy="0"
      r={RING_OUTER + 0.5}
      fill="none"
      stroke="rgba(180, 83, 9, 0.7)"
      stroke-width="1"
    />
  </svg>

  <!-- Inner minimap: same -100..100 viewBox as before, but the
       wrapping div is rounded-full so the radar reads as the clock
       face itself. -->
  <div
    class="absolute overflow-hidden rounded-full bg-black/80"
    style:top="{MINIMAP_INSET}px"
    style:left="{MINIMAP_INSET}px"
    style:width="{MINIMAP_PX}px"
    style:height="{MINIMAP_PX}px"
  >
    <svg viewBox="-100 -100 200 200" class="h-full w-full">
      <!-- Range rings for spatial reference. -->
      <circle
        cx="0"
        cy="0"
        r={SCALE * 10}
        class="fill-none stroke-amber-700/30"
        stroke-width="0.5"
      />
      <circle
        cx="0"
        cy="0"
        r={SCALE * 20}
        class="fill-none stroke-amber-700/20"
        stroke-width="0.5"
      />

      <!-- City plaza on the map, drawn before mobs so dots stay on top. -->
      <circle
        cx={mapX(CITY_X)}
        cy={mapY(CITY_Z)}
        r={SCALE * CITY_RADIUS}
        fill="#9a9a9a"
        fill-opacity="0.55"
        stroke="#cfcfcf"
        stroke-width="0.7"
      />

      <!-- World entities. One pass through, colour + size dispatched
           by kind. Cyan = allies, red = swain, dark purple-red =
           spiders (sized by tier), tan = wolf, brown = bear,
           dim grey = troller. -->
      {#each world.entities as e (e.id)}
        {#if e.kind === 'janna'}
          <circle cx={mapX(e.x)} cy={mapY(e.z)} r="3" fill="#5dd6ff" />
        {:else if e.kind === 'swain'}
          <circle cx={mapX(e.x)} cy={mapY(e.z)} r="3" fill="#e44141" />
        {:else if e.kind === 'spider-big'}
          <circle cx={mapX(e.x)} cy={mapY(e.z)} r="3" fill="#9c2a55" />
        {:else if e.kind === 'spider-medium'}
          <circle cx={mapX(e.x)} cy={mapY(e.z)} r="2.2" fill="#9c2a55" />
        {:else if e.kind === 'spider-tiny'}
          <circle cx={mapX(e.x)} cy={mapY(e.z)} r="1.5" fill="#9c2a55" />
        {:else if e.kind === 'wolf'}
          <circle cx={mapX(e.x)} cy={mapY(e.z)} r="3" fill="#9a8266" />
        {:else if e.kind === 'bear'}
          <circle cx={mapX(e.x)} cy={mapY(e.z)} r="3.5" fill="#6b4625" />
        {:else if e.kind === 'troller'}
          <circle cx={mapX(e.x)} cy={mapY(e.z)} r="2.5" fill="#bdbdbd" />
        {/if}
      {/each}

      <!-- Loot bags — gold for kill bags, brighter gold for the
           player's death bag. -->
      {#each world.lootBags as b (b.id)}
        <circle cx={mapX(b.x)} cy={mapY(b.z)} r="6" fill="#d4a23a" opacity="0.3" />
        <circle
          cx={mapX(b.x)}
          cy={mapY(b.z)}
          r="3.5"
          fill={b.isDeathBag ? '#ffd040' : '#d4a23a'}
        />
      {/each}

      <!-- Player — center, yellow with white ring. -->
      <circle cx="0" cy="0" r="4.5" fill="#ffeb80" stroke="#ffffff" stroke-width="1" />
    </svg>
  </div>
</div>
