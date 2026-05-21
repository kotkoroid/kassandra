<script lang="ts">
  // Single buff/debuff tile. Pure declarative: the fill height and
  // tile opacity are both `$derived` from `world.time`, so the tile
  // always reflects the current remaining duration the moment the
  // sim updates.
  //
  // The fill div has a short CSS `transition: height` so the
  // per-tick height step is interpolated between frames by the
  // browser. Earlier attempts to drive the animation imperatively
  // (CSS transition delays, Web Animations API) had mount-timing
  // races that left the tile invisible — keeping everything in the
  // template removes that whole class of bug.

  import type { ActiveEffect } from '@kassandra/simulation-domain-library';
  import { world } from '../world.svelte';

  interface Props {
    effect: ActiveEffect;
  }
  let { effect }: Props = $props();

  const FADE_SECONDS = 1;

  const isBuff = $derived(effect.kind === 'buff');

  // Fraction of the effect still to run, 0..1. Permanent effects
  // (no expiresAt) stay at 1 forever.
  const fillFraction = $derived.by(() => {
    if (effect.expiresAt === undefined) return 1;
    const total = Math.max(0.001, effect.expiresAt - effect.appliedAt);
    const left = effect.expiresAt - world.time;
    return Math.max(0, Math.min(1, left / total));
  });

  // Tile opacity ramps 1 → 0 over the last FADE_SECONDS of the
  // effect's life. Permanent effects stay at 1.
  const tileOpacity = $derived.by(() => {
    if (effect.expiresAt === undefined) return 1;
    const left = effect.expiresAt - world.time;
    if (left >= FADE_SECONDS) return 1;
    return Math.max(0, left / FADE_SECONDS);
  });

  // Whole-second readout for the tooltip.
  function remainingSeconds(effect: ActiveEffect, now: number): number | null {
    if (effect.expiresAt === undefined) return null;
    return Math.max(0, Math.ceil(effect.expiresAt - now));
  }

  function formatStat(delta: number, unit?: string): string {
    const sign = delta >= 0 ? '+' : '';
    return `${sign}${delta}${unit ?? ''}`;
  }
</script>

<div
  class="group relative pointer-events-auto"
  style:opacity={tileOpacity}
>
  <!-- Outer tile: border + dark substrate. The substrate shows
       through wherever the colored fill has receded. -->
  <div
    class="relative h-9 w-9 overflow-hidden border bg-black/70 {isBuff
      ? 'border-emerald-500'
      : 'border-red-500'}"
    aria-label={effect.name}
  >
    <!-- Countdown fill. Anchored to the bottom; height drains with
         `fillFraction`. CSS transition smooths the per-frame step
         so the visible motion stays continuous between sim ticks. -->
    <div
      class="absolute inset-x-0 bottom-0 {isBuff
        ? 'bg-emerald-600/70'
        : 'bg-red-600/70'}"
      style:height="{fillFraction * 100}%"
      style:transition="height 80ms linear"
    ></div>
    <!-- Icon sits above the fill so it stays legible at every
         remaining-fraction. -->
    <div
      class="relative flex h-full w-full items-center justify-center text-xl leading-none select-none"
    >
      {effect.icon}
    </div>
  </div>

  <!-- Tooltip. Plain CSS :group-hover so we don't need JS open
       state. Anchored to the left edge so a long row doesn't push
       it off-screen. -->
  <div
    class="pointer-events-none invisible absolute top-full left-0 z-10 mt-1 w-max min-w-[180px] border bg-black/90 px-2 py-1.5 text-xs text-white opacity-0 transition-opacity group-hover:visible group-hover:opacity-100 {isBuff
      ? 'border-emerald-500'
      : 'border-red-500'}"
  >
    <div class="mb-1 font-semibold {isBuff ? 'text-emerald-300' : 'text-red-300'}">
      {effect.name}
    </div>
    {#each effect.stats as s, i (i)}
      <div class="whitespace-nowrap">
        {s.label}
        <span class={s.delta >= 0 ? 'text-emerald-300' : 'text-red-300'}>
          {formatStat(s.delta, s.unit)}
        </span>
      </div>
    {/each}
    {#if remainingSeconds(effect, world.time) !== null}
      <div class="mt-1 text-white/70">
        Remaining: {remainingSeconds(effect, world.time)} s
      </div>
    {/if}
    <div class="text-white/70">Source: {effect.source}</div>
  </div>
</div>
