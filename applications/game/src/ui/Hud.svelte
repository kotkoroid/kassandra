<script lang="ts">
  import { fly } from 'svelte/transition';
  import { STAMINA_MAX, dispatch, getEffectiveStat } from '@kassandra/simulation';
  import { world } from '../world.svelte';

  // Local alias so the existing markup stays readable.
  const player = $derived(world.players[world.localPlayerId]);
  const death = world.death;

  function requestRespawn() {
    dispatch(world, { kind: 'request_respawn' });
  }
  import { bagOpen } from '../bag.svelte';
  import { characterOpen } from '../character.svelte';
  import { lootBagOpen } from '../lootBagOpen.svelte';
  import { socialOpen } from '../social.svelte';
  import { BAG_PICKUP_RADIUS } from '@kassandra/simulation';
  import BagPanel from './BagPanel.svelte';
  import BuffBar from './BuffBar.svelte';
  import CharacterPanel from './CharacterPanel.svelte';
  import Chat from './Chat.svelte';
  import ChatTicker from './ChatTicker.svelte';
  import DialogPanel from './DialogPanel.svelte';
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
    const dx = world.players[world.localPlayerId].x - bag.x;
    const dz = world.players[world.localPlayerId].z - bag.z;
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
  let frameMs = $state(0);
  let frames = 0;
  let last = performance.now();

  function tick() {
    frames += 1;
    const now = performance.now();
    const elapsed = now - last;
    if (elapsed >= 500) {
      fps = Math.round((frames * 1000) / elapsed);
      // Average ms-per-frame across the same sampling window, so the
      // value tracks the FPS reading instead of one noisy frame.
      frameMs = Math.round((elapsed / frames) * 10) / 10;
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

<!-- Reusable liquid-style gauge. Filled portion uses a vertical
     gradient for cylinder shading, a horizontal sheen that slides
     across to suggest motion, and a width transition so changes
     flow instead of snap. Class on the fill chooses the colour
     palette via the <style> block below. -->
{#snippet liquidBar(label: string, value: number, max: number, fillClass: string)}
  {@const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0}
  <!-- Outer container owns the hover group + the tooltip so the
       overflow-hidden on the inner gauge can clip the liquid
       stripes without also clipping the tooltip that floats above. -->
  <div class="group pointer-events-auto relative w-40">
    <div class="relative h-2.5 w-full overflow-hidden border border-black/60 bg-neutral-900 shadow-inner">
      <div class="liquid-fill {fillClass} h-full" style:width="{pct}%">
        <div class="liquid-flow"></div>
        <div class="liquid-meniscus"></div>
      </div>
    </div>
    <div
      class="pointer-events-none absolute -top-7 left-0 border border-amber-700/50 bg-black/95 px-2 py-1 text-xs whitespace-nowrap text-white opacity-0 transition-opacity group-hover:opacity-100"
    >
      {label}: {Math.round(value)} / {Math.round(max)} ({Math.round(pct)}%)
    </div>
  </div>
{/snippet}

<!-- HUD root: a high-z fixed layer that sits above the canvas *and*
     above every `<HTML>` overlay @threlte/extras portals to the body
     (which would otherwise stack over the HUD by DOM order). The
     wrapper is pointer-events-none so the 3D canvas still receives
     mouse input through any HUD gap. -->
<div class="pointer-events-none fixed inset-0 z-50">
<!-- Build / perf badge. Sits just above the bottom taskbar so it
     doesn't overlap the gauges / quickbar / action buttons.
     `z-[60]` keeps it above every panel. -->
<div
  class="pointer-events-none fixed right-3 bottom-16 z-[60] flex flex-col items-end gap-0.5 font-mono text-[11px] leading-tight text-stone-300"
>
  <div class="tracking-[0.25em] uppercase">
    Kassandra <span class="opacity-60">|</span> Alpha Build
  </div>
  <div class="tracking-wider">
    {fps} fps <span class="opacity-60">|</span> {frameMs.toFixed(1)} ms
  </div>
</div>

<Minimap />
<BuffBar />
<SelectionPanel />

{#if !death.alive}
  <div
    class="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/70 [text-shadow:0_2px_6px_rgb(0_0_0_/_0.95)]"
  >
    <div class="flex flex-col items-center">
      <div
        class="text-7xl font-bold tracking-[0.4em] text-red-500 uppercase"
      >
        You Died.
      </div>

      {#if death.summary}
        {@const s = death.summary}
        <div
          class="mt-6 w-[480px] border-2 border-red-800/70 bg-black/80 [text-shadow:0_1px_2px_rgb(0_0_0_/_0.9)]"
        >
          <div class="grid grid-cols-2 border-b border-red-900/60 px-4 py-2 text-center">
            <div>
              <div class="text-[10px] font-semibold tracking-[0.3em] text-red-300/80 uppercase">
                Total Damage
              </div>
              <div class="font-mono text-2xl text-red-200">
                {Math.round(s.totalDamage)}
              </div>
            </div>
            <div>
              <div class="text-[10px] font-semibold tracking-[0.3em] text-red-300/80 uppercase">
                Fight Length
              </div>
              <div class="font-mono text-2xl text-red-200">
                {s.fightSeconds.toFixed(2)}s
              </div>
            </div>
          </div>

          <div class="px-4 py-3">
            {#if s.attackers.length === 0}
              <div class="text-center text-sm text-white/55 italic">
                No attacker on record.
              </div>
            {:else}
              <div class="mb-2 text-[10px] font-semibold tracking-[0.3em] text-red-300/80 uppercase">
                Killers
              </div>
              <ul class="space-y-1.5">
                {#each s.attackers as a (a.monsterId)}
                  {@const pct = s.totalDamage > 0 ? (a.total / s.totalDamage) * 100 : 0}
                  <li class="flex items-center gap-2">
                    <span class="w-28 text-sm text-white/85">{a.name}</span>
                    <span class="w-10 text-right font-mono text-[11px] text-white/55">
                      ×{a.hits}
                    </span>
                    <div class="relative h-3 flex-1 border border-red-900/50 bg-black/60">
                      <div
                        class="h-full bg-red-600/80"
                        style:width="{pct}%"
                      ></div>
                    </div>
                    <span class="w-12 text-right font-mono text-xs text-red-200">
                      {Math.round(a.total)}
                    </span>
                    <span class="w-10 text-right font-mono text-[10px] text-white/55">
                      {Math.round(pct)}%
                    </span>
                  </li>
                {/each}
              </ul>
            {/if}
          </div>
        </div>
      {/if}

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
      {@render liquidBar('Health', player.health, getEffectiveStat(player, 'maxHealth'), 'liquid-fill-health')}
      {@render liquidBar('Mana', player.mana, getEffectiveStat(player, 'maxMana'), 'liquid-fill-mana')}
      {@render liquidBar('Stamina', player.stamina, STAMINA_MAX, 'liquid-fill-stamina')}
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
<DialogPanel />
<Chat />
<ChatTicker />
</div>

<style>
  /* Liquid-gauge fill: vertical gradient gives the bar a glassy
     cylinder shape; the width transition smooths damage spikes /
     regen ticks instead of letting them snap. */
  .liquid-fill {
    position: relative;
    overflow: hidden;
    transition: width 240ms ease-out;
    box-shadow: inset 0 -1px 1px rgb(0 0 0 / 0.4);
  }
  .liquid-fill-health {
    background-image: linear-gradient(
      to bottom,
      #ff7a72 0%,
      #e0463c 45%,
      #7a1414 100%
    );
  }
  .liquid-fill-mana {
    background-image: linear-gradient(
      to bottom,
      #a4e0ff 0%,
      #3aa0e8 45%,
      #163866 100%
    );
  }
  .liquid-fill-stamina {
    background-image: linear-gradient(
      to bottom,
      #ffe28a 0%,
      #f0b040 45%,
      #6a4012 100%
    );
  }

  /* Continuous diagonal stripes — reads as fluid in motion rather
     than a one-shot sweep. The pattern is repeating so the loop
     point is invisible: every pixel of the bar always has something
     moving past it. `pointer-events: none` so tooltips still work. */
  .liquid-flow {
    position: absolute;
    inset: 0;
    pointer-events: none;
    background-image: repeating-linear-gradient(
      115deg,
      rgb(255 255 255 / 0.16) 0,
      rgb(255 255 255 / 0.16) 4px,
      rgb(255 255 255 / 0) 4px,
      rgb(255 255 255 / 0) 12px
    );
    background-size: 24px 100%;
    animation: liquid-flow-slide 1.4s linear infinite;
  }
  @keyframes liquid-flow-slide {
    from { background-position: 0 0; }
    to   { background-position: 24px 0; }
  }

  /* Thin lighter band at the top of the fill that bobs vertically —
     the "meniscus" that sells the fluid surface. Pure CSS, no JS. */
  .liquid-meniscus {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 1px;
    pointer-events: none;
    background: rgb(255 255 255 / 0.55);
    animation: liquid-bob 1.8s ease-in-out infinite;
  }
  @keyframes liquid-bob {
    0%, 100% { transform: translateY(0); }
    50%      { transform: translateY(1px); }
  }
</style>
