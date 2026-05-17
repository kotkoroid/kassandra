// World clock. The full 24-hour day completes in 30 real seconds at
// a uniform rate, so every game-hour is 1.25 s. Day (hours 6→22)
// fills 20 s of that; night (hours 22→6) fills 10 s.

export const CYCLE_SECONDS = 300; // full 24-hour cycle in real seconds
export const HOURS_PER_CYCLE = 24;
export const SECONDS_PER_HOUR = CYCLE_SECONDS / HOURS_PER_CYCLE; // 1.25
// Cycle starts at dawn so a fresh run drops the player into morning.
export const START_HOUR = 6;
// Night window. Inclusive of NIGHT_START, exclusive of NIGHT_END.
export const NIGHT_START = 22;
export const NIGHT_END = 6;
// Monster stat multiplier while it's night.
export const NIGHT_BOOST = 5;

export const time = $state({
  // Real seconds since cycle start. Wraps every CYCLE_SECONDS.
  elapsed: 0,
});

export function currentHour(): number {
  const h = START_HOUR + time.elapsed / SECONDS_PER_HOUR;
  return ((h % HOURS_PER_CYCLE) + HOURS_PER_CYCLE) % HOURS_PER_CYCLE;
}

export function isNightHour(hour: number): boolean {
  // Night straddles midnight: [22, 24) ∪ [0, 6).
  return hour >= NIGHT_START || hour < NIGHT_END;
}

export function isNight(): boolean {
  return isNightHour(currentHour());
}

// Multiplier applied to every monster stat during the night phase.
export function nightStatMultiplier(): number {
  return isNight() ? NIGHT_BOOST : 1;
}
