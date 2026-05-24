import * as Schema from 'effect/Schema';

// --- Enums -------------------------------------------------------

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

export const EntityKind = Schema.Literals([
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

// --- Spell channel state -----------------------------------------

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

// --- Player ------------------------------------------------------

export const PlayerSnapshot = Schema.Struct({
  id: Schema.String,

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

  // Inventory
  bag: Schema.Array(Schema.String),
  lars: Schema.Number,

  // Points
  skillPoints: Schema.Number,
  classSpellPoints: Schema.Number,

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

  // Death state (per-player in multiplayer)
  alive: Schema.Boolean,
  deathX: Schema.Number,
  deathZ: Schema.Number,
});

// --- Entity ------------------------------------------------------

export const EntitySnapshot = Schema.Struct({
  id: Schema.String,
  kind: EntityKind,
  monsterId: Schema.String,
  x: Schema.Number,
  z: Schema.Number,
  rotation: Schema.Number,
  hp: Schema.Number,
  maxHp: Schema.Number,
  saying: Schema.optional(Schema.String),
});

// --- Projectile --------------------------------------------------

export const ProjectileSnapshot = Schema.Struct({
  id: Schema.String,
  x: Schema.Number,
  z: Schema.Number,
  vx: Schema.Number,
  vz: Schema.Number,
});

// --- Healing circle ----------------------------------------------

export const HealingCircleSnapshot = Schema.Struct({
  id: Schema.String,
  ownerId: Schema.String,
  x: Schema.Number,
  z: Schema.Number,
  ttl: Schema.Number,
});

// --- Loot bag ----------------------------------------------------

const LootBagItem = Schema.Struct({
  owner: Schema.String,
  itemId: Schema.String,
});

export const LootBagSnapshot = Schema.Struct({
  id: Schema.String,
  x: Schema.Number,
  z: Schema.Number,
  items: Schema.Array(LootBagItem),
  ttl: Schema.Number,
  isDeathBag: Schema.Boolean,
  bagXp: Schema.Number,
});

// --- Chat --------------------------------------------------------

export const ChatMessageSnapshot = Schema.Struct({
  id: Schema.String,
  author: Schema.String,
  text: Schema.String,
  channel: Schema.Literals(['Normal', 'Global', 'Group']),
});

// --- Top-level snapshot ------------------------------------------

export const Snapshot = Schema.Struct({
  tick: Schema.Number,
  time: Schema.Number,
  // Party owner — the first player to connect. Null only while the realm
  // has not yet accepted its first session (rare; clients normally see
  // this populated by the first snapshot they receive).
  ownerId: Schema.NullOr(Schema.String),
  players: Schema.Array(PlayerSnapshot),
  entities: Schema.Array(EntitySnapshot),
  projectiles: Schema.Array(ProjectileSnapshot),
  healingCircles: Schema.Array(HealingCircleSnapshot),
  lootBags: Schema.Array(LootBagSnapshot),
  chatMessages: Schema.Array(ChatMessageSnapshot),
});

export type EntityKind = typeof EntityKind.Type;
export type PlayerSnapshot = typeof PlayerSnapshot.Type;
export type EntitySnapshot = typeof EntitySnapshot.Type;
export type ProjectileSnapshot = typeof ProjectileSnapshot.Type;
export type HealingCircleSnapshot = typeof HealingCircleSnapshot.Type;
export type LootBagSnapshot = typeof LootBagSnapshot.Type;
export type ChatMessageSnapshot = typeof ChatMessageSnapshot.Type;
export type Snapshot = typeof Snapshot.Type;
