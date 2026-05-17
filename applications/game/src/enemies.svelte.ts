// Shared reactive state for the enemy system. `$state` arrays in a
// `.svelte.ts` module are deeply reactive — both array mutations
// (push/splice) and per-item field updates (x, z, cooldown) trigger
// re-renders in any component that reads them.

export interface Enemy {
  id: string;
  x: number;
  z: number;
  rotation: number;
  // Seconds until this enemy's next shot.
  cooldown: number;
  // Attack Speed: shots per second this enemy can fire.
  attackSpeed: number;
  hp: number;
  maxHp: number;
  // Per-shot damage locked in at spawn so a night-spawned Swain
  // keeps its boost even after dawn.
  damage: number;
  healthRegen: number;
}

export interface Projectile {
  id: string;
  x: number;
  z: number;
  vx: number;
  vz: number;
  traveled: number;
  // Damage carried by this projectile; captured from the firing
  // enemy at launch so a daytime orb can't gain night damage in
  // flight (and vice versa).
  damage: number;
}

export const enemies = $state<Enemy[]>([]);
export const projectiles = $state<Projectile[]>([]);
