// Snapshot interpolation — bridges the 20 Hz server tick to 60 Hz+
// rendering so the world doesn't visibly step every 50 ms.
//
// Architecture: `applySnapshot` is the *target* writer (every server
// frame), and `tickInterpolation` is the *position* writer (every
// render frame). Between them, `world.players[id].x` is the lerped
// rendered position, not the raw snapshot position. The authoritative
// snapshot position lives in this module's target Maps until the lerp
// catches up.
//
// Why exponential smoothing over fixed-duration lerp:
//   - One frame-rate-independent constant tunes the feel; no need to
//     track per-entity prev/target/timestamp triples.
//   - Network jitter is handled implicitly — a late snapshot just
//     means the world keeps smoothing toward the previous target until
//     a fresher one arrives, then continues toward the new one.
//   - Cheap: one Math.exp per frame, one mul-add per entity per axis.
//
// Trade-off: rendered position lags the snapshot by ~half a tick
// (~25 ms) — fine for an RPG, not for twitch-FPS. The constant can be
// raised if input responsiveness becomes the bottleneck.

import { world } from '../world.svelte';

// Per-second smoothing rate. With α = 1 - exp(-RATE * dt):
//   dt = 1/60  → α ≈ 0.63  (one frame catches up 63% of the gap)
//   dt = 1/20  → α ≈ 0.95  (a full tick catches up 95% of the gap)
// Tuned so the visible position closes most of the gap each server
// frame, leaving a tiny residual that the next frame absorbs.
const SMOOTHING_RATE = 60;

interface PositionTarget {
  readonly x: number;
  readonly z: number;
  readonly rotation?: number;
}

// Parallel state keyed by entity id. World state holds the *rendered*
// position; these Maps hold the *authoritative* snapshot position.
const playerTargets = new Map<string, PositionTarget>();
const entityTargets = new Map<string, PositionTarget>();
const projectileTargets = new Map<string, PositionTarget>();
const healingCircleTargets = new Map<string, PositionTarget>();

/**
 * True if `id` was unknown to the interpolator before this snapshot —
 * i.e. it's a freshly spawned entity that should appear AT its snapshot
 * position rather than sliding in from the previous frame's rendered
 * position (which would be 0,0 / a stale prior entity's slot / etc.).
 */
export function isNewPlayer(id: string): boolean {
  return !playerTargets.has(id);
}
export function isNewEntity(id: string): boolean {
  return !entityTargets.has(id);
}
export function isNewProjectile(id: string): boolean {
  return !projectileTargets.has(id);
}
export function isNewHealingCircle(id: string): boolean {
  return !healingCircleTargets.has(id);
}

/**
 * Register the latest server-authoritative positions as the lerp
 * targets. Called by `applySnapshot` after the new world state has
 * been built (with positions left at their rendered values). Returns
 * nothing; subsequent `tickInterpolation` calls pull the world toward
 * these targets.
 */
export function recordTargets(snapshot: {
  readonly players: ReadonlyArray<{ id: string; x: number; z: number; rotation: number }>;
  readonly entities: ReadonlyArray<{ id: string; x: number; z: number; rotation: number }>;
  readonly projectiles: ReadonlyArray<{ id: string; x: number; z: number }>;
  readonly healingCircles: ReadonlyArray<{ id: string; x: number; z: number }>;
}): void {
  // Players: clear-and-refill so disappeared players don't keep being
  // lerped against stale targets.
  playerTargets.clear();
  for (const p of snapshot.players) {
    playerTargets.set(p.id, { x: p.x, z: p.z, rotation: p.rotation });
  }

  entityTargets.clear();
  for (const e of snapshot.entities) {
    entityTargets.set(e.id, { x: e.x, z: e.z, rotation: e.rotation });
  }

  projectileTargets.clear();
  for (const p of snapshot.projectiles) {
    projectileTargets.set(p.id, { x: p.x, z: p.z });
  }

  healingCircleTargets.clear();
  for (const h of snapshot.healingCircles) {
    healingCircleTargets.set(h.id, { x: h.x, z: h.z });
  }
}

/**
 * Shortest-arc rotation lerp. Plain linear lerp on radians takes the
 * long way around near ±π (e.g. -3 → 3 traverses 6 radians clockwise
 * instead of 0.28 radians counter-clockwise). The signed-arc reduction
 * `((b-a + π) mod 2π) - π` gives the value in [-π, π] to step along.
 */
function lerpAngle(current: number, target: number, alpha: number): number {
  const TAU = Math.PI * 2;
  const diff = ((target - current + Math.PI) % TAU + TAU) % TAU - Math.PI;
  return current + diff * alpha;
}

/**
 * Advance the lerp one render frame. Called from Scene.svelte's
 * useTask with the frame's delta-time in seconds. Mutates world
 * positions in place — keep the call BEFORE any render code that
 * reads `world.players[id].x` (camera, model, nameplate, …) so they
 * all read the same lerped value within a single frame.
 *
 * Idempotent on entities that have already reached their target
 * (alpha * 0 = 0); cheap to call every frame regardless of motion.
 */
export function tickInterpolation(dt: number): void {
  if (dt <= 0) return;
  // Cap dt so a hitched frame doesn't snap the entire world forward
  // (a 1 s pause shouldn't make every entity teleport to its target —
  // it should resume smoothing as if no time had passed).
  const dtClamped = Math.min(dt, 0.1);
  const alpha = 1 - Math.exp(-SMOOTHING_RATE * dtClamped);

  // Players
  for (const [id, target] of playerTargets) {
    const p = world.players[id];
    if (!p) continue;
    p.x = p.x + (target.x - p.x) * alpha;
    p.z = p.z + (target.z - p.z) * alpha;
    if (target.rotation !== undefined) {
      p.rotation = lerpAngle(p.rotation, target.rotation, alpha);
    }
  }

  // Entities (array, indexed lookup against the entity's own id)
  for (let i = 0; i < world.entities.length; i++) {
    const e = world.entities[i]!;
    const target = entityTargets.get(e.id);
    if (!target) continue;
    e.x = e.x + (target.x - e.x) * alpha;
    e.z = e.z + (target.z - e.z) * alpha;
    if (target.rotation !== undefined) {
      e.rotation = lerpAngle(e.rotation, target.rotation, alpha);
    }
  }

  // Projectiles — no rotation in the schema; they ride a velocity
  // vector that's already encoded by the position delta between
  // snapshots.
  for (let i = 0; i < world.projectiles.length; i++) {
    const p = world.projectiles[i]!;
    const target = projectileTargets.get(p.id);
    if (!target) continue;
    p.x = p.x + (target.x - p.x) * alpha;
    p.z = p.z + (target.z - p.z) * alpha;
  }

  // Healing circles — usually stationary while alive; cheap to lerp
  // anyway and covers any future drift behaviour.
  for (let i = 0; i < world.healingCircles.length; i++) {
    const h = world.healingCircles[i]!;
    const target = healingCircleTargets.get(h.id);
    if (!target) continue;
    h.x = h.x + (target.x - h.x) * alpha;
    h.z = h.z + (target.z - h.z) * alpha;
  }
}
