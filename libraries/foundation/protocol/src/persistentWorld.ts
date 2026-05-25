// PR-E: schema for the persisted world. The realm DO writes one row
// per realm to its SQLite storage on last-disconnect and on a 30s
// alarm; on next connect we decode it back and resume the simulation
// from where it left off.
//
// Differences vs `Snapshot` (wire-shape over RPC):
//   - Adds fields the snapshot omits but the sim depends on
//     (modifiers, effects, abilities, activeQuests, attackCooldown,
//     fightStartedAt, spawnPointRespawnAt, nextId, rng seed, …).
//   - Drops transient buffers (inputQueue, recentEvents) — those
//     belong to a single tick and are rebuilt empty on rehydrate.
//   - Drops the `entityById` Map — rebuilt O(n) from `entities[]`.
//   - `world.players: Record<PlayerId, Player>` and
//     `spawnPointRespawnAt: Map<string, number>` both serialize as
//     `Schema.Record(Schema.String, ...)` — JSON-friendly without
//     special-casing.
//   - Mulberry32 state collapses to the `rngSeed: number` field at
//     the top of the envelope. Restore returns it alongside the
//     rehydrated world so RealmRoom can build the `RandomState`
//     service (PR-D3e.3) at exactly that seed and rebind
//     `world.rng` to the shared callable.
//
// Versioning: the top-level envelope carries `version: 1`. On a
// breaking schema change, bump the literal + (later) add a migrator.
// For now an old payload that fails to decode falls back to
// `createWorld()` cleanly via RealmStorage.restore returning `None`.

import * as Schema from 'effect/Schema';

// --- Enums (mirrors of snapshot.ts; redeclared here to keep the
// persistent schema independent of the wire-shape's evolution) ---

const Sex = Schema.Literals(['male', 'female']);
const HairColor = Schema.Literals(['black', 'brown', 'blonde', 'red', 'gray', 'white']);
const ArmorColor = Schema.Literals([
  'silver',
  'gold',
  'black',
  'brown',
  'red',
  'green',
  'blue',
  'white',
]);
const PlayerClass = Schema.Literals(['warrior', 'assassin', 'mage', 'bruiser']);
const StatKey = Schema.Literals([
  'damage',
  'attackSpeed',
  'healthRegen',
  'maxHealth',
  'maxMana',
  'maxStamina',
  'moveSpeed',
]);
const AbilityKind = Schema.Literals(['active', 'passive']);
const EffectKind = Schema.Literals(['buff', 'debuff']);
const ChatChannel = Schema.Literals(['Normal', 'Global', 'Group']);
const EntityKind = Schema.Literals([
  'spider-big',
  'spider-medium',
  'spider-tiny',
  'wolf',
  'bear',
  'warmaiden',
  'shadowmaiden',
  'swain',
  'bowmaiden',
  'spellmaiden',
  'janna',
  'azir',
  'troller',
]);

// --- Modifiers + effects ----------------------------------------

const Modifier = Schema.Struct({
  stat: StatKey,
  kind: Schema.Literals(['add', 'mul']),
  value: Schema.Number,
  expiresAt: Schema.optional(Schema.Number),
  effectId: Schema.optional(Schema.String),
});

const EffectStat = Schema.Struct({
  label: Schema.String,
  delta: Schema.Number,
  unit: Schema.optional(Schema.String),
});

const ActiveEffect = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  icon: Schema.String,
  kind: EffectKind,
  appliedAt: Schema.Number,
  expiresAt: Schema.optional(Schema.Number),
  source: Schema.String,
  stats: Schema.Array(EffectStat),
});

const Quest = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  description: Schema.String,
  timeLimitSec: Schema.NullOr(Schema.Number),
  acceptedAt: Schema.Number,
  progress: Schema.optional(
    Schema.Struct({
      current: Schema.Number,
      goal: Schema.Number,
      label: Schema.String,
    }),
  ),
});

const Ability = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  description: Schema.String,
  kind: AbilityKind,
  level: Schema.Number,
  maxLevel: Schema.Number,
});

const ActiveSpell = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal('rush'),
    targetId: Schema.String,
    startedAt: Schema.Number,
    endsAt: Schema.Number,
    fromX: Schema.Number,
    fromZ: Schema.Number,
    toX: Schema.Number,
    toZ: Schema.Number,
  }),
  Schema.Struct({
    kind: Schema.Literal('hail-of-blades'),
    startedAt: Schema.Number,
    endsAt: Schema.Number,
    lastTickAt: Schema.Number,
  }),
]);

// --- Per-player death pipeline (PR-D3d.2) -----------------------

const Attacker = Schema.Struct({
  monsterId: Schema.String,
  name: Schema.String,
  total: Schema.Number,
  hits: Schema.Number,
});

const Summary = Schema.Struct({
  attackers: Schema.Array(Attacker),
  totalDamage: Schema.Number,
  fightSeconds: Schema.Number,
});

const IndicatorBug = Schema.Struct({
  x: Schema.Number,
  z: Schema.Number,
  rotation: Schema.Number,
  wanderTargetX: Schema.Number,
  wanderTargetZ: Schema.Number,
  retargetTimer: Schema.Number,
});

// --- Player ------------------------------------------------------

const Player = Schema.Struct({
  // Identity
  name: Schema.String,
  sex: Sex,
  hairColor: HairColor,
  armor: ArmorColor,
  playerClass: PlayerClass,

  // Progression
  level: Schema.Number,
  experience: Schema.Number,

  // Pools
  health: Schema.Number,
  mana: Schema.Number,
  stamina: Schema.Number,

  // Pose
  x: Schema.Number,
  z: Schema.Number,
  rotation: Schema.Number,

  // Stats
  attackSpeed: Schema.Number,
  healthRegen: Schema.Number,
  damage: Schema.Number,
  equippedWeaponId: Schema.String,

  // Modifier/effect stack (not on wire snapshot — server-side truth)
  modifiers: Schema.Array(Modifier),
  effects: Schema.Array(ActiveEffect),

  // Inventory
  bag: Schema.Array(Schema.String),
  lars: Schema.Number,

  // Abilities + spell points
  abilities: Schema.Array(Ability),
  skillPoints: Schema.Number,
  classSpellPoints: Schema.Number,

  // Active quests
  activeQuests: Schema.Array(Quest),

  // Combat state
  autoAttack: Schema.Boolean,
  engageTargetId: Schema.NullOr(Schema.String),
  engageActive: Schema.Boolean,
  navTargetX: Schema.NullOr(Schema.Number),
  navTargetZ: Schema.NullOr(Schema.Number),
  lastSlashTime: Schema.Number,
  slashTrigger: Schema.Number,
  exhausted: Schema.Boolean,

  // Chat bubble
  saying: Schema.String,
  sayExpiresAt: Schema.Number,

  // Visual triggers
  levelUpTrigger: Schema.Number,
  spellAnimTrigger: Schema.Number,

  // Spells
  spellCooldowns: Schema.Record(Schema.String, Schema.Number),
  spellLevels: Schema.Record(Schema.String, Schema.Number),
  activeSpell: Schema.NullOr(ActiveSpell),

  // Per-player death pipeline (PR-D3d.1 + D3d.2)
  alive: Schema.Boolean,
  deathX: Schema.Number,
  deathZ: Schema.Number,
  attackers: Schema.Array(Attacker),
  fightStartedAt: Schema.NullOr(Schema.Number),
  summary: Schema.NullOr(Summary),
  bug: Schema.NullOr(IndicatorBug),

  // Per-player pending input flags
  pendingManualAttack: Schema.Boolean,
  pendingRespawn: Schema.Boolean,
});

// --- Entities + projectiles + circles + loot bags ---------------

const Entity = Schema.Struct({
  id: Schema.String,
  kind: EntityKind,
  monsterId: Schema.String,
  x: Schema.Number,
  z: Schema.Number,
  rotation: Schema.Number,
  hp: Schema.Number,
  maxHp: Schema.Number,
  damage: Schema.Number,
  attackSpeed: Schema.Number,
  healthRegen: Schema.Number,
  experience: Schema.Number,
  spawnPointId: Schema.optional(Schema.String),
  attackCooldown: Schema.Number,
  healCooldown: Schema.optional(Schema.Number),
  phase: Schema.optional(Schema.Literals(['approach', 'collect', 'leave'])),
  phaseTimer: Schema.optional(Schema.Number),
  carriesPlayerBag: Schema.optional(Schema.Boolean),
  trollerTargetX: Schema.optional(Schema.Number),
  trollerTargetZ: Schema.optional(Schema.Number),
  forPlayerId: Schema.optional(Schema.String),
  bagXp: Schema.optional(Schema.Number),
  stunnedUntil: Schema.optional(Schema.Number),
  slowedUntil: Schema.optional(Schema.Number),
  saying: Schema.optional(Schema.String),
  sayExpiresAt: Schema.optional(Schema.Number),
  nextSayAt: Schema.optional(Schema.Number),
});

const Projectile = Schema.Struct({
  id: Schema.String,
  ownerId: Schema.String,
  ownerMonsterId: Schema.String,
  x: Schema.Number,
  z: Schema.Number,
  vx: Schema.Number,
  vz: Schema.Number,
  traveled: Schema.Number,
  damage: Schema.Number,
});

const HealingCircle = Schema.Struct({
  id: Schema.String,
  ownerId: Schema.String,
  x: Schema.Number,
  z: Schema.Number,
  ttl: Schema.Number,
});

const LootBagItem = Schema.Struct({
  owner: Schema.String,
  itemId: Schema.String,
});

const WorldLootBag = Schema.Struct({
  id: Schema.String,
  x: Schema.Number,
  z: Schema.Number,
  items: Schema.Array(LootBagItem),
  ttl: Schema.Number,
  isDeathBag: Schema.Boolean,
  bagXp: Schema.Number,
  forPlayerId: Schema.optional(Schema.String),
  isCurrencyOnly: Schema.Boolean,
  larsCount: Schema.Number,
  hasOwnerItems: Schema.Boolean,
});

const ChatMessage = Schema.Struct({
  id: Schema.String,
  author: Schema.String,
  text: Schema.String,
  channel: ChatChannel,
});

// --- Top-level world --------------------------------------------

export const PersistentWorld = Schema.Struct({
  version: Schema.Literal(1),
  // Mulberry32 seed; RealmRoom feeds it to `makeRandomLayer(seed)`
  // on restore (PR-D3e.3).
  rngSeed: Schema.Number,
  time: Schema.Number,
  tick: Schema.Number,
  localPlayerId: Schema.String,
  ownerId: Schema.NullOr(Schema.String),

  // Maps → Records for JSON roundtrip.
  players: Schema.Record(Schema.String, Player),

  entities: Schema.Array(Entity),
  projectiles: Schema.Array(Projectile),
  healingCircles: Schema.Array(HealingCircle),
  lootBags: Schema.Array(WorldLootBag),

  chat: Schema.Struct({
    messages: Schema.Array(ChatMessage),
  }),

  spawnPointsInitialized: Schema.Boolean,
  spawnPointRespawnAt: Schema.Record(Schema.String, Schema.Number),

  nextId: Schema.Number,
});

export type PersistentWorld = typeof PersistentWorld.Type;
