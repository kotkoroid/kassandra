// The authoritative simulation entry point. The realm Worker calls
// `tick` on a fixed 20 Hz schedule. `allInputs` maps each connected
// player's id to their movement vector for this frame; `perPlayerEvents`
// carries the discrete SimEvents each client sent since the last tick.

import { LARS_ID } from './items.ts';
import { LOOT_BAG_TTL } from './constants.ts';
import { refreshLootBagFlags } from './util.ts';
import { applyChat } from './systems/chat.ts';
import { tickDeath } from './systems/death.ts';
import { tickModifiers } from './stats.ts';
import { tickHealingCircles } from './systems/healingCircles.ts';
import { tickLootBags } from './systems/loot.ts';
import { tickMonsters } from './systems/monsters.ts';
import { tickNpcChat } from './systems/npcChat.ts';
import { tickPlayer } from './systems/player.ts';
import { tickProjectiles } from './systems/projectiles.ts';
import { tickSpawners } from './systems/spawners.ts';
import { tickTime } from './systems/time.ts';
import { castSpell, levelUpSpell, tickSpells } from './spells.ts';
import type { FrameInputs, PlayerId, SimEvent, World } from './types.ts';
import { rebuildGrid } from './spatialGrid.ts';
import { primeWaterCache } from './util.ts';
import { genId, localPlayer } from './world.ts';

// Hard upper bound on a single step. Protects against catastrophic
// catch-up after a tab unfreeze where frameDt could be seconds long.
const MAX_STEP = 1 / 20;

const NO_INPUT: FrameInputs = { moveX: 0, moveZ: 0 };

export function tick(
  world: World,
  dt: number,
  allInputs: Record<PlayerId, FrameInputs>,
  perPlayerEvents: Record<PlayerId, SimEvent[]> = {},
) {
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
  const player = localPlayer(world);
  primeWaterCache(player.x, player.z);

  // 1. World clock first so other systems see the new time.
  tickTime(world, dt);
  tickModifiers(world);

  // 2. Process per-player events. Temporarily swap localPlayerId so
  //    handleEvent targets the right player record for each sender.
  const savedId = world.localPlayerId;
  for (const [pid, events] of Object.entries(perPlayerEvents)) {
    if (!world.players[pid]) continue;
    world.localPlayerId = pid;
    for (const ev of events) handleEvent(world, ev);
  }
  world.localPlayerId = savedId;

  // 3. Player input + movement for every connected player.
  for (const [pid, inputs] of Object.entries(allInputs)) {
    if (!world.players[pid]) continue;
    world.localPlayerId = pid;
    tickPlayer(world, dt, inputs);
  }
  world.localPlayerId = savedId;

  // 3b. Advance channelled spells (Rush dash lerp, Hail ticks).
  //     Runs after player movement so the channel overrides position.
  //     Iterated per-player with the same localPlayerId swap pattern as
  //     event handling — tickSpells reads localPlayer(world) internally,
  //     so without the swap only the anchor player's spell would tick.
  for (const pid of Object.keys(world.players)) {
    world.localPlayerId = pid;
    tickSpells(world, dt);
  }
  world.localPlayerId = savedId;

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
  const p = localPlayer(world);
  switch (ev.kind) {
    case 'click_ground':
      p.navTargetX = ev.x;
      p.navTargetZ = ev.z;
      p.engageTargetId = null;
      p.engageActive = true;
      break;
    case 'engage':
      p.engageTargetId = ev.targetId;
      p.engageActive = true;
      p.navTargetX = null;
      p.navTargetZ = null;
      break;
    case 'set_auto_attack':
      p.autoAttack = ev.on;
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
      if (world.death.alive) p.health = 0;
      break;
    case 'pickup_loot': {
      const bagIdx = world.lootBags.findIndex((b) => b.id === ev.bagId);
      if (bagIdx < 0) break;
      const bag = world.lootBags[bagIdx]!;
      const playerName = p.name;
      let larsGained = 0;
      const kept = bag.items.filter((item) => {
        if (item.owner !== playerName) return true;
        // Currency items roll into the Lars counter; everything else
        // lands as an inventory slot in the player bag.
        if (item.itemId === LARS_ID) {
          p.lars += 1;
          larsGained += 1;
        } else {
          p.bag.push(item.itemId);
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
    case 'level_up_spell':
      levelUpSpell(world, ev.spellId);
      break;
    case 'drop_item': {
      // Splits N copies of `itemId` out of the player's holdings
      // into a fresh loot bag at the player's feet. Lars pulls from
      // the dedicated counter; other ids pull from the bag array.
      // Stamps the player as owner so they can reclaim the coins.
      let have: number;
      if (ev.itemId === LARS_ID) {
        have = p.lars;
      } else {
        have = p.bag.reduce((n, id) => n + (id === ev.itemId ? 1 : 0), 0);
      }
      const n = Math.max(0, Math.min(ev.count, have));
      if (n === 0) break;
      if (ev.itemId === LARS_ID) {
        p.lars -= n;
      } else {
        removeBagItems(p.bag, ev.itemId, n);
      }
      const owner = p.name;
      const items = [] as { owner: string; itemId: string }[];
      for (let i = 0; i < n; i++) items.push({ owner, itemId: ev.itemId });
      const newBag = {
        id: genId(world, 'lb'),
        x: p.x,
        z: p.z,
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
