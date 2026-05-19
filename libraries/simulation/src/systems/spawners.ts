// Fixed spawn-point seeder + respawn drain.
//
// On the first tick, every entry in the SPAWN_POINTS catalog is
// realised as a live entity. The spawn-point id is stamped onto
// the entity (see `spawnEntity` in ../spawn.ts) so when combat.ts
// kills it, the spawner can schedule a respawn keyed by point id.
//
// The system has two responsibilities per tick:
//   1. One-time bootstrap: spawn every point's initial entity. Runs
//      once per world, guarded by `world.spawnPointsInitialized`.
//   2. Respawn drain: walk `world.spawnPointRespawnAt` and re-spawn
//      any point whose scheduled time has arrived. The map is the
//      source of truth — combat.ts writes entries on death, this
//      system removes them on respawn.
//
// Streaming ring/tree spawners that used to live here are gone; the
// world population is whatever the catalog specifies. Random-spawn
// behaviour (e.g. /m chat command, spider split, troller drop) still
// works because those paths call spawnEntity without a spawnPointId.

import { getSpawnPoint, SPAWN_POINTS, type SpawnPointId } from '../spawnPoints';
import { spawnEntity } from '../spawn';
import type { World } from '../types';

export function tickSpawners(world: World) {
  if (!world.spawnPointsInitialized) {
    for (const id of Object.keys(SPAWN_POINTS) as SpawnPointId[]) {
      const point = getSpawnPoint(id);
      spawnEntity(world, point.kind, point.x, point.z, point.rotation, id);
    }
    world.spawnPointsInitialized = true;
  }

  if (world.spawnPointRespawnAt.size === 0) return;

  // Collect first, mutate second — Map iteration tolerates deletion
  // mid-loop but we'd rather keep the read/write phases distinct.
  const now = world.time;
  const due: SpawnPointId[] = [];
  for (const [id, at] of world.spawnPointRespawnAt) {
    if (now >= at) due.push(id);
  }
  for (const id of due) {
    const point = getSpawnPoint(id);
    spawnEntity(world, point.kind, point.x, point.z, point.rotation, id);
    world.spawnPointRespawnAt.delete(id);
  }
}
