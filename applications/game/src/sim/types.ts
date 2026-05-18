// World shape. Everything the simulation reads or writes lives in
// these types — no `.svelte.ts` imports, no DOM, no canvas. The
// goal is that `tick(world, dt, inputs)` is a pure function over
// these structures and could equally well run inside a worker, a
// test, or (eventually) a Cloudflare Durable Object.

import type { ItemId } from '../items';
import type { MonsterId } from '../monsters';
import type { Rng } from './rng';

// --- Identity / cosmetics ---------------------------------------

export type Sex = 'male' | 'female';

export type HairColor =
  | 'black' | 'brown' | 'blonde' | 'red' | 'gray' | 'white';

export type ArmorColor =
  | 'silver' | 'gold' | 'black' | 'brown' | 'red' | 'green' | 'blue' | 'white';

// --- Player -----------------------------------------------------

export interface Player {
  // Identity
  name: string;
  sex: Sex;
  hairColor: HairColor;
  armor: ArmorColor;

  // Progression
  level: number;
  experience: number;

  // Pools
  health: number;
  mana: number;
  stamina: number;

  // Pose
  x: number;
  z: number;
  rotation: number;

  // Stats. Base values; effective values fold in the equipped
  // weapon's attributes at read time (see sim helpers).
  attackSpeed: number;
  healthRegen: number;
  damage: number;
  equippedWeaponId: ItemId;

  // Auto-attack mode: when true the player keeps swinging the
  // selected hostile until either dies; when false they swing once
  // and stop, requiring another click.
  autoAttack: boolean;

  // Engagement / nav. `engageTargetId` is the entity the player is
  // actively trying to fight; `navTarget*` is the click-to-move
  // destination. Either can be set independently — engage continually
  // refreshes navTarget while out of reach.
  engageTargetId: string | null;
  engageActive: boolean;
  navTargetX: number | null;
  navTargetZ: number | null;

  // Attack pacing
  lastSlashTime: number; // world.time of last accepted slash
  // Monotonic counter the view latches onto to play the slash
  // animation. Incremented from sim, observed by Player.svelte.
  slashTrigger: number;

  // Stamina exhaustion latch (slow regen until full again).
  exhausted: boolean;

  // Chat bubble above the head.
  saying: string;
  sayExpiresAt: number;

  // Level-up visual trigger — incremented once per level-up so
  // Player.svelte can spawn the pillar of light without polling.
  levelUpTrigger: number;
}

// --- Entities (monsters + janna + troller) ----------------------

export type EntityKind =
  | 'spider-big' | 'spider-medium' | 'spider-tiny'
  | 'wolf' | 'bear' | 'swain'
  | 'janna' | 'troller';

export interface Entity {
  id: string;
  kind: EntityKind;
  monsterId: MonsterId;

  x: number;
  z: number;
  rotation: number;

  // Stats snapshot at spawn (night multiplier already folded in).
  hp: number;
  maxHp: number;
  damage: number;
  attackSpeed: number;
  healthRegen: number;

  // Per-instance attack cooldown in seconds.
  attackCooldown: number;

  // Janna's healing-circle cooldown lives here too — same shape,
  // separate semantics.
  healCooldown?: number;

  // Troller pipeline phase: approach corpse → collect → leave with bag.
  phase?: 'approach' | 'collect' | 'leave';
  phaseTimer?: number;
  // Troller carries the player's death-bag XP until it drops the bag.
  carriesPlayerBag?: boolean;
  trollerTargetX?: number;
  trollerTargetZ?: number;
}

// --- Projectiles, healing circles, world loot bags --------------

export interface Projectile {
  id: string;
  ownerId: string;
  x: number;
  z: number;
  vx: number;
  vz: number;
  traveled: number;
  damage: number;
}

export interface HealingCircle {
  id: string;
  ownerId: string;
  x: number;
  z: number;
  ttl: number;
}

export interface LootBagItem {
  owner: string;
  itemId: ItemId;
}

export interface WorldLootBag {
  id: string;
  x: number;
  z: number;
  items: LootBagItem[];
  ttl: number;
  // Death-bag flag distinguishes the bag dropped by the player's
  // troller (carries XP recovery) from regular kill bags.
  isDeathBag: boolean;
  // XP held by the death bag (0 for regular bags).
  bagXp: number;
}

// --- Death-pipeline transient state -----------------------------

export interface IndicatorBug {
  x: number;
  z: number;
  rotation: number;
  wanderTargetX: number;
  wanderTargetZ: number;
  retargetTimer: number;
}

// --- Chat -------------------------------------------------------

export type ChatChannel = 'Normal' | 'Global' | 'Group';

export interface ChatMessage {
  id: string;
  author: string;
  text: string;
  channel: ChatChannel;
}

// --- Inputs / events --------------------------------------------

export type SimEvent =
  | { kind: 'click_ground'; x: number; z: number }
  | { kind: 'engage'; targetId: string }
  | { kind: 'manual_attack' }
  | { kind: 'send_chat'; text: string; channel: ChatChannel }
  | { kind: 'request_respawn' }
  | { kind: 'set_auto_attack'; on: boolean }
  | { kind: 'kill_player' };

export interface FrameInputs {
  // World-space WASD (already camera-transformed by the client).
  // Set to {0,0} when no key is held.
  moveX: number;
  moveZ: number;
}

// --- The world --------------------------------------------------

export interface World {
  // Seeded PRNG used by every sim system. Math.random() is
  // forbidden inside sim/.
  rng: Rng;
  // Real game seconds since the world was created. Drives day/
  // night cycle, attack-speed clocks, bubble expiries, ttls, etc.
  time: number;
  // Monotonic tick counter, useful for generating stable ids.
  tick: number;

  player: Player;
  entities: Entity[];
  projectiles: Projectile[];
  healingCircles: HealingCircle[];
  lootBags: WorldLootBag[];

  // Death pipeline. `alive` is the truth for the player; when false
  // the troller pipeline runs until the bag is dropped/pickup.
  // `bagXp` is the total XP the troller is carrying (transferred
  // onto whichever WorldLootBag eventually lands on the ground).
  death: {
    alive: boolean;
    deathX: number;
    deathZ: number;
    bagXp: number;
    bug: IndicatorBug | null;
  };

  chat: {
    messages: ChatMessage[];
  };

  // Per-system spawn cooldowns. Each tick we add dt; once the
  // threshold is crossed, the spawner attempts a spawn.
  spawnTimers: {
    spider: number;
    swain: number;
    wolf: number;
    bear: number;
    janna: number;
  };

  // Internal id counter. Entities/projectiles/circles/bags pull
  // their ids from here so they stay unique without needing per-
  // collection counters.
  nextId: number;

  // Inputs queued from outside (UI dispatches, future network
  // packets). Drained at the top of every tick.
  inputQueue: SimEvent[];

  // Per-tick scratch flags. Events set them; downstream systems read
  // and clear them during the same tick. Kept on the world so two
  // parallel sims (e.g. client prediction + authoritative) don't
  // clobber each other through module-level singletons.
  pending: {
    manualAttack: boolean;
    respawn: boolean;
  };
}
