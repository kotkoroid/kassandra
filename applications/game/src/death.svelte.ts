// Death + loot recovery state. Single $state object so all consumers
// (Player rendering, Scene gating movement, Hud dialog, Death system)
// share one source of truth.

export interface Gnome {
  phase: 'approach' | 'collect' | 'leave';
  x: number;
  z: number;
  rotation: number;
  targetX: number;
  targetZ: number;
  timer: number;
}

export interface LootBag {
  x: number;
  z: number;
  ttl: number;
}

export interface IndicatorBug {
  x: number;
  z: number;
  rotation: number;
  wanderTargetX: number;
  wanderTargetZ: number;
  retargetTimer: number;
}

export const death = $state({
  alive: true,
  // Where the player fell. Blood pool + gnome anchor.
  deathX: 0,
  deathZ: 0,
  // Seconds until auto-respawn.
  respawnTimer: 0,
  // XP held in the active bag (the bag returns 75% of this).
  bagXp: 0,
  gnome: null as Gnome | null,
  bag: null as LootBag | null,
  bug: null as IndicatorBug | null,
});
