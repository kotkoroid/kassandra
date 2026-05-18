// The single simulation entry point. `tick` advances the world by
// one variable-sized step. On the client we call it once per render
// frame with `dt = frameDt`, so render and sim are aligned by con-
// struction — no interpolation, no fixed-step beating. A future
// authoritative server would call `tick` on a fixed schedule with a
// fixed dt; the same function works either way.

import { applyChat } from './systems/chat';
import { tickDeath } from './systems/death';
import { tickHealingCircles } from './systems/healingCircles';
import { tickLootBags } from './systems/loot';
import { tickMonsters } from './systems/monsters';
import { tickPlayer } from './systems/player';
import { tickProjectiles } from './systems/projectiles';
import { tickSpawners } from './systems/spawners';
import { tickTime } from './systems/time';
import type { FrameInputs, SimEvent, World } from './types';

// Hard upper bound on a single step. Protects against catastrophic
// catch-up after a tab unfreeze where frameDt could be seconds long.
const MAX_STEP = 1 / 20;

export function tick(world: World, dt: number, inputs: FrameInputs) {
  if (dt > MAX_STEP) dt = MAX_STEP;

  // 1. World clock first so other systems see the new time.
  tickTime(world, dt);

  // 2. Drain queued events. Some set per-tick flags on world.pending
  // that downstream systems read this same tick.
  const events = world.inputQueue;
  world.inputQueue = [];
  for (const ev of events) handleEvent(world, ev);

  // 3. Player input + movement + engage + slash cadence.
  tickPlayer(world, dt, inputs);

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

  // 9. Spawners (after entities have moved/died this tick).
  tickSpawners(world, dt);

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
  }
}
