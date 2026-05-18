<script lang="ts">
  import { getItem, type ItemId } from '../items';
  import { lootBagOpen } from '../lootBagOpen.svelte';
  import { dispatch } from '../sim/input';
  import { world } from '../sim/world.svelte';

  interface Stack {
    id: ItemId;
    count: number;
  }
  interface OwnerGroup {
    owner: string;
    stacks: Stack[];
  }

  // Resolve the open id against the live bag list each render so a
  // bag that expires (or gets picked up) while the panel is open
  // simply disappears.
  const bag = $derived(
    lootBagOpen.value
      ? world.lootBags.find((b) => b.id === lootBagOpen.value) ?? null
      : null,
  );

  const grouped = $derived.by<OwnerGroup[]>(() => {
    if (!bag) return [];
    const byOwner = new Map<string, Map<ItemId, number>>();
    for (const entry of bag.items) {
      let owned = byOwner.get(entry.owner);
      if (!owned) {
        owned = new Map();
        byOwner.set(entry.owner, owned);
      }
      owned.set(entry.itemId, (owned.get(entry.itemId) ?? 0) + 1);
    }
    return [...byOwner.entries()].map(([owner, owned]) => ({
      owner,
      stacks: [...owned.entries()].map(([id, count]) => ({ id, count })),
    }));
  });

  function close() {
    lootBagOpen.value = null;
  }

  function pickUp() {
    if (!bag) return;
    dispatch(world, { kind: 'pickup_loot', bagId: bag.id });
    lootBagOpen.value = null;
  }

  const hasOwnedItems = $derived(
    !!bag && bag.items.some((item) => item.owner === world.player.name),
  );
</script>

{#if bag}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    class="pointer-events-auto absolute inset-0 flex items-center justify-center bg-black/50"
    role="dialog"
    aria-modal="true"
    aria-label="Loot bag contents"
    tabindex="-1"
    onclick={close}
    onkeydown={(e) => {
      if (e.key === 'Escape') close();
    }}
  >
    <div
      class="w-[360px] border-2 border-amber-700/70 bg-neutral-900/95 [text-shadow:0_1px_2px_rgb(0_0_0_/_0.6)]"
      role="document"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.stopPropagation()}
    >
      <div
        class="flex items-center justify-between border-b border-amber-700/40 px-4 py-2"
      >
        <h2
          class="text-sm font-semibold tracking-[0.3em] text-amber-300 uppercase"
        >
          {bag.isDeathBag ? 'Death Bag' : 'Loot Bag'}
        </h2>
        <div class="flex items-center gap-2">
          {#if hasOwnedItems && !bag.isDeathBag}
            <button
              type="button"
              class="border border-amber-600/70 bg-amber-900/40 px-2 py-0.5 text-xs font-semibold text-amber-200 hover:border-amber-400 hover:text-amber-100"
              onclick={pickUp}
            >
              Pick Up
            </button>
          {/if}
          <button
            type="button"
            class="text-amber-300/80 hover:text-amber-100"
            onclick={close}
            aria-label="Close loot bag"
          >
            ✕
          </button>
        </div>
      </div>

      <div class="space-y-3 p-4">
        {#if bag.isDeathBag && bag.bagXp > 0}
          <div class="border border-amber-700/40 bg-amber-900/20 px-3 py-2 text-xs text-amber-200">
            Holding {Math.round(bag.bagXp)} XP — walk over the bag to
            reclaim {Math.round(bag.bagXp * 0.7)} of it.
          </div>
        {/if}

        {#if grouped.length === 0}
          <div class="text-sm text-white/70">Empty.</div>
        {:else}
          {#each grouped as group (group.owner)}
            <section class="border border-amber-700/50 bg-black/30">
              <header
                class="border-b border-amber-700/30 px-3 py-1 text-xs font-semibold tracking-widest text-amber-200/90 uppercase"
              >
                {group.owner || 'Unclaimed'}
              </header>
              <ul class="divide-y divide-amber-900/30">
                {#each group.stacks as stack (stack.id)}
                  {@const item = getItem(stack.id)}
                  <li
                    class="flex items-center justify-between gap-4 px-3 py-1.5"
                  >
                    <span class="text-sm text-white">
                      {item?.name ?? stack.id}
                    </span>
                    <span
                      class="font-mono text-xs tracking-wider text-amber-200/90"
                    >
                      ×{stack.count}
                    </span>
                  </li>
                {/each}
              </ul>
            </section>
          {/each}
        {/if}
      </div>
    </div>
  </div>
{/if}
