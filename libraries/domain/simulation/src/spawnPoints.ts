import type { EntityKind } from './types.ts';

import catalog from './data/spawnPoints.json' with { type: 'json' };

export interface SpawnPoint {
  kind: Exclude<EntityKind, 'troller'>;
  x: number;
  z: number;
  rotation?: number;
  respawnDelay?: number;
}

export type SpawnPointId = string;

export const SPAWN_POINTS: Record<SpawnPointId, SpawnPoint> = catalog as Record<SpawnPointId, SpawnPoint>;

export function getSpawnPoint(id: SpawnPointId): SpawnPoint {
  const p = SPAWN_POINTS[id];
  if (!p) throw new Error(`Unknown spawn point: ${id}`);
  return p;
}
