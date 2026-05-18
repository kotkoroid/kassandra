<script lang="ts">
  import { fly } from 'svelte/transition';
  import { STAMINA_MAX } from '../sim/constants';
  import { dispatch } from '../sim/input';
  import { getEffectiveStat } from '../sim/stats';
  import { world } from '../sim/world.svelte';

  // Local alias so the existing markup stays readable.
  const player = world.player;
  const death = world.death;

  function requestRespawn() {
    dispatch(world, { kind: 'request_respawn' });
  }
  import { bagOpen } from '../bag.svelte';
  import { characterOpen } from '../character.svelte';
  import { lootBagOpen } from '../lootBagOpen.svelte';
  import { socialOpen } from '../social.svelte';
  import { BAG_PICKUP_RADIUS } from '../sim/constants';
  import BagPanel from './BagPanel.svelte';
  import CharacterPanel from './CharacterPanel.svelte';
  import Chat from './Chat.svelte';
  import SocialPanel from './SocialPanel.svelte';

  // Auto-open watcher: once the player walks into pickup range of
  // the bag whose timer was clicked, flip the panel open and clear
  // the pending mark. Also clears if the bag expired mid-walk.
  $effect(() => {
    const pendingId = lootBagOpen.pendingArrival;
    if (!pendingId) return;
    const bag = world.lootBags.find((b) => b.id === pendingId);
    if (!bag) {
      lootBagOpen.pendingArrival = null;
      return;
    }
    const dx = world.player.x - bag.x;
    const dz = world.player.z - bag.z;
    if (dx * dx + dz * dz <= BAG_PICKUP_RADIUS * BAG_PICKUP_RADIUS) {
      lootBagOpen.value = pendingId;
      lootBagOpen.pendingArrival = null;
    }
  });
  import LootBagPanel from './LootBagPanel.svelte';
  import Minimap from './Minimap.svelte';
  import QuickBar from './QuickBar.svelte';
  import SelectionPanel from './SelectionPanel.svelte';
  import Settings from './Settings.svelte';

  let settingsOpen = $state(false);

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

<!-- HUD root: a high-z fixed layer that sits above the canvas *and*
     above every `<HTML>` overlay @threlte/extras portals to the body
     (which would otherwise stack over the HUD by DOM order). The
     wrapper is pointer-events-none so the 3D canvas still receives
     mouse input through any HUD gap. -->
<div class="pointer-events-none fixed inset-0 z-50">
<div
  class="pointer-events-none absolute top-4 left-4 flex items-baseline gap-4 text-sm text-white/85 [text-shadow:0_1px_2px_rgb(0_0_0_/_0.6)]"
>
  <span class="font-semibold tracking-widest uppercase">Kassandra</span>
  <span class="opacity-70">{fps} fps</span>
</div>

<Minimap />
<SelectionPanel />

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
      <button
        type="button"
        class="pointer-events-auto mt-8 border-2 border-red-500/80 bg-black/80 px-8 py-3 text-sm font-semibold tracking-[0.3em] text-red-100 uppercase transition hover:border-red-300 hover:bg-red-900/40 hover:text-white"
        onclick={requestRespawn}
      >
        Respawn
      </button>
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
  class="pointer-events-none absolute right-0 bottom-0 left-0 grid grid-cols-3 items-center border-t-2 border-amber-700/70 bg-black/90 p-1.5"
>
  <div class="flex items-center gap-2 justify-self-start">
    <div class="flex flex-col gap-0.5">
      <div class="group pointer-events-auto relative h-2 w-40 bg-neutral-800">
        <div class="h-full bg-red-600" style:width="{(player.health / getEffectiveStat(player, 'maxHealth')) * 100}%"></div>
        <div
          class="pointer-events-none absolute -top-7 left-0 border border-amber-700/50 bg-black/95 px-2 py-1 text-xs whitespace-nowrap text-white opacity-0 transition-opacity group-hover:opacity-100"
        >
          Health: {Math.round(player.health)} / {getEffectiveStat(player, 'maxHealth')} ({Math.round((player.health / getEffectiveStat(player, 'maxHealth')) * 100)}%)
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
            class="absolute right-0 bottom-0 left-0 bg-amber-500 transition-[height] duration-500 ease-out"
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

  <div class="justify-self-center">
    <QuickBar />
  </div>

  <div class="pointer-events-auto flex items-center gap-1.5 justify-self-end">
    {#each ['Character', 'Inventory', 'Social', 'Settings'] as label (label)}
      <button
        type="button"
        class="border border-amber-700/50 bg-neutral-900/80 px-3 py-1.5 text-xs font-semibold tracking-wider text-amber-300/90 uppercase transition hover:border-amber-400 hover:bg-amber-900/30 hover:text-amber-100"
        onclick={() => {
          if (label === 'Settings') settingsOpen = true;
          if (label === 'Inventory') bagOpen.value = !bagOpen.value;
          if (label === 'Character') characterOpen.value = !characterOpen.value;
          if (label === 'Social') socialOpen.value = !socialOpen.value;
        }}
      >
        {label}
      </button>
    {/each}
  </div>
</div>

{#if settingsOpen}
  <Settings onClose={() => (settingsOpen = false)} />
{/if}

<LootBagPanel />
<BagPanel />
<CharacterPanel />
<SocialPanel />
<Chat />
</div>
