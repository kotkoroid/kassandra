<script lang="ts">
  import { chat, toggleChat } from '../chat.svelte';
  import { CLASS_SPELLS } from '../classSpells';
  import { QUICKBAR_DIGITS, QUICKBAR_FN, getSlots, swapSlots } from '../quickbar.svelte';
  import { selection } from '../selection.svelte';
  import { dispatch, getSpellLevel, localPlayer } from '@kassandra/simulation-domain-library';
  import { world } from '../world.svelte';

  const player = $derived(localPlayer(world));

  function toggleAutoAttack() {
    dispatch(world, { kind: 'set_auto_attack', on: !player.autoAttack });
  }

  function castSpell(spellId: string) {
    const targetId = selection.value && selection.value !== 'player' ? selection.value : null;
    dispatch(world, { kind: 'cast_spell', spellId, targetId });
  }

  // Per-class slot layout (drag-reorderable, persisted to localStorage).
  // Spell metadata lookup by id — used to render the slot from its
  // stored spellId without scanning CLASS_SPELLS each cell.
  const slotIds = $derived(getSlots(player.playerClass));
  const spellById = $derived(
    new Map((CLASS_SPELLS[player.playerClass] ?? []).map((s) => [s.id, s])),
  );

  // Drag state. dragFrom is the slot we picked up; dragOver is the
  // slot currently hovered as a drop target (used purely for visual
  // highlight). Both reset on dragend / drop.
  let dragFrom = $state<number | null>(null);
  let dragOver = $state<number | null>(null);

  function onDragStart(e: DragEvent, slot: number) {
    if (!slotIds[slot]) {
      // Nothing to drag from an empty slot.
      e.preventDefault();
      return;
    }
    dragFrom = slot;
    // Required for Firefox to actually fire dragend; payload itself
    // unused — we read dragFrom directly.
    e.dataTransfer?.setData('text/plain', String(slot));
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
  }

  function onDragOver(e: DragEvent, slot: number) {
    if (dragFrom === null) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    if (dragOver !== slot) dragOver = slot;
  }

  function onDragLeave(slot: number) {
    if (dragOver === slot) dragOver = null;
  }

  function onDrop(e: DragEvent, to: number) {
    e.preventDefault();
    const from = dragFrom;
    dragFrom = null;
    dragOver = null;
    if (from === null || from === to) return;
    swapSlots(player.playerClass, from, to);
  }

  function onDragEnd() {
    dragFrom = null;
    dragOver = null;
  }

  function cooldownFraction(spellId: string): number {
    const readyAt = player.spellCooldowns[spellId] ?? 0;
    if (world.time >= readyAt) return 0;
    // We don't store the cooldown duration per-spell here, so we just
    // clamp to a max so the overlay at least shows "cooling down".
    return Math.min((readyAt - world.time) / 15, 1);
  }

  function isOnCooldown(spellId: string): boolean {
    return (player.spellCooldowns[spellId] ?? 0) > world.time;
  }

  function secondsLeft(spellId: string): number {
    return Math.max(0, Math.ceil((player.spellCooldowns[spellId] ?? 0) - world.time));
  }
</script>

<div class="pointer-events-auto flex items-center gap-1">
  <!-- Auto-attack toggle. Highlighted when on (the engage loop keeps
       slashing until something dies); muted when off (one swing per
       click). -->
  <button
    type="button"
    class="flex h-10 w-10 items-center justify-center border-2 transition {player.autoAttack
      ? 'border-amber-400 bg-amber-900/40 text-amber-100'
      : 'border-amber-900/70 bg-neutral-900/80 text-amber-300/70'} hover:border-amber-300 hover:text-amber-100"
    onclick={toggleAutoAttack}
    aria-pressed={player.autoAttack}
    aria-label="Toggle auto-attack"
    title="Auto-attack: {player.autoAttack ? 'on' : 'off'}"
  >
    <!-- Stylised sword icon. -->
    <svg viewBox="0 0 24 24" class="h-5 w-5" aria-hidden="true">
      <path
        d="M14.5 17.5L17 20l2-2-2.5-2.5M6.5 6.5L4 4l2-2L21 11l-2 2-2.5-2.5-7 7-2.5 2.5L4 18l4-4-1.5-1.5L9 11 6.5 6.5z"
        fill="currentColor"
      />
    </svg>
  </button>

  <!-- One snippet drives both rows so digit (1-5) and F (F1-F5) slots
       use identical drag/drop semantics. The keyboard label differs
       (digit number vs "F{n}") but the slot index in the layout array
       is the source of truth — index < QUICKBAR_DIGITS = digit row,
       otherwise F row. -->
  {#snippet slotCell(i: number)}
    {@const spellId = slotIds[i] ?? null}
    {@const spell = spellId ? (spellById.get(spellId) ?? null) : null}
    {@const onCd = spell ? isOnCooldown(spell.id) : false}
    {@const isDragSrc = dragFrom === i}
    {@const isDropTgt = dragOver === i && dragFrom !== null && dragFrom !== i}
    {@const keyLabel = i < QUICKBAR_DIGITS ? String(i + 1) : `F${i - QUICKBAR_DIGITS + 1}`}
    {@const spellLvl = spell ? getSpellLevel(player, spell.id) : 0}
    {#if spell}
      <button
        type="button"
        draggable="true"
        ondragstart={(e) => onDragStart(e, i)}
        ondragover={(e) => onDragOver(e, i)}
        ondragleave={() => onDragLeave(i)}
        ondrop={(e) => onDrop(e, i)}
        ondragend={onDragEnd}
        class="relative flex h-10 w-10 flex-col items-center justify-center border-2 text-xs transition
          {onCd
            ? 'border-amber-900/50 bg-neutral-900/80 text-amber-300/40'
            : 'border-amber-600/80 bg-amber-900/20 text-amber-200 hover:border-amber-300 hover:bg-amber-900/40'}
          {isDragSrc ? 'opacity-40' : ''}
          {isDropTgt ? 'ring-2 ring-amber-300 ring-offset-1 ring-offset-black' : ''}"
        onclick={() => castSpell(spell.id)}
        aria-label="{spell.name} (key {keyLabel})"
        title="{spell.name} — {spell.description} (key {keyLabel}). Drag to reorder."
      >
        <span class="absolute top-0.5 left-1 font-mono text-[10px] leading-none text-amber-200/80"
          >{keyLabel}</span
        >
        <span class="max-w-full truncate px-0.5 text-[9px] leading-tight">{spell.name}</span>
        <!-- Spell level badge (bottom-right). Shown for any learned
             spell (level ≥ 1); rendered above the cooldown overlay so
             the player can still see their investment while the spell
             is recharging. -->
        {#if spellLvl > 0}
          <span
            class="pointer-events-none absolute right-0.5 bottom-0 z-10 font-mono text-[10px] leading-none text-amber-300"
            >{spellLvl}</span
          >
        {/if}
        {#if onCd}
          <span class="absolute inset-0 flex items-center justify-center bg-black/50 text-[10px] font-bold text-amber-300">
            {secondsLeft(spell.id)}
          </span>
        {/if}
      </button>
    {:else}
      <div
        role="button"
        tabindex="-1"
        ondragover={(e) => onDragOver(e, i)}
        ondragleave={() => onDragLeave(i)}
        ondrop={(e) => onDrop(e, i)}
        class="relative flex h-10 w-10 items-center justify-center border-2 border-amber-900/70 bg-neutral-900/80 text-xs text-amber-300/70
          {isDropTgt ? 'ring-2 ring-amber-300 ring-offset-1 ring-offset-black' : ''}"
        aria-label="Slot {keyLabel}"
        title="Slot {keyLabel}. Drop a spell here to assign."
      >
        <span class="absolute top-0.5 left-1 font-mono text-[10px] leading-none text-amber-200/80"
          >{keyLabel}</span
        >
      </div>
    {/if}
  {/snippet}

  <!-- Digit row: slots 0..QUICKBAR_DIGITS-1 (keys 1-5). -->
  {#each Array(QUICKBAR_DIGITS) as _, i (i)}
    {@render slotCell(i)}
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

  <!-- F row: slots QUICKBAR_DIGITS..QUICKBAR_DIGITS+QUICKBAR_FN-1 (keys F1-F5). -->
  {#each Array(QUICKBAR_FN) as _, i (i)}
    {@render slotCell(QUICKBAR_DIGITS + i)}
  {/each}
</div>
