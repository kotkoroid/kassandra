// Click-to-select state. Pure UI: which entity is highlighted with
// a red ring + shown in the top selection panel. Sim-side
// engagement (chase + auto-slash) is tracked separately on
// `world.player.engageTargetId`; selecting a hostile dispatches an
// `engage` event in addition to setting the local id.
//
// The selection is identified by entity id, with the sentinel
// 'player' covering the local character — which never appears in
// `world.entities` because it has its own slot.

import {
  getMonster,
  MONSTER_JANNA,
  MONSTER_TROLLER,
  getEffectiveStat,
} from '@kassandra/simulation';
import { world } from './world.svelte';

export type SelectionId = 'player' | string;

export const selection = $state<{ value: SelectionId | null }>({
  value: null,
});

export interface SelectionView {
  name: string;
  level: number;
  hp: number;
  maxHp: number;
  x: number;
  z: number;
}

export function getSelectionView(): SelectionView | null {
  const id = selection.value;
  if (!id) return null;
  if (id === 'player') {
    return {
      name: world.player.name,
      level: world.player.level,
      hp: world.player.health,
      maxHp: getEffectiveStat(world.player, 'maxHealth'),
      x: world.player.x,
      z: world.player.z,
    };
  }
  const entity = world.entityById.get(id);
  if (!entity) return null;
  // Name + level come from the catalog so the panel reads
  // identically to the floating nameplate.
  const monster = getMonster(entity.monsterId);
  return {
    name: monster.name,
    level: monster.level,
    hp: entity.hp,
    maxHp: entity.maxHp,
    x: entity.x,
    z: entity.z,
  };
}

export function clearSelection() {
  selection.value = null;
}

// Convenience for code that wants to know the underlying entity
// kind (e.g. SelectionPanel deciding whether to show "ally" vs
// "monster" badges).
export function selectedEntityKind() {
  const id = selection.value;
  if (!id || id === 'player') return null;
  return world.entityById.get(id)?.kind ?? null;
}

// Re-export catalog ids so consumers that care about ally/troller
// don't have to import from two modules.
export { MONSTER_JANNA, MONSTER_TROLLER };
