<script lang="ts">
  import { clearSelection, getSelectionView, selection } from '../selection.svelte';

  // Re-evaluating each render keeps the panel live as the selected
  // entity moves and takes damage; reading `selection.value` first
  // is what makes it reactive in $derived.
  const view = $derived(selection.value ? getSelectionView() : null);
</script>

{#if view}
  <div
    class="pointer-events-auto absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-3 border-2 border-amber-800/80 bg-gradient-to-b from-[#5a2a2a] to-[#2a1010] px-3 py-2 [text-shadow:0_1px_2px_rgb(0_0_0_/_0.85)]"
  >
    <!-- Circular portrait slot — no art yet, so a single coloured
         disc keeps the layout intact. -->
    <div
      class="flex h-12 w-12 items-center justify-center rounded-full border-2 border-amber-700/80 bg-neutral-900 text-xs font-semibold tracking-widest text-amber-300 uppercase"
    >
      {view.name.slice(0, 1) || '?'}
    </div>

    <div class="flex min-w-[220px] flex-col gap-1">
      <!-- Name + level + close button row. -->
      <div
        class="flex items-center justify-between gap-3 border border-amber-900/60 bg-black/40 px-2 py-0.5 text-xs"
      >
        <span class="font-semibold text-white whitespace-nowrap">
          <span class="text-amber-300">Lv.{view.level}</span>
          <span class="text-white/60">·</span>
          <span class="text-white">{view.name}</span>
        </span>
        <button
          type="button"
          class="text-amber-300/80 hover:text-amber-100"
          onclick={clearSelection}
          aria-label="Clear selection"
        >
          ✕
        </button>
      </div>
      <!-- HP bar + numeric readout. -->
      <div class="relative h-3 w-full border border-amber-900/60 bg-black/70">
        <div
          class="h-full bg-red-600"
          style:width="{Math.max(0, Math.min(1, view.hp / view.maxHp)) * 100}%"
        ></div>
        <div
          class="absolute inset-0 flex items-center justify-center text-[10px] font-mono leading-none text-white"
        >
          HP {Math.round(view.hp)} / {Math.round(view.maxHp)}
        </div>
      </div>
    </div>
  </div>
{/if}
