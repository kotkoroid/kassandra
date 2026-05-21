import * as Cloudflare from 'alchemy/Cloudflare';
import * as Effect from 'effect/Effect';
import { HttpServerRequest } from 'effect/unstable/http/HttpServerRequest';
import {
  addPlayer,
  createWorld,
  tick,
  type ClientMessageType,
  type FrameInputs,
  type PlayerId,
  type SimEvent,
  type World,
} from '@kassandra/simulation-domain-library';

// --- Snapshot builder -------------------------------------------

function worldToSnapshot(world: World) {
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
    activeSpell: p.activeSpell,
    // Death state is keyed to world.localPlayerId on the server.
    // Only that player gets live death tracking; others show as alive.
    alive: id === world.localPlayerId ? world.death.alive : true,
    deathX: id === world.localPlayerId ? world.death.deathX : 0,
    deathZ: id === world.localPlayerId ? world.death.deathZ : 0,
  }));

  return {
    kind: 'snapshot',
    snapshot: {
      tick: world.tick,
      time: world.time,
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

// --- Durable Object ---------------------------------------------

interface SessionData {
  sessionId: string;
  playerId: PlayerId;
}

export default class PartyRoom extends Cloudflare.DurableObjectNamespace<PartyRoom>()(
  'PartyRoom',
  Effect.gen(function* () {
    return Effect.gen(function* () {
      const state = yield* Cloudflare.DurableObjectState;

      const world = createWorld();
      const sessions = new Map<string, { socket: Cloudflare.DurableWebSocket; playerId: PlayerId }>();
      const pendingInputs = new Map<string, FrameInputs>();
      const pendingEvents = new Map<string, SimEvent[]>();

      // Rehydrate session map after hibernation.
      for (const socket of yield* state.getWebSockets()) {
        const data = socket.deserializeAttachment<SessionData>();
        if (data) {
          sessions.set(data.sessionId, { socket, playerId: data.playerId });
          pendingInputs.set(data.sessionId, { moveX: 0, moveZ: 0 });
          pendingEvents.set(data.sessionId, []);
        }
      }

      function broadcast(text: string) {
        for (const { socket } of sessions.values()) {
          socket.ws.send(text);
        }
      }

      let lastTickAt = Date.now();
      let tickInterval: ReturnType<typeof setInterval> | null = null;

      function startTickLoop() {
        if (tickInterval !== null) return;
        lastTickAt = Date.now();
        tickInterval = setInterval(() => {
          const now = Date.now();
          const dt = Math.min((now - lastTickAt) / 1000, 1 / 5);
          lastTickAt = now;

          // Build per-player inputs and events from pending maps.
          const allInputs: Record<PlayerId, FrameInputs> = {};
          const allEvents: Record<PlayerId, SimEvent[]> = {};
          for (const [sid, { playerId }] of sessions) {
            allInputs[playerId] = pendingInputs.get(sid) ?? { moveX: 0, moveZ: 0 };
            allEvents[playerId] = pendingEvents.get(sid) ?? [];
            pendingInputs.set(sid, { moveX: 0, moveZ: 0 });
            pendingEvents.set(sid, []);
          }

          tick(world, dt, allInputs, allEvents);
          broadcast(JSON.stringify(worldToSnapshot(world)));
        }, 50); // 20 Hz
      }

      function stopTickLoop() {
        if (tickInterval === null) return;
        clearInterval(tickInterval);
        tickInterval = null;
      }

      if (sessions.size > 0) startTickLoop();

      return {
        fetch: Effect.gen(function* () {
          const request = yield* HttpServerRequest;
          const url = new URL(request.url, 'http://localhost');
          // Client passes its locally-generated UUID so both sides
          // agree on the player identity without an extra roundtrip.
          const playerId: PlayerId = url.searchParams.get('playerId') ?? crypto.randomUUID();

          const [response, socket] = yield* Cloudflare.upgrade();

          const sessionId = crypto.randomUUID();
          const data: SessionData = { sessionId, playerId };
          socket.serializeAttachment(data);
          sessions.set(sessionId, { socket, playerId });
          pendingInputs.set(sessionId, { moveX: 0, moveZ: 0 });
          pendingEvents.set(sessionId, []);

          // Add the player slot; create_character will fill in identity.
          addPlayer(world, playerId);
          // First player to connect anchors localPlayerId for world systems
          // (death tracking, monster proximity, NPC chat).
          if (Object.keys(world.players).length === 1) {
            world.localPlayerId = playerId;
          }

          startTickLoop();
          return response;
        }),

        webSocketMessage: Effect.fnUntraced(function* (
          socket: Cloudflare.DurableWebSocket,
          message: string | ArrayBuffer,
        ) {
          const data = socket.deserializeAttachment<SessionData>();
          if (!data) return;
          const text = typeof message === 'string' ? message : new TextDecoder().decode(message);
          let parsed: ClientMessageType;
          try {
            parsed = JSON.parse(text) as ClientMessageType;
          } catch {
            return;
          }
          if (parsed.kind !== 'inputs') return;

          pendingInputs.set(data.sessionId, { moveX: parsed.moveX, moveZ: parsed.moveZ });

          // Handle create_character directly — it mutates player identity
          // and must not be deferred into perPlayerEvents.
          const regularEvents: SimEvent[] = [];
          for (const ev of parsed.events) {
            if (ev.kind === 'create_character') {
              const p = world.players[data.playerId];
              if (p) {
                p.name = ev.name;
                p.sex = ev.sex;
                p.hairColor = ev.hairColor;
                p.armor = ev.armor;
                p.playerClass = ev.playerClass;
              }
            } else {
              regularEvents.push(ev);
            }
          }

          const existing = pendingEvents.get(data.sessionId) ?? [];
          pendingEvents.set(data.sessionId, [...existing, ...regularEvents]);
        }),

        webSocketClose: Effect.fnUntraced(function* (
          ws: Cloudflare.DurableWebSocket,
          code: number,
          reason: string,
        ) {
          const data = ws.deserializeAttachment<SessionData>();
          if (data) {
            sessions.delete(data.sessionId);
            pendingInputs.delete(data.sessionId);
            pendingEvents.delete(data.sessionId);
            delete world.players[data.playerId];
            // Re-anchor localPlayerId to any remaining player.
            const remaining = Object.keys(world.players)[0];
            if (remaining) world.localPlayerId = remaining;
          }
          if (sessions.size === 0) stopTickLoop();
          yield* ws.close(code, reason);
        }),
      };
    });
  }),
) {}
