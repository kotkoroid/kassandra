<script lang="ts">
  import { Canvas, T } from '@threlte/core';
  import { bagOpen } from '../bag.svelte';
  import { getItem, type ItemId } from '../items';
  import Player from '../scene/Player.svelte';
  import { world } from '../sim/world.svelte';

  interface Stack {
    id: ItemId;
    count: number;
  }

  const stacks = $derived.by<Stack[]>(() => {
    const counts = new Map<ItemId, number>();
    for (const id of world.player.bag) {
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    return [...counts.entries()].map(([id, count]) => ({ id, count }));
  });

  // Equipment paper-doll. Only `weapon` is wired to actual player
  // state today — the rest are visual placeholders matching the
  // inspiration's slot layout so the design intent reads clearly.
  // When more gear slots land on Player they replace these `null`s.
  const equippedWeapon = $derived(getItem(world.player.equippedWeaponId));

  // Bag grid: fixed pool of slot cells so empty squares render as
  // an honeycomb of placeholders even when the bag is nearly empty.
  const GRID_COLS = 5;
  const GRID_ROWS = 8;
  const SLOT_COUNT = GRID_COLS * GRID_ROWS;
  const slots = $derived.by(() => {
    const filled = stacks.slice(0, SLOT_COUNT);
    const padding: (Stack | null)[] = Array(SLOT_COUNT - filled.length).fill(null);
    return [...filled, ...padding];
  });

  // Two bag tabs (I / II) — visual nod to the inspiration. Only I
  // backs real state; selecting II shows an empty page until pages
  // are actually modelled.
  let activeTab = $state<'I' | 'II'>('I');

  // Slow turntable for the paper-doll silhouette.
  let dollRotation = $state(0);
  $effect(() => {
    if (!bagOpen.value) return;
    let last = performance.now();
    let raf: number;
    function step(now: number) {
      const delta = (now - last) / 1000;
      last = now;
      dollRotation += delta * 0.4;
      raf = requestAnimationFrame(step);
    }
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  });

  // Initial of an item name used as a glyph inside its slot until
  // proper item icons exist.
  function glyph(id: ItemId): string {
    return getItem(id)?.name.charAt(0).toUpperCase() ?? '?';
  }
</script>

{#snippet equipSlot(label: string, glyphChar: string | null)}
  <div
    class="group relative flex h-9 w-9 items-center justify-center border border-amber-800/60 bg-stone-950/70"
    title={label}
  >
    {#if glyphChar}
      <span class="font-mono text-sm font-bold text-amber-200">{glyphChar}</span>
    {:else}
      <span class="text-[9px] tracking-widest text-amber-700/60 uppercase">
        {label.slice(0, 3)}
      </span>
    {/if}
  </div>
{/snippet}

{#snippet bagSlot(stack: Stack | null)}
  <div
    class="relative flex aspect-square items-center justify-center border border-amber-900/50 bg-stone-950/70"
  >
    {#if stack}
      <span class="font-mono text-base font-bold text-amber-200" title={getItem(stack.id)?.name}>
        {glyph(stack.id)}
      </span>
      {#if stack.count > 1}
        <span class="absolute right-0.5 bottom-0 font-mono text-[10px] leading-none text-amber-200/90">
          {stack.count}
        </span>
      {/if}
    {/if}
  </div>
{/snippet}

{#if bagOpen.value}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    class="pointer-events-auto absolute inset-0 flex items-center justify-center bg-black/50"
    role="dialog"
    aria-modal="true"
    aria-label="Inventory"
    tabindex="-1"
    onclick={() => (bagOpen.value = false)}
    onkeydown={(e) => { if (e.key === 'Escape') bagOpen.value = false; }}
  >
    <div
      class="w-[300px] border-2 border-amber-700/70 bg-neutral-900/95 [text-shadow:0_1px_2px_rgb(0_0_0_/_0.6)]"
      role="document"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.stopPropagation()}
    >
      <!-- Title bar -->
      <div
        class="flex items-center justify-between border-b border-amber-700/40 bg-gradient-to-r from-stone-900 via-amber-950/60 to-stone-900 px-3 py-1.5"
      >
        <h2 class="flex-1 text-center text-xs font-semibold tracking-[0.4em] text-amber-200 uppercase">
          Inventory
        </h2>
        <button
          type="button"
          class="text-amber-300/80 hover:text-amber-100"
          onclick={() => (bagOpen.value = false)}
          aria-label="Close inventory"
        >
          ✕
        </button>
      </div>

      <!-- Paper-doll: silhouette flanked by equipment slot columns. -->
      <div class="border-b border-amber-700/40 bg-stone-950/40 p-2">
        <div class="grid grid-cols-[auto_1fr_auto] items-center gap-2">
          <!-- Left column: weapon over gloves over boot. -->
          <div class="flex flex-col gap-1.5">
            {@render equipSlot('Weapon', equippedWeapon ? equippedWeapon.name.charAt(0).toUpperCase() : null)}
            {@render equipSlot('Gloves', null)}
            {@render equipSlot('Boots', null)}
          </div>

          <!-- Silhouette -->
          <div class="h-[140px] border border-amber-700/50 bg-stone-950/80">
            <Canvas>
              <T.Color attach="background" args={['#0a0a0a']} />
              <T.PerspectiveCamera
                makeDefault
                fov={26}
                position={[0, 1.1, 3.4]}
                oncreate={(c) => c.lookAt(0, 1.1, 0)}
              />
              <T.AmbientLight intensity={0.5} />
              <T.DirectionalLight position={[3, 5, 3]} intensity={0.9} />
              <Player
                position={[0, 0, 0]}
                rotation={dollRotation}
                moving={false}
                slashTrigger={0}
              />
            </Canvas>
          </div>

          <!-- Right column: helmet over armor over belt over medallion. -->
          <div class="flex flex-col gap-1.5">
            {@render equipSlot('Helmet', null)}
            {@render equipSlot('Armor', null)}
            {@render equipSlot('Belt', null)}
            {@render equipSlot('Necklace', null)}
          </div>
        </div>

        <!-- Tabs: I (active) / II (placeholder for second bag page). -->
        <div class="mt-2 grid grid-cols-2 gap-0 border border-amber-700/40">
          {#each ['I', 'II'] as tab (tab)}
            <button
              type="button"
              onclick={() => (activeTab = tab as 'I' | 'II')}
              class="border-amber-700/40 px-2 py-1 text-center text-[11px] font-bold tracking-widest uppercase transition first:border-r {activeTab ===
              tab
                ? 'bg-amber-900/40 text-amber-200'
                : 'bg-stone-950/60 text-white/40 hover:text-amber-300'}"
            >
              {tab}
            </button>
          {/each}
        </div>
      </div>

      <!-- Bag grid -->
      <div class="bg-stone-950/40 p-2">
        <div
          class="grid gap-1"
          style:grid-template-columns="repeat({GRID_COLS}, minmax(0, 1fr))"
        >
          {#if activeTab === 'I'}
            {#each slots as stack, i (i)}
              {@render bagSlot(stack)}
            {/each}
          {:else}
            {#each Array(SLOT_COUNT) as _, i (i)}
              {@render bagSlot(null)}
            {/each}
          {/if}
        </div>
      </div>

      <!-- Currency footer -->
      <div class="flex items-center gap-2 border-t border-amber-700/40 bg-stone-950/70 px-3 py-1.5">
        <div class="flex h-5 w-5 items-center justify-center rounded-full border border-amber-600/70 bg-amber-700/40 text-[10px] font-bold text-amber-200">
          ¥
        </div>
        <span class="font-mono text-xs tracking-wider text-amber-200/90">0 Lars</span>
      </div>
    </div>
  </div>
{/if}
