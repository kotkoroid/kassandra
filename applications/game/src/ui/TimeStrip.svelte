<script lang="ts">
  import {
    currentHour,
    HOURS_PER_CYCLE,
    isNightHour,
    time,
  } from '../time.svelte';

  // Visible window: how many hours are drawn left + right of "now".
  // 4 hours each side + the center hour = 9 visible cells, matching
  // the reference strip the user shared.
  const HALF_VISIBLE = 4;
  // Pixel width of one hour cell. Strip width follows from this.
  const CELL_PX = 60;
  // Reading time.elapsed keeps this $derived reactive to the cycle
  // advancing each frame in Scene.svelte's useTask.
  const hour = $derived(time.elapsed >= 0 ? currentHour() : 0);

  // The center cell is the floor(hour) cell, offset within itself by
  // the fractional part. Pre-compute the visible hours so each cell's
  // background can independently flag night.
  interface Cell {
    label: string;
    offset: number;
    night: boolean;
  }
  const cells = $derived.by<Cell[]>(() => {
    const base = Math.floor(hour);
    const frac = hour - base;
    const out: Cell[] = [];
    for (let i = -HALF_VISIBLE; i <= HALF_VISIBLE; i++) {
      const slotHour =
        ((base + i) % HOURS_PER_CYCLE + HOURS_PER_CYCLE) % HOURS_PER_CYCLE;
      out.push({
        label: slotHour.toString().padStart(2, '0'),
        offset: (i - frac) * CELL_PX,
        night: isNightHour(slotHour),
      });
    }
    return out;
  });

  const night = $derived(isNightHour(hour));
  const stripWidth = (HALF_VISIBLE * 2 + 1) * CELL_PX;
</script>

<div
  class="pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 select-none"
  style:width="{stripWidth}px"
>
  <!-- Phase label so it's obvious what part of the cycle we're in. -->
  <div
    class="mb-1 text-center text-xs font-semibold tracking-[0.4em] uppercase {night
      ? 'text-indigo-200'
      : 'text-amber-200'} [text-shadow:0_1px_2px_rgb(0_0_0_/_0.8)]"
  >
    {night ? 'Night' : 'Adventure'}
  </div>

  <!-- Strip body: mauve base with a vertical "now" tick at the
       center. Each hour cell paints its own night/day background so
       contiguous night cells form one dark band naturally. -->
  <div
    class="relative h-12 overflow-hidden border border-black/40 bg-[#8a6b6e]"
    style:width="{stripWidth}px"
  >
    {#each cells as cell (cell.label + '@' + cell.offset)}
      <div
        class="absolute top-0 flex h-full flex-col items-center justify-between py-1"
        style:width="{CELL_PX}px"
        style:left="calc(50% - {CELL_PX / 2}px + {cell.offset}px)"
        style:background={cell.night ? '#3a2e34' : 'transparent'}
      >
        <div class="h-3 w-px bg-black/60"></div>
        <div
          class="text-lg font-bold {cell.night
            ? 'text-indigo-100'
            : 'text-black/85'}"
        >
          {cell.label}
        </div>
      </div>
    {/each}

    <!-- Center "now" indicator on top of the cells. -->
    <div
      class="pointer-events-none absolute top-0 bottom-0 left-1/2 w-px -translate-x-1/2 bg-amber-300/90"
    ></div>
  </div>
</div>
