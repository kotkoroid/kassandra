<script lang="ts">
  import { getItem, type ItemId } from '../items';
  import { bagOpen } from '../bag.svelte';
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
</script>

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
      class="w-[360px] border-2 border-amber-700/70 bg-neutral-900/95 [text-shadow:0_1px_2px_rgb(0_0_0_/_0.6)]"
      role="document"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.stopPropagation()}
    >
      <div class="flex items-center justify-between border-b border-amber-700/40 px-4 py-2">
        <h2 class="text-sm font-semibold tracking-[0.3em] text-amber-300 uppercase">
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

      <div class="p-4">
        {#if stacks.length === 0}
          <div class="text-sm text-white/70">Empty.</div>
        {:else}
          <ul class="divide-y divide-amber-900/30 border border-amber-700/50 bg-black/30">
            {#each stacks as stack (stack.id)}
              {@const item = getItem(stack.id)}
              <li class="flex items-center justify-between gap-4 px-3 py-1.5">
                <span class="text-sm text-white">{item?.name ?? stack.id}</span>
                <span class="font-mono text-xs tracking-wider text-amber-200/90">×{stack.count}</span>
              </li>
            {/each}
          </ul>
        {/if}
      </div>
    </div>
  </div>
{/if}
