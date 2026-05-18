// Periodic spawn timers for every monster type. Each kind has its
// own interval, cap, and placement strategy — spiders bubble up
// from random trees, the rest pick a random angle on a ring around
// the player. None of them spawn inside the city.

import { isInCity } from '../../city';
import { getVisibleProps } from '../../scene/world';
import { SPAWN } from '../constants';
import { spawnEntity } from '../spawn';
import type { EntityKind, World } from '../types';

export function tickSpawners(world: World, dt: number) {
  world.spawnTimers.spider += dt;
  world.spawnTimers.swain += dt;
  world.spawnTimers.wolf += dt;
  world.spawnTimers.bear += dt;
  world.spawnTimers.janna += dt;

  if (world.spawnTimers.spider >= SPAWN.spider.interval) {
    if (trySpiderFromTree(world)) world.spawnTimers.spider = 0;
  }
  if (world.spawnTimers.swain >= SPAWN.swain.interval) {
    if (tryRingSpawn(world, 'swain')) world.spawnTimers.swain = 0;
  }
  if (world.spawnTimers.wolf >= SPAWN.wolf.interval) {
    if (tryRingSpawn(world, 'wolf')) world.spawnTimers.wolf = 0;
  }
  if (world.spawnTimers.bear >= SPAWN.bear.interval) {
    if (tryRingSpawn(world, 'bear')) world.spawnTimers.bear = 0;
  }
  if (world.spawnTimers.janna >= SPAWN.janna.interval) {
    if (tryRingSpawn(world, 'janna')) world.spawnTimers.janna = 0;
  }
}

function countKind(world: World, kind: EntityKind): number {
  let n = 0;
  for (const e of world.entities) if (e.kind === kind) n++;
  return n;
}

function countSpiders(world: World): number {
  let n = 0;
  for (const e of world.entities) {
    if (
      e.kind === 'spider-big' ||
      e.kind === 'spider-medium' ||
      e.kind === 'spider-tiny'
    ) {
      n++;
    }
  }
  return n;
}

// Pick a random visible tree outside the city and spit a big spider
// out of it. If no tree qualifies this attempt is a no-op — the
// timer keeps ticking and the next tree-bearing chunk shifts in.
function trySpiderFromTree(world: World): boolean {
  if (countSpiders(world) >= SPAWN.spider.max) return false;
  const trees = getVisibleProps(world.player.x, world.player.z).filter(
    (p) => p.type === 'tree' && !isInCity(p.x, p.z),
  );
  if (trees.length === 0) return false;
  const tree = trees[Math.floor(world.rng.next() * trees.length)]!;
  const offset = SPAWN.spider.treeOffset;
  spawnEntity(
    world,
    'spider-big',
    tree.x + (world.rng.next() - 0.5) * offset,
    tree.z + (world.rng.next() - 0.5) * offset,
  );
  return true;
}

// Ring placement: choose a random angle around the player, pick a
// distance from the kind's [min, max] band, reject inside-city
// rolls. Returns true on a successful push so the caller can reset
// the timer.
function tryRingSpawn(
  world: World,
  kind: 'swain' | 'wolf' | 'bear' | 'janna',
): boolean {
  const config = SPAWN[kind];
  if (countKind(world, kind) >= config.max) return false;
  const angle = world.rng.next() * Math.PI * 2;
  const dist =
    config.distMin + world.rng.next() * (config.distMax - config.distMin);
  const x = world.player.x + Math.cos(angle) * dist;
  const z = world.player.z + Math.sin(angle) * dist;
  if (isInCity(x, z)) return false;

  spawnEntity(world, kind, x, z);
  return true;
}
