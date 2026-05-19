<script lang="ts">
  import { closeDialog, dialog } from '../dialog.svelte';
</script>

{#if dialog.open && dialog.content}
  {@const c = dialog.content}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    class="pointer-events-auto absolute inset-0 flex items-center justify-center bg-black/50 [text-shadow:0_1px_2px_rgb(0_0_0_/_0.6)]"
    role="dialog"
    aria-modal="true"
    aria-label="Dialog with {c.speaker}"
    tabindex="-1"
    onclick={closeDialog}
    onkeydown={(e) => {
      if (e.key === 'Escape' || e.key === 'Enter') closeDialog();
    }}
  >
    <div
      class="w-[480px] border-2 border-amber-700/70 bg-neutral-900/95 shadow-2xl shadow-black/60"
      role="document"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.stopPropagation()}
    >
      <header
        class="flex items-center justify-between border-b border-amber-700/40 bg-gradient-to-r from-stone-900 via-amber-950/60 to-stone-900 px-4 py-2"
      >
        <h2 class="text-xs font-semibold tracking-[0.3em] text-amber-200 uppercase">
          {c.speaker}
        </h2>
        <button
          type="button"
          class="text-amber-300/80 hover:text-amber-100"
          onclick={closeDialog}
          aria-label="Close dialog"
        >
          ✕
        </button>
      </header>

      <div class="max-h-[60vh] overflow-y-auto px-5 py-4">
        <p class="text-sm leading-relaxed text-white/90">
          {c.body}
        </p>
      </div>

      <footer class="flex justify-end border-t border-amber-700/40 bg-stone-950/60 px-4 py-3">
        <button
          type="button"
          onclick={closeDialog}
          class="border-2 border-amber-300 bg-amber-400 px-6 py-1.5 text-xs font-bold tracking-widest text-stone-950 uppercase shadow-md shadow-amber-900/40 transition hover:bg-amber-300"
        >
          Continue
        </button>
      </footer>
    </div>
  </div>
{/if}
