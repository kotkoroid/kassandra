// Damage application + per-kind death effects. Everything that
// reduces an entity's hp routes through `applyDamageToEntity` so
// death side-effects (loot, xp, spider split, troller bag drop)
// happen in one place regardless of source.

import { rollLoot } from './loot.ts';
import { getSpawnPoint } from './spawnPoints.ts';
import { EXP_PER_LEVEL, LOOT_BAG_TTL, SWORD_DOT_THRESHOLD, SWORD_REACH } from './constants.ts';
import { emit } from './events.ts';
import { spawnEntity, type SpiderKind } from './spawn.ts';
import { getEffectiveStat } from './stats.ts';
import { pushSystem } from './systems/chat.ts';
import type { Entity, PlayerId, World } from './types.ts';
import { isHostile, refreshLootBagFlags, removeEntity } from './util.ts';
import { grid } from './spatialGrid.ts';
import { genId, localPlayer, playerById } from './world.ts';

const SPIDER_CHILD_COUNT = 3;
const SPIDER_CHILD_DIST = 0.4;

/**
 * PR-D3c: `byPlayer: boolean` was widened to `attribution: PlayerId | null`.
 * - `PlayerId` — damage attributed to a specific player (XP + loot
 *   ownership credited to them on kill).
 * - `null` — environmental damage (NPC vs NPC, projectile from a
 *   monster, etc.). No XP, no loot ownership.
 *
 * Callers that used `true` now pass the slayer's pid; callers that
 * used `false` pass `null`. The emitted `damage-dealt` event keeps the
 * boolean `byPlayer` flag (UI consumers still want a yes/no for the
 * damage popup colour).
 */
export function applyDamageToEntity(
  world: World,
  index: number,
  amount: number,
  attribution: PlayerId | null,
) {
  const e = world.entities[index];
  if (!e) return;
  e.hp -= amount;
  emit(world, {
    kind: 'damage-dealt',
    x: e.x,
    z: e.z,
    amount,
    byPlayer: attribution !== null,
  });
  if (e.hp <= 0) onEntityDeath(world, index, attribution);
}

// Entity-reference variant. Avoids holding an array index across
// intermediate code that may splice. `indexOf` is O(N) but called only
// on death (rare), and the subsequent splice is also O(N) — no extra cost.
export function applyDamageToEntityRef(
  world: World,
  e: Entity,
  amount: number,
  attribution: PlayerId | null,
) {
  // Look up canonical index before mutating so we always operate on
  // world.entities[index] — the authoritative proxy. Comparing by id
  // avoids Svelte 5 proxy-identity mismatches between entityById and
  // entities array access paths.
  const index = world.entities.findIndex((ent) => ent.id === e.id);
  if (index < 0) return;
  applyDamageToEntity(world, index, amount, attribution);
}

// Single chokepoint for damage taken by the player. Emits the popup
// event AND attributes the damage to the named attacker so the
// death-summary in world.death.attackers stays accurate without
// every caller remembering to update it. A no-op while dead.
export function applyDamageToPlayer(
  world: World,
  amount: number,
  attacker: { monsterId: string; name: string },
) {
  if (!world.death.alive) return;
  const player = localPlayer(world);
  const before = player.health;
  player.health = Math.max(0, before - amount);
  const dealt = before - player.health;
  if (dealt <= 0) return;
  emit(world, {
    kind: 'damage-dealt',
    x: player.x,
    z: player.z,
    amount: dealt,
    byPlayer: false,
  });
  if (world.death.fightStartedAt === null) {
    world.death.fightStartedAt = world.time;
  }
  let entry = world.death.attackers.find((a) => a.monsterId === attacker.monsterId);
  if (!entry) {
    entry = { monsterId: attacker.monsterId, name: attacker.name, total: 0, hits: 0 };
    world.death.attackers.push(entry);
  }
  entry.total += dealt;
  entry.hits += 1;
}

function onEntityDeath(world: World, index: number, attribution: PlayerId | null) {
  const e = world.entities[index];
  if (!e) return;

  if (attribution !== null) {
    // Loot bag at the kill site, stamped with the slayer as owner.
    const drops = rollLoot(e.monsterId);
    if (drops.length > 0) {
      const owner = playerById(world, attribution).name;
      const bag = {
        id: genId(world, 'lb'),
        x: e.x,
        z: e.z,
        items: drops.map((itemId) => ({ owner, itemId })),
        ttl: LOOT_BAG_TTL,
        isDeathBag: false,
        bagXp: 0,
        isCurrencyOnly: false,
        larsCount: 0,
        hasOwnerItems: false,
      };
      world.lootBags.push(bag);
      refreshLootBagFlags(world, bag);
    }
    grantExperience(world, attribution, e.experience);
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

  // Drop the slayer's engage on this entity (so they stop chasing a
  // corpse). Reads the attribution player when known, otherwise falls
  // back to localPlayer to preserve the pre-pid-threading behaviour
  // for environmental kills.
  const combatPlayer =
    attribution !== null ? playerById(world, attribution) : localPlayer(world);
  if (combatPlayer.engageTargetId === e.id) {
    combatPlayer.engageTargetId = null;
  }

  // Schedule respawn for fixed-spawn-point entities whose point
  // defines a respawnDelay. Spider-split children, troller, and
  // /m chat spawns have no spawnPointId so they fall through.
  if (e.spawnPointId !== undefined) {
    const point = getSpawnPoint(e.spawnPointId);
    if (point.respawnDelay !== undefined) {
      world.spawnPointRespawnAt.set(e.spawnPointId, world.time + point.respawnDelay);
    }
  }

  emit(world, {
    kind: 'entity-killed',
    entityKind: e.kind,
    monsterId: e.monsterId,
    x: e.x,
    z: e.z,
    byPlayer: attribution !== null,
  });
  removeEntity(world, index);
}

function splitSpider(world: World, kind: SpiderKind, x: number, z: number) {
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
export function dropPlayerDeathBag(world: World, x: number, z: number) {
  const bag = {
    id: genId(world, 'lb'),
    x,
    z,
    items: [],
    ttl: LOOT_BAG_TTL,
    isDeathBag: true,
    bagXp: world.death.bagXp,
    isCurrencyOnly: false,
    larsCount: 0,
    hasOwnerItems: false,
  };
  world.lootBags.push(bag);
  // Empty death bag — flags default to false; no items to scan.
  // The bag carries the XP from here on — clear the staging slot
  // so a future death doesn't double-count it.
  world.death.bagXp = 0;
}

export function grantExperience(
  world: World,
  playerId: PlayerId,
  amount: number,
) {
  if (amount <= 0) return;
  const p = playerById(world, playerId);
  // Remember the pre-grant level so we can announce once at the end,
  // not once per level — a single fat XP grant that crosses several
  // levels reads as one chat line ("X reached level 8.") instead of
  // spamming N consecutive lines.
  const startLevel = p.level;
  p.experience += amount;
  while (p.experience >= EXP_PER_LEVEL) {
    p.experience -= EXP_PER_LEVEL;
    p.level += 1;
    p.health = getEffectiveStat(p, 'maxHealth');
    p.mana = getEffectiveStat(p, 'maxMana');
    p.stamina = getEffectiveStat(p, 'maxStamina');
    // Each character level-up grants one classSpellPoint, spent in
    // the Abilities panel via the `level_up_spell` SimEvent.
    p.classSpellPoints += 1;
    p.levelUpTrigger += 1;
    emit(world, { kind: 'player-level-up', level: p.level });
  }
  if (p.level > startLevel) {
    pushSystem(world, `${p.name || 'A hero'} reached level ${p.level}.`);
  }
}

// Per-swing stamina cost. Drained from `world.player.stamina`,
// clamped at zero — running out doesn't gate the swing itself,
// it just leaves the player exhausted so movement slows until
// stamina regenerates.
const SLASH_STAMINA_COST = 5;

// Sword swing: damages every hostile entity inside the forward cone
// within sword reach. The spatial grid narrows candidates to the cell
// neighbourhood around the player — typically 0-3 entities — instead of
// scanning all entities in the world.
export function slash(world: World, playerId: PlayerId) {
  const p = playerById(world, playerId);
  p.slashTrigger++;
  p.lastSlashTime = world.time;
  p.stamina = Math.max(0, p.stamina - SLASH_STAMINA_COST);
  if (p.stamina === 0) p.exhausted = true;

  const fwdX = Math.sin(p.rotation);
  const fwdZ = Math.cos(p.rotation);
  const damage = getEffectiveStat(p, 'damage');

  for (const e of grid.queryRadius(p.x, p.z, SWORD_REACH)) {
    if (!isHostile(e.kind)) continue;
    const dx = e.x - p.x;
    const dz = e.z - p.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.001) continue;
    const dot = (dx / dist) * fwdX + (dz / dist) * fwdZ;
    if (dot < SWORD_DOT_THRESHOLD) continue;
    applyDamageToEntityRef(world, e, damage, playerId);
  }
}
