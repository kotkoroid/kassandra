// UI-only ring of floating damage popups spawned from the in-sim
// 'damage-dealt' event bus. Subscribing here means combat/projectile
// systems don't have to know anything about how (or whether) the
// numbers are rendered — turning them off is a one-line change.

import { subscribe } from '@kassandra/simulation';

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

subscribe((world, ev) => {
  if (ev.kind !== 'damage-dealt') return;
  const rounded = Math.max(0, Math.round(ev.amount));
  if (rounded === 0) return;
  damageNumbers.list.push({
    id: nextId++,
    x: ev.x,
    z: ev.z,
    amount: rounded,
    color: ev.byPlayer ? 'yellow' : 'red',
    spawnedAt: world.time,
  });
  // Hard cap so a fire-rate spike can't unbounded the array between
  // prune ticks. Oldest fall out first.
  if (damageNumbers.list.length > POP_CAP) {
    damageNumbers.list.splice(0, damageNumbers.list.length - POP_CAP);
  }
});

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
