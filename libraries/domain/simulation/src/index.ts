// Public surface of @kassandra/simulation.
// Re-exports everything the game app (and future server) needs so
// consumers can write `from '@kassandra/simulation'` rather than
// deep-pathing into the library internals.

// --- Data catalogs ---
export {
  ITEMS,
  STARTING_WEAPON_ID,
  LARS_ID,
  getItem,
  type Item,
  type ItemId,
  type ItemType,
  type ItemSubtype,
  type ItemAttributes,
} from './items.ts';

export {
  MONSTERS,
  MONSTER_WOLF,
  MONSTER_BEAR,
  MONSTER_SWAIN,
  MONSTER_SPIDER,
  MONSTER_SMALL_SPIDER,
  MONSTER_TINY_SPIDER,
  MONSTER_TROLLER,
  MONSTER_JANNA,
  MONSTER_AZIR,
  MONSTER_BOWMAIDEN,
  MONSTER_WARMAIDEN,
  MONSTER_SHADOWMAIDEN,
  MONSTER_SPELLMAIDEN,
  getMonster,
  type Monster,
  type MonsterId,
  type MonsterType,
  type MonsterAttributes,
} from './monsters.ts';

export { LOOT, rollLoot, type LootEntry, type LootTable } from './loot.ts';

export { SPAWN_POINTS, getSpawnPoint, type SpawnPoint, type SpawnPointId } from './spawnPoints.ts';

// --- City ---
export {
  CITY_X,
  CITY_Z,
  CITY_RADIUS,
  CITY_WALL_HEIGHT,
  CITY_WALL_THICKNESS,
  CITY_GATE_ANGLE,
  CITY_GATE_HALF_WIDTH,
  isInCity,
  isGateAngle,
} from './city.ts';

// --- World generation ---
export {
  CHUNK_SIZE,
  RENDER_RADIUS,
  getChunk,
  getVisibleProps,
  getWaterChunk,
  getVisibleWaters,
  type PropInstance,
  type PropType,
  type WaterPatch,
} from './worldGen.ts';

// --- Constants ---
export {
  BASE_ATTACK_SPEED,
  BASE_HEALTH_REGEN,
  BASE_DAMAGE,
  PLAYER_MAX_HP,
  PLAYER_MAX_MANA,
  STAMINA_MAX,
  SWORD_REACH,
  SWORD_DOT_THRESHOLD,
  ENGAGE_RANGE,
  ARRIVE_RADIUS,
  SPEED_NORMAL,
  SPEED_EXHAUSTED,
  WATER_SPEED_FACTOR,
  STAMINA_DRAIN,
  STAMINA_WATER_DRAIN_MULT,
  STAMINA_REGEN_PARTIAL,
  STAMINA_REGEN_EMPTY,
  PLAYER_RADIUS,
  TREE_RADIUS,
  EXP_PER_LEVEL,
  LOOT_BAG_TTL,
  BAG_XP_RECOVERY,
  BAG_PICKUP_RADIUS,
  PROJECTILE_SPEED,
  PROJECTILE_MAX_DISTANCE,
  PROJECTILE_HEIGHT,
  PROJECTILE_HIT_RADIUS,
  HEAL_CIRCLE_RADIUS,
  HEAL_CIRCLE_TTL,
  HEAL_CIRCLE_RATE,
  HEAL_CIRCLE_OFFSET_MAX,
  JANNA_HEAL_COOLDOWN,
  TROLLER_SPEED,
  TROLLER_LEAVE_DISTANCE,
  TROLLER_COLLECT_TIME,
  BUG_SPEED,
  BUG_WANDER_RADIUS,
  BUG_RETARGET_MIN,
  BUG_RETARGET_MAX,
  BUG_BAG_BIAS,
  SAY_TTL,
  CYCLE_SECONDS,
  HOURS_PER_CYCLE,
  SECONDS_PER_HOUR,
  START_HOUR,
  NIGHT_START,
  NIGHT_END,
  NIGHT_BOOST,
} from './constants.ts';

// --- RNG ---
export { createRng, type Rng } from './rng.ts';

// --- Types ---
export type {
  World,
  Player,
  PlayerId,
  Entity,
  EntityKind,
  Projectile,
  HealingCircle,
  WorldLootBag,
  LootBagItem,
  IndicatorBug,
  ChatMessage,
  ChatChannel,
  SimEvent,
  FrameInputs,
  StatKey,
  Modifier,
  ActiveEffect,
  EffectStat,
  Sex,
  HairColor,
  ArmorColor,
  PlayerClass,
  QuestId,
  Quest,
  ActiveSpell,
  AbilityKind,
  Ability,
} from './types.ts';

// --- World factory + helpers ---
export { addPlayer, createWorld, defaultPlayer, genId, localPlayer } from './world.ts';

// --- Stats ---
export { getEffectiveStat, tickModifiers } from './stats.ts';

// --- Events ---
export { subscribe, emit, type GameEvent } from './events.ts';

// --- Input dispatch ---
export { dispatch } from './input.ts';

// --- Simulation entry point ---
export { tick } from './tick.ts';

// --- Spawn helpers ---
export { spawnEntity, spawnTroller, spawnByMonsterId, type SpiderKind } from './spawn.ts';

// --- Combat helpers ---
export {
  applyDamageToEntity,
  applyDamageToEntityRef,
  applyDamageToPlayer,
  dropPlayerDeathBag,
  grantExperience,
  slash,
} from './combat.ts';

// --- Util helpers ---
export {
  findEntity,
  removeEntity,
  isHostile,
  primeWaterCache,
  isInWaterAt,
  lerpAngle,
  refreshLootBagFlags,
} from './util.ts';

// --- Spells ---
export {
  MAX_SPELL_LEVEL,
  castSpell,
  getSpellLevel,
  getSpellManaCost,
  levelUpSpell,
  tickSpells,
} from './spells.ts';

// --- Spatial grid ---
export { SpatialGrid, grid, rebuildGrid } from './spatialGrid.ts';

// --- Systems (time helpers used by scene) ---
export { currentHour, isNightHour, isNight, nightStatMultiplier } from './systems/time.ts';

// --- Chat lifecycle helper (used by realm worker for join/leave lines) ---
export { pushSystem } from './systems/chat.ts';

// --- Effect-native services (PR-D1 onward) ---
export {
  Combat,
  CombatLayer,
  makeCombat,
  makeTime,
  makeWorldRef,
  SimLayer,
  Time,
  TimeLayer,
  WorldRef,
  worldToSnapshot,
  type CombatShape,
  type TimeShape,
  type WorldRefShape,
} from './services/index.ts';

