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

import { getMonster, MONSTERS, type MonsterId } from '../monsters.ts';
import { SAY_TTL } from '../constants.ts';
import { spawnByMonsterId } from '../spawn.ts';
import type { ChatChannel, World } from '../types.ts';
import { isHostile, removeEntity } from '../util.ts';
import { genId, localPlayer } from '../world.ts';

const MAX_SPAWN_COUNT = 50;

export function applyChat(world: World, text: string, channel: ChatChannel) {
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
  const player = localPlayer(world);
  world.chat.messages.push({
    id: genId(world, 'm'),
    author: player.name || 'You',
    text: trimmed,
    channel,
  });
  player.saying = trimmed;
  player.sayExpiresAt = world.time + SAY_TTL;
}

// Exported so other systems (death/respawn, lifecycle events from the
// realm worker, future hooks) can push system-tagged chat lines
// without duplicating the chat-push pattern. Defaults to the Normal
// channel, which is the only one rendered today; pass an explicit
// channel for future Global/Group lifecycle messages.
export function pushSystem(world: World, text: string, channel: ChatChannel = 'Normal') {
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
  '/purge [RADIUS?] — remove hostile entities within RADIUS units (default 15)',
  '/buff [DURATION?] — apply a sample buff (default 60s)',
  '/debuff [DURATION?] — apply a sample debuff (default 60s)',
  '/clearbuffs — remove all active effects',
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
    case 'purge':
      return cmdPurge(world, args[0]);
    case 'buff':
      return cmdEffect(world, 'buff', args[0]);
    case 'debuff':
      return cmdEffect(world, 'debuff', args[0]);
    case 'clearbuffs':
      return cmdClearBuffs(world);
    default:
      return [`Unknown command: /${cmd}`];
  }
}

// Debug helper — pushes a canned buff or debuff onto the player so
// the HUD bar has something to render before real gameplay sources
// (potions, spells, environment) are wired up. The catalog is
// deliberately tiny: enough to verify the icon + tooltip + cascade
// pruning end-to-end. Real effects will live alongside the systems
// that apply them.
function cmdEffect(
  world: World,
  kind: 'buff' | 'debuff',
  durationArg: string | undefined,
): string[] {
  const durationSec = durationArg ? Number.parseInt(durationArg, 10) : 60;
  if (!Number.isFinite(durationSec) || durationSec < 1) {
    return [`Invalid duration: ${durationArg}`];
  }
  const id = genId(world, 'eff');
  const now = world.time;
  const expiresAt = now + durationSec;
  const player = localPlayer(world);
  const source = player.name || 'Debug';

  if (kind === 'buff') {
    player.effects.push({
      id,
      name: 'Strength of the Hunt',
      icon: '⚔️',
      kind: 'buff',
      appliedAt: now,
      expiresAt,
      source,
      stats: [
        { label: 'Strength', delta: 3 },
        { label: 'Attack Speed', delta: 0.1, unit: 's' },
      ],
    });
    // Math side. Tagged with effectId so the math row is dropped in
    // lockstep when the effect expires.
    player.modifiers.push({
      stat: 'damage',
      kind: 'add',
      value: 3,
      expiresAt,
      effectId: id,
    });
    player.modifiers.push({
      stat: 'attackSpeed',
      kind: 'add',
      value: 0.1,
      expiresAt,
      effectId: id,
    });
    return [`Applied buff: Strength of the Hunt (${durationSec}s)`];
  }

  player.effects.push({
    id,
    name: 'Bleeding',
    icon: '🩸',
    kind: 'debuff',
    appliedAt: now,
    expiresAt,
    source,
    stats: [{ label: 'Health Regen', delta: -2 }],
  });
  player.modifiers.push({
    stat: 'healthRegen',
    kind: 'add',
    value: -2,
    expiresAt,
    effectId: id,
  });
  return [`Applied debuff: Bleeding (${durationSec}s)`];
}

function cmdClearBuffs(world: World): string[] {
  const player = localPlayer(world);
  const n = player.effects.length;
  // Drop both the presentation row and any math rows linked to one
  // of the cleared effects. Untagged modifiers (e.g. equipment) stay.
  const clearedIds = new Set(player.effects.map((e) => e.id));
  player.effects = [];
  player.modifiers = player.modifiers.filter(
    (m) => m.effectId === undefined || !clearedIds.has(m.effectId),
  );
  return [n === 0 ? 'No active effects' : `Cleared ${n} effect(s)`];
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
  const player = localPlayer(world);
  for (let i = 0; i < count; i++) {
    const angle = world.rng.next() * Math.PI * 2;
    const dist = 4 + world.rng.next() * 4;
    const x = player.x + Math.cos(angle) * dist;
    const z = player.z + Math.sin(angle) * dist;
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
  const player = localPlayer(world);
  if (player.name !== name) return [`No player named ${name}`];
  if (!world.death.alive) return [`${name} is already dead`];
  player.health = 0;
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
  const player = localPlayer(world);
  if (player.name !== nameArg) return [`No player named ${nameArg}`];

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

  const have = player.lars;
  if (have + delta < 0) {
    return [`${nameArg} only has ${have} Lars (cannot remove ${n})`];
  }
  player.lars = have + delta;
  return [`${nameArg}: ${have} → ${player.lars} Lars (${delta >= 0 ? '+' : ''}${delta})`];
}

// Silent removal of every hostile entity inside `radius` of the
// player. Skips the death pipeline on purpose — no loot bags, no
// XP, no spawn-point respawn schedule — so it's a clean cleanup
// for stress-test spawns rather than a farming shortcut. Allies
// (Janna, Azir via isHostile) are never touched.
const PURGE_DEFAULT_RADIUS = 15;

function cmdPurge(world: World, radiusArg: string | undefined): string[] {
  const r = radiusArg === undefined ? PURGE_DEFAULT_RADIUS : Number.parseFloat(radiusArg);
  if (!Number.isFinite(r) || r <= 0) return [`Invalid radius: ${radiusArg}`];
  const r2 = r * r;
  const player = localPlayer(world);
  const px = player.x;
  const pz = player.z;
  let removed = 0;
  // Reverse iteration — removeEntity splices, so indexes shift forward.
  for (let i = world.entities.length - 1; i >= 0; i--) {
    const e = world.entities[i]!;
    if (!isHostile(e.kind)) continue;
    const dx = e.x - px;
    const dz = e.z - pz;
    if (dx * dx + dz * dz > r2) continue;
    if (player.engageTargetId === e.id) {
      player.engageTargetId = null;
    }
    removeEntity(world, i);
    removed++;
  }
  if (removed === 0) return [`No hostile entities within ${r}`];
  return [`Purged ${removed} hostile entit${removed === 1 ? 'y' : 'ies'} within ${r}`];
}

function cmdRespawn(world: World, name: string | undefined): string[] {
  if (!name) return ['Usage: /respawn [NAME]'];
  const player = localPlayer(world);
  if (player.name !== name) return [`No player named ${name}`];
  if (world.death.alive) return [`${name} is already alive`];
  // Defer the actual revive to the death system so respawn-side
  // effects (city teleport, bug spawn) all run in one place.
  world.pending.respawn = true;
  return [`Respawning ${name}…`];
}
