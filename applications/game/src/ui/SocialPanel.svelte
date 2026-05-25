<script lang="ts">
  import { socialOpen } from '../social.svelte';
  import { world } from '../world.svelte';

  // Four collapsible sections — Favorites (account-scoped), Party
  // (current realm's owner-anchored party), Group (an ad-hoc roster
  // smaller than the party, e.g. a dungeon team), Blocked (suppressed
  // chat/visibility). The taxonomy aligns with ADR-002: Party is
  // per-realm (matches PartyRoom membership); Favorites is the
  // account-wide social graph that won't exist until an
  // account-scoped DO is reintroduced.
  //
  // Party is the only live-data section today — it mirrors
  // `world.players`, which the realm rebuilds from every snapshot.
  // Players present in the snapshot are by definition connected, so
  // every entry is "online" until they disconnect (at which point
  // PartyRoom drops them from the world). Favorites / Group / Blocked
  // still render "Empty" until their backing state lands.
  interface Entry {
    name: string;
    online: boolean;
  }

  interface Section {
    key: 'favorites' | 'party' | 'group' | 'blocked';
    label: string;
    entries: Entry[];
  }

  // Skip pre-create_character placeholders (empty name): the player
  // is technically in the world but hasn't picked an identity yet,
  // so showing them in the social roster is just visual noise. Sort
  // by name for deterministic ordering across rerenders.
  const partyEntries = $derived<Entry[]>(
    Object.values(world.players)
      .filter((p) => p.name.trim().length > 0)
      .map((p) => ({ name: p.name, online: true }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  );

  const sections = $derived<Section[]>([
    { key: 'favorites', label: 'Favorites', entries: [] },
    { key: 'party', label: 'Party', entries: partyEntries },
    { key: 'group', label: 'Group', entries: [] },
    { key: 'blocked', label: 'Blocked', entries: [] },
  ]);

  // All sections expanded by default — the inspiration shows every
  // header with a chevron, so let users collapse individually.
  let collapsed = $state<Record<Section['key'], boolean>>({
    favorites: false,
    party: false,
    group: false,
    blocked: false,
  });
</script>

{#if socialOpen.value}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    class="pointer-events-auto absolute inset-0 flex items-center justify-center bg-black/50"
    role="dialog"
    aria-modal="true"
    aria-label="Social"
    tabindex="-1"
    onclick={() => (socialOpen.value = false)}
    onkeydown={(e) => { if (e.key === 'Escape') socialOpen.value = false; }}
  >
    <div
      class="flex h-[420px] w-[260px] flex-col border-2 border-amber-700/70 bg-neutral-900/95 [text-shadow:0_1px_2px_rgb(0_0_0_/_0.6)]"
      role="document"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.stopPropagation()}
    >
      <!-- Title bar -->
      <div
        class="flex items-center justify-between border-b border-amber-700/40 bg-gradient-to-r from-stone-900 via-amber-950/60 to-stone-900 px-3 py-1.5"
      >
        <h2 class="flex-1 text-center text-xs font-semibold tracking-[0.4em] text-amber-200 uppercase">
          Social
        </h2>
        <button
          type="button"
          class="text-amber-300/80 hover:text-amber-100"
          onclick={() => (socialOpen.value = false)}
          aria-label="Close social"
        >
          ✕
        </button>
      </div>

      <!-- Section list -->
      <div class="flex-1 overflow-y-auto bg-stone-950/40 px-3 py-2">
        {#each sections as section (section.key)}
          <div class="mb-2">
            <button
              type="button"
              class="flex w-full items-center gap-2 text-left text-sm font-semibold tracking-wider text-white/85 hover:text-amber-200"
              onclick={() => (collapsed[section.key] = !collapsed[section.key])}
            >
              <span class="text-xs text-amber-300/90 transition-transform" class:rotate-180={collapsed[section.key]}>
                ⌃
              </span>
              <span>{section.label}</span>
            </button>

            {#if !collapsed[section.key]}
              <div class="mt-1 pl-6">
                {#if section.entries.length === 0}
                  <div class="text-xs text-white/35">Empty</div>
                {:else}
                  {#each section.entries as entry (entry.name)}
                    <div class="flex items-center gap-2 py-0.5">
                      <span
                        class="inline-block h-2 w-2 rounded-full"
                        class:bg-emerald-400={entry.online}
                        class:bg-neutral-600={!entry.online}
                      ></span>
                      <span class="text-sm text-white/90">{entry.name}</span>
                    </div>
                  {/each}
                {/if}
              </div>
            {/if}
          </div>
        {/each}
      </div>

      <!-- Action bar: visual nod to the inspiration's row of five
           tool buttons. None are wired yet; they'll gain handlers
           when add-friend / whisper / block / notes are implemented. -->
      <div class="grid grid-cols-5 border-t border-amber-700/40 bg-stone-950/70">
        {#each [{ glyph: '+', label: 'Add friend' }, { glyph: '✎', label: 'Edit' }, { glyph: '✉', label: 'Message' }, { glyph: '⊘', label: 'Block' }, { glyph: '☰', label: 'Notes' }] as btn (btn.label)}
          <button
            type="button"
            class="border-r border-amber-700/30 px-2 py-2 text-sm text-amber-300/60 transition last:border-r-0 hover:bg-amber-900/30 hover:text-amber-100"
            title={btn.label}
            aria-label={btn.label}
          >
            {btn.glyph}
          </button>
        {/each}
      </div>
    </div>
  </div>
{/if}
