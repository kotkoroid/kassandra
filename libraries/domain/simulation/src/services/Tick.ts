// Tick — Effect-native simulation orchestrator.
//
// PR-D3a: translates the function-based `tick()` in src/tick.ts into a
// service that yields every per-system service in the same order. The
// legacy `tick()` function stays for now (PR-B's realm Tick still
// referenced it pre-D3a; PR-D3a switches realm to use this service
// and the legacy function can go in a follow-up).
//
// What this is, exactly:
//   - The world object is grabbed ONCE via WorldRef.get at the top of
//     step. All system services then mutate it in place — same shape
//     they've always had. Because the Ref's content reference doesn't
//     change, no Ref.update is needed (when sim moves to a
//     SubscriptionRef-backed WorldRef on the client, that decision
//     gets revisited).
//   - The `world.localPlayerId` swap that the legacy tick used for
//     per-player processing is PRESERVED in this PR. D3b removes it
//     by passing playerId to each system call explicitly.
//   - handleEvent stays inline (was a private function in tick.ts);
//     same code path, just lives here now.

import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';

import { LOOT_BAG_TTL } from '../constants.ts';
import { LARS_ID } from '../items.ts';
import { castSpell, levelUpSpell } from '../spells.ts';
import { tickModifiers } from '../stats.ts';
import { rebuildGrid } from '../spatialGrid.ts';
import { applyChat } from '../systems/chat.ts';
import type { FrameInputs, PlayerId, SimEvent, World } from '../types.ts';
import { primeWaterCache, refreshLootBagFlags } from '../util.ts';
import { genId, localPlayer, playerById } from '../world.ts';

import { Death } from './Death.ts';
import { HealingCircles } from './HealingCircles.ts';
import { Loot } from './Loot.ts';
import { Monsters } from './Monsters.ts';
import { Movement } from './Movement.ts';
import { NpcChat } from './NpcChat.ts';
import { Projectiles } from './Projectiles.ts';
import { Spawner } from './Spawner.ts';
import { Spells } from './Spells.ts';
import { Time } from './Time.ts';
import { WorldRef } from './WorldRef.ts';

// Hard upper bound on a single step. Protects against catastrophic
// catch-up after a tab unfreeze where frameDt could be seconds long.
const MAX_STEP = 1 / 20;

export interface TickShape {
  /**
   * Run one authoritative simulation step. `allInputs` maps each
   * connected player's id to their movement vector this frame;
   * `allEvents` carries discrete SimEvents accumulated since the
   * previous step. Mutates the world in place via WorldRef.
   */
  readonly step: (
    dt: number,
    allInputs: Record<PlayerId, FrameInputs>,
    allEvents: Record<PlayerId, ReadonlyArray<SimEvent>>,
  ) => Effect.Effect<void>;
}

export class Tick extends Context.Service<Tick, TickShape>()(
  'kassandra/sim/Tick',
) {}

export const makeTick = Effect.gen(function* () {
  const worldRef = yield* WorldRef;
  const time = yield* Time;
  const movement = yield* Movement;
  const spells = yield* Spells;
  const monsters = yield* Monsters;
  const projectiles = yield* Projectiles;
  const heals = yield* HealingCircles;
  const loot = yield* Loot;
  const death = yield* Death;
  const spawner = yield* Spawner;
  const npcChat = yield* NpcChat;

  return {
    step: Effect.fn('Tick.step')(function* (rawDt, allInputs, allEvents) {
      const dt = Math.min(rawDt, MAX_STEP);
      const world = yield* worldRef.get;

      // 0. Per-tick caches — built before any system runs so every
      //    lookup this tick reads a consistent snapshot of the world
      //    at tick start.
      rebuildGrid(world.entities);
      const player = localPlayer(world);
      primeWaterCache(player.x, player.z);

      // 1. World clock first so other systems see the new time.
      yield* time.tick(world, dt);
      tickModifiers(world);

      // 2. Process per-player events. handleEvent now takes pid
      //    explicitly — no localPlayerId mutation needed.
      for (const [pid, events] of Object.entries(allEvents)) {
        if (!world.players[pid]) continue;
        for (const ev of events) handleEvent(world, pid, ev);
      }

      // 3. Player input + movement for every connected player.
      //    Movement (Movement.tickPlayer / systems/player.ts) still
      //    reads localPlayer(world) internally because tickPlayer and
      //    its downstream slash() call have wide reach into combat /
      //    pending state that hasn't been pid-threaded yet. Preserve
      //    the swap for this loop only; full removal lands when
      //    tickPlayer + slash take pid explicitly (future PR).
      const savedId = world.localPlayerId;
      for (const [pid, inputs] of Object.entries(allInputs)) {
        if (!world.players[pid]) continue;
        world.localPlayerId = pid;
        yield* movement.tickPlayer(world, dt, inputs);
      }
      world.localPlayerId = savedId;

      // 3b. Advance channelled spells per-player. Spells.tick now
      //     takes pid explicitly.
      for (const pid of Object.keys(world.players)) {
        yield* spells.tick(world, pid, dt);
      }

      // 4. Monster AI (target pick, move, attack) and Janna heal-circle
      //    spawning. Runs per-entity dispatch on kind.
      yield* monsters.tick(world, dt);

      // 5. Projectiles integrate, hit, expire.
      yield* projectiles.tick(world, dt);

      // 6. Janna's heal-circles tick down ttl and heal the player while
      //    they stand inside.
      yield* heals.tick(world, dt);

      // 7. Loot-bag ttls (kill bags + the player's death bag).
      yield* loot.tick(world, dt);

      // 8. Death pipeline: troller phases, bag/bug bookkeeping.
      yield* death.tick(world, dt);

      // 9. Spawners (after entities have moved/died this tick).
      yield* spawner.tick(world);

      // 10. Ambient NPC chatter — must run after the clock + spawners
      //     so a fresh NPC has a chance to schedule its first line.
      yield* npcChat.tick(world);

      world.tick++;
    }),
  } satisfies TickShape;
});

export const TickLayer = Layer.effect(Tick)(makeTick);

// ---------------------------------------------------------------------
// handleEvent — per-player SimEvent dispatcher.
//
// Moved from tick.ts (was a private function there). Same code path,
// same side-effects on `world`. Future PRs may extract individual
// branches (e.g. loot pickup) into their own services; for now the
// switch stays as a single dispatcher.
// ---------------------------------------------------------------------

function handleEvent(world: World, playerId: PlayerId, ev: SimEvent): void {
  const p = playerById(world, playerId);
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
      if (kept.length === 0 && !bag.isDeathBag) {
        world.lootBags.splice(bagIdx, 1);
      }
      break;
    }
    case 'cast_spell':
      castSpell(world, playerId, ev.spellId, ev.targetId ?? null);
      break;
    case 'level_up_spell':
      levelUpSpell(world, playerId, ev.spellId);
      break;
    case 'drop_item': {
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

function removeBagItems(bag: string[], itemId: string, count: number): void {
  let removed = 0;
  for (let i = bag.length - 1; i >= 0 && removed < count; i--) {
    if (bag[i] === itemId) {
      bag.splice(i, 1);
      removed++;
    }
  }
}
