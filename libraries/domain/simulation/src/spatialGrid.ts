// Coarse spatial hash for O(1) radius queries in the sim.
//
// Cell size is chosen so every query radius in the sim (SWORD_REACH=1.6,
// PROJECTILE_HIT_RADIUS=0.5, melee attackRange≤1.0) visits at most a
// 2×2 cell neighbourhood — one cell the query point sits in, plus one
// ring of adjacent cells along each axis.
//
// The grid is rebuilt once per tick (rebuildGrid in tick.ts) before any
// system runs, so all consumers see the same positional snapshot. Melee
// entities that move mid-tick introduce at most dt×speed ≈ 0.06 unit
// error by the time tickProjectiles reads it — well within any hit radius.
//
// Non-moving entities (Janna, Azir, ranged casters) have zero drift, so
// projectile-intercept queries are exact.

import type { Entity } from './types.ts';

const CELL = 4; // world units per grid cell
const PRIME = 99991; // for a simple two-axis hash

function cellKey(cx: number, cz: number): number {
  return cx * PRIME + cz;
}

export class SpatialGrid {
  private cells = new Map<number, Entity[]>();

  clear() {
    this.cells.clear();
  }

  insert(e: Entity) {
    const k = cellKey(Math.floor(e.x / CELL), Math.floor(e.z / CELL));
    let bucket = this.cells.get(k);
    if (!bucket) {
      bucket = [];
      this.cells.set(k, bucket);
    }
    bucket.push(e);
  }

  // Returns every entity within radius r of (x, z).
  // The caller still receives the raw entity references — no copies.
  queryRadius(x: number, z: number, r: number): Entity[] {
    const r2 = r * r;
    const cx0 = Math.floor((x - r) / CELL);
    const cx1 = Math.floor((x + r) / CELL);
    const cz0 = Math.floor((z - r) / CELL);
    const cz1 = Math.floor((z + r) / CELL);
    const out: Entity[] = [];
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cz = cz0; cz <= cz1; cz++) {
        const bucket = this.cells.get(cellKey(cx, cz));
        if (!bucket) continue;
        for (const e of bucket) {
          const dx = e.x - x;
          const dz = e.z - z;
          if (dx * dx + dz * dz <= r2) out.push(e);
        }
      }
    }
    return out;
  }
}

// Module-level singleton. Rebuilt at the top of every tick so every sim
// system reads a consistent snapshot.
export const grid = new SpatialGrid();

export function rebuildGrid(entities: Entity[]) {
  grid.clear();
  for (const e of entities) grid.insert(e);
}
