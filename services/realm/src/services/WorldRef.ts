// WorldRef — wraps Ref<World> with the operations PartyRoom needs.
//
// Replaces the `let world = createWorld()` module-level state at the
// old PartyRoom.ts:125. The Ref serializes concurrent updates from the
// tick fiber, message handlers, and the close handler.
//
// In PR-D the SubscriptionRef variant will replace Ref so the client's
// SimLayer can subscribe to changes; for now PR-B keeps it simple — the
// server only has one consumer (the tick fiber) so plain Ref suffices.

import {
  createWorld,
  type PlayerId,
  type World,
} from '@kassandra/simulation-domain-library';
import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Ref from 'effect/Ref';

export interface WorldRefShape {
  /** Read the current world. */
  readonly get: Effect.Effect<World>;
  /**
   * Apply an update to the world. The function may mutate in place and
   * return the same reference (current sim code does this) OR return a
   * new World; Ref.update doesn't distinguish.
   */
  readonly modify: (f: (w: World) => World) => Effect.Effect<void>;
  /** Build the wire-shape snapshot from the current world. */
  readonly snapshot: Effect.Effect<SnapshotEnvelope>;
}

/**
 * Context tag for the per-DO WorldRef instance. Built once per DO
 * lifetime by `makeWorldRef` in PartyRoom's constructor; provided to
 * every handler via `Effect.provideService(WorldRef, impl)`.
 */
export class WorldRef extends Context.Service<WorldRef, WorldRefShape>()(
  'kassandra/realm/WorldRef',
) {}

/**
 * Build a WorldRef seeded with the given owner (restored from DO
 * storage; `null` on a brand-new room). Pure Effect — no DO state
 * dependencies — so it composes anywhere.
 */
export const makeWorldRef = (storedOwner: PlayerId | null): Effect.Effect<WorldRefShape> =>
  Effect.gen(function* () {
    const world = createWorld();
    if (storedOwner) world.ownerId = storedOwner;
    const ref = yield* Ref.make<World>(world);
    return {
      get: Ref.get(ref),
      modify: (f) => Ref.update(ref, f),
      snapshot: Effect.map(Ref.get(ref), worldToSnapshot),
    };
  });

// ---------------------------------------------------------------------
// Snapshot envelope (extracted verbatim from old PartyRoom.ts:16-112).
//
// Kept co-located with WorldRef because the envelope IS derived state
// of the world — putting it here keeps PartyRoom free of derivation
// boilerplate and gives the snapshot one clear owner.
// ---------------------------------------------------------------------

export type SnapshotEnvelope = ReturnType<typeof worldToSnapshot>;

export function worldToSnapshot(world: World) {
  const players = Object.entries(world.players).map(([id, p]) => ({
    id,
    name: p.name,
    sex: p.sex,
    hairColor: p.hairColor,
    armor: p.armor,
    playerClass: p.playerClass,
    level: p.level,
    experience: p.experience,
    health: p.health,
    mana: p.mana,
    stamina: p.stamina,
    x: p.x,
    z: p.z,
    rotation: p.rotation,
    attackSpeed: p.attackSpeed,
    healthRegen: p.healthRegen,
    damage: p.damage,
    equippedWeaponId: p.equippedWeaponId,
    bag: [...p.bag],
    lars: p.lars,
    skillPoints: p.skillPoints,
    classSpellPoints: p.classSpellPoints,
    autoAttack: p.autoAttack,
    engageTargetId: p.engageTargetId,
    engageActive: p.engageActive,
    navTargetX: p.navTargetX,
    navTargetZ: p.navTargetZ,
    lastSlashTime: p.lastSlashTime,
    slashTrigger: p.slashTrigger,
    exhausted: p.exhausted,
    saying: p.saying,
    sayExpiresAt: p.sayExpiresAt,
    levelUpTrigger: p.levelUpTrigger,
    spellAnimTrigger: p.spellAnimTrigger,
    spellCooldowns: { ...p.spellCooldowns },
    spellLevels: { ...p.spellLevels },
    activeSpell: p.activeSpell,
    // Death state is keyed to world.localPlayerId on the server.
    // Only that player gets live death tracking; others show as alive.
    alive: id === world.localPlayerId ? world.death.alive : true,
    deathX: id === world.localPlayerId ? world.death.deathX : 0,
    deathZ: id === world.localPlayerId ? world.death.deathZ : 0,
  }));

  return {
    kind: 'snapshot' as const,
    snapshot: {
      tick: world.tick,
      time: world.time,
      ownerId: world.ownerId,
      players,
      entities: world.entities.map((e) => ({
        id: e.id,
        kind: e.kind,
        monsterId: e.monsterId,
        x: e.x,
        z: e.z,
        rotation: e.rotation,
        hp: e.hp,
        maxHp: e.maxHp,
        ...(e.saying !== undefined ? { saying: e.saying } : {}),
      })),
      projectiles: world.projectiles.map((p) => ({
        id: p.id,
        x: p.x,
        z: p.z,
        vx: p.vx,
        vz: p.vz,
      })),
      healingCircles: world.healingCircles.map((h) => ({
        id: h.id,
        ownerId: h.ownerId,
        x: h.x,
        z: h.z,
        ttl: h.ttl,
      })),
      lootBags: world.lootBags.map((b) => ({
        id: b.id,
        x: b.x,
        z: b.z,
        items: b.items.map((i) => ({ owner: i.owner, itemId: i.itemId })),
        ttl: b.ttl,
        isDeathBag: b.isDeathBag,
        bagXp: b.bagXp,
      })),
      chatMessages: world.chat.messages.map((m) => ({
        id: m.id,
        author: m.author,
        text: m.text,
        channel: m.channel,
      })),
    },
  };
}
