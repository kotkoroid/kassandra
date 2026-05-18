// Chat slash-command dispatcher. Recognises `/cmd …` text from the
// chat panel, runs it against the live game state, and returns a
// human-readable message that the chat panel echoes back as a
// System line.

import { beasts, type BeastKind } from './beasts.svelte';
import { death, requestRespawn } from './death.svelte';
import { enemies } from './enemies.svelte';
import {
  getMonster,
  MONSTER_BEAR,
  MONSTER_SMALL_SPIDER,
  MONSTER_SPIDER,
  MONSTER_SWAIN,
  MONSTER_TINY_SPIDER,
  MONSTER_TROLLER,
  MONSTER_WOLF,
  MONSTERS,
  type MonsterId,
} from './monsters';
import { SPIDER_VISUALS, spiders, type SpiderSize } from './spiders.svelte';
import { player } from './state.svelte';
import { nightStatMultiplier } from './time.svelte';

// Single counter for command-spawned entities so ids don't collide
// with the per-scene counters in Spiders/Beasts/Enemies.
let nextId = 1;
const genId = (prefix: string) => `cmd-${prefix}${nextId++}`;

// Spawn a few units away from the player at a random angle so the
// new entity lands somewhere visible without overlapping the
// character model.
function spawnPos(distance = 3) {
  const angle = Math.random() * Math.PI * 2;
  return {
    x: player.x + Math.cos(angle) * distance,
    z: player.z + Math.sin(angle) * distance,
  };
}

function pushSpider(size: SpiderSize) {
  const monster = getMonster(SPIDER_VISUALS[size].monsterId);
  const pos = spawnPos();
  const maxHp = monster.attributes.health * nightStatMultiplier();
  spiders.push({
    id: genId('s'),
    size,
    x: pos.x,
    z: pos.z,
    rotation: 0,
    hp: maxHp,
    maxHp,
    attackCooldown: 0,
  });
}

function pushBeast(kind: BeastKind, monsterId: MonsterId) {
  const monster = getMonster(monsterId);
  const pos = spawnPos();
  const maxHp = monster.attributes.health * nightStatMultiplier();
  beasts.push({
    id: genId('b'),
    kind,
    monsterId,
    x: pos.x,
    z: pos.z,
    rotation: Math.atan2(player.x - pos.x, player.z - pos.z),
    hp: maxHp,
    maxHp,
    attackCooldown: 0,
  });
}

function pushSwain() {
  const swain = getMonster(MONSTER_SWAIN);
  const pos = spawnPos(8);
  const mul = nightStatMultiplier();
  const attackSpeed = swain.attributes.attackSpeed * mul;
  const maxHp = swain.attributes.health * mul;
  enemies.push({
    id: genId('e'),
    x: pos.x,
    z: pos.z,
    rotation: Math.atan2(player.x - pos.x, player.z - pos.z),
    cooldown: Math.random() / Math.max(attackSpeed, 0.0001),
    attackSpeed,
    hp: maxHp,
    maxHp,
    damage: swain.attributes.damage * mul,
    healthRegen: swain.attributes.healthRegen * mul,
  });
}

function pushTroller() {
  // Only one troller can exist at a time (it's the player's-death
  // bag carrier). Replace any existing one.
  const troller = getMonster(MONSTER_TROLLER);
  const pos = spawnPos();
  death.gnome = {
    phase: 'approach',
    x: pos.x,
    z: pos.z,
    targetX: player.x,
    targetZ: player.z,
    rotation: 0,
    timer: 0,
    hp: troller.attributes.health,
    maxHp: troller.attributes.health,
  };
}

// Accepts `1`, `01`, `000001`, or `MONSTER000001` and returns a
// canonical MonsterId if one exists in the catalog.
function normalizeMonsterId(arg: string): MonsterId | null {
  const upper = arg.toUpperCase();
  const candidate = upper.startsWith('MONSTER')
    ? upper
    : `MONSTER${arg.padStart(6, '0')}`;
  return candidate in MONSTERS ? (candidate as MonsterId) : null;
}

// Hard cap so a typo like `/m 1 1000000` doesn't lock the renderer.
const MAX_SPAWN_COUNT = 50;

function parseCount(arg: string | undefined): number | string {
  if (arg === undefined) return 1;
  const n = Number.parseInt(arg, 10);
  if (!Number.isFinite(n) || n < 1) return `Invalid count: ${arg}`;
  if (n > MAX_SPAWN_COUNT) return `Count capped at ${MAX_SPAWN_COUNT}`;
  return n;
}

function spawnOne(id: MonsterId): string | null {
  switch (id) {
    case MONSTER_WOLF:
      pushBeast('wolf', MONSTER_WOLF);
      return null;
    case MONSTER_BEAR:
      pushBeast('bear', MONSTER_BEAR);
      return null;
    case MONSTER_SWAIN:
      pushSwain();
      return null;
    case MONSTER_SPIDER:
      pushSpider('big');
      return null;
    case MONSTER_SMALL_SPIDER:
      pushSpider('medium');
      return null;
    case MONSTER_TINY_SPIDER:
      pushSpider('tiny');
      return null;
    case MONSTER_TROLLER:
      // Troller is a singleton — spawning a second one overwrites
      // the first, so honour the count by spawning the last only.
      pushTroller();
      return null;
    default:
      return `Monster ${id} has no spawn handler`;
  }
}

function spawnMonster(idArg: string | undefined, countArg: string | undefined): string {
  if (!idArg) return 'Usage: /monster [ID] [COUNT?]';
  const id = normalizeMonsterId(idArg);
  if (!id) return `Unknown monster id: ${idArg}`;
  const count = parseCount(countArg);
  if (typeof count === 'string') return count;
  for (let i = 0; i < count; i++) {
    const err = spawnOne(id);
    if (err) return err;
  }
  const name = getMonster(id).name;
  return count === 1 ? `Spawned ${name}` : `Spawned ${count} ${name}`;
}

// Resolves a player name argument to the local player. Multiplayer
// will swap this for a real roster lookup; for now `/cmd me` and the
// local player's name both target the same character.
function resolveSelf(name: string | undefined): boolean {
  if (!name) return false;
  return name === 'me' || name.toLowerCase() === player.name.toLowerCase();
}

function killPlayer(name: string | undefined): string {
  if (!name) return 'Usage: /kill [NAME]';
  if (!resolveSelf(name)) return `No player named "${name}"`;
  if (!death.alive) return `${player.name} is already dead`;
  // Setting health to 0 triggers the death pipeline in Death.svelte's
  // $effect (drop into the bag, spawn the troller, etc.).
  player.health = 0;
  return `Killed ${player.name}`;
}

function respawnPlayer(name: string | undefined): string {
  if (!name) return 'Usage: /respawn [NAME]';
  if (!resolveSelf(name)) return `No player named "${name}"`;
  if (death.alive) return `${player.name} is already alive`;
  requestRespawn();
  return `Respawned ${player.name}`;
}

const HELP_LINES = [
  '/m or /monster [ID] [COUNT?] — spawn monster(s) by id (default 1)',
  '/kill [NAME] — kill a player by name',
  '/respawn [NAME] — respawn a player by name',
  '/help — show this list',
];

/**
 * Run a slash-command and return one or more lines to echo back as
 * System messages. Returns `null` when the input isn't a command,
 * so the caller can fall through to normal chat handling.
 */
export function runCommand(text: string): string[] | null {
  if (!text.startsWith('/')) return null;
  const [rawCmd, ...args] = text.slice(1).split(/\s+/);
  const cmd = (rawCmd ?? '').toLowerCase();
  switch (cmd) {
    case 'm':
    case 'monster':
      return [spawnMonster(args[0], args[1])];
    case 'kill':
      return [killPlayer(args[0])];
    case 'respawn':
      return [respawnPlayer(args[0])];
    case 'help':
      return HELP_LINES;
    case '':
      return ['Type /help for a list of commands.'];
    default:
      return [`Unknown command: /${cmd}. Try /help`];
  }
}
