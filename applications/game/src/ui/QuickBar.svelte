<script lang="ts">
  import { chat, toggleChat } from '../chat.svelte';
  import { dispatch } from '../sim/input';
  import { world } from '../sim/world.svelte';

  // Auto-attack lives on the simulated player so the toggle is
  // multiplayer-ready. Click dispatches a SimEvent rather than
  // mutating world directly so the input pipeline stays single-source.
  function toggleAutoAttack() {
    dispatch(world, { kind: 'set_auto_attack', on: !world.player.autoAttack });
  }

  // Five item slots (keys 1-5) and five skill slots (keys F1-F5).
  // Nothing is wired into them yet — the labels exist so the bar
  // reads as the right thing visually and keyboard fires the right
  // intent, ready for items/skills to land later.
  const ITEM_SLOTS = [1, 2, 3, 4, 5] as const;
  const SKILL_SLOTS = [1, 2, 3, 4, 5] as const;
</script>

<div class="pointer-events-auto flex items-center gap-1">
  <!-- Auto-attack toggle. Highlighted when on (the engage loop keeps
       slashing until something dies); muted when off (one swing per
       click). -->
  <button
    type="button"
    class="flex h-10 w-10 items-center justify-center border-2 transition {world.player.autoAttack
      ? 'border-amber-400 bg-amber-900/40 text-amber-100'
      : 'border-amber-900/70 bg-neutral-900/80 text-amber-300/70'} hover:border-amber-300 hover:text-amber-100"
    onclick={toggleAutoAttack}
    aria-pressed={world.player.autoAttack}
    aria-label="Toggle auto-attack"
    title="Auto-attack: {world.player.autoAttack ? 'on' : 'off'}"
  >
    <!-- Stylised sword icon. -->
    <svg viewBox="0 0 24 24" class="h-5 w-5" aria-hidden="true">
      <path
        d="M14.5 17.5L17 20l2-2-2.5-2.5M6.5 6.5L4 4l2-2L21 11l-2 2-2.5-2.5-7 7-2.5 2.5L4 18l4-4-1.5-1.5L9 11 6.5 6.5z"
        fill="currentColor"
      />
    </svg>
  </button>

  <!-- Item quick slots (1-5). Empty placeholders for now. -->
  {#each ITEM_SLOTS as n (n)}
    <button
      type="button"
      class="relative flex h-10 w-10 items-center justify-center border-2 border-amber-900/70 bg-neutral-900/80 text-xs text-amber-300/70 hover:border-amber-300"
      aria-label="Item slot {n}"
      title="Item slot {n} (key {n})"
    >
      <span
        class="absolute top-0.5 left-1 font-mono text-[10px] leading-none text-amber-200/80"
        >{n}</span
      >
    </button>
  {/each}

  <!-- Chat button. Highlighted while the chat panel is open. -->
  <button
    type="button"
    class="flex h-10 w-10 items-center justify-center border-2 transition {chat.open
      ? 'border-amber-400 bg-amber-900/40 text-amber-100'
      : 'border-amber-900/70 bg-neutral-900/80 text-amber-300/70'} hover:border-amber-300 hover:text-amber-100"
    onclick={toggleChat}
    aria-pressed={chat.open}
    aria-label="Toggle chat"
    title="Chat (Enter)"
  >
    <svg viewBox="0 0 24 24" class="h-5 w-5" aria-hidden="true">
      <path
        d="M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H8.5L4 21V6a1 1 0 0 1 1-1z"
        fill="currentColor"
      />
    </svg>
  </button>

  <!-- Skill quick slots (F1-F5). Empty placeholders. -->
  {#each SKILL_SLOTS as n (n)}
    <button
      type="button"
      class="relative flex h-10 w-10 items-center justify-center border-2 border-amber-900/70 bg-neutral-900/80 text-xs text-amber-300/70 hover:border-amber-300"
      aria-label="Skill slot F{n}"
      title="Skill slot F{n} (key F{n})"
    >
      <span
        class="absolute top-0.5 left-1 font-mono text-[10px] leading-none text-amber-200/80"
        >F{n}</span
      >
    </button>
  {/each}
</div>
