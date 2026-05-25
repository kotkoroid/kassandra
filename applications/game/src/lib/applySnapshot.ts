// applySnapshot — ingests a server-authoritative Snapshot into the
// local world mirror.
//
// Pre-PR-C2 this was inlined in realm.svelte.ts and took a hand-rolled
// `{ kind: 'snapshot', snapshot: {...} }` envelope. With the RPC
// migration the Snapshot type arrives typed (matches the protocol
// library's schema exactly), so the only casts that remain are the
// few places where the world's per-player narrow unions need to be
// re-asserted — the schema type and the world type are structurally
// identical but TypeScript doesn't always see through the equivalence.

import type { Snapshot } from '@kassandra/protocol-foundation-library';
import type {
  ActiveSpell,
  ArmorColor,
  EntityKind,
  GameEvent,
  HairColor,
  HealingCircle,
  Player,
  PlayerClass,
  Projectile,
  Sex,
  WorldLootBag,
} from '@kassandra/simulation-domain-library';

import { dispatchSimEvent } from '../damageNumbers.svelte';
import { world } from '../world.svelte';

// PR-H: lock the local player slot while CharacterCreation is mounted.
// `applySnapshot` runs every tick (20 Hz) and replaces `world.players`
// wholesale — without this guard, every keystroke / cosmetic change in
// the creation form is overwritten on the next snapshot. The lock is
// scoped to the local player only; other players, entities, chat, etc.
// keep streaming in normally so the rest of the world stays live behind
// the modal.
//
// App.svelte toggles via `setLocalPlayerLocked(true)` when entering the
// creation view and `setLocalPlayerLocked(false)` after submit (when
// view transitions to 'game'). The very next snapshot after unlock
// rehydrates the server's authoritative view of the player, which is
// the desired hand-off — the form's local edits travel server-side via
// the `create_character` SimEvent dispatched at submit.
let localPlayerLocked = false;
export function setLocalPlayerLocked(locked: boolean): void {
  localPlayerLocked = locked;
}

export function applySnapshot(s: Snapshot): void {
  world.tick = s.tick;
  world.time = s.time;
  world.ownerId = s.ownerId;

  const nextPlayers: Record<string, Player> = {};
  for (const p of s.players) {
    nextPlayers[p.id] = {
      name: p.name,
      sex: p.sex as Sex,
      hairColor: p.hairColor as HairColor,
      armor: p.armor as ArmorColor,
      playerClass: p.playerClass as PlayerClass,
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
      modifiers: [],
      effects: [],
      bag: [...p.bag],
      lars: p.lars,
      abilities: [],
      skillPoints: p.skillPoints,
      classSpellPoints: p.classSpellPoints,
      activeQuests: [],
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
      activeSpell: p.activeSpell as ActiveSpell | null,
      // PR-D3d.1 + PR-D3d.2: per-player death state. The snapshot
      // ships alive/deathX/deathZ, the death summary, and the indicator
      // bug per player. Pending flags are server-only (the client never
      // sends them via snapshot) so they default to false on the mirror.
      // attackers/fightStartedAt are sim-internal running totals — the
      // client only reads the frozen summary.
      alive: p.alive,
      deathX: p.deathX,
      deathZ: p.deathZ,
      pendingManualAttack: false,
      pendingRespawn: false,
      attackers: [],
      fightStartedAt: null,
      summary: p.summary
        ? {
            attackers: p.summary.attackers.map((a) => ({ ...a })),
            totalDamage: p.summary.totalDamage,
            fightSeconds: p.summary.fightSeconds,
          }
        : null,
      bug: p.bug ? { ...p.bug } : null,
    };
  }

  // PR-H: while CharacterCreation owns the local player record, preserve
  // whatever the form has mutated locally instead of clobbering it with
  // the server's (still-empty) snapshot. Other player records flow
  // through normally — only the localPlayerId slot is held back.
  if (localPlayerLocked && world.localPlayerId) {
    const existing = world.players[world.localPlayerId];
    if (existing !== undefined) {
      nextPlayers[world.localPlayerId] = existing;
    }
  }

  world.players = nextPlayers;

  // PR-G5 dev guard: surface (and self-heal) the case where a snapshot's
  // players don't include world.localPlayerId. The intended invariant
  // post-PR-G2 is:
  //   auth.accountId === cookie.sid → KV.accountId === ?playerId
  //                                === server world.players key
  //                                === client world.localPlayerId
  // If this fails, every `$derived(localPlayer(world))` in the tree
  // throws on the next reactivity tick. Re-anchoring to the first
  // available key (the server's authoritative view) keeps the UI alive
  // and the warning makes the mismatch visible in the in-game console
  // bridge instead of an opaque cascade of invariant errors.
  if (
    world.localPlayerId &&
    nextPlayers[world.localPlayerId] === undefined
  ) {
    const keys = Object.keys(nextPlayers);
    console.warn(
      '[applySnapshot] world.localPlayerId is not in snapshot.players —',
      'localPlayerId=', world.localPlayerId,
      'snapshot.players keys=', keys,
    );
    if (keys.length > 0) {
      world.localPlayerId = keys[0]!;
    }
  }

  world.entities = s.entities.map((e) => ({
    id: e.id,
    kind: e.kind as EntityKind,
    monsterId: e.monsterId,
    x: e.x,
    z: e.z,
    rotation: e.rotation,
    hp: e.hp,
    maxHp: e.maxHp,
    saying: e.saying,
  })) as typeof world.entities;
  world.projectiles = s.projectiles.map((p) => ({ ...p })) as Projectile[];
  world.healingCircles = s.healingCircles.map((h) => ({ ...h })) as HealingCircle[];
  world.lootBags = s.lootBags.map((b) => ({
    ...b,
    items: b.items.map((i) => ({ ...i })),
  })) as WorldLootBag[];
  world.chat.messages = s.chatMessages.map((m) => ({ ...m }));

  // PR-D3d.3: transient sim events fan out to UI consumers here.
  // The mirror itself doesn't keep them — once a tick's events
  // have been dispatched, they're gone (next snapshot brings a
  // fresh batch). We still write to `world.recentEvents` for any
  // future consumer that wants a snapshot-time read.
  const events = s.recentEvents.map((e) => ({ ...e })) as GameEvent[];
  world.recentEvents = events;
  for (const ev of events) {
    dispatchSimEvent(ev, s.time, world.localPlayerId);
  }
}
