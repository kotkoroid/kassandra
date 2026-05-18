// In-game chat state. Messages and the input draft live here so the
// chat panel can re-open mid-session and keep its history, and so
// Scene.svelte can gate keyboard input while the player is typing.

import { runCommand } from './commands';
import { player } from './state.svelte';

export type ChatChannel = 'Normal' | 'Global' | 'Group';

export interface ChatMessage {
  id: string;
  author: string;
  text: string;
  channel: ChatChannel;
}

export const chat = $state<{
  open: boolean;
  messages: ChatMessage[];
  draft: string;
  channel: ChatChannel;
}>({
  open: false,
  messages: [],
  draft: '',
  channel: 'Normal',
});

let nextId = 1;

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

// Bubble lifetime above the player's head, in ms. Re-sends reset
// the timer; an explicit token prevents an older send's timeout
// from clearing a newer message.
const SAY_TTL_MS = 5000;
let sayToken = 0;

function pushSystem(text: string) {
  chat.messages.push({
    id: `m${nextId++}`,
    author: 'System',
    text,
    channel: chat.channel,
  });
}

export function sendMessage() {
  const text = chat.draft.trim();
  // Empty or whitespace-only → treat the Enter as "close chat" so
  // hitting Return again is a quick dismiss.
  if (!text) {
    closeChat();
    return;
  }
  chat.draft = '';

  // Slash-commands run against the live game state and echo their
  // result(s) back as System lines instead of broadcasting.
  const result = runCommand(text);
  if (result) {
    for (const line of result) pushSystem(line);
    return;
  }

  chat.messages.push({
    id: `m${nextId++}`,
    author: player.name || 'You',
    text,
    channel: chat.channel,
  });
  // Float the message above the player's head for SAY_TTL_MS so
  // other characters (eventually other players) can see what was
  // said without opening the chat panel.
  player.saying = text;
  const token = ++sayToken;
  setTimeout(() => {
    if (token === sayToken) player.saying = '';
  }, SAY_TTL_MS);
}
