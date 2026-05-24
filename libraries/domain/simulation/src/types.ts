// World shape. Everything the simulation reads or writes lives in
// these types — no `.svelte.ts` imports, no DOM, no canvas. The
// goal is that `tick(world, dt, inputs)` is a pure function over
// these structures and could equally well run inside a worker, a
// test, or (eventually) a Cloudflare Durable Object.

import type { ChatChannel, SimEvent } from '@kassandra/protocol-foundation-library';
import type { ItemId } from './items.ts';
import type { MonsterId } from './monsters.ts';
import type { Rng } from './rng.ts';

export type { ChatChannel, SimEvent };

export type PlayerId = string;

// --- Stat modifier stack ----------------------------------------

export type StatKey =
  | 'damage'
  | 'attackSpeed'
  | 'healthRegen'
  | 'maxHealth'
  | 'maxMana'
  | 'maxStamina'
  | 'moveSpeed';

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

export type HairColor = 'black' | 'brown' | 'blonde' | 'red' | 'gray' | 'white';

export type ArmorColor = 'silver' | 'gold' | 'black' | 'brown' | 'red' | 'green' | 'blue' | 'white';

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

// --- Spell channel state ----------------------------------------

export type ActiveSpell =
  | {
      kind: 'rush';
      targetId: string;
      startedAt: number;
      endsAt: number;
      fromX: number;
      fromZ: number;
      toX: number;
      toZ: number;
    }
  | {
      kind: 'hail-of-blades';
      startedAt: number;
      endsAt: number;
      lastTickAt: number;
    };

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
  // own cadence — granted +1 per character level-up, spent via the
  // `level_up_spell` SimEvent.
  classSpellPoints: number;

  // Per-spell level, keyed by spellId (matches CLASS_SPELLS[].id).
  // Absent / 0 ↔ locked (uncastable). 1..MAX_SPELL_LEVEL after the
  // player spends classSpellPoints to learn/level it up. Mana cost
  // scales with this value (see getSpellManaCost in spells.ts).
  spellLevels: Record<string, number>;

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

  // Spell system. `spellCooldowns` maps spellId → world.time at which
  // the spell becomes castable again. `activeSpell` is non-null while a
  // channelled spell (Rush dash, Hail spin) is in progress — movement
  // and auto-attack are suppressed during channels. `spellAnimTrigger`
  // is a monotonic counter Player.svelte watches to kick off vfx.
  spellCooldowns: Record<string, number>;
  activeSpell: ActiveSpell | null;
  spellAnimTrigger: number;

  // Per-player death state (PR-D3d.1+D3d.2). Pre-D3d these lived on
  // world.death (one-per-world, anchor-tracked); now every player
  // dies independently AND every player has their own pipeline state
  // (troller, indicator bug, attackers summary).
  alive: boolean;
  // Location where the player most recently died. Used by the bag
  // pickup logic + the in-world tombstone marker. Stays at the last
  // death even after respawn.
  deathX: number;
  deathZ: number;

  // PR-D3d.2 pipeline state, per-player:
  //   - attackers: running per-fight damage attribution; folded into
  //     `summary` on death; cleared on respawn.
  //   - fightStartedAt: world.time of the first hit in the current
  //     life (null until someone lands a hit).
  //   - summary: frozen recap snapshot at death; cleared on respawn.
  //     The Hud's death overlay reads it.
  //   - bug: breadcrumb indicator pointing to this player's pending
  //     death-bag after they respawn; cleared when the bag is
  //     picked up or expires.
  attackers: { monsterId: string; name: string; total: number; hits: number }[];
  fightStartedAt: number | null;
  summary: {
    attackers: { monsterId: string; name: string; total: number; hits: number }[];
    totalDamage: number;
    fightSeconds: number;
  } | null;
  bug: IndicatorBug | null;

  // Per-player pending input signals (PR-D3d.1). Pre-D3d these were
  // world.pending fields, which mis-routed in multiplayer (anyone
  // pressing space made the anchor swing). Now each player has their
  // own flags; the RPC handler / tick consumer drains the right one.
  pendingManualAttack: boolean;
  pendingRespawn: boolean;
}

// --- Entities (monsters + janna + troller) ----------------------

export type EntityKind =
  | 'spider-big'
  | 'spider-medium'
  | 'spider-tiny'
  | 'wolf'
  | 'bear'
  | 'warmaiden'
  | 'shadowmaiden'
  | 'swain'
  | 'bowmaiden'
  | 'spellmaiden'
  | 'janna'
  | 'azir'
  | 'troller';

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
  // PR-D3d.2: per-player death pipeline. A troller now belongs to a
  // specific dying player; multiple trollers can coexist when many
  // players die at once. `forPlayerId` tags ownership; `bagXp` is the
  // XP this troller will deposit into the death-bag on drop.
  forPlayerId?: PlayerId;
  bagXp?: number;

  // Spell status effects applied by player abilities.
  stunnedUntil?: number; // world.time; AI skips its tick while set
  slowedUntil?: number; // world.time; AI moves at half speed while set

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
  // PR-D3d.2: which player this bag belongs to. Only set for death
  // bags — kill-loot bags use `items[].owner` (a display name) for
  // ownership UI. Auto-pickup gates on `forPlayerId === pid` so each
  // player can only reclaim their own corpse XP.
  forPlayerId?: PlayerId;

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

export interface ChatMessage {
  id: string;
  author: string;
  text: string;
  channel: ChatChannel;
}

// --- Inputs / events --------------------------------------------

export interface FrameInputs {
  // World-space WASD (already camera-transformed by the client).
  // Set to {0,0} when no key is held.
  moveX: number;
  moveZ: number;
}

// --- Transient sim events ---------------------------------------
// PR-D3d.3: cross-cutting events that fire during a tick (damage
// popups, kill feed, level-up announce, spell cast). Buffered on
// `world.recentEvents`, drained into the snapshot each tick, and
// dispatched on the client to UI subscribers. The old module-level
// `Set<Handler>` in events.ts was a solo-arch holdover — the sim
// runs in the DO, so any client-side `subscribe()` never fired in
// multiplayer. Per-world buffer + snapshot transport fixes that.

export type GameEvent =
  | {
      kind: 'entity-killed';
      entityKind: EntityKind;
      monsterId: MonsterId;
      x: number;
      z: number;
      // The player credited with the kill, or null for an
      // environmental kill (NPC vs NPC, projectile from a monster).
      // UI consumers compare against `world.localPlayerId` to decide
      // whether to show e.g. an XP popup on *this* client.
      byPlayerId: PlayerId | null;
    }
  | { kind: 'player-level-up'; level: number }
  | {
      kind: 'damage-dealt';
      x: number;
      z: number;
      amount: number;
      // PR-bug-bash: was `byPlayer: boolean` (any-player vs not).
      // In multiplayer that mis-coloured every popup yellow on every
      // client. Now carries the attacker's PlayerId (or null for
      // monster→player damage) so each client can compare against its
      // own `localPlayerId` to colour "given" vs "taken" correctly.
      byPlayerId: PlayerId | null;
    }
  | { kind: 'spell-cast'; spellId: string; x: number; z: number };

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

  players: Record<PlayerId, Player>;
  localPlayerId: PlayerId;
  // The party owner. Set on the realm side when the first player connects
  // to a fresh party (persisted in DO storage). Null for solo / pre-connect
  // worlds. Only the owner is allowed to disband the party.
  ownerId: PlayerId | null;
  entities: Entity[];
  // O(1) entity lookup by id. Mirrors `entities` — kept in sync by
  // spawn.ts (add) and removeEntity() in util.ts (remove).
  entityById: Map<string, Entity>;
  projectiles: Projectile[];
  healingCircles: HealingCircle[];
  lootBags: WorldLootBag[];

  // PR-D3d.2: world.death is gone. Every field that used to live there
  // (alive, deathX/Z, bagXp, bug, attackers, fightStartedAt, summary)
  // is now per-player. bagXp travels via the troller Entity itself
  // (entity.bagXp) for the duration of the carry; on drop it lands on
  // the WorldLootBag.

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

  // PR-D3d.3: transient events emitted during a tick (damage hits,
  // kills, level-ups, spell casts). Populated by `emit()` calls from
  // sim systems; serialized into the snapshot at end-of-tick; cleared
  // at the start of the next tick. UI consumers subscribe by reading
  // these out of each snapshot rather than via a shared handler set
  // — see applications/game/src/damageNumbers.svelte.ts.
  recentEvents: GameEvent[];

  // PR-D3d.1: per-tick scratch flags moved to Player.pendingManualAttack
  // and Player.pendingRespawn. Each player drains their own flags
  // during their own tick step instead of a shared anchor-only bag.
}
