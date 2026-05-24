import { ServerMessage } from '@kassandra/protocol-foundation-library';
import type {
  ActiveSpell,
  ArmorColor,
  ClientMessageType,
  EntityKind,
  HairColor,
  HealingCircle,
  Player,
  PlayerClass,
  Projectile,
  Sex,
  SimEvent,
  WorldLootBag,
} from '@kassandra/simulation-domain-library';
import * as Cause from 'effect/Cause';
import * as Exit from 'effect/Exit';
import * as Schema from 'effect/Schema';

import { world } from './world.svelte';

export const realm = $state({
  connected: false,
  partyId: null as string | null,
  // Monotonic counter bumped each time we receive a 'disbanded' message
  // from the realm. App.svelte watches this to redirect back to
  // PartySetup. A counter (not a boolean) avoids the "edge missed
  // because the flag was already true" footgun if disbands ever
  // happen in close succession.
  disbandCount: 0,
});

let ws: WebSocket | null = null;
// Events queued before the socket opens (e.g. create_character sent right after connect()).
let pendingEvents: SimEvent[] = [];

// PR-C: Schema decoder built once at module load. `fromJsonString`
// composes a wire-form decoder out of the runtime ServerMessage schema
// (which lives in libraries/foundation/protocol — single source of
// truth shared with services/realm). `decodeUnknownExit` runs sync and
// returns an Exit, dodging both try/catch (for parse failures) and
// Effect runtime ceremony (for what is a pure pull-decode).
const decodeServerMessage = Schema.decodeUnknownExit(Schema.fromJsonString(ServerMessage));

type DecodedServerMessage = Schema.Schema.Type<typeof ServerMessage>;
type DecodedSnapshot = Extract<DecodedServerMessage, { kind: 'snapshot' }>['snapshot'];

export function connect(id: string) {
  if (ws) {
    ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null;
    ws.close();
  }

  realm.partyId = id;

  // In dev, proxy through the game origin to avoid ad blocker blocks on
  // realm.localhost. In production, connect directly to the realm URL.
  const wsUrl = import.meta.env.DEV
    ? `ws://${window.location.host}/realm`
    : import.meta.env.VITE_REALM_URL.replace(/\/$/, '')
        .replace(/^http:\/\//, 'ws://')
        .replace(/^https:\/\//, 'wss://');

  ws = new WebSocket(
    `${wsUrl}/parties/${id}/ws?playerId=${encodeURIComponent(world.localPlayerId)}`,
  );

  ws.onopen = () => {
    realm.connected = true;
    // Flush any events that were queued before the socket opened.
    if (pendingEvents.length > 0) {
      sendFrame(0, 0, pendingEvents.splice(0));
    }
  };

  ws.onmessage = (e: MessageEvent<string>) => {
    const exit = decodeServerMessage(e.data);
    if (Exit.isFailure(exit)) {
      // Adversarial / corrupted frame. Drop and continue — the next
      // tick's snapshot will overwrite any stale local state anyway.
      // No reflect-back to the server today.
      console.warn('[realm] decode failed:', Cause.pretty(exit.cause));
      return;
    }
    const msg = exit.value;
    switch (msg.kind) {
      case 'snapshot':
        applySnapshot(msg.snapshot);
        break;
      case 'ack':
        // Server processed inputs for `msg.tick` — no client-side state
        // update needed today; informational. Could drive a latency
        // graph or smoothed tick estimate in the future.
        break;
      case 'disbanded':
        // Owner has disbanded the party. Server is about to close every
        // socket — preempt by disconnecting locally, clear ?party= from
        // the URL, and bump the disband counter so App.svelte can route
        // back to PartySetup. Order: bump first, then disconnect, so the
        // App's $effect sees the counter change in the same micro-task
        // batch as partyId becoming null.
        realm.disbandCount += 1;
        disconnect();
        {
          const url = new URL(window.location.href);
          url.searchParams.delete('party');
          window.history.replaceState(null, '', url.toString());
        }
        break;
    }
  };

  ws.onclose = () => {
    realm.connected = false;
  };

  ws.onerror = () => {
    realm.connected = false;
  };
}

export function disconnect() {
  if (ws) {
    ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null;
    ws.close();
    ws = null;
  }
  pendingEvents = [];
  realm.connected = false;
  realm.partyId = null;
}

export function sendFrame(moveX: number, moveZ: number, events: SimEvent[]) {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    // Socket not open yet — queue events so they are sent once it opens.
    if (events.length > 0) pendingEvents.push(...events);
    return;
  }
  const msg: ClientMessageType = {
    kind: 'inputs',
    tick: world.tick,
    moveX,
    moveZ,
    events,
  };
  ws.send(JSON.stringify(msg));
}

// PR-C: Snapshot ingest is now Schema-typed end-to-end. The decoded
// `s` matches the wire schema exactly, so the per-field assignments
// are type-safe with no `as never` escape hatches. The fields the
// snapshot doesn't carry (modifiers, effects, abilities, activeQuests)
// stay server-only and default to empty on the client mirror.
function applySnapshot(s: DecodedSnapshot) {
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
