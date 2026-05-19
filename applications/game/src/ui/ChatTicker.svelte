<script lang="ts">
  // Transient overlay that surfaces incoming chat lines while the
  // full chat panel is closed. Each line fades out 5 s after the
  // ticker first observed it, so the player can read system /
  // ambient / other-player messages without having to open chat.
  //
  // Bookkeeping is purely UI-side: the world's message log is
  // append-only and we never mutate it. We just stamp each message's
  // id with a `performance.now()` "first seen" value the first time
  // we lay eyes on it, then filter by age at render time.

  import { onMount } from 'svelte';
  import { chat } from '../chat.svelte';
  import type { ChatMessage } from '../sim/types';
  import { world } from '../sim/world.svelte';

  const TTL_MS = 5000;
  const FADE_MS = 600;
  // Hard cap on simultaneously-visible lines. Beyond this the
  // oldest still-living lines get clipped so a chat-spam burst
  // doesn't tile up past the rest of the HUD.
  const MAX_VISIBLE = 8;

  // `now` is the clock the visible-set derivation reads. Bumped on
  // a coarse 200 ms timer so messages slide out of the window
  // without us repainting at every animation frame.
  let now = $state(performance.now());

  // Per-message stamp: when did the ticker first see this id? Map
  // lives at component scope so a refresh of `world.chat.messages`
  // doesn't reset the timers of already-seen lines.
  const firstSeen = new Map<string, number>();

  // Subscribe to the messages array so newly-pushed lines get a
  // stamp as soon as they arrive — without waiting for the next
  // tick of the 200 ms timer.
  $effect(() => {
    // Reading the length subscribes the effect to push/pop.
    world.chat.messages.length;
    const t = performance.now();
    for (const msg of world.chat.messages) {
      if (!firstSeen.has(msg.id)) firstSeen.set(msg.id, t);
    }
  });

  onMount(() => {
    const handle = setInterval(() => {
      now = performance.now();
    }, 200);
    return () => clearInterval(handle);
  });

  interface TickerLine {
    msg: ChatMessage;
    opacity: number;
  }

  const visible = $derived.by<TickerLine[]>(() => {
    const t = now;
    const out: TickerLine[] = [];
    // Walk from newest to oldest so the natural slice for the cap
    // keeps the most recent lines visible.
    for (let i = world.chat.messages.length - 1; i >= 0; i--) {
      const msg = world.chat.messages[i]!;
      const seenAt = firstSeen.get(msg.id);
      if (seenAt === undefined) continue;
      const age = t - seenAt;
      if (age >= TTL_MS) continue;
      let opacity = 1;
      if (age > TTL_MS - FADE_MS) {
        opacity = Math.max(0, (TTL_MS - age) / FADE_MS);
      }
      out.push({ msg, opacity });
      if (out.length >= MAX_VISIBLE) break;
    }
    // Flip back to chronological order so the newest line sits at
    // the bottom — same reading direction as the open chat panel.
    return out.reverse();
  });
</script>

{#if !chat.open && visible.length > 0}
  <!-- Mirror the open chat panel's horizontal layout: same bottom
       offset, centered on the screen, same 640 px width. That way
       the ticker reads as the "closed" continuation of the same
       channel — opening chat doesn't shift the line positions. -->
  <div
    class="pointer-events-none absolute bottom-20 left-1/2 w-[640px] -translate-x-1/2 px-3 font-sans text-sm text-white/95 [text-shadow:0_1px_2px_rgb(0_0_0_/_0.85)]"
  >
    {#each visible as v (v.msg.id)}
      <div class="leading-tight" style:opacity={v.opacity}>
        <span class="text-amber-300">{v.msg.author}</span><span class="text-white/50"
          >:</span
        >
        {v.msg.text}
      </div>
    {/each}
  </div>
{/if}
