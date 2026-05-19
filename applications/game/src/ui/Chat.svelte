<script lang="ts">
  import { tick } from 'svelte';
  import {
    chat,
    closeChat,
    cycleChannel,
    historyNext,
    historyPrev,
    sendMessage,
  } from '../chat.svelte';
  import { world } from '../simulation/world.svelte';

  // Messages live on the world (so multiplayer would broadcast
  // them); everything else in this panel is local UI state.
  const messages = $derived(world.chat.messages);

  let inputRef: HTMLInputElement | undefined = $state();
  let listRef: HTMLDivElement | undefined = $state();

  // Auto-focus the input every time the panel opens, and keep the
  // message list scrolled to the bottom whenever a new message
  // lands.
  $effect(() => {
    if (chat.open) {
      // Wait a tick so the element is mounted before focusing.
      tick().then(() => inputRef?.focus());
    }
  });

  $effect(() => {
    // Read the messages length so the effect re-runs after sends.
    messages.length;
    tick().then(() => {
      if (listRef) listRef.scrollTop = listRef.scrollHeight;
    });
  });

  function moveCursorToEnd() {
    tick().then(() => {
      const el = inputRef;
      if (!el) return;
      const len = el.value.length;
      el.setSelectionRange(len, len);
    });
  }

  function handleKey(e: KeyboardEvent) {
    // Stop the global game keybinds from reading what the player is
    // typing (WASD, F-keys, etc.).
    e.stopPropagation();
    if (e.key === 'Enter') {
      e.preventDefault();
      sendMessage();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeChat();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      historyPrev();
      moveCursorToEnd();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      historyNext();
      moveCursorToEnd();
    }
  }
</script>

{#if chat.open}
  <div
    class="pointer-events-auto absolute bottom-20 left-1/2 -translate-x-1/2 w-[640px] border-2 border-amber-800/80 bg-gradient-to-b from-[#5a3a22] to-[#2b1a0e] [text-shadow:0_1px_2px_rgb(0_0_0_/_0.8)]"
  >
    <div
      class="flex items-center justify-between border-b border-amber-900/60 px-3 py-1.5"
    >
      <span
        class="text-xs font-semibold tracking-[0.3em] text-amber-200 uppercase"
        >Chat</span
      >
      <button
        type="button"
        class="text-amber-200/80 hover:text-amber-50"
        onclick={closeChat}
        aria-label="Close chat"
      >
        ✕
      </button>
    </div>

    <!-- Message list. Auto-scrolls to bottom on new messages. -->
    <div
      bind:this={listRef}
      class="h-48 overflow-y-auto bg-black/40 px-3 py-2 text-sm text-white/95 font-sans"
    >
      {#if messages.length === 0}
        <div class="text-white/40 italic">No messages yet.</div>
      {:else}
        {#each messages as msg (msg.id)}
          <div class="leading-tight">
            <span class="text-amber-300">{msg.author}</span>
            <span class="text-white/50">:</span>
            {msg.text}
          </div>
        {/each}
      {/if}
    </div>

    <!-- Input row with the channel tag on the left and the send /
         pseudo-icons on the right (decorative — not wired up). -->
    <div
      class="flex items-center gap-2 border-t border-amber-900/60 bg-black/50 px-2 py-1.5"
    >
      <!-- Channel toggle. Click cycles Normal → Global → Group →
           Normal. Channels aren't routed differently yet; the value
           is recorded on outgoing messages so the routing can land
           later without touching the UI. -->
      <button
        type="button"
        class="border border-amber-900/70 bg-neutral-900/80 px-2 py-0.5 text-xs text-amber-200 hover:border-amber-300 hover:text-amber-50"
        onclick={cycleChannel}
        title="Channel: {chat.channel} (click to cycle)"
      >
        {chat.channel}
      </button>
      <input
        bind:this={inputRef}
        bind:value={chat.draft}
        onkeydown={handleKey}
        class="flex-1 border border-amber-900/70 bg-black/60 px-2 py-1 text-sm text-white outline-none focus:border-amber-400"
        placeholder="Type a message…"
        maxlength="200"
      />
      <button
        type="button"
        class="border border-amber-900/70 bg-neutral-900/80 px-2 py-1 text-amber-200 hover:border-amber-300 hover:text-amber-50"
        onclick={sendMessage}
        aria-label="Send message"
      >
        ↵
      </button>
    </div>
  </div>
{/if}
