// Death + loot recovery state. Single $state object so all consumers
// (Player rendering, Scene gating movement, Hud dialog, Death system)
// share one source of truth.

import {
  BASE_ATTACK_SPEED,
  BASE_DAMAGE,
  BASE_HEALTH_REGEN,
  EXP_PER_LEVEL,
  player,
  STAMINA_MAX,
} from './state.svelte';

export interface Gnome {
  phase: 'approach' | 'collect' | 'leave';
  x: number;
  z: number;
  rotation: number;
  targetX: number;
  targetZ: number;
  timer: number;
  // Troller is a regular monster — slashable like spiders/wolves.
  // hp/maxHp track health for the overhead bar and lethal hits.
  hp: number;
  maxHp: number;
}

export interface LootBag {
  x: number;
  z: number;
  ttl: number;
}

export interface IndicatorBug {
  x: number;
  z: number;
  rotation: number;
  wanderTargetX: number;
  wanderTargetZ: number;
  retargetTimer: number;
}

export const death = $state({
  alive: true,
  // Where the player fell. Blood pool + gnome anchor.
  deathX: 0,
  deathZ: 0,
  // XP held in the active bag. The bag returns BAG_XP_RECOVERY of
  // this on pickup (see Death.svelte's stepBag).
  bagXp: 0,
  gnome: null as Gnome | null,
  bag: null as LootBag | null,
  bug: null as IndicatorBug | null,
});

// Fraction of the held XP returned when the player reclaims the
// loot bag. The remaining 30% is the death penalty.
export const BAG_XP_RECOVERY = 0.7;

// Resets everything earned during this life back to base values.
// Called from the death trigger in Death.svelte once health hits 0.
// Items haven't been wired into the bag yet — when they are, this is
// where the equipped/inventory transfer to death.bag will happen.
export function loseProgressOnDeath() {
  // player.experience is just the *bar* — XP earned toward the next
  // level. Stash the full lifetime total so the bag can return a
  // meaningful 70% on pickup; otherwise levels that finished cleanly
  // would silently evaporate.
  death.bagXp = (player.level - 1) * EXP_PER_LEVEL + player.experience;
  player.experience = 0;
  player.level = 1;
  player.attackSpeed = BASE_ATTACK_SPEED;
  player.healthRegen = BASE_HEALTH_REGEN;
  player.damage = BASE_DAMAGE;
}

// Player-initiated respawn. Called from the Hud's "Respawn" button —
// there is no auto-respawn timer, so the dead screen stays up until
// the user clicks. Scene.svelte watches the alive transition to
// teleport the body back to the city.
export function requestRespawn() {
  if (death.alive) return;
  death.alive = true;
  player.health = 100;
  player.mana = 100;
  player.stamina = STAMINA_MAX;
  // Indicator bug spawns next to the respawned player so the visual
  // breadcrumb back to the loot bag (if any) appears immediately.
  const angle = Math.random() * Math.PI * 2;
  death.bug = {
    x: player.x + Math.cos(angle) * 1.5,
    z: player.z + Math.sin(angle) * 1.5,
    rotation: 0,
    wanderTargetX: player.x,
    wanderTargetZ: player.z,
    retargetTimer: 0,
  };
}
