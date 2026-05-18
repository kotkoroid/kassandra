<script lang="ts">
  import { HTML } from '@threlte/extras';
  import { settings } from '../settings.svelte';

  // Floating `Level X | Name` label + hp bar shared by every world
  // entity (Player keeps its own variant because of the chat
  // bubble). Visual numbers stay identical across mobs so any tweak
  // happens here, not in seven copies.

  interface Props {
    /** Local-space anchor for the HTML overlay, relative to the
     *  parent T.Group. */
    position: [number, number, number];
    name: string;
    level: number;
    /** 0..1 — clamped before rendering. */
    hpPercent: number;
    /** HP bar width in CSS pixels. Smaller monsters (spider tiers,
     *  troller) feel right at 56; the rest sit at 64. */
    barWidthPx?: number;
  }
  let { position, name, level, hpPercent, barWidthPx = 64 }: Props = $props();

  // zIndexRange clamps every overlay below the HUD's z-50 wrapper —
  // see ui/Hud.svelte for the rationale.
</script>

<HTML {position} center pointerEvents="none" zIndexRange={[40, 0]}>
  <div
    class="flex flex-col items-center gap-0.5 [text-shadow:0_1px_2px_rgb(0_0_0_/_0.85)]"
  >
    {#if settings.showNames}
      <div
        class="flex items-baseline gap-1 text-xs font-semibold whitespace-nowrap"
      >
        <span class="text-amber-400">Level {level}</span>
        <span class="text-white/50">|</span>
        <span class="text-white">{name}</span>
      </div>
    {/if}
    <div
      class="h-1.5 border border-red-950 bg-black/70"
      style:width="{barWidthPx}px"
    >
      <div
        class="h-full bg-red-600"
        style:width="{Math.max(0, Math.min(1, hpPercent)) * 100}%"
      ></div>
    </div>
  </div>
</HTML>
