// Tunable numbers consumed by sim systems. Kept in one file so the
// game-feel knobs are findable from a single place.

// --- Player base stats ---

export const BASE_ATTACK_SPEED = 1; // hits per second
export const BASE_HEALTH_REGEN = 1; // hp per second
export const BASE_DAMAGE = 0; // flat damage before weapon

// Pool maxima.
export const PLAYER_MAX_HP = 100;
export const PLAYER_MAX_MANA = 100;
export const STAMINA_MAX = 300;

// --- Combat / movement ---

export const SWORD_REACH = 1.6;
export const SWORD_DOT_THRESHOLD = 0.5; // ~120° forward cone
// Slight margin inside SWORD_REACH so the player doesn't bob in
// and out of range while in auto-engage.
export const ENGAGE_RANGE = 1.45;
// Distance below which click-to-move considers itself "arrived".
export const ARRIVE_RADIUS = 0.15;

export const SPEED_NORMAL = 5;
export const SPEED_EXHAUSTED = 2;
export const WATER_SPEED_FACTOR = 0.5;
export const STAMINA_DRAIN = 12.5;
export const STAMINA_WATER_DRAIN_MULT = 2;
export const STAMINA_REGEN_PARTIAL = 20;
export const STAMINA_REGEN_EMPTY = 10;

export const PLAYER_RADIUS = 0.25;
export const TREE_RADIUS = 0.3;

// --- Progression ---

export const EXP_PER_LEVEL = 50;

// --- Loot bag ---

// Bags dropped on mob kills despawn after this long. Player-death
// bags share the same lifetime — the timer is uniform across kinds.
export const LOOT_BAG_TTL = 3 * 60;
// Fraction of pre-death lifetime XP returned when the player
// reclaims their bag. The remaining 30% is the death penalty.
export const BAG_XP_RECOVERY = 0.7;
export const BAG_PICKUP_RADIUS = 1.2;

// --- Swain projectile ---

export const PROJECTILE_SPEED = 8;
export const PROJECTILE_MAX_DISTANCE = 10;
export const PROJECTILE_HEIGHT = 1.2;
export const PROJECTILE_HIT_RADIUS = 0.5;

// --- Healing circle (Janna) ---

export const HEAL_CIRCLE_RADIUS = 1.5;
export const HEAL_CIRCLE_TTL = 5;
export const HEAL_CIRCLE_RATE = 10;
export const HEAL_CIRCLE_OFFSET_MAX = 4;
// Seconds between consecutive heal-circle drops.
export const JANNA_HEAL_COOLDOWN = 7;

// --- Troller ---

export const TROLLER_SPEED = 2.2;
export const TROLLER_LEAVE_DISTANCE = 4;
export const TROLLER_COLLECT_TIME = 1.2;

// --- Indicator bug (loot-bag wayfinder) ---

export const BUG_SPEED = 1.6;
export const BUG_WANDER_RADIUS = 4;
export const BUG_RETARGET_MIN = 1.5;
export const BUG_RETARGET_MAX = 3;
export const BUG_BAG_BIAS = 0.55;

// --- Chat ---

export const SAY_TTL = 5; // seconds the bubble stays above the head

// --- Day / night clock ---

// The full 24-hour day completes in 300 real seconds at a uniform
// rate (1.25s per game-hour). Day fills 200s (hours 6→22), night
// fills 100s (hours 22→6).
export const CYCLE_SECONDS = 300;
export const HOURS_PER_CYCLE = 24;
export const SECONDS_PER_HOUR = CYCLE_SECONDS / HOURS_PER_CYCLE;
// Fresh runs drop into morning.
export const START_HOUR = 6;
// Night straddles midnight; inclusive of NIGHT_START, exclusive of
// NIGHT_END.
export const NIGHT_START = 22;
export const NIGHT_END = 6;
// Monster stat multiplier applied at spawn during the night phase.
export const NIGHT_BOOST = 5;
