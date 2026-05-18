// Monster catalog loader. Mirrors items.ts — the source file is JSONC
// imported as raw text so authors can keep `//` comments alongside
// each entry; the same naive stripper handles `//` + `/* */`.

import rawCatalog from './monsters.jsonc?raw';

export type MonsterType = 'ANIMAL' | 'ALLY';

export interface MonsterAttributes {
  damage: number;
  attackSpeed: number;
  health: number;
  healthRegen: number;
  // XP granted to the player when this monster is slain.
  experience: number;
}

export interface Monster {
  name: string;
  type: MonsterType;
  level: number;
  attributes: MonsterAttributes;
}

export type MonsterId = string;

function stripJsonc(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:"])\/\/.*$/gm, '$1');
}

export const MONSTERS: Record<MonsterId, Monster> = JSON.parse(
  stripJsonc(rawCatalog),
);

// Stable id constants so call sites don't sprinkle magic strings.
export const MONSTER_WOLF: MonsterId = 'MONSTER000001';
export const MONSTER_BEAR: MonsterId = 'MONSTER000002';
export const MONSTER_SWAIN: MonsterId = 'MONSTER000003';
export const MONSTER_SPIDER: MonsterId = 'MONSTER000004';
export const MONSTER_SMALL_SPIDER: MonsterId = 'MONSTER000005';
export const MONSTER_TINY_SPIDER: MonsterId = 'MONSTER000006';
export const MONSTER_TROLLER: MonsterId = 'MONSTER000007';
export const MONSTER_JANNA: MonsterId = 'MONSTER000008';

export function getMonster(id: MonsterId): Monster {
  const m = MONSTERS[id];
  if (!m) throw new Error(`Unknown monster: ${id}`);
  return m;
}
