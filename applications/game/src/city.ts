// The city: a fixed safe zone at world origin. Player always spawns
// and respawns here; monsters refuse to enter, and standing inside
// drops aggro from anything that was chasing.

export const CITY_X = 0;
export const CITY_Z = 0;
// Big enough that the walled silhouette reads as a hub from a
// distance — the safe stone tile inside still anchors the spawn.
export const CITY_RADIUS = 12;

// Wall ring sits flush with the city perimeter. Used by the scene
// to place the stone curtain + crenellations + flanking gate towers.
export const CITY_WALL_HEIGHT = 1.8;
export const CITY_WALL_THICKNESS = 0.5;

// The gate is an angular opening in the wall ring. `CITY_GATE_ANGLE`
// is the centre direction of the gap (+X by default — visually the
// "south" side of town from the camera), `CITY_GATE_HALF_WIDTH` is
// half the angular size of the opening in radians.
export const CITY_GATE_ANGLE = 0;
export const CITY_GATE_HALF_WIDTH = 0.16;

export function isInCity(x: number, z: number): boolean {
  return Math.hypot(x - CITY_X, z - CITY_Z) < CITY_RADIUS;
}

// True when the world-space angle θ falls inside the gate opening
// (handles wrap around ±π). Used by the scene to skip wall segments
// at the gate and (later) by movement code to allow passage there.
export function isGateAngle(theta: number): boolean {
  let delta = theta - CITY_GATE_ANGLE;
  while (delta > Math.PI) delta -= 2 * Math.PI;
  while (delta < -Math.PI) delta += 2 * Math.PI;
  return Math.abs(delta) < CITY_GATE_HALF_WIDTH;
}
