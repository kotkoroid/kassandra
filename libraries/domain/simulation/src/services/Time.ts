// Time service — PR-D1's simplest system migration.
//
// Wraps the existing systems/time.ts. The tick + pure derived helpers
// (currentHour, isNight, etc.) all stay where they are; this Service
// just exposes the orchestration-relevant entry point (`tick`) plus
// the day/night predicates as Effects so other Effect-native systems
// can compose with them without bouncing in and out of the Effect
// context.

import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';

import {
  currentHour as currentHourImpl,
  isNight as isNightImpl,
  nightStatMultiplier as nightStatMultiplierImpl,
  tickTime as tickTimeImpl,
} from '../systems/time.ts';
import type { World } from '../types.ts';

export interface TimeShape {
  /** Advance the world clock by `dt` seconds (mutates world.time). */
  readonly tick: (world: World, dt: number) => Effect.Effect<void>;
  /** Game-hour [0, 24) for the world's current time. */
  readonly currentHour: (world: World) => Effect.Effect<number>;
  /** Whether the current world time falls in the night window. */
  readonly isNight: (world: World) => Effect.Effect<boolean>;
  /** Stat multiplier active at night (1.0 during the day). */
  readonly nightStatMultiplier: (world: World) => Effect.Effect<number>;
}

export class Time extends Context.Service<Time, TimeShape>()(
  'kassandra/sim/Time',
) {}

export const makeTime: Effect.Effect<TimeShape> = Effect.succeed({
  tick: Effect.fn('Time.tick')(function* (world, dt) {
    tickTimeImpl(world, dt);
  }),
  currentHour: (world) => Effect.sync(() => currentHourImpl(world)),
  isNight: (world) => Effect.sync(() => isNightImpl(world)),
  nightStatMultiplier: (world) => Effect.sync(() => nightStatMultiplierImpl(world)),
});

export const TimeLayer = Layer.effect(Time)(makeTime);
