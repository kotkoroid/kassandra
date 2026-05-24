// Death pipeline — thin orchestrator over the pure-core in `pure/death.ts`.
//
//   alive=true  player.health hits 0
//       │      ──────────────────────────►  triggerDeath: stash XP, reset
//       │                                    stats, spawn Troller heading
//       │                                    for the corpse
//       │
//       ▼
//   alive=false  Troller phases (handled by `tickTroller`)
//       │            approach → collect → leave  → drop bag
//       │       (player can slash troller en-route; combat.ts
//       │        intercepts that path and drops the bag locally)
//       │
//       ▼
//   Hud "Respawn" button → SimEvent → pendingRespawn flag → respawn:
//                                     restore pools, teleport to city,
//                                     spawn indicator bug.
//
// PR-D3e.1: every helper that previously consumed `world.rng.next()`
// inline has been carved out into `pure/death.ts` and takes a
// `rng: () => number` callable. This file's only remaining role is
// to (1) walk the world's per-player + per-troller state, and (2)
// thread `world.rng.next` into the pure callees. Tests can call the
// pure functions directly with a fixed-sequence rng.
//
// Why the pure twins still take a callable instead of a pre-rolled
// `rngFloat: number`: `tickTroller` and `tickIndicatorBug` consume
// rng *conditionally* (only on phase transitions / retargets), so a
// pre-rolled value would either be wasted on the common path or
// shift the rng-stream consumption pattern of existing saved worlds.

import {
  respawn,
  tickIndicatorBug,
  tickTroller,
  triggerDeath,
} from '../pure/death.ts';
import type { World } from '../types.ts';

export function tickDeath(world: World, dt: number) {
  // PR-D3d.2: every player runs their own death pipeline. Multiple
  // trollers can coexist (one per dying player), tagged by
  // entity.forPlayerId; each player's indicator bug + summary +
  // attackers list lives on their Player record.
  const rng = () => world.rng.next();

  // 1. Detect fresh deaths and kick off per-player pipelines.
  for (const [pid, p] of Object.entries(world.players)) {
    if (p.alive && p.health <= 0) {
      triggerDeath(world, pid, rng);
    }
  }

  // 2. Honor each player's queued respawn intent.
  for (const [pid, p] of Object.entries(world.players)) {
    if (p.pendingRespawn) {
      p.pendingRespawn = false;
      if (!p.alive) respawn(world, pid, rng);
    }
  }

  // 3. Step troller(s) — one per dying player. The troller carries
  //    its own bagXp + forPlayerId so dropping the bag doesn't need
  //    any cross-reference to a global pipeline.
  for (let i = world.entities.length - 1; i >= 0; i--) {
    const e = world.entities[i];
    if (!e || e.kind !== 'troller') continue;
    tickTroller(world, e, i, dt, rng);
  }

  // 4. Indicator bugs — one per player with an active bug pointer.
  for (const [pid, p] of Object.entries(world.players)) {
    tickIndicatorBug(world, pid, p, dt, rng);
  }
}
