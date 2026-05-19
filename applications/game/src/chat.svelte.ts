// UI-side chat state. The message history lives on the world
// (sim/types.ts → World.chat.messages); only client-only fields —
// is the panel open, what is currently typed, which channel is
// selected — live here.

import { dispatch } from './simulation/input';
import type { ChatChannel } from './simulation/types';
import { world } from './simulation/world.svelte';

export type { ChatChannel };

export const chat = $state<{
  open: boolean;
  draft: string;
  channel: ChatChannel;
  // Sent-message history for Up/Down navigation. Most recent at the
  // end. Consecutive duplicates are deduped at send time.
  history: string[];
  // Cursor into `history` while the user is scrolling through it.
  // `null` means the input shows the live draft, not a history entry.
  historyIndex: number | null;
  // The in-progress draft the user had typed before they started
  // pressing Up. Restored when they scroll back past the newest entry.
  pendingDraft: string;
}>({
  open: false,
  draft: '',
  channel: 'Normal',
  history: [],
  historyIndex: null,
  pendingDraft: '',
});

const HISTORY_MAX = 50;

export function openChat() {
  chat.open = true;
}

export function closeChat() {
  chat.open = false;
}

export function toggleChat() {
  chat.open = !chat.open;
}

const CHANNEL_ORDER: ChatChannel[] = ['Normal', 'Global', 'Group'];

export function cycleChannel() {
  const idx = CHANNEL_ORDER.indexOf(chat.channel);
  chat.channel = CHANNEL_ORDER[(idx + 1) % CHANNEL_ORDER.length]!;
}

export function sendMessage() {
  const text = chat.draft.trim();
  // Empty (or whitespace-only) Enter dismisses the panel.
  if (!text) {
    closeChat();
    return;
  }
  // Dedupe consecutive duplicates so spamming the same command
  // doesn't bloat the recall list. Cap the ring at HISTORY_MAX.
  const last = chat.history[chat.history.length - 1];
  if (last !== text) {
    chat.history.push(text);
    if (chat.history.length > HISTORY_MAX) chat.history.shift();
  }
  chat.draft = '';
  chat.historyIndex = null;
  chat.pendingDraft = '';
  dispatch(world, { kind: 'send_chat', text, channel: chat.channel });
}

// Recall the previous entry (terminal-style ↑). If we're currently
// showing the live draft, snapshot it first so ↓ past the newest
// entry can restore it.
export function historyPrev() {
  if (chat.history.length === 0) return;
  if (chat.historyIndex === null) {
    chat.pendingDraft = chat.draft;
    chat.historyIndex = chat.history.length - 1;
  } else if (chat.historyIndex > 0) {
    chat.historyIndex -= 1;
  }
  chat.draft = chat.history[chat.historyIndex]!;
}

// Recall the next entry (terminal-style ↓). Past the newest entry,
// restore the in-progress draft and detach from the history.
export function historyNext() {
  if (chat.historyIndex === null) return;
  if (chat.historyIndex < chat.history.length - 1) {
    chat.historyIndex += 1;
    chat.draft = chat.history[chat.historyIndex]!;
  } else {
    chat.historyIndex = null;
    chat.draft = chat.pendingDraft;
    chat.pendingDraft = '';
  }
}
