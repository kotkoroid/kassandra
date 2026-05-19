// Ambient NPC chatter. Each registered entity kind has a small pool
// of one-liners and a randomised cadence; this system picks lines,
// shows them as a floating bubble above the speaker (via the
// entity's `saying` field, identical to the player's chat bubble),
// and mirrors the same line into the world chat log so it shows up
// as `City Guardian: <line>`.

import { SAY_TTL } from '../constants';
import type { EntityKind, World } from '../types';
import { genId } from '../world';

interface NpcChatter {
  // Author shown in chat + intended as the bubble's tagline.
  speaker: string;
  // Random sample is uniformly drawn from this pool. Consecutive
  // duplicates aren't filtered — small price for a one-liner.
  lines: readonly string[];
  // Random delay between lines, in seconds.
  cadenceMin: number;
  cadenceMax: number;
}

// Only kinds in this map ever speak. Adding a new NPC = adding an
// entry here; no other system change needed.
const CHATTERS: Partial<Record<EntityKind, NpcChatter>> = {
  azir: {
    speaker: 'City Guardian',
    lines: [
      'Watch yourself out there, recruit.',
      "Don't waste my time. Move!",
      'A war never sleeps. Keep your blade sharp.',
      'I keep this town safe — try to keep up.',
      "Train hard or don't come back.",
      'Mind the wall. The night is patient.',
    ],
    cadenceMin: 25,
    cadenceMax: 60,
  },
};

function pickInterval(world: World, c: NpcChatter): number {
  return c.cadenceMin + world.rng.next() * (c.cadenceMax - c.cadenceMin);
}

export function tickNpcChat(world: World) {
  const now = world.time;
  for (const e of world.entities) {
    const chatter = CHATTERS[e.kind];
    if (!chatter) continue;

    // Lazy initialise the first-line timer so an NPC doesn't speak
    // the instant it spawns.
    if (e.nextSayAt === undefined) {
      e.nextSayAt = now + pickInterval(world, chatter);
      continue;
    }

    // Pop the floating bubble when its TTL expires.
    if (e.sayExpiresAt !== undefined && e.sayExpiresAt <= now) {
      delete e.saying;
      delete e.sayExpiresAt;
    }

    if (now >= e.nextSayAt) {
      const pool = chatter.lines;
      const line = pool[Math.floor(world.rng.next() * pool.length)]!;
      e.saying = line;
      e.sayExpiresAt = now + SAY_TTL;
      world.chat.messages.push({
        id: genId(world, 'm'),
        author: chatter.speaker,
        text: line,
        channel: 'Normal',
      });
      e.nextSayAt = now + pickInterval(world, chatter);
    }
  }
}
