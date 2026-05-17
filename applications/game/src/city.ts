// The city: a fixed safe zone at world origin. Player always spawns
// and respawns here; monsters refuse to enter, and standing inside
// drops aggro from anything that was chasing.

export const CITY_X = 0;
export const CITY_Z = 0;
// "Little big" — large enough to feel like a hub, small enough to
// still see monsters at its edge.
export const CITY_RADIUS = 6;

export function isInCity(x: number, z: number): boolean {
  return Math.hypot(x - CITY_X, z - CITY_Z) < CITY_RADIUS;
}
