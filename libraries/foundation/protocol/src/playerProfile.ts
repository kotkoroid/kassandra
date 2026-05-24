// Typed RPC contract for the PlayerProfile DO.
//
// One DO instance per account; the DO name IS the accountId. A
// character record persists on this instance and travels with the
// account across parties — pre-PR-G the character only lived inside
// the PartyRoom's world snapshot and was lost the moment a player
// joined a different party (or the same party after disband).
//
// Auth: PR-G1 ships without JWT — the URL path component carries
// the accountId (same trust model as parties). PR-G2 layers
// `Authorization: Bearer <jwt>` on top so the realm can verify the
// caller actually owns the account before serving a load/save.
//
// Wire shape is intentionally smaller than the runtime Player:
//   - Pose (x/z/rotation), pools (hp/mana/stamina), engage/nav,
//     pending flags, attackers/summary/bug — all *world-instance*
//     state. They reset on each party connect from PlayerProfile's
//     base + the party's tick stream.
//   - What persists here = identity (name + appearance + class) +
//     progression (level, xp, abilities, spells, inventory, lars).
//     This is the "save game" surface; anything mid-fight is gone
//     when the player disconnects.

import * as Context from 'effect/Context';
import * as Schema from 'effect/Schema';
import { Rpc, RpcGroup } from 'effect/unstable/rpc';
import * as RpcMiddleware from 'effect/unstable/rpc/RpcMiddleware';

// ---------------------------------------------------------------------
// CharacterRecord — the persisted account-scoped save data
// ---------------------------------------------------------------------

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
const AbilityKind = Schema.Literals(['active', 'passive']);

const Ability = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  description: Schema.String,
  kind: AbilityKind,
  level: Schema.Number,
  maxLevel: Schema.Number,
});

export const CharacterRecord = Schema.Struct({
  // Identity / appearance — set during creation, immutable afterward
  // (a future "barber shop" feature could mutate appearance; the
  // schema is already shaped for that).
  name: Schema.String,
  sex: Sex,
  hairColor: HairColor,
  armor: ArmorColor,
  playerClass: PlayerClass,

  // Progression — these tick up over a play session and persist.
  level: Schema.Number,
  experience: Schema.Number,

  // Inventory — item ids the player has accumulated; lars is the
  // currency counter (item-bag stays slot-free for coin pickups).
  bag: Schema.Array(Schema.String),
  lars: Schema.Number,
  equippedWeaponId: Schema.String,

  // Abilities + spend pools.
  abilities: Schema.Array(Ability),
  skillPoints: Schema.Number,
  classSpellPoints: Schema.Number,

  // Spell levels keyed by spell id (0 / absent = locked, 1..N = trained).
  spellLevels: Schema.Record(Schema.String, Schema.Number),
});
export type CharacterRecord = typeof CharacterRecord.Type;

// ---------------------------------------------------------------------
// Tagged errors
// ---------------------------------------------------------------------

/**
 * Raised by `LoadCharacter` / `SaveCharacter` when the calling
 * accountId doesn't match the DO instance. PR-G1 always succeeds
 * the match (the DO routes by name); PR-G2 (JWT) introduces a
 * mismatch path when a token's `sub` claim differs from the path
 * accountId.
 */
export class WrongAccountError extends Schema.TaggedErrorClass<WrongAccountError>()(
  'kassandra/profile/WrongAccountError',
  { expected: Schema.String, received: Schema.String },
) {}

// ---------------------------------------------------------------------
// Per-connection context
// ---------------------------------------------------------------------

/**
 * Per-RPC-request identity for PlayerProfile handlers. The DO's
 * connection bridge populates this from the upgrade URL's accountId
 * path component; every handler can `yield* AccountSession` to know
 * who is calling.
 */
export class AccountSession extends Context.Service<
  AccountSession,
  { readonly accountId: string }
>()('kassandra/profile/AccountSession') {}

/**
 * Middleware that resolves AccountSession per request. Same shape as
 * PartySession on the realm side — reads the `accountid` header the
 * bridge synthesizes from the upgrade URL.
 */
export class ProfileSession extends RpcMiddleware.Service<
  ProfileSession,
  { provides: AccountSession }
>()('kassandra/profile/ProfileSession') {}

// ---------------------------------------------------------------------
// RPC group
// ---------------------------------------------------------------------

export class PlayerProfileRpc extends RpcGroup.make(
  /**
   * Load the stored character for this account. Returns `null` for a
   * fresh account (no character yet — client should show the creation
   * panel). The DO key is the accountId, so multi-character per
   * account would need a `characterId` argument and a different DO
   * shape; today one account = one character. Null vs `Option` is
   * deliberate — the wire shape stays a plain JSON nullable.
   */
  Rpc.make('LoadCharacter', {
    payload: Schema.Void,
    success: Schema.NullOr(CharacterRecord),
    error: WrongAccountError,
  }),

  /**
   * Save (create or replace) the character for this account. The
   * server is the source of truth; callers should fetch via
   * `LoadCharacter` first to avoid clobbering a server-side mutation
   * that happened in another tab/party.
   */
  Rpc.make('SaveCharacter', {
    payload: { character: CharacterRecord },
    success: Schema.Void,
    error: WrongAccountError,
  }),
).middleware(ProfileSession) {}
