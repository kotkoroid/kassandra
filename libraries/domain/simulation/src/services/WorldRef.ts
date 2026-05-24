// WorldRef — shared service tag for the authoritative World state.
//
// PR-D1 lifts this from services/realm/src/services/WorldRef.ts so the
// abstraction lives next to the World type itself. The realm provides
// its impl via `Layer.succeed(WorldRef)(...)` or by yielding `makeWorldRef`
// in its per-DO setup; future Effect-native client code (PR-D2+) will
// provide a SubscriptionRef-backed variant.
//
// The Service shape is the same Effect-style API the realm has been
// using since PR-B: `get`, `modify` for mutation, `snapshot` for the
// wire-form. Co-locating snapshot derivation here keeps PartyRoom free
// of conversion boilerplate.

import type { Snapshot } from '@kassandra/protocol-foundation-library';
import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Ref from 'effect/Ref';

import type { World } from '../types.ts';

export interface WorldRefShape {
  /** Read the current world. */
  readonly get: Effect.Effect<World>;
  /**
   * Apply an update. The function may mutate in place and return the
   * same reference (current sim code does this; PR-D2+ moves to pure
   * cores returning new world objects).
   */
  readonly modify: (f: (w: World) => World) => Effect.Effect<void>;
  /** Build the wire-shape snapshot from the current world. */
  readonly snapshot: Effect.Effect<Snapshot>;
}

export class WorldRef extends Context.Service<WorldRef, WorldRefShape>()(
  'kassandra/sim/WorldRef',
) {}

/**
 * Build a WorldRef from an initial world. The caller owns initial-state
 * construction (createWorld + any seeding like ownerId restore); sim
 * just provides the Effect machinery.
 */
export const makeWorldRef = (initial: World): Effect.Effect<WorldRefShape> =>
  Effect.gen(function* () {
    const ref = yield* Ref.make<World>(initial);
    return {
      get: Ref.get(ref),
      modify: (f) => Ref.update(ref, f),
      snapshot: Effect.map(Ref.get(ref), worldToSnapshot),
    };
  });

// ---------------------------------------------------------------------
// Snapshot derivation — World → wire-form Snapshot.
//
// Extracted from services/realm/src/services/WorldRef.ts. Lives in sim
// because it's purely a function of World; the protocol library owns
// the wire schema, but mapping World → Snapshot belongs next to the
// World type.
// ---------------------------------------------------------------------

export function worldToSnapshot(world: World): Snapshot {
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
    // Per-player death state (PR-D3d.1). Each player has their own
    // alive flag now — the "anchor-only" snapshot special-case is gone.
    alive: p.alive,
    deathX: p.deathX,
    deathZ: p.deathZ,
  }));

  return {
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
  };
}
