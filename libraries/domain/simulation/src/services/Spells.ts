// Spells service — wraps the spells.ts module.
//
// PR-D2 thin Effect wrappers. The pure-core math (channelled spell
// ticks, cooldowns, mana costs) stays in spells.ts unchanged; this
// surface lets handler/orchestrator code yield `Spells` instead of
// calling the function exports directly. Internals migrate in PR-D3.

import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';

import {
  castSpell as castSpellImpl,
  getSpellLevel as getSpellLevelImpl,
  getSpellManaCost as getSpellManaCostImpl,
  levelUpSpell as levelUpSpellImpl,
  tickSpells as tickSpellsImpl,
} from '../spells.ts';
import type { Player, World } from '../types.ts';

export interface SpellsShape {
  /** Local player casts `spellId` at `targetId` (null for self/AoE). */
  readonly cast: (
    world: World,
    spellId: string,
    targetId: string | null,
  ) => Effect.Effect<void>;
  /** Spend one classSpellPoint to raise this spell's level by 1. */
  readonly levelUp: (world: World, spellId: string) => Effect.Effect<void>;
  /** Advance channelled spells (Rush dash, Hail ticks, etc.). */
  readonly tick: (world: World, dt: number) => Effect.Effect<void>;
  /** Mana cost for casting `spellId` at `level`. */
  readonly manaCost: (spellId: string, level: number) => Effect.Effect<number>;
  /** Current level of `spellId` for `player`. */
  readonly levelOf: (player: Player, spellId: string) => Effect.Effect<number>;
}

export class Spells extends Context.Service<Spells, SpellsShape>()(
  'kassandra/sim/Spells',
) {}

export const makeSpells: Effect.Effect<SpellsShape> = Effect.succeed({
  cast: Effect.fn('Spells.cast')(function* (world, spellId, targetId) {
    castSpellImpl(world, spellId, targetId);
  }),
  levelUp: Effect.fn('Spells.levelUp')(function* (world, spellId) {
    levelUpSpellImpl(world, spellId);
  }),
  tick: Effect.fn('Spells.tick')(function* (world, dt) {
    tickSpellsImpl(world, dt);
  }),
  manaCost: (spellId, level) => Effect.sync(() => getSpellManaCostImpl(spellId, level)),
  levelOf: (player, spellId) => Effect.sync(() => getSpellLevelImpl(player, spellId)),
});

export const SpellsLayer = Layer.effect(Spells)(makeSpells);
