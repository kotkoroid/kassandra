// Click-to-select state for every world entity. The Scene draws a
// red ring under the chosen entity, and the HUD shows its name +
// level + hp bar at the top.
//
// We store a *handle* (kind + id) rather than a snapshot, then read
// the live record from the relevant array each frame. That way the
// panel and ring track movement and damage in real time.

import { beasts } from './beasts.svelte';
import { death } from './death.svelte';
import { enemies } from './enemies.svelte';
import { healers } from './healers.svelte';
import {
  getMonster,
  MONSTER_SWAIN,
  MONSTER_TROLLER,
} from './monsters';
import { SPIDER_VISUALS, spiders } from './spiders.svelte';
import { player } from './state.svelte';

export type Selection =
  | { kind: 'player' }
  | { kind: 'healer'; id: string }
  | { kind: 'spider'; id: string }
  | { kind: 'enemy'; id: string }
  | { kind: 'beast'; id: string }
  | { kind: 'troller' };

export const selection = $state<{ value: Selection | null }>({ value: null });

export interface SelectionView {
  name: string;
  level: number;
  hp: number;
  maxHp: number;
  x: number;
  z: number;
}

// Returns the live display fields for the current selection, or
// null if nothing is selected (or the previously selected entity
// has since despawned). Callers should re-evaluate every frame.
export function getSelectionView(): SelectionView | null {
  const s = selection.value;
  if (!s) return null;
  switch (s.kind) {
    case 'player':
      return {
        name: player.name,
        level: player.level,
        hp: player.health,
        maxHp: 100,
        x: player.x,
        z: player.z,
      };
    case 'healer': {
      const h = healers.find((x) => x.id === s.id);
      if (!h) return null;
      return {
        name: 'Janna',
        level: 10,
        hp: h.hp,
        maxHp: h.maxHp,
        x: h.x,
        z: h.z,
      };
    }
    case 'spider': {
      const sp = spiders.find((x) => x.id === s.id);
      if (!sp) return null;
      const monster = getMonster(SPIDER_VISUALS[sp.size].monsterId);
      return {
        name: monster.name,
        level: monster.level,
        hp: sp.hp,
        maxHp: sp.maxHp,
        x: sp.x,
        z: sp.z,
      };
    }
    case 'enemy': {
      const e = enemies.find((x) => x.id === s.id);
      if (!e) return null;
      const monster = getMonster(MONSTER_SWAIN);
      return {
        name: monster.name,
        level: monster.level,
        hp: e.hp,
        maxHp: e.maxHp,
        x: e.x,
        z: e.z,
      };
    }
    case 'beast': {
      const b = beasts.find((x) => x.id === s.id);
      if (!b) return null;
      const monster = getMonster(b.monsterId);
      return {
        name: monster.name,
        level: monster.level,
        hp: b.hp,
        maxHp: b.maxHp,
        x: b.x,
        z: b.z,
      };
    }
    case 'troller': {
      const g = death.gnome;
      if (!g) return null;
      const monster = getMonster(MONSTER_TROLLER);
      return {
        name: monster.name,
        level: monster.level,
        hp: g.hp,
        maxHp: g.maxHp,
        x: g.x,
        z: g.z,
      };
    }
  }
}

export function clearSelection() {
  selection.value = null;
}
