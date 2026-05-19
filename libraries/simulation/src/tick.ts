// The single simulation entry point. `tick` advances the world by
// one variable-sized step. On the client we call it once per render
// frame with `dt = frameDt`, so render and sim are aligned by con-
// struction — no interpolation, no fixed-step beating. A future
// authoritative server would call `tick` on a fixed schedule with a
// fixed dt; the same function works either way.

import { LARS_ID } from './items';
import { LOOT_BAG_TTL } from './constants';
import { refreshLootBagFlags } from './util';
import { applyChat } from './systems/chat';
import { tickDeath } from './systems/death';
import { tickModifiers } from './stats';
import { tickHealingCircles } from './systems/healingCircles';
import { tickLootBags } from './systems/loot';
import { tickMonsters } from './systems/monsters';
import { tickNpcChat } from './systems/npcChat';
import { tickPlayer } from './systems/player';
import { tickProjectiles } from './systems/projectiles';
import { tickSpawners } from './systems/spawners';
import { tickTime } from './systems/time';
import { castSpell, tickSpells } from './spells';
import type { FrameInputs, SimEvent, World } from './types';
import { rebuildGrid } from './spatialGrid';
import { primeWaterCache } from './util';
import { genId } from './world';

// Hard upper bound on a single step. Protects against catastrophic
// catch-up after a tab unfreeze where frameDt could be seconds long.
const MAX_STEP = 1 / 20;

export function tick(world: World, dt: number, inputs: FrameInputs) {
  if (dt > MAX_STEP) dt = MAX_STEP;

  // 0. Per-tick caches — built before any system runs so every lookup
  //    this tick reads a consistent snapshot of the world at tick start.
  //
  //    Spatial entity grid: slash() and projectile intercept visit only
  //    nearby cells instead of scanning all entities. Stationary entities
  //    (Janna, ranged casters) have zero drift; movers introduce at most
  //    dt×speed ≈ 0.06 unit error by tickProjectiles time, well within
  //    any hit radius.
  //
  //    Water patch list: isInWaterAt() iterates one shared array instead
  //    of issuing ~60 per-call getVisibleWaters() lookups (25 chunk
  //    Map.get + array alloc each). All active entities are within the
  //    player's chunk window, so the player-centred snapshot is correct
  //    for every water check this tick.
  rebuildGrid(world.entities);
  primeWaterCache(world.player.x, world.player.z);

  // 1. World clock first so other systems see the new time.
  tickTime(world, dt);
  tickModifiers(world);

  // 2. Drain queued events. Some set per-tick flags on world.pending
  // that downstream systems read this same tick.
  const events = world.inputQueue;
  world.inputQueue = [];
  for (const ev of events) handleEvent(world, ev);

  // 3. Player input + movement + engage + slash cadence.
  tickPlayer(world, dt, inputs);

  // 3b. Advance channelled spells (Rush dash lerp, Hail ticks).
  //     Runs after player movement so the channel overrides position.
  tickSpells(world, dt);

  // 4. Monster AI (target pick, move, attack) and Janna heal-circle
  // spawning. Runs per-entity dispatch on kind.
  tickMonsters(world, dt);

  // 5. Projectiles integrate, hit, expire.
  tickProjectiles(world, dt);

  // 6. Janna's heal-circles tick down ttl and heal the player while
  // they stand inside.
  tickHealingCircles(world, dt);

  // 7. Loot-bag ttls (kill bags + the player's death bag).
  tickLootBags(world, dt);

  // 8. Death pipeline: troller phases, bag/bug bookkeeping.
  tickDeath(world, dt);

  // 9. Spawners (after entities have moved/died this tick). Seeds
  // every fixed spawn point on first tick, then drains any due
  // respawns scheduled by combat.ts.
  tickSpawners(world);

  // 10. Ambient NPC chatter (Azir, …). Reads world.time / pushes
  // chat messages — must run after the clock + spawners so a fresh
  // NPC has a chance to schedule its first line.
  tickNpcChat(world);

  world.tick++;
}

function handleEvent(world: World, ev: SimEvent) {
  switch (ev.kind) {
    case 'click_ground':
      world.player.navTargetX = ev.x;
      world.player.navTargetZ = ev.z;
      world.player.engageTargetId = null;
      world.player.engageActive = true;
      break;
    case 'engage':
      world.player.engageTargetId = ev.targetId;
      world.player.engageActive = true;
      world.player.navTargetX = null;
      world.player.navTargetZ = null;
      break;
    case 'set_auto_attack':
      world.player.autoAttack = ev.on;
      break;
    case 'manual_attack':
      world.pending.manualAttack = true;
      break;
    case 'send_chat':
      applyChat(world, ev.text, ev.channel);
      break;
    case 'request_respawn':
      world.pending.respawn = true;
      break;
    case 'kill_player':
      if (world.death.alive) world.player.health = 0;
      break;
    case 'pickup_loot': {
      const bagIdx = world.lootBags.findIndex((b) => b.id === ev.bagId);
      if (bagIdx < 0) break;
      const bag = world.lootBags[bagIdx]!;
      const playerName = world.player.name;
      let larsGained = 0;
      const kept = bag.items.filter((item) => {
        if (item.owner !== playerName) return true;
        // Currency items roll into the Lars counter; everything else
        // lands as an inventory slot in the player bag.
        if (item.itemId === LARS_ID) {
          world.player.lars += 1;
          larsGained += 1;
        } else {
          world.player.bag.push(item.itemId);
        }
        return false;
      });
      bag.items = kept;
      refreshLootBagFlags(world, bag);
      if (larsGained > 0) {
        world.chat.messages.push({
          id: genId(world, 'm'),
          author: 'System',
          text: `You have received ${larsGained} Lars.`,
          channel: 'Normal',
        });
      }
      // Remove empty kill bags immediately rather than waiting for TTL.
      if (kept.length === 0 && !bag.isDeathBag) {
        world.lootBags.splice(bagIdx, 1);
      }
      break;
    }
    case 'cast_spell':
      castSpell(world, ev.spellId, ev.targetId ?? null);
      break;
    case 'drop_item': {
      // Splits N copies of `itemId` out of the player's holdings
      // into a fresh loot bag at the player's feet. Lars pulls from
      // the dedicated counter; other ids pull from the bag array.
      // Stamps the player as owner so they can reclaim the coins.
      let have: number;
      if (ev.itemId === LARS_ID) {
        have = world.player.lars;
      } else {
        have = world.player.bag.reduce((n, id) => n + (id === ev.itemId ? 1 : 0), 0);
      }
      const n = Math.max(0, Math.min(ev.count, have));
      if (n === 0) break;
      if (ev.itemId === LARS_ID) {
        world.player.lars -= n;
      } else {
        removeBagItems(world.player.bag, ev.itemId, n);
      }
      const owner = world.player.name;
      const items = [] as { owner: string; itemId: string }[];
      for (let i = 0; i < n; i++) items.push({ owner, itemId: ev.itemId });
      const newBag = {
        id: genId(world, 'lb'),
        x: world.player.x,
        z: world.player.z,
        items,
        ttl: LOOT_BAG_TTL,
        isDeathBag: false,
        bagXp: 0,
        isCurrencyOnly: false,
        larsCount: 0,
        hasOwnerItems: false,
      };
      world.lootBags.push(newBag);
      refreshLootBagFlags(world, newBag);
      break;
    }
  }
}

function removeBagItems(bag: string[], itemId: string, count: number) {
  let removed = 0;
  for (let i = bag.length - 1; i >= 0 && removed < count; i--) {
    if (bag[i] === itemId) {
      bag.splice(i, 1);
      removed++;
    }
  }
}
