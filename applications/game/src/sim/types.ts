// World shape. Everything the simulation reads or writes lives in
// these types — no `.svelte.ts` imports, no DOM, no canvas. The
// goal is that `tick(world, dt, inputs)` is a pure function over
// these structures and could equally well run inside a worker, a
// test, or (eventually) a Cloudflare Durable Object.

import type { ItemId } from '../items';
import type { MonsterId } from '../monsters';
import type { Rng } from './rng';

// --- Stat modifier stack ----------------------------------------

export type StatKey =
  | 'damage' | 'attackSpeed' | 'healthRegen'
  | 'maxHealth' | 'maxMana' | 'maxStamina';

export interface Modifier {
  stat: StatKey;
  kind: 'add' | 'mul';
  value: number;
  // World time (seconds) at which this modifier expires. Absent = permanent.
  expiresAt?: number;
  // Optional link back to the ActiveEffect that owns this math row.
  // When the effect expires, every modifier carrying its id is dropped
  // alongside it so the two layers stay consistent.
  effectId?: string;
}

// --- Buffs / debuffs --------------------------------------------

// A single line in an effect's tooltip ("Intelligence +12"). Kept
// free-form so the catalog can advertise flavour stats (Strength,
// Intelligence, Crit) without growing StatKey to match. The actual
// math impact lives in the Modifier rows the effect spawns; this
// list is presentation only.
export interface EffectStat {
  label: string;
  delta: number;
  // Optional unit suffix (e.g. 's', '%'). Renderer prints
  // `${label} ${sign}${delta}${unit ?? ''}`.
  unit?: string;
}

// A presentation-layer buff/debuff. One effect = one icon in the
// HUD bar. Each effect can also push one or more Modifier rows tagged
// with its id; when the effect's expiresAt passes, tickModifiers
// drops the effect AND its modifier rows together.
export interface ActiveEffect {
  id: string;
  name: string;
  // Single emoji used as the icon for now. Swap for an image key
  // later when art lands.
  icon: string;
  kind: 'buff' | 'debuff';
  // World time when applied. Useful for sort order and (later) a
  // radial-fill expiry animation.
  appliedAt: number;
  // Absent = permanent. Number = world.time at expiry.
  expiresAt?: number;
  // Display name of whoever applied this effect.
  source: string;
  // Tooltip stat lines (display only).
  stats: EffectStat[];
}

// --- Identity / cosmetics ---------------------------------------

export type Sex = 'male' | 'female';

export type HairColor =
  | 'black' | 'brown' | 'blonde' | 'red' | 'gray' | 'white';

export type ArmorColor =
  | 'silver' | 'gold' | 'black' | 'brown' | 'red' | 'green' | 'blue' | 'white';

export type PlayerClass = 'warrior' | 'assassin' | 'mage' | 'bruiser';

// --- Quests -----------------------------------------------------

// A "quest envelope" — what shows up as a row in the Quests tab
// and (eventually) as a pickup item in the world. `timeLimitSec`
// null = no time limit; otherwise the entry should display a
// countdown and auto-expire from the log.
export type QuestId = string;

export interface Quest {
  id: QuestId;
  title: string;
  description: string;
  // Null = open-ended. Number = seconds from `acceptedAt`.
  timeLimitSec: number | null;
  // World time at which the player picked up the envelope. Used to
  // drive the countdown for time-limited quests.
  acceptedAt: number;
  // Optional running progress (e.g. "Remaining: 3"). Quest systems
  // increment this directly; the UI just displays it.
  progress?: { current: number; goal: number; label: string };
}

// --- Abilities --------------------------------------------------

// Active = triggered (consumes SP, has cooldown). Passive = always
// on. Kept as a discriminator so the abilities panel can group them
// without a parallel lookup.
export type AbilityKind = 'active' | 'passive';

export interface Ability {
  id: string;
  name: string;
  description: string;
  kind: AbilityKind;
  // Current investment level; 0 = unlocked-but-untrained slot, which
  // still renders distinctly from a locked/empty slot.
  level: number;
  maxLevel: number;
}

// --- Player -----------------------------------------------------

export interface Player {
  // Identity
  name: string;
  sex: Sex;
  hairColor: HairColor;
  armor: ArmorColor;
  playerClass: PlayerClass;

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

  // Base stats. Effective values fold in weapon + modifier stack at
  // read time via getEffectiveStat() in sim/stats.ts.
  attackSpeed: number;
  healthRegen: number;
  damage: number;
  equippedWeaponId: ItemId;
  modifiers: Modifier[];
  // Active buffs / debuffs surfaced in the HUD bar. Pure presentation
  // wrapper around `modifiers` — see ActiveEffect above.
  effects: ActiveEffect[];

  // Inventory: item ids acquired from world loot bags. Currency
  // items (Lars) do NOT live here — they roll into the `lars`
  // counter at pickup so the bag never wastes slots on coins.
  bag: ItemId[];
  // Lars (the currency). Increments on coin pickup, decrements on
  // drop or on /gold -N. Floor is 0.
  lars: number;

  // Trained abilities. Empty on a fresh character — populated as
  // ability books are consumed or as class skills unlock at level.
  abilities: Ability[];
  // Unspent skill points awarded on level-up; spent to raise an
  // ability's level in the Abilities panel.
  skillPoints: number;
  // Separate pool spent only on the six per-class signature spells.
  // Kept distinct from skillPoints so the class kit can level on its
  // own cadence (e.g. one classSpellPoint per class-quest reward).
  classSpellPoints: number;

  // Active quest envelopes — every quest the player has accepted
  // and not yet completed/abandoned. Rendered in the Quests tab.
  activeQuests: Quest[];

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
  | 'wolf' | 'bear' | 'warmaiden' | 'shadowmaiden'
  | 'swain' | 'bowmaiden' | 'spellmaiden'
  | 'janna' | 'azir' | 'troller';

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
  experience: number;

  // Spawn-point origin id (when the entity came from the fixed
  // spawn-point system). Used by combat.ts to schedule a respawn on
  // death. Absent for entities created dynamically — spider-split
  // children, troller, /m chat spawns.
  spawnPointId?: string;

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

  // Ambient NPC chatter. The line currently shown above the head
  // (cleared when `sayExpiresAt` passes). `nextSayAt` is the sim
  // time at which the next line should fire — driven by the npcChat
  // system, lazily initialised on first tick.
  saying?: string;
  sayExpiresAt?: number;
  nextSayAt?: number;
}

// --- Projectiles, healing circles, world loot bags --------------

export interface Projectile {
  id: string;
  ownerId: string;
  // Catalog id of the firing monster. Captured at spawn time so the
  // death-summary attribution survives the owner dying mid-flight.
  ownerMonsterId: string;
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

  // --- Cached summaries of `items` ---
  // These are refreshed by `refreshLootBagFlags()` whenever the
  // bag is created or its items change (pickup). They let per-frame
  // consumers (coin physics, render bundle visibility, Z-pickup
  // scan) read O(1) instead of rescanning the items array.
  isCurrencyOnly: boolean;
  larsCount: number;
  hasOwnerItems: boolean;
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
  | { kind: 'kill_player' }
  | { kind: 'pickup_loot'; bagId: string }
  | { kind: 'drop_item'; itemId: string; count: number };

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
  // O(1) entity lookup by id. Mirrors `entities` — kept in sync by
  // spawn.ts (add) and removeEntity() in util.ts (remove).
  entityById: Map<string, Entity>;
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
    // Running per-attacker damage taken since the last respawn —
    // grouped by monsterId, used to build the death summary.
    attackers: { monsterId: string; name: string; total: number; hits: number }[];
    // World time of the first hit in the current life (null until
    // someone lands the first hit). Drives the summary's fight length.
    fightStartedAt: number | null;
    // Snapshot frozen at death; cleared on respawn. The Hud shows
    // the death recap whenever this is non-null.
    summary: {
      attackers: { monsterId: string; name: string; total: number; hits: number }[];
      totalDamage: number;
      fightSeconds: number;
    } | null;
  };

  chat: {
    messages: ChatMessage[];
  };

  // Fixed spawn-point bookkeeping. `spawnPointsInitialized` flips
  // true after tickSpawners seeds every point on the first tick.
  // `spawnPointRespawnAt` maps a spawn-point id to the world time
  // at which it should respawn — populated by combat.ts on the
  // death of an entity carrying a spawnPointId whose point has a
  // respawnDelay. Entries are removed when respawned.
  spawnPointsInitialized: boolean;
  spawnPointRespawnAt: Map<string, number>;

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
