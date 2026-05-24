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
import type { Player, PlayerId, World } from '../types.ts';

export interface SpellsShape {
  /**
   * `playerId` casts `spellId` at `targetId` (null for self/AoE).
   * PR-D3b takes pid explicitly instead of reading world.localPlayerId.
   */
  readonly cast: (
    world: World,
    playerId: PlayerId,
    spellId: string,
    targetId: string | null,
  ) => Effect.Effect<void>;
  /** Spend one of `playerId`'s classSpellPoints to raise the spell's level. */
  readonly levelUp: (
    world: World,
    playerId: PlayerId,
    spellId: string,
  ) => Effect.Effect<void>;
  /** Advance channelled spells (Rush dash, Hail ticks, etc.) for `playerId`. */
  readonly tick: (
    world: World,
    playerId: PlayerId,
    dt: number,
  ) => Effect.Effect<void>;
  /** Mana cost for casting `spellId` at `level`. */
  readonly manaCost: (spellId: string, level: number) => Effect.Effect<number>;
  /** Current level of `spellId` for `player`. */
  readonly levelOf: (player: Player, spellId: string) => Effect.Effect<number>;
}

export class Spells extends Context.Service<Spells, SpellsShape>()(
  'kassandra/sim/Spells',
) {}

export const makeSpells: Effect.Effect<SpellsShape> = Effect.succeed({
  cast: Effect.fn('Spells.cast')(function* (world, playerId, spellId, targetId) {
    castSpellImpl(world, playerId, spellId, targetId);
  }),
  levelUp: Effect.fn('Spells.levelUp')(function* (world, playerId, spellId) {
    levelUpSpellImpl(world, playerId, spellId);
  }),
  tick: Effect.fn('Spells.tick')(function* (world, playerId, dt) {
    tickSpellsImpl(world, playerId, dt);
  }),
  manaCost: (spellId, level) => Effect.sync(() => getSpellManaCostImpl(spellId, level)),
  levelOf: (player, spellId) => Effect.sync(() => getSpellLevelImpl(player, spellId)),
});

export const SpellsLayer = Layer.effect(Spells)(makeSpells);
