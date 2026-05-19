<script lang="ts">
  import { Canvas, T } from '@threlte/core';
  import { characterOpen } from '../character.svelte';
  import { CLASS_SPELLS, MAX_CLASS_SPELLS } from '../classSpells';
  import { PLAYER_CLASSES } from '../cosmetics';
  import { getItem, EXP_PER_LEVEL, SPEED_NORMAL, STAMINA_MAX, getEffectiveStat } from '@kassandra/simulation';
  import Player from '../scene/Player.svelte';
  import { world } from '../world.svelte';

  const player = world.player;

  // Slow turntable so the portrait isn't static. The animation loop
  // only runs while the dialog is open.
  let portraitRotation = $state(0);
  $effect(() => {
    if (!characterOpen.value) return;
    let last = performance.now();
    let raf: number;
    function step(now: number) {
      const delta = (now - last) / 1000;
      last = now;
      portraitRotation += delta * 0.5;
      raf = requestAnimationFrame(step);
    }
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  });

  const maxHp = $derived(getEffectiveStat(player, 'maxHealth'));
  const maxMana = $derived(getEffectiveStat(player, 'maxMana'));
  const damage = $derived(getEffectiveStat(player, 'damage'));
  const attackSpeed = $derived(getEffectiveStat(player, 'attackSpeed'));
  const healthRegen = $derived(getEffectiveStat(player, 'healthRegen'));
  const weapon = $derived(getItem(player.equippedWeaponId));

  // Tabbed content. Only Status and Abilities are wired today;
  // Emotions / Missions are rendered as disabled placeholders so
  // the panel reads as a real character sheet.
  type Tab = 'status' | 'abilities' | 'emotions' | 'quests';
  let activeTab = $state<Tab>('status');

  // Quest log: three collapsible categories matching the
  // inspiration's Game / Book / Daily split. No quest state lives
  // on the player today, so every section reads "No active quests".
  const questCategories: { key: string; label: string }[] = [
    { key: 'game', label: 'Game Missions' },
    { key: 'book', label: 'Mission Book Quests' },
    { key: 'daily', label: 'Daily Quests' },
  ];
  let questCollapsed = $state<Record<string, boolean>>({
    game: false,
    book: true,
    daily: true,
  });

  // Emotions: three slot grids matching the inspiration's
  // Normal / Couple / New rows. Pure UI scaffold for now — no
  // unlocked-emote state lives on the player yet, so every cell is
  // empty.
  const EMOTE_COLS = 6;
  const emoteSections = [
    { label: 'Normal Gestures', rows: 3 },
    { label: 'Couple Gestures', rows: 1 },
    { label: 'New Gestures', rows: 2 },
  ];

  // Abilities sub-grid. 6×4 trained slots + a smaller "Standard
  // Skills" strip. With no abilities trained yet every cell renders
  // empty — once player.abilities populates, slots fill in order.
  const ABILITY_COLS = 6;
  const ABILITY_ROWS = 4;
  const STANDARD_SKILL_COUNT = 4;
  const trainedCells = $derived.by(() => {
    const slots: (typeof player.abilities[number] | null)[] = [];
    const active = player.abilities.filter((a) => a.kind === 'active');
    for (let i = 0; i < ABILITY_COLS * ABILITY_ROWS; i++) {
      slots.push(active[i] ?? null);
    }
    return slots;
  });
  const passiveCells = $derived.by(() => {
    const slots: (typeof player.abilities[number] | null)[] = [];
    const passive = player.abilities.filter((a) => a.kind === 'passive');
    for (let i = 0; i < STANDARD_SKILL_COUNT; i++) {
      slots.push(passive[i] ?? null);
    }
    return slots;
  });

  // Class Spells: exactly six fixed slots per class, sourced from
  // the static CLASS_SPELLS catalog. Empty slots remain visible so
  // the player can see how many spells their class will gain.
  const classSpellCells = $derived.by(() => {
    const defs = CLASS_SPELLS[player.playerClass];
    const slots: (typeof defs[number] | null)[] = [];
    for (let i = 0; i < MAX_CLASS_SPELLS; i++) {
      slots.push(defs[i] ?? null);
    }
    return slots;
  });

  // Two parallel columns of stat rows, mirroring the inspiration's
  // VIT/INT/STR/DEX on the left and HP/SP/Atk/Def on the right.
  const statusLeft = $derived([
    { label: 'Class', value: PLAYER_CLASSES[player.playerClass].label },
    { label: 'Level', value: String(player.level) },
    { label: 'Damage', value: String(Math.round(damage)) },
    { label: 'Regen', value: `${healthRegen.toFixed(1)}/s` },
  ]);
  const statusRight = $derived([
    { label: 'HP', value: `${Math.round(player.health)}/${Math.round(maxHp)}` },
    { label: 'SP', value: `${Math.round(player.mana)}/${Math.round(maxMana)}` },
    { label: 'Stamina', value: `${Math.round(player.stamina)}/${STAMINA_MAX}` },
    { label: 'Atk Speed', value: `${attackSpeed.toFixed(2)}/s` },
  ]);
</script>

{#snippet statRow(label: string, value: string)}
  <div class="flex items-center gap-1.5">
    <span class="w-14 text-[10px] font-semibold tracking-wider text-amber-300/80 uppercase">
      {label}
    </span>
    <span class="flex-1 border border-amber-700/40 bg-black/50 px-1.5 py-0.5 text-center font-mono text-[11px] text-white">
      {value}
    </span>
  </div>
{/snippet}

{#if characterOpen.value}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    class="pointer-events-auto absolute inset-0 flex items-center justify-center bg-black/50"
    role="dialog"
    aria-modal="true"
    aria-label="Character"
    tabindex="-1"
    onclick={() => (characterOpen.value = false)}
    onkeydown={(e) => {
      if (e.key === 'Escape') characterOpen.value = false;
    }}
  >
    <div
      class="flex max-h-[90vh] w-[340px] flex-col border-2 border-amber-700/70 bg-neutral-900/95 [text-shadow:0_1px_2px_rgb(0_0_0_/_0.6)]"
      role="document"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.stopPropagation()}
    >
      <!-- Title bar -->
      <div
        class="flex items-center justify-between border-b border-amber-700/40 bg-gradient-to-r from-stone-900 via-amber-950/60 to-stone-900 px-4 py-2"
      >
        <h2
          class="flex-1 text-center text-sm font-semibold tracking-[0.4em] text-amber-200 uppercase"
        >
          Character
        </h2>
        <button
          type="button"
          class="text-amber-300/80 hover:text-amber-100"
          onclick={() => (characterOpen.value = false)}
          aria-label="Close character"
        >
          ✕
        </button>
      </div>

      <!-- Scrollable body: portrait + level boxes + tabbed content.
           Constrained so the dialog fits in viewport. -->
      <div class="flex-1 overflow-y-auto">

      <!-- Portrait + name plate -->
      <div class="flex gap-2 p-3">
        <div class="h-20 w-20 shrink-0 border-2 border-amber-700/50 bg-stone-950/70">
          <Canvas>
            <T.Color attach="background" args={['#0d0d0d']} />
            <T.PerspectiveCamera
              makeDefault
              fov={20}
              position={[0, 1.55, 2.4]}
              oncreate={(c) => c.lookAt(0, 1.55, 0)}
            />
            <T.AmbientLight intensity={0.7} />
            <T.DirectionalLight position={[2, 4, 3]} intensity={1.1} />
            <Player
              position={[0, 0, 0]}
              rotation={portraitRotation}
              speed={0}
              slashTrigger={0}
            />
          </Canvas>
        </div>

        <div class="flex flex-1 flex-col justify-center gap-1.5">
          <div class="border border-amber-700/40 bg-black/60 px-2 py-1 text-center text-sm font-semibold tracking-wider text-white">
            {player.name || '—'}
          </div>
          <div class="text-center text-[10px] font-semibold tracking-[0.3em] text-amber-300/80 uppercase">
            {PLAYER_CLASSES[player.playerClass].label}
          </div>
        </div>
      </div>

      <!-- Level / EXP / Necessary EXP -->
      <div class="grid grid-cols-3 gap-1.5 px-3">
        <div class="border border-amber-700/40 bg-black/40">
          <div class="border-b border-amber-700/30 bg-stone-950/60 px-1.5 py-0.5 text-center text-[9px] font-bold tracking-widest text-red-400 uppercase">
            Level
          </div>
          <div class="px-1.5 py-1 text-center font-mono text-xs text-white">
            {player.level}
          </div>
        </div>
        <div class="border border-amber-700/40 bg-black/40">
          <div class="border-b border-amber-700/30 bg-stone-950/60 px-1.5 py-0.5 text-center text-[9px] font-bold tracking-widest text-amber-300 uppercase">
            EXP
          </div>
          <div class="px-1.5 py-1 text-center font-mono text-xs text-white">
            {Math.round(player.experience)}
          </div>
        </div>
        <div class="border border-amber-700/40 bg-black/40">
          <div class="border-b border-amber-700/30 bg-stone-950/60 px-1.5 py-0.5 text-center text-[9px] font-bold tracking-widest text-amber-300 uppercase">
            Next
          </div>
          <div class="px-1.5 py-1 text-center font-mono text-xs text-white">
            {EXP_PER_LEVEL}
          </div>
        </div>
      </div>

      {#if activeTab === 'status'}
        <!-- Character Status -->
        <div class="mt-3 px-3">
          <div class="mb-2 border-b border-amber-700/40 text-sm font-bold tracking-widest text-amber-300 uppercase">
            Character Status
          </div>
          <div class="grid grid-cols-2 gap-x-4 gap-y-1.5">
            <div class="flex flex-col gap-1.5">
              {#each statusLeft as row (row.label)}
                {@render statRow(row.label, row.value)}
              {/each}
            </div>
            <div class="flex flex-col gap-1.5">
              {#each statusRight as row (row.label)}
                {@render statRow(row.label, row.value)}
              {/each}
            </div>
          </div>
        </div>

        <!-- Attributes -->
        <div class="mt-3 px-3 pb-3">
          <div class="mb-2 border-b border-amber-700/40 text-sm font-bold tracking-widest text-amber-300 uppercase">
            Attributes
          </div>
          <div class="grid grid-cols-2 gap-x-4 gap-y-1.5">
            {@render statRow('Moving Speed', String(SPEED_NORMAL))}
            {@render statRow('Weapon', weapon?.name ?? '—')}
          </div>
        </div>
      {:else if activeTab === 'abilities'}
        <!-- Abilities: 6×4 active grid + standard skills strip.
             Every cell is empty today; once player.abilities gets
             populated by class skills / ability books, slots fill
             in declaration order. Hovering a filled slot will show
             a tooltip with stats (level, recharge, SP cost, etc.) —
             that lives in this same panel when abilities exist. -->
        <!-- Class Spells: the six signature spells of the
             current class, with their own dedicated point pool
             (classSpellPoints) distinct from general skillPoints.
             Always six slots so empty ones read as "to be unlocked"
             rather than "none." -->
        <div class="mt-3 px-3">
          <div class="mb-2 flex items-center justify-between border-b border-amber-700/40">
            <span class="text-sm font-bold tracking-widest text-amber-300 uppercase">
              Class Spells
            </span>
            <span class="text-xs font-semibold tracking-wider text-amber-200/90">
              Available <span class="font-mono text-amber-300">{player.classSpellPoints}</span>
            </span>
          </div>
          <div
            class="grid gap-1 rounded-sm border border-amber-900/40 bg-black/40 p-1.5"
            style:grid-template-columns="repeat({MAX_CLASS_SPELLS}, minmax(0, 1fr))"
          >
            {#each classSpellCells as spell, i (i)}
              <div
                class="relative flex aspect-square items-center justify-center border bg-stone-950/70 {spell
                  ? 'border-amber-600/70'
                  : 'border-amber-900/40'}"
                title={spell?.name ?? ''}
              >
                {#if spell}
                  <span class="font-mono text-base font-bold text-amber-200">
                    {spell.name.charAt(0).toUpperCase()}
                  </span>
                  {#if spell.level > 0}
                    <span class="absolute right-0.5 bottom-0 font-mono text-[10px] leading-none text-amber-300">
                      {spell.level}
                    </span>
                  {/if}
                {/if}
              </div>
            {/each}
          </div>
        </div>

        <div class="mt-3 px-3">
          <div class="mb-2 flex items-center justify-between border-b border-amber-700/40">
            <span class="text-sm font-bold tracking-widest text-amber-300 uppercase">
              Active Skills
            </span>
            <span class="text-xs font-semibold tracking-wider text-amber-200/90">
              Available <span class="font-mono text-amber-300">{player.skillPoints}</span>
            </span>
          </div>
          <div
            class="grid gap-1 rounded-sm border border-amber-900/40 bg-black/40 p-1.5"
            style:grid-template-columns="repeat({ABILITY_COLS}, minmax(0, 1fr))"
          >
            {#each trainedCells as ability, i (i)}
              <div
                class="relative flex aspect-square items-center justify-center border bg-stone-950/70 {ability
                  ? 'border-amber-600/70'
                  : 'border-amber-900/40'}"
                title={ability?.name ?? ''}
              >
                {#if ability}
                  <span class="font-mono text-base font-bold text-amber-200">
                    {ability.name.charAt(0).toUpperCase()}
                  </span>
                  {#if ability.level > 0}
                    <span class="absolute right-0.5 bottom-0 font-mono text-[10px] leading-none text-amber-300">
                      {ability.level}
                    </span>
                  {/if}
                {/if}
              </div>
            {/each}
          </div>
        </div>

        <div class="mt-3 px-3 pb-3">
          <div class="mb-2 border-b border-amber-700/40 text-sm font-bold tracking-widest text-amber-300 uppercase">
            Standard Skills
          </div>
          <div
            class="grid gap-1 rounded-sm border border-amber-900/40 bg-black/40 p-1.5"
            style:grid-template-columns="repeat({STANDARD_SKILL_COUNT}, minmax(0, 1fr))"
          >
            {#each passiveCells as ability, i (i)}
              <div
                class="relative flex aspect-square items-center justify-center border bg-stone-950/70 {ability
                  ? 'border-amber-600/70'
                  : 'border-amber-900/40'}"
                title={ability?.name ?? ''}
              >
                {#if ability}
                  <span class="font-mono text-base font-bold text-amber-200">
                    {ability.name.charAt(0).toUpperCase()}
                  </span>
                {/if}
              </div>
            {/each}
          </div>
        </div>
      {:else if activeTab === 'emotions'}
        <!-- Emotions: three slot bands, mirroring the inspiration's
             Normal / Couple / New gesture rows. Empty until an
             unlocked-emote list lives on the player. -->
        <div class="px-3 pt-3 pb-3">
          {#each emoteSections as section, sIdx (section.label)}
            <div class="mb-3 last:mb-0">
              <div class="mb-1.5 border-b border-amber-700/40 text-sm font-bold tracking-widest text-amber-300 uppercase">
                {section.label}
              </div>
              <div
                class="grid gap-1 rounded-sm border border-amber-900/40 bg-black/40 p-1.5"
                style:grid-template-columns="repeat({EMOTE_COLS}, minmax(0, 1fr))"
              >
                {#each Array(EMOTE_COLS * section.rows) as _, i (i)}
                  <div
                    class="aspect-square border border-amber-900/40 bg-stone-950/70"
                  ></div>
                {/each}
              </div>
            </div>
          {/each}
        </div>
      {:else if activeTab === 'quests'}
        <!-- Quest log: a stack of envelope rows pulled straight
             from player.activeQuests. Time-limited quests show a
             remaining-seconds line; open-ended ones show "No time
             limit." Progress lines render when the quest carries
             a counter. Empty list shows a placeholder. -->
        <div class="px-3 pt-3 pb-3">
          {#if player.activeQuests.length === 0}
            <div class="rounded-sm border border-amber-900/40 bg-black/40 px-3 py-2 text-xs text-white/55">
              No active quests.
            </div>
          {:else}
            <div class="flex flex-col gap-1.5">
              {#each player.activeQuests as quest (quest.id)}
                {@const remaining = quest.timeLimitSec === null
                  ? null
                  : Math.max(0, Math.ceil(quest.timeLimitSec - (world.time - quest.acceptedAt)))}
                <div class="flex gap-2 border border-amber-900/50 bg-black/40 px-2 py-1.5">
                  <!-- Envelope glyph: stylized scroll/letter so the
                       row reads as a quest item even without art. -->
                  <div class="flex h-8 w-8 shrink-0 items-center justify-center border border-amber-700/60 bg-stone-950/80 text-amber-300">
                    ✉
                  </div>
                  <div class="flex flex-1 flex-col">
                    <span class="text-xs font-semibold text-white/95">{quest.title}</span>
                    <span class="text-[10px] text-white/55">
                      {#if remaining === null}
                        No time limit.
                      {:else}
                        Time Remaining: {Math.floor(remaining / 60)}m {remaining % 60}s
                      {/if}
                    </span>
                    {#if quest.progress}
                      <span class="text-[10px] text-amber-300/80">
                        {quest.progress.label}: {quest.progress.current}/{quest.progress.goal}
                      </span>
                    {/if}
                  </div>
                </div>
              {/each}
            </div>
          {/if}
          <div class="mt-3">
            {#each questCategories as cat (cat.key)}
              <div class="mb-2 last:mb-0">
                <button
                  type="button"
                  class="flex w-full items-center gap-2 border-b border-amber-700/40 py-1 text-left text-xs font-bold tracking-widest text-amber-300 uppercase hover:text-amber-200"
                  onclick={() => (questCollapsed[cat.key] = !questCollapsed[cat.key])}
                >
                  <span class="text-xs text-amber-400/80 transition-transform" class:rotate-180={questCollapsed[cat.key]}>
                    ⌃
                  </span>
                  <span class="flex-1">{cat.label}</span>
                </button>
                {#if !questCollapsed[cat.key]}
                  <div class="px-3 py-1 text-[11px] text-white/40">Empty</div>
                {/if}
              </div>
            {/each}
          </div>
        </div>
      {/if}

      </div><!-- /scrollable body -->

      <!-- Tab strip — all four tabs are wired now. -->
      <div class="grid grid-cols-4 border-t-2 border-amber-700/60 bg-stone-950/70">
        {#each [{ id: 'status' as Tab, label: 'Status' }, { id: 'abilities' as Tab, label: 'Abilities' }, { id: 'emotions' as Tab, label: 'Emotions' }, { id: 'quests' as Tab, label: 'Quests' }] as tab (tab.id)}
          <button
            type="button"
            onclick={() => (activeTab = tab.id)}
            class="border-r border-amber-700/30 px-2 py-1.5 text-center text-xs font-bold tracking-widest uppercase transition last:border-r-0 {activeTab ===
            tab.id
              ? 'bg-amber-900/30 text-amber-200'
              : 'text-white/55 hover:bg-amber-900/15 hover:text-amber-200'}"
          >
            {tab.label}
          </button>
        {/each}
      </div>
    </div>
  </div>
{/if}
