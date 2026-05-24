// PR-D3e.2 — pure-core extraction for ambient NPC chatter.
//
// `tickNpcChat` walks NPC entities, samples one-liners from each
// kind's pool, and pushes them into the world chat log + a floating
// bubble above the speaker. Rng usage is internal to that loop —
// pickInterval (cadence between lines) and the line picker — so the
// whole tick function moves to pure/ and `systems/npcChat.ts` keeps
// a thin wrapper that binds `world.rng.next`.

import { SAY_TTL } from '../constants.ts';
import type { EntityKind, World } from '../types.ts';
import { genId } from '../world.ts';

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

function pickInterval(c: NpcChatter, rng: () => number): number {
  return c.cadenceMin + rng() * (c.cadenceMax - c.cadenceMin);
}

/**
 * Pure twin of `tickNpcChat`. Rng consumption is per-speaker and
 * conditional on (a) the speaker's first sight (one call for the
 * initial cadence) or (b) the speaker's `nextSayAt` window having
 * arrived (two calls: line pick + next cadence).
 */
export function tickNpcChat(world: World, rng: () => number) {
  const now = world.time;
  for (const e of world.entities) {
    const chatter = CHATTERS[e.kind];
    if (!chatter) continue;

    // Lazy initialise the first-line timer so an NPC doesn't speak
    // the instant it spawns.
    if (e.nextSayAt === undefined) {
      e.nextSayAt = now + pickInterval(chatter, rng);
      continue;
    }

    // Pop the floating bubble when its TTL expires.
    if (e.sayExpiresAt !== undefined && e.sayExpiresAt <= now) {
      delete e.saying;
      delete e.sayExpiresAt;
    }

    if (now >= e.nextSayAt) {
      const pool = chatter.lines;
      const line = pool[Math.floor(rng() * pool.length)]!;
      e.saying = line;
      e.sayExpiresAt = now + SAY_TTL;
      world.chat.messages.push({
        id: genId(world, 'm'),
        author: chatter.speaker,
        text: line,
        channel: 'Normal',
      });
      e.nextSayAt = now + pickInterval(chatter, rng);
    }
  }
}
