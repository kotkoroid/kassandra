// Shared rock physics handles. Props.svelte owns the actual rock
// simulation (kick, friction, rock-rock collisions). It republishes
// each rock's world position + velocity into `rockSnapshot` at the
// end of every frame so other scene systems — currently just the
// loot-bag pile physics — can read up-to-date rock state without
// reaching into Props.svelte's local component state.
//
// The snapshot is intentionally plain (not reactive): consumers
// read it inside useTask which fires every frame, so per-key
// reactivity would be pure overhead.

export const ROCK_RADIUS = 0.18;

export interface RockSnapshot {
  x: number;
  z: number;
  radius: number;
  vx: number;
  vz: number;
}

export const rockSnapshot = new Map<string, RockSnapshot>();
