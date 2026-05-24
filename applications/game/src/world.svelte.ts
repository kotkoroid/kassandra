import { createWorld, type World } from '@kassandra/simulation-domain-library';
export const world = $state<World>(createWorld());
export function resetWorld(seed: number = Date.now() >>> 0) {
  const fresh = createWorld(seed);
  world.localPlayerId = fresh.localPlayerId;
  world.ownerId = fresh.ownerId;
  world.players = fresh.players;
  world.rng = fresh.rng;
  world.time = fresh.time;
  world.tick = fresh.tick;
  world.entities = fresh.entities;
  world.entityById = fresh.entityById;
  world.projectiles = fresh.projectiles;
  world.healingCircles = fresh.healingCircles;
  world.lootBags = fresh.lootBags;
  world.death = fresh.death;
  world.chat = fresh.chat;
  world.spawnPointsInitialized = fresh.spawnPointsInitialized;
  world.spawnPointRespawnAt = fresh.spawnPointRespawnAt;
  world.nextId = fresh.nextId;
  world.inputQueue = fresh.inputQueue;
  // PR-D3d.1: world.pending is gone — pending flags live on Player now.
}
