<script lang="ts">
  import { chat, toggleChat } from '../chat.svelte';
  import { CLASS_SPELLS } from '../classSpells';
  import { selection } from '../selection.svelte';
  import { dispatch } from '../simulation/input';
  import { world } from '../simulation/world.svelte';

  function toggleAutoAttack() {
    dispatch(world, { kind: 'set_auto_attack', on: !world.player.autoAttack });
  }

  function castSpell(spellId: string) {
    const targetId = selection.value && selection.value !== 'player' ? selection.value : null;
    dispatch(world, { kind: 'cast_spell', spellId, targetId });
  }

  // Class spells for the current player (up to 5 shown in number slots).
  const classSpells = $derived(CLASS_SPELLS[world.player.playerClass] ?? []);

  function cooldownFraction(spellId: string): number {
    const readyAt = world.player.spellCooldowns[spellId] ?? 0;
    if (world.time >= readyAt) return 0;
    // We don't store the cooldown duration per-spell here, so we just
    // clamp to a max so the overlay at least shows "cooling down".
    return Math.min((readyAt - world.time) / 15, 1);
  }

  function isOnCooldown(spellId: string): boolean {
    return (world.player.spellCooldowns[spellId] ?? 0) > world.time;
  }

  function secondsLeft(spellId: string): number {
    return Math.max(0, Math.ceil((world.player.spellCooldowns[spellId] ?? 0) - world.time));
  }
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

  <!-- Number slots 1-5: class spells where available, empty otherwise. -->
  {#each [0, 1, 2, 3, 4] as i (i)}
    {@const spell = classSpells[i]}
    {#if spell}
      {@const onCd = isOnCooldown(spell.id)}
      <button
        type="button"
        class="relative flex h-10 w-10 flex-col items-center justify-center border-2 text-xs transition
          {onCd
            ? 'border-amber-900/50 bg-neutral-900/80 text-amber-300/40'
            : 'border-amber-600/80 bg-amber-900/20 text-amber-200 hover:border-amber-300 hover:bg-amber-900/40'}"
        onclick={() => castSpell(spell.id)}
        aria-label="{spell.name} (key {i + 1})"
        title="{spell.name} — {spell.description} (key {i + 1})"
      >
        <span class="absolute top-0.5 left-1 font-mono text-[10px] leading-none text-amber-200/80"
          >{i + 1}</span
        >
        <span class="max-w-full truncate px-0.5 text-[9px] leading-tight">{spell.name}</span>
        {#if onCd}
          <span class="absolute inset-0 flex items-center justify-center bg-black/50 text-[10px] font-bold text-amber-300">
            {secondsLeft(spell.id)}
          </span>
        {/if}
      </button>
    {:else}
      <button
        type="button"
        class="relative flex h-10 w-10 items-center justify-center border-2 border-amber-900/70 bg-neutral-900/80 text-xs text-amber-300/70"
        aria-label="Slot {i + 1}"
        title="Slot {i + 1} (key {i + 1})"
        disabled
      >
        <span class="absolute top-0.5 left-1 font-mono text-[10px] leading-none text-amber-200/80"
          >{i + 1}</span
        >
      </button>
    {/if}
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

  <!-- F-slots (F1-F5). Empty placeholders for now. -->
  {#each [1, 2, 3, 4, 5] as n (n)}
    <button
      type="button"
      class="relative flex h-10 w-10 items-center justify-center border-2 border-amber-900/70 bg-neutral-900/80 text-xs text-amber-300/70 hover:border-amber-300"
      aria-label="Skill slot F{n}"
      title="Skill slot F{n} (key F{n})"
    >
      <span class="absolute top-0.5 left-1 font-mono text-[10px] leading-none text-amber-200/80"
        >F{n}</span
      >
    </button>
  {/each}
</div>
