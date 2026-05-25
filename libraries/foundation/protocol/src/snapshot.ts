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

// --- Per-player death pipeline -----------------------------------

const AttackerSnapshot = Schema.Struct({
  monsterId: Schema.String,
  name: Schema.String,
  total: Schema.Number,
  hits: Schema.Number,
});

const SummarySnapshot = Schema.Struct({
  attackers: Schema.Array(AttackerSnapshot),
  totalDamage: Schema.Number,
  fightSeconds: Schema.Number,
});

const BugSnapshot = Schema.Struct({
  x: Schema.Number,
  z: Schema.Number,
  rotation: Schema.Number,
  wanderTargetX: Schema.Number,
  wanderTargetZ: Schema.Number,
  retargetTimer: Schema.Number,
});

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
  // PR-D3d.2: death summary + indicator bug live on Player now.
  // Both nullable: summary is null until the player dies once; bug
  // is null when there's no death bag pointer active.
  summary: Schema.NullOr(SummarySnapshot),
  bug: Schema.NullOr(BugSnapshot),
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
  // PR-D3d.2: present only on death bags; the player who can reclaim
  // this bag's stored XP via auto-pickup.
  forPlayerId: Schema.optional(Schema.String),
});

// --- Chat --------------------------------------------------------

export const ChatMessageSnapshot = Schema.Struct({
  id: Schema.String,
  author: Schema.String,
  text: Schema.String,
  channel: Schema.Literals(['Normal', 'Global', 'Group']),
});

// --- Transient sim events ---------------------------------------
// PR-D3d.3: events emitted by sim systems during a tick (damage
// popups, kills, level-ups, spell casts) — shipped on every snapshot
// then cleared sim-side. Replaces the dead-on-MP `subscribe()` API.

export const GameEventSnapshot = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal('entity-killed'),
    entityKind: EntityKind,
    monsterId: Schema.String,
    x: Schema.Number,
    z: Schema.Number,
    // Bug-bash: `byPlayer: boolean` became `byPlayerId: PlayerId | null`
    // so multiplayer clients can compare against their localPlayerId
    // instead of mis-attributing every kill to themselves.
    byPlayerId: Schema.NullOr(Schema.String),
  }),
  Schema.Struct({
    kind: Schema.Literal('player-level-up'),
    level: Schema.Number,
  }),
  Schema.Struct({
    kind: Schema.Literal('damage-dealt'),
    x: Schema.Number,
    z: Schema.Number,
    amount: Schema.Number,
    byPlayerId: Schema.NullOr(Schema.String),
  }),
  Schema.Struct({
    kind: Schema.Literal('spell-cast'),
    spellId: Schema.String,
    x: Schema.Number,
    z: Schema.Number,
  }),
]);

// --- Top-level snapshot ------------------------------------------

export const Snapshot = Schema.Struct({
  tick: Schema.Number,
  time: Schema.Number,
  // Realm owner — the first player to connect. Null only while the realm
  // has not yet accepted its first session (rare; clients normally see
  // this populated by the first snapshot they receive).
  ownerId: Schema.NullOr(Schema.String),
  // Server-authoritative identity for the receiving client. Equal to
  // the session.accountId the realm read from the session cookie. The
  // client uses this to set world.localPlayerId instead of relying on
  // its own auth.accountId — the two can diverge when a stale session
  // cookie is present (different accountId than the current localStorage
  // value). Per-subscriber: the tick publishes a selfId-less snapshot to
  // the PubSub; each SnapshotStream handler maps in the player's own id.
  selfId: Schema.String,
  players: Schema.Array(PlayerSnapshot),
  entities: Schema.Array(EntitySnapshot),
  projectiles: Schema.Array(ProjectileSnapshot),
  healingCircles: Schema.Array(HealingCircleSnapshot),
  lootBags: Schema.Array(LootBagSnapshot),
  chatMessages: Schema.Array(ChatMessageSnapshot),
  // PR-D3d.3: transient events that fired during the just-finished
  // sim tick. Drained sim-side after this snapshot is built; clients
  // dispatch them on receipt (damage popups, kill feed, etc.).
  recentEvents: Schema.Array(GameEventSnapshot),
});

export type EntityKind = typeof EntityKind.Type;
export type PlayerSnapshot = typeof PlayerSnapshot.Type;
export type EntitySnapshot = typeof EntitySnapshot.Type;
export type ProjectileSnapshot = typeof ProjectileSnapshot.Type;
export type HealingCircleSnapshot = typeof HealingCircleSnapshot.Type;
export type LootBagSnapshot = typeof LootBagSnapshot.Type;
export type ChatMessageSnapshot = typeof ChatMessageSnapshot.Type;
export type GameEventSnapshot = typeof GameEventSnapshot.Type;
export type Snapshot = typeof Snapshot.Type;
