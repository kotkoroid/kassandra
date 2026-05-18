// Cross-system helpers — kept tiny and pure so anything in sim/ can
// import without dragging system state around.

import { getItem } from '../items';
import { getVisibleWaters } from '../scene/world';
import type { Entity, EntityKind, Player, World } from './types';

export function findEntity(world: World, id: string): Entity | null {
  return world.entities.find((e) => e.id === id) ?? null;
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

// Effective player stats include the equipped weapon's contribution.
// Reading the catalog each call is fine — it's a Record lookup.

export function effectiveAttackSpeed(player: Player): number {
  const w = getItem(player.equippedWeaponId);
  return player.attackSpeed + (w?.attributes.attackSpeed ?? 0);
}

export function effectiveDamage(player: Player): number {
  const w = getItem(player.equippedWeaponId);
  return player.damage + (w?.attributes.damage ?? 0);
}

// Wrap-aware angle lerp — atan2 results sit in (-π, π] so a naive
// `a + (b - a) * t` jumps when the angle crosses the seam.
export function lerpAngle(a: number, b: number, t: number): number {
  let delta = b - a;
  while (delta > Math.PI) delta -= 2 * Math.PI;
  while (delta < -Math.PI) delta += 2 * Math.PI;
  return a + delta * t;
}
