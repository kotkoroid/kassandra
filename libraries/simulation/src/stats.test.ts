import { expect, it } from '@effect/vitest';
import { Effect } from 'effect';
import {
  BASE_ATTACK_SPEED,
  BASE_DAMAGE,
  BASE_HEALTH_REGEN,
  PLAYER_MAX_HP,
  PLAYER_MAX_MANA,
  STAMINA_MAX,
} from './constants';
import { getEffectiveStat } from './stats';
import type { Modifier, Player } from './types';

function makePlayer(overrides: Partial<Player> = {}): Player {
  return {
    name: 'Test',
    sex: 'male',
    hairColor: 'black',
    armor: 'silver',
    playerClass: 'warrior',
    level: 1,
    experience: 0,
    health: PLAYER_MAX_HP,
    mana: PLAYER_MAX_MANA,
    stamina: STAMINA_MAX,
    x: 0,
    z: 0,
    rotation: 0,
    attackSpeed: BASE_ATTACK_SPEED,
    healthRegen: BASE_HEALTH_REGEN,
    damage: BASE_DAMAGE,
    equippedWeaponId: '',
    modifiers: [],
    effects: [],
    bag: [],
    lars: 0,
    abilities: [],
    skillPoints: 0,
    classSpellPoints: 0,
    activeQuests: [],
    autoAttack: true,
    engageTargetId: null,
    engageActive: true,
    navTargetX: null,
    navTargetZ: null,
    lastSlashTime: -Infinity,
    slashTrigger: 0,
    exhausted: false,
    saying: '',
    sayExpiresAt: 0,
    levelUpTrigger: 0,
    spellCooldowns: {},
    activeSpell: null,
    spellAnimTrigger: 0,
    ...overrides,
  };
}

it.effect('maxHealth returns base with no modifiers', () =>
  Effect.gen(function* () {
    expect(getEffectiveStat(makePlayer(), 'maxHealth')).toBe(PLAYER_MAX_HP);
  }),
);

it.effect('maxHealth applies additive modifier', () =>
  Effect.gen(function* () {
    const mod: Modifier = { stat: 'maxHealth', kind: 'add', value: 50 };
    expect(getEffectiveStat(makePlayer({ modifiers: [mod] }), 'maxHealth')).toBe(
      PLAYER_MAX_HP + 50,
    );
  }),
);

it.effect('maxHealth applies multiplicative modifier', () =>
  Effect.gen(function* () {
    const mod: Modifier = { stat: 'maxHealth', kind: 'mul', value: 2 };
    expect(getEffectiveStat(makePlayer({ modifiers: [mod] }), 'maxHealth')).toBe(PLAYER_MAX_HP * 2);
  }),
);

it.effect('add and mul stack — add first then multiply', () =>
  Effect.gen(function* () {
    const mods: Modifier[] = [
      { stat: 'maxHealth', kind: 'add', value: 100 },
      { stat: 'maxHealth', kind: 'mul', value: 1.5 },
    ];
    expect(getEffectiveStat(makePlayer({ modifiers: mods }), 'maxHealth')).toBe(
      (PLAYER_MAX_HP + 100) * 1.5,
    );
  }),
);

it.effect('modifiers for other stats are ignored', () =>
  Effect.gen(function* () {
    const mod: Modifier = { stat: 'damage', kind: 'add', value: 999 };
    expect(getEffectiveStat(makePlayer({ modifiers: [mod] }), 'maxHealth')).toBe(PLAYER_MAX_HP);
  }),
);

it.effect('moveSpeed base is 1', () =>
  Effect.gen(function* () {
    expect(getEffectiveStat(makePlayer(), 'moveSpeed')).toBe(1);
  }),
);
