<script lang="ts">
  import { fly } from 'svelte/transition';
  import { death } from '../death.svelte';
  import { player, STAMINA_MAX } from '../state.svelte';
  import Minimap from './Minimap.svelte';

  let fps = $state(0);
  let frames = 0;
  let last = performance.now();

  function tick() {
    frames += 1;
    const now = performance.now();
    const elapsed = now - last;
    if (elapsed >= 500) {
      fps = Math.round((frames * 1000) / elapsed);
      frames = 0;
      last = now;
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  // Watch the level-up trigger and show the top-center banner for a
  // fixed window. clearTimeout keeps consecutive levels from causing
  // the banner to disappear too early.
  let levelUpVisible = $state(false);
  let levelShown = $state(1);
  let lastLevelUpTrigger = 0;
  let hideTimer: ReturnType<typeof setTimeout> | null = null;
  $effect(() => {
    if (player.levelUpTrigger !== lastLevelUpTrigger) {
      lastLevelUpTrigger = player.levelUpTrigger;
      levelShown = player.level;
      levelUpVisible = true;
      if (hideTimer) clearTimeout(hideTimer);
      hideTimer = setTimeout(() => {
        levelUpVisible = false;
      }, 2500);
    }
  });
</script>

<div
  class="pointer-events-none absolute top-4 left-4 flex items-baseline gap-4 text-sm text-white/85 [text-shadow:0_1px_2px_rgb(0_0_0_/_0.6)]"
>
  <span class="font-semibold tracking-widest uppercase">Kassandra</span>
  <span class="opacity-70">{fps} fps</span>
</div>

<Minimap />

{#if !death.alive}
  <div
    class="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/70 [text-shadow:0_2px_6px_rgb(0_0_0_/_0.95)]"
  >
    <div class="text-center">
      <div
        class="text-7xl font-bold tracking-[0.4em] text-red-500 uppercase"
      >
        You Died.
      </div>
      <div
        class="mt-4 text-sm font-semibold tracking-[0.3em] text-red-200/80 uppercase"
      >
        Respawning in {Math.max(0, Math.ceil(death.respawnTimer))}…
      </div>
    </div>
  </div>
{/if}

{#if levelUpVisible}
  <div
    class="pointer-events-none absolute top-16 left-1/2 -translate-x-1/2 border-2 border-amber-400 bg-black/80 px-10 py-3 text-center [text-shadow:0_1px_2px_rgb(0_0_0_/_0.85)]"
    transition:fly={{ y: -40, duration: 350 }}
  >
    <div
      class="text-xs font-semibold tracking-[0.4em] text-amber-300 uppercase"
    >
      Level Up
    </div>
    <div class="text-2xl font-bold text-amber-100">Level {levelShown}</div>
  </div>
{/if}

<div
  class="pointer-events-none absolute right-0 bottom-0 left-0 flex items-center justify-between border-t-2 border-amber-700/70 bg-black/90 p-1.5"
>
  <div class="flex items-center gap-2">
    <div class="flex flex-col gap-0.5">
      <div class="group pointer-events-auto relative h-2 w-40 bg-neutral-800">
        <div class="h-full bg-red-600" style:width="{player.health}%"></div>
        <div
          class="pointer-events-none absolute -top-7 left-0 border border-amber-700/50 bg-black/95 px-2 py-1 text-xs whitespace-nowrap text-white opacity-0 transition-opacity group-hover:opacity-100"
        >
          Health: {Math.round(player.health)} ({Math.round(player.health)}%)
        </div>
      </div>
      <div class="group pointer-events-auto relative h-2 w-40 bg-neutral-800">
        <div class="h-full bg-sky-500" style:width="{player.mana}%"></div>
        <div
          class="pointer-events-none absolute -top-7 left-0 border border-amber-700/50 bg-black/95 px-2 py-1 text-xs whitespace-nowrap text-white opacity-0 transition-opacity group-hover:opacity-100"
        >
          Mana: {Math.round(player.mana)} ({Math.round(player.mana)}%)
        </div>
      </div>
      <div class="group pointer-events-auto relative h-2 w-40 bg-neutral-800">
        <div
          class="h-full bg-amber-400"
          style:width="{(player.stamina / STAMINA_MAX) * 100}%"
        ></div>
        <div
          class="pointer-events-none absolute -top-7 left-0 border border-amber-700/50 bg-black/95 px-2 py-1 text-xs whitespace-nowrap text-white opacity-0 transition-opacity group-hover:opacity-100"
        >
          Stamina: {Math.round(player.stamina)} ({Math.round(
            (player.stamina / STAMINA_MAX) * 100,
          )}%)
        </div>
      </div>
    </div>

    <div class="group pointer-events-auto relative flex gap-1">
      {#each [0, 1, 2, 3] as i (i)}
        {@const progress = player.experience / 50}
        {@const fill =
          Math.max(0, Math.min(1, (progress - i * 0.25) / 0.25)) * 100}
        <div
          class="relative h-6 w-6 overflow-hidden rounded-full bg-neutral-800 ring-1 ring-amber-900"
        >
          <div
            class="absolute right-0 bottom-0 left-0 bg-amber-500"
            style:height="{fill}%"
          ></div>
        </div>
      {/each}
      <div
        class="pointer-events-none absolute -top-7 left-0 border border-amber-700/50 bg-black/95 px-2 py-1 text-xs whitespace-nowrap text-white opacity-0 transition-opacity group-hover:opacity-100"
      >
        Experience: {Math.round(player.experience)} ({Math.round(
          (player.experience / 50) * 100,
        )}%)
      </div>
    </div>
  </div>

  <div class="pointer-events-auto flex items-center gap-1.5">
    {#each ['Character', 'Inventory', 'Social', 'Settings'] as label (label)}
      <button
        type="button"
        class="border border-amber-700/50 bg-neutral-900/80 px-3 py-1.5 text-xs font-semibold tracking-wider text-amber-300/90 uppercase transition hover:border-amber-400 hover:bg-amber-900/30 hover:text-amber-100"
      >
        {label}
      </button>
    {/each}
  </div>
</div>
