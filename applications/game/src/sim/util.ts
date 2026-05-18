// Cross-system helpers — kept tiny and pure so anything in sim/ can
// import without dragging system state around.

import { getVisibleWaters } from '../scene/world';
import type { Entity, EntityKind, World } from './types';

export function findEntity(world: World, id: string): Entity | null {
  return world.entityById.get(id) ?? null;
}

// Removes the entity at `index` from both the array and the id index.
// All entity removals must route through here to keep the two in sync.
export function removeEntity(world: World, index: number): void {
  const e = world.entities[index];
  if (e) world.entityById.delete(e.id);
  world.entities.splice(index, 1);
}

// Janna is the only ally entity kind. Troller is hostile (the
// player can slash it before it carries the bag away).
export function isHostile(kind: EntityKind): boolean {
  return kind !== 'janna';
}

export function isInWaterAt(x: number, z: number): boolean {
  for (const w of getVisibleWaters(x, z)) {
    if (Math.hypot(x - w.x, z - w.z) < w.radius) return true;
  }
  return false;
}

// Wrap-aware angle lerp — atan2 results sit in (-π, π] so a naive
// `a + (b - a) * t` jumps when the angle crosses the seam.
export function lerpAngle(a: number, b: number, t: number): number {
  let delta = b - a;
  while (delta > Math.PI) delta -= 2 * Math.PI;
  while (delta < -Math.PI) delta += 2 * Math.PI;
  return a + delta * t;
}
