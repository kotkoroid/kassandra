import type { ClientMessageType, SimEvent } from '@kassandra/simulation-domain-library';
import { world } from './world.svelte';

export let connected = $state(false);
export let partyId = $state<string | null>(null);

let ws: WebSocket | null = null;

export function connect(id: string) {
  if (ws) {
    ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null;
    ws.close();
  }

  partyId = id;
  const realmUrl = import.meta.env.VITE_REALM_URL.replace(/\/$/, '');
  const wsUrl = realmUrl
    .replace(/^http:\/\//, 'ws://')
    .replace(/^https:\/\//, 'wss://');

  ws = new WebSocket(
    `${wsUrl}/parties/${id}/ws?playerId=${encodeURIComponent(world.localPlayerId)}`,
  );

  ws.onopen = () => {
    connected = true;
  };

  ws.onmessage = (e: MessageEvent<string>) => {
    let msg: { kind: string; snapshot?: unknown };
    try {
      msg = JSON.parse(e.data) as { kind: string; snapshot?: unknown };
    } catch {
      return;
    }
    if (msg.kind === 'snapshot') applySnapshot(msg as ReturnType<typeof buildSnapshotShape>);
  };

  ws.onclose = () => {
    connected = false;
  };

  ws.onerror = () => {
    connected = false;
  };
}

export function disconnect() {
  if (ws) {
    ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null;
    ws.close();
    ws = null;
  }
  connected = false;
  partyId = null;
}

export function sendFrame(moveX: number, moveZ: number, events: SimEvent[]) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  const msg: ClientMessageType = {
    kind: 'inputs',
    tick: world.tick,
    moveX,
    moveZ,
    events,
  };
  ws.send(JSON.stringify(msg));
}

// Minimal snapshot shape — mirrors worldToSnapshot() in PartyRoom.ts.
type SnapshotMsg = ReturnType<typeof buildSnapshotShape>;
function buildSnapshotShape() {
  // This function is never called; it only exists to give applySnapshot
  // a concrete type to work against without importing the protocol package.
  return {} as {
    kind: 'snapshot';
    snapshot: {
      tick: number;
      time: number;
      players: Array<{
        id: string;
        name: string;
        sex: 'male' | 'female';
        hairColor: string;
        armor: string;
        playerClass: string;
        level: number;
        experience: number;
        health: number;
        mana: number;
        stamina: number;
        x: number;
        z: number;
        rotation: number;
        attackSpeed: number;
        healthRegen: number;
        damage: number;
        equippedWeaponId: string;
        bag: string[];
        lars: number;
        skillPoints: number;
        classSpellPoints: number;
        autoAttack: boolean;
        engageTargetId: string | null;
        engageActive: boolean;
        navTargetX: number | null;
        navTargetZ: number | null;
        lastSlashTime: number;
        slashTrigger: number;
        exhausted: boolean;
        saying: string;
        sayExpiresAt: number;
        levelUpTrigger: number;
        spellAnimTrigger: number;
        spellCooldowns: Record<string, number>;
        activeSpell: unknown;
        alive: boolean;
        deathX: number;
        deathZ: number;
      }>;
      entities: Array<{
        id: string;
        kind: string;
        monsterId: string;
        x: number;
        z: number;
        rotation: number;
        hp: number;
        maxHp: number;
        saying?: string;
      }>;
      projectiles: Array<{ id: string; x: number; z: number; vx: number; vz: number }>;
      healingCircles: Array<{ id: string; ownerId: string; x: number; z: number; ttl: number }>;
      lootBags: Array<{
        id: string;
        x: number;
        z: number;
        items: Array<{ owner: string; itemId: string }>;
        ttl: number;
        isDeathBag: boolean;
        bagXp: number;
      }>;
      chatMessages: Array<{ id: string; author: string; text: string; channel: string }>;
    };
  };
}

function applySnapshot(msg: SnapshotMsg) {
  const s = msg.snapshot;

  world.tick = s.tick;
  world.time = s.time;

  // Full-replace players. Fields not in the snapshot (modifiers, effects,
  // abilities, activeQuests) default to empty — they are server-only.
  const nextPlayers: typeof world.players = {};
  for (const p of s.players) {
    nextPlayers[p.id] = {
      name: p.name,
      sex: p.sex as 'male' | 'female',
      hairColor: p.hairColor as never,
      armor: p.armor as never,
      playerClass: p.playerClass as never,
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
      bag: p.bag,
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
      spellCooldowns: p.spellCooldowns,
      activeSpell: p.activeSpell as never,
    };
  }
  world.players = nextPlayers;

  // Extract local player's death state from the snapshot.
  const localSnap = s.players.find((p) => p.id === world.localPlayerId);
  if (localSnap) {
    world.death.alive = localSnap.alive;
    world.death.deathX = localSnap.deathX;
    world.death.deathZ = localSnap.deathZ;
  }

  world.entities = s.entities as typeof world.entities;
  world.projectiles = s.projectiles as typeof world.projectiles;
  world.healingCircles = s.healingCircles as typeof world.healingCircles;
  world.lootBags = s.lootBags as typeof world.lootBags;
  world.chat.messages = s.chatMessages as typeof world.chat.messages;
}
