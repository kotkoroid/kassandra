// UI-side chat state. The message history lives on the world
// (sim/types.ts → World.chat.messages); only client-only fields —
// is the panel open, what is currently typed, which channel is
// selected — live here.

import { dispatch } from './sim/input';
import type { ChatChannel } from './sim/types';
import { world } from './sim/world.svelte';

export type { ChatChannel };

export const chat = $state<{
  open: boolean;
  draft: string;
  channel: ChatChannel;
}>({
  open: false,
  draft: '',
  channel: 'Normal',
});

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
  chat.draft = '';
  dispatch(world, { kind: 'send_chat', text, channel: chat.channel });
}
