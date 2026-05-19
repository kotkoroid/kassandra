<script lang="ts">
  import { HTML } from '@threlte/extras';
  import { settings } from '../settings.svelte';
  import { world } from '../world.svelte';

  // Floating `Level X | Name` label + hp bar shared by every world
  // entity (Player keeps its own variant because of the chat
  // bubble). Visual numbers stay identical across mobs so any tweak
  // happens here, not in seven copies.
  //
  // Distance culling: when entityX/entityZ are provided the overlay
  // is skipped entirely once the entity is >CULL_DIST units from the
  // player. At that range the nameplate would be a few CSS pixels
  // and below the readable threshold anyway, and the <HTML> portal
  // overhead (getBoundingClientRect + CSS transform per frame) is
  // pure waste.

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
    /** World-space XZ of the parent entity. When supplied, the
     *  nameplate is culled beyond CULL_DIST so distant entities
     *  don't pay the per-frame HTML portal cost. */
    entityX?: number;
    entityZ?: number;
  }
  let { position, name, level, hpPercent, barWidthPx = 64, entityX, entityZ }: Props = $props();

  // zIndexRange clamps every overlay below the HUD's z-50 wrapper —
  // see ui/Hud.svelte for the rationale.

  const CULL_DIST_SQ = 40 * 40;

  const visible = $derived.by(() => {
    if (entityX === undefined || entityZ === undefined) return true;
    const np = world.players.get(world.localPlayerId)!;
    const dx = np.x - entityX;
    const dz = np.z - entityZ;
    return dx * dx + dz * dz <= CULL_DIST_SQ;
  });
</script>

{#if visible}
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
{/if}
