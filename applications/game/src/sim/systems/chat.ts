// Chat + slash-commands.
//
// `applyChat(world, text, channel)` runs inside `tick` when a
// `send_chat` SimEvent fires. Slash-commands are interpreted here
// and echo back as System lines; plain text is broadcast to the
// world message log and floats above the speaker's head for
// SAY_TTL seconds via `player.saying`.
//
// Spawn / kill / respawn commands all mutate `world` directly,
// piggybacking on the spawn helpers in `sim/spawn.ts` — no parallel
// "commands" module any more.

import { getMonster, MONSTERS, type MonsterId } from '../../monsters';
import { SAY_TTL } from '../constants';
import { spawnByMonsterId } from '../spawn';
import type { ChatChannel, World } from '../types';
import { genId } from '../world.svelte';

const MAX_SPAWN_COUNT = 50;

export function applyChat(
  world: World,
  text: string,
  channel: ChatChannel,
) {
  const trimmed = text.trim();
  // Empty sends are absorbed up in the UI ("Enter on empty closes
  // chat") and never reach sim. Defensive guard anyway.
  if (!trimmed) return;

  if (trimmed.startsWith('/')) {
    const lines = runCommand(world, trimmed);
    for (const line of lines) pushSystem(world, line, channel);
    return;
  }

  // Broadcast a normal message + raise the speech bubble.
  world.chat.messages.push({
    id: genId(world, 'm'),
    author: world.player.name || 'You',
    text: trimmed,
    channel,
  });
  world.player.saying = trimmed;
  world.player.sayExpiresAt = world.time + SAY_TTL;
}

function pushSystem(world: World, text: string, channel: ChatChannel) {
  world.chat.messages.push({
    id: genId(world, 'm'),
    author: 'System',
    text,
    channel,
  });
}

// --- Command runner ---------------------------------------------

const HELP_LINES = [
  'Commands:',
  '/m or /monster [ID] [COUNT?] — spawn monster(s) by id (default 1)',
  '/kill [NAME] — drop the named player to 0 hp',
  '/respawn [NAME] — revive the named player',
  '/gold [NAME] [+/-AMOUNT] — adjust Lars (default +; cannot go below 0)',
  '/help — list commands',
];

function runCommand(world: World, line: string): string[] {
  const parts = line.slice(1).trim().split(/\s+/);
  const cmd = parts[0]?.toLowerCase() ?? '';
  const args = parts.slice(1);
  switch (cmd) {
    case 'help':
      return HELP_LINES;
    case 'm':
    case 'monster':
      return cmdSpawnMonster(world, args[0], args[1]);
    case 'kill':
      return cmdKill(world, args[0]);
    case 'respawn':
      return cmdRespawn(world, args[0]);
    case 'gold':
      return cmdGold(world, args[0], args[1]);
    default:
      return [`Unknown command: /${cmd}`];
  }
}

// Accepts the short id (e.g. "1", "07") or the canonical
// "MONSTER000007" form and returns the canonical id if known.
function normalizeMonsterId(arg: string): MonsterId | null {
  const padded = `MONSTER${arg.padStart(6, '0')}`;
  if (MONSTERS[padded]) return padded;
  if (MONSTERS[arg]) return arg;
  return null;
}

function parseCount(arg: string | undefined): number | string {
  if (arg === undefined) return 1;
  const n = Number.parseInt(arg, 10);
  if (!Number.isFinite(n) || n < 1) return `Invalid count: ${arg}`;
  if (n > MAX_SPAWN_COUNT) return `Count capped at ${MAX_SPAWN_COUNT}`;
  return n;
}

function cmdSpawnMonster(
  world: World,
  idArg: string | undefined,
  countArg: string | undefined,
): string[] {
  if (!idArg) return ['Usage: /m [ID] [COUNT?]'];
  const id = normalizeMonsterId(idArg);
  if (!id) return [`Unknown monster id: ${idArg}`];
  const count = parseCount(countArg);
  if (typeof count === 'string') return [count];
  for (let i = 0; i < count; i++) {
    const angle = world.rng.next() * Math.PI * 2;
    const dist = 4 + world.rng.next() * 4;
    const x = world.player.x + Math.cos(angle) * dist;
    const z = world.player.z + Math.sin(angle) * dist;
    if (!spawnByMonsterId(world, id, x, z)) {
      return [`Monster ${id} has no spawn handler`];
    }
  }
  const name = getMonster(id).name;
  return [count === 1 ? `Spawned ${name}` : `Spawned ${count} ${name}`];
}

function cmdKill(world: World, name: string | undefined): string[] {
  if (!name) return ['Usage: /kill [NAME]'];
  // Single-player today — only the local player is a candidate. The
  // name match keeps the shape ready for multiplayer.
  if (world.player.name !== name) return [`No player named ${name}`];
  if (!world.death.alive) return [`${name} is already dead`];
  world.player.health = 0;
  return [`Killed ${name}`];
}

function cmdGold(
  world: World,
  nameArg: string | undefined,
  amountArg: string | undefined,
): string[] {
  if (!nameArg || amountArg === undefined) {
    return ['Usage: /gold [NAME] [+/-AMOUNT]'];
  }
  if (world.player.name !== nameArg) return [`No player named ${nameArg}`];

  // Parse the signed amount. Leading + adds (the default), leading -
  // subtracts; a bare number is treated as +. Only integers; the
  // magnitude must be >= 0 after stripping the sign.
  let sign = 1;
  let mag = amountArg;
  if (amountArg.startsWith('+')) mag = amountArg.slice(1);
  else if (amountArg.startsWith('-')) {
    sign = -1;
    mag = amountArg.slice(1);
  }
  const n = Number.parseInt(mag, 10);
  if (!Number.isFinite(n) || n < 0 || String(n) !== mag) {
    return [`Invalid amount: ${amountArg}`];
  }
  const delta = sign * n;

  const have = world.player.lars;
  if (have + delta < 0) {
    return [`${nameArg} only has ${have} Lars (cannot remove ${n})`];
  }
  world.player.lars = have + delta;
  return [`${nameArg}: ${have} → ${world.player.lars} Lars (${delta >= 0 ? '+' : ''}${delta})`];
}

function cmdRespawn(world: World, name: string | undefined): string[] {
  if (!name) return ['Usage: /respawn [NAME]'];
  if (world.player.name !== name) return [`No player named ${name}`];
  if (world.death.alive) return [`${name} is already alive`];
  // Defer the actual revive to the death system so respawn-side
  // effects (city teleport, bug spawn) all run in one place.
  world.pending.respawn = true;
  return [`Respawning ${name}…`];
}
