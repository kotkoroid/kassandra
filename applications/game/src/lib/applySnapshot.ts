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
  HairColor,
  HealingCircle,
  Player,
  PlayerClass,
  Projectile,
  Sex,
  WorldLootBag,
} from '@kassandra/simulation-domain-library';

import { world } from '../world.svelte';

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
  world.players = nextPlayers;

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
}
