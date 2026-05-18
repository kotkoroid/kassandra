// Damage application + per-kind death effects. Everything that
// reduces an entity's hp routes through `applyDamageToEntity` so
// death side-effects (loot, xp, spider split, troller bag drop)
// happen in one place regardless of source.

import { rollLoot } from '../loot';
import {
  EXP_PER_LEVEL,
  LOOT_BAG_TTL,
  SWORD_DOT_THRESHOLD,
  SWORD_REACH,
} from './constants';
import { emit } from './events';
import { spawnEntity, type SpiderKind } from './spawn';
import { getEffectiveStat } from './stats';
import type { World } from './types';
import { isHostile, removeEntity } from './util';
import { genId } from './world.svelte';

const SPIDER_CHILD_COUNT = 3;
const SPIDER_CHILD_DIST = 0.4;

export function applyDamageToEntity(
  world: World,
  index: number,
  amount: number,
  byPlayer: boolean,
) {
  const e = world.entities[index];
  if (!e) return;
  e.hp -= amount;
  if (e.hp <= 0) onEntityDeath(world, index, byPlayer);
}

function onEntityDeath(world: World, index: number, byPlayer: boolean) {
  const e = world.entities[index];
  if (!e) return;

  if (byPlayer) {
    // Loot bag at the kill site, stamped with the slayer as owner.
    const drops = rollLoot(e.monsterId);
    if (drops.length > 0) {
      const owner = world.player.name;
      world.lootBags.push({
        id: genId(world, 'lb'),
        x: e.x,
        z: e.z,
        items: drops.map((itemId) => ({ owner, itemId })),
        ttl: LOOT_BAG_TTL,
        isDeathBag: false,
        bagXp: 0,
      });
    }
    grantExperience(world, e.experience);
  }

  // Spider split — happens regardless of who delivered the killing
  // blow. Big → medium x3, medium → tiny x3. Tiny is terminal.
  if (e.kind === 'spider-big') {
    splitSpider(world, 'spider-medium', e.x, e.z);
  } else if (e.kind === 'spider-medium') {
    splitSpider(world, 'spider-tiny', e.x, e.z);
  }

  // Troller drop: when killed mid-delivery, the player's bag lands
  // wherever the troller fell so it stays reclaimable.
  if (e.kind === 'troller' && e.carriesPlayerBag) {
    dropPlayerDeathBag(world, e.x, e.z);
  }

  if (world.player.engageTargetId === e.id) {
    world.player.engageTargetId = null;
  }

  emit(world, { kind: 'entity-killed', entityKind: e.kind, monsterId: e.monsterId, x: e.x, z: e.z, byPlayer });
  removeEntity(world, index);
}

function splitSpider(
  world: World,
  kind: SpiderKind,
  x: number,
  z: number,
) {
  for (let i = 0; i < SPIDER_CHILD_COUNT; i++) {
    const angle = (i / SPIDER_CHILD_COUNT) * Math.PI * 2;
    spawnEntity(
      world,
      kind,
      x + Math.cos(angle) * SPIDER_CHILD_DIST,
      z + Math.sin(angle) * SPIDER_CHILD_DIST,
      angle,
    );
  }
}

// Drop the player's death-bag at (x, z), transferring whatever XP
// the troller (or the world.death state) was carrying onto the bag.
// Bag pickup logic recovers BAG_XP_RECOVERY of that XP.
export function dropPlayerDeathBag(
  world: World,
  x: number,
  z: number,
) {
  world.lootBags.push({
    id: genId(world, 'lb'),
    x,
    z,
    items: [],
    ttl: LOOT_BAG_TTL,
    isDeathBag: true,
    bagXp: world.death.bagXp,
  });
  // The bag carries the XP from here on — clear the staging slot
  // so a future death doesn't double-count it.
  world.death.bagXp = 0;
}

export function grantExperience(world: World, amount: number) {
  if (amount <= 0) return;
  const p = world.player;
  p.experience += amount;
  while (p.experience >= EXP_PER_LEVEL) {
    p.experience -= EXP_PER_LEVEL;
    p.level += 1;
    p.health = getEffectiveStat(p, 'maxHealth');
    p.mana = getEffectiveStat(p, 'maxMana');
    p.stamina = getEffectiveStat(p, 'maxStamina');
    p.levelUpTrigger += 1;
    emit(world, { kind: 'player-level-up', level: p.level });
  }
}

// Sword swing: damages every hostile entity inside the forward cone
// within sword reach.
export function slash(world: World) {
  const p = world.player;
  p.slashTrigger++;
  p.lastSlashTime = world.time;

  const fwdX = Math.sin(p.rotation);
  const fwdZ = Math.cos(p.rotation);
  const damage = getEffectiveStat(p, 'damage');

  for (let i = world.entities.length - 1; i >= 0; i--) {
    const e = world.entities[i];
    if (!e) continue;
    if (!isHostile(e.kind)) continue;
    const dx = e.x - p.x;
    const dz = e.z - p.z;
    const dist = Math.hypot(dx, dz);
    if (dist > SWORD_REACH || dist < 0.001) continue;
    const dot = (dx / dist) * fwdX + (dz / dist) * fwdZ;
    if (dot < SWORD_DOT_THRESHOLD) continue;
    applyDamageToEntity(world, i, damage, true);
  }
}
