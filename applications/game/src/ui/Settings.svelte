<script lang="ts">
  import { dispatch } from '@kassandra/simulation-domain-library';
  import { settings } from '../settings.svelte';
  import { world } from '../world.svelte';

  interface Props {
    onClose: () => void;
  }
  let { onClose }: Props = $props();

  // Static reference list of input bindings. Read-only for now —
  // remapping would need a key-capture flow that isn't worth
  // building until the bindings actually start changing.
  const bindings: { keys: string; action: string }[] = [
    { keys: 'W A S D / ↑ ← ↓ →', action: 'Move' },
    { keys: 'Space', action: 'Attack' },
    { keys: 'Right Mouse Drag', action: 'Rotate camera' },
  ];

  // Owner-only Disband button visibility. world.ownerId is set by the
  // realm on first connect and arrives in the first snapshot — until
  // then it's null and nobody sees the button.
  const isOwner = $derived(
    world.ownerId !== null && world.ownerId === world.localPlayerId,
  );

  function disbandParty() {
    // Dispatch goes onto world.inputQueue; Scene.svelte drains it on the
    // next animation frame and forwards via sendFrame. Server verifies
    // sender === ownerId, broadcasts 'disbanded', and closes every socket.
    dispatch(world, { kind: 'disband_party' });
    onClose();
  }
</script>

<!-- Backdrop. Clicking outside the dialog closes it. The dialog role
     keeps this accessible; svelte-check still flags the click + key
     handlers on a div, so we silence that one rule explicitly. -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
  class="pointer-events-auto absolute inset-0 flex items-center justify-center bg-black/60"
  role="dialog"
  aria-modal="true"
  aria-label="Settings"
  tabindex="-1"
  onclick={onClose}
  onkeydown={(e) => {
    if (e.key === 'Escape') onClose();
  }}
>
  <!-- Panel. Stop propagation so clicks inside don't dismiss. -->
  <div
    class="w-[440px] border-2 border-amber-700/70 bg-neutral-900/95 [text-shadow:0_1px_2px_rgb(0_0_0_/_0.6)]"
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
        Settings
      </h2>
      <button
        type="button"
        class="text-amber-300/80 hover:text-amber-100"
        onclick={onClose}
        aria-label="Close settings"
      >
        ✕
      </button>
    </div>

    <div class="space-y-4 p-4">
      <section>
        <h3
          class="mb-2 text-xs font-semibold tracking-widest text-amber-200/80 uppercase"
        >
          Display
        </h3>
        <label class="flex items-center gap-2 text-sm text-white">
          <input
            type="checkbox"
            class="h-4 w-4 accent-amber-500"
            bind:checked={settings.showNames}
          />
          Show names above characters
        </label>
      </section>

      <section>
        <h3
          class="mb-2 text-xs font-semibold tracking-widest text-amber-200/80 uppercase"
        >
          Keybindings
        </h3>
        <ul class="divide-y divide-amber-900/30 border border-amber-900/30">
          {#each bindings as b (b.action)}
            <li class="flex items-center justify-between gap-4 px-3 py-1.5">
              <span class="text-sm text-white">{b.action}</span>
              <span
                class="font-mono text-xs tracking-wider text-amber-200/90"
              >
                {b.keys}
              </span>
            </li>
          {/each}
        </ul>
      </section>

      {#if isOwner}
        <section>
          <h3
            class="mb-2 text-xs font-semibold tracking-widest text-amber-200/80 uppercase"
          >
            Party
          </h3>
          <button
            type="button"
            class="w-full border border-red-700/60 bg-red-900/30 px-3 py-1.5 text-sm font-semibold tracking-wider text-red-200 uppercase hover:bg-red-900/60"
            onclick={disbandParty}
          >
            Disband Party
          </button>
          <p class="mt-1 text-xs text-amber-200/60">
            Disconnects every player and deletes the party. Cannot be undone.
          </p>
        </section>
      {/if}
    </div>
  </div>
</div>
