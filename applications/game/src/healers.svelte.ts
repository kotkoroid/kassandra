// Shared reactive state for the healer system. Same pattern as
// enemies.svelte.ts: $state arrays are deeply reactive so array
// mutations and per-item field changes both propagate.

export interface Healer {
  id: string;
  x: number;
  z: number;
  rotation: number;
  cooldown: number;
  hp: number;
}

export interface HealingCircle {
  id: string;
  x: number;
  z: number;
  ttl: number;
}

export const healers = $state<Healer[]>([]);
export const healingCircles = $state<HealingCircle[]>([]);
