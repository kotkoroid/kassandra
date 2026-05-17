// Shared reactive state for the enemy system. `$state` arrays in a
// `.svelte.ts` module are deeply reactive — both array mutations
// (push/splice) and per-item field updates (x, z, cooldown) trigger
// re-renders in any component that reads them.

export interface Enemy {
  id: string;
  x: number;
  z: number;
  rotation: number;
  cooldown: number;
  hp: number;
}

export interface Projectile {
  id: string;
  x: number;
  z: number;
  vx: number;
  vz: number;
  traveled: number;
}

export const enemies = $state<Enemy[]>([]);
export const projectiles = $state<Projectile[]>([]);
