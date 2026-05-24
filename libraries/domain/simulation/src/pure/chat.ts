// PR-D3e.2 — pure-core extraction for chat slash-commands.
//
// `systems/chat.ts` interprets slash-commands; the only one that
// consumes rng is `/m [ID] [COUNT?]`, which scatters spawns around
// the player at random angles/distances. This module carves out that
// scatter helper so callers (and tests) can drive a fixed-sequence
// rng.

import type { MonsterId } from '../monsters.ts';
import { spawnByMonsterId } from '../spawn.ts';
import type { World } from '../types.ts';
import { localPlayer } from '../world.ts';

/**
 * Spawn `count` instances of `monsterId` at random offsets around the
 * local player. Returns the number successfully spawned; a falsy
 * return from `spawnByMonsterId` short-circuits the loop (used to
 * propagate "no spawn handler" feedback to the caller).
 *
 * Rng consumption: two calls per spawn (angle + dist). Linear in
 * `count`; no early-exit savings.
 */
export function scatterSpawnsAroundPlayer(
  world: World,
  monsterId: MonsterId,
  count: number,
  rng: () => number,
): { ok: boolean; spawned: number } {
  const player = localPlayer(world);
  for (let i = 0; i < count; i++) {
    const angle = rng() * Math.PI * 2;
    const dist = 4 + rng() * 4;
    const x = player.x + Math.cos(angle) * dist;
    const z = player.z + Math.sin(angle) * dist;
    if (!spawnByMonsterId(world, monsterId, x, z)) {
      return { ok: false, spawned: i };
    }
  }
  return { ok: true, spawned: count };
}
