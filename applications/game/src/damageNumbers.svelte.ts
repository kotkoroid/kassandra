// UI-only ring of floating damage popups driven by the sim's
// `damage-dealt` event. PR-D3d.3: in the multiplayer architecture
// the sim runs in the realm DO, so the old client-side
// `subscribe()` against a module-level Set never fired. Events now
// arrive via `Snapshot.recentEvents`; `applySnapshot` calls
// `dispatchSimEvent` once per event each tick.

import type { GameEvent } from '@kassandra/simulation-domain-library';

export interface DamagePop {
  id: number;
  x: number;
  z: number;
  amount: number;
  // 'yellow' = damage the player dealt, 'red' = damage they took.
  color: 'yellow' | 'red';
  // Sim time at spawn; the renderer compares to world.time each
  // frame to drive the float-up + fade-out and to prune.
  spawnedAt: number;
}

export const DAMAGE_TTL = 1.2;
const POP_CAP = 64;

let nextId = 1;

export const damageNumbers = $state<{ list: DamagePop[] }>({ list: [] });

/**
 * Push a `damage-dealt` event into the popup ring. Other event
 * kinds (level-up, kill, spell-cast) flow through the same dispatch
 * fn but are no-ops here — UI consumers can hook them by extending
 * this switch or adding a sibling dispatcher.
 *
 * `simTime` is the sim's `world.time` at the moment the event was
 * emitted (taken from the snapshot the event arrived in). It anchors
 * the popup's TTL to sim time, not wall-clock — pausing the sim
 * pauses the popups.
 */
export function dispatchSimEvent(ev: GameEvent, simTime: number): void {
  if (ev.kind !== 'damage-dealt') return;
  const rounded = Math.max(0, Math.round(ev.amount));
  if (rounded === 0) return;
  damageNumbers.list.push({
    id: nextId++,
    x: ev.x,
    z: ev.z,
    amount: rounded,
    color: ev.byPlayer ? 'yellow' : 'red',
    spawnedAt: simTime,
  });
  // Hard cap so a fire-rate spike can't unbounded the array between
  // prune ticks. Oldest fall out first.
  if (damageNumbers.list.length > POP_CAP) {
    damageNumbers.list.splice(0, damageNumbers.list.length - POP_CAP);
  }
}

// Called from the renderer's useTask. We can't do this in sim
// because the popup queue is UI-only.
export function pruneDamageNumbers(now: number) {
  const list = damageNumbers.list;
  // First-survivor index — the queue is append-only and roughly
  // age-ordered so a linear scan from the front is enough.
  let firstAlive = 0;
  while (firstAlive < list.length && now - list[firstAlive]!.spawnedAt >= DAMAGE_TTL) {
    firstAlive++;
  }
  if (firstAlive > 0) list.splice(0, firstAlive);
}
