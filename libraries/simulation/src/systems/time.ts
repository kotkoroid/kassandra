import {
  CYCLE_SECONDS,
  HOURS_PER_CYCLE,
  NIGHT_BOOST,
  NIGHT_END,
  NIGHT_START,
  SECONDS_PER_HOUR,
  START_HOUR,
} from '../constants';
import type { World } from '../types';

// Advance the world clock. Sun rig + day/night logic derive
// everything they need from `world.time`, so the tick itself is a
// one-liner; the helpers below are pure functions over the
// resulting timestamp so views and sim systems share one source of
// truth.
export function tickTime(world: World, dt: number) {
  world.time = (world.time + dt) % CYCLE_SECONDS;
}

// Game-hour in [0, 24) for the world's current time.
export function currentHour(world: World): number {
  const h = START_HOUR + world.time / SECONDS_PER_HOUR;
  return ((h % HOURS_PER_CYCLE) + HOURS_PER_CYCLE) % HOURS_PER_CYCLE;
}

export function isNightHour(hour: number): boolean {
  return hour >= NIGHT_START || hour < NIGHT_END;
}

export function isNight(world: World): boolean {
  return isNightHour(currentHour(world));
}

export function nightStatMultiplier(world: World): number {
  return isNight(world) ? NIGHT_BOOST : 1;
}
