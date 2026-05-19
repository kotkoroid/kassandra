// Spawn-point catalog loader. Mirrors monsters.ts / items.ts — the
// JSONC source ships as raw text so authors can keep `//` comments
// alongside each entry. Same naive stripper handles `//` + `/* */`.
//
// A spawn point is a permanent anchor in world space for a single
// NPC. `tickSpawners` seeds an entity at every point on first tick;
// when an entity tied to a point dies, the spawner schedules a
// respawn iff the point has a `respawnDelay`.

import rawCatalog from './data/spawnPoints.jsonc?raw';
import type { EntityKind } from './simulation/types';

export interface SpawnPoint {
  kind: Exclude<EntityKind, 'troller'>;
  x: number;
  z: number;
  rotation?: number;
  // Seconds between death and respawn. Omitted = never respawns.
  respawnDelay?: number;
}

export type SpawnPointId = string;

function stripJsonc(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:"])\/\/.*$/gm, '$1');
}

export const SPAWN_POINTS: Record<SpawnPointId, SpawnPoint> = JSON.parse(
  stripJsonc(rawCatalog),
);

export function getSpawnPoint(id: SpawnPointId): SpawnPoint {
  const p = SPAWN_POINTS[id];
  if (!p) throw new Error(`Unknown spawn point: ${id}`);
  return p;
}
