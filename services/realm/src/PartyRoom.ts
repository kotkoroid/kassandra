import * as Cloudflare from 'alchemy/Cloudflare';
import * as Effect from 'effect/Effect';
import { HttpServerRequest } from 'effect/unstable/http/HttpServerRequest';
import {
  addPlayer,
  createWorld,
  pushSystem,
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
    spellLevels: { ...p.spellLevels },
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

      // Restore the party owner from storage. Persisted on first connect
      // (see fetch handler below) so the owner survives DO hibernation and
      // re-connects. Null on a brand-new room.
      const storedOwner = yield* state.storage.get<PlayerId>('ownerId');
      if (storedOwner) world.ownerId = storedOwner;

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
          // First REAL player to connect anchors localPlayerId for world
          // systems (death tracking, monster proximity, NPC chat,
          // channelled-spell advancement via tickSpells). createWorld()
          // pre-populates a placeholder player as a single-player legacy
          // — drop it on the first real connect so the count and
          // localPlayerId reflect actual sessions, not the placeholder.
          if (sessions.size === 1) {
            for (const pid of Object.keys(world.players)) {
              if (pid !== playerId) delete world.players[pid];
            }
            world.localPlayerId = playerId;
          }

          // Anchor the party owner. The first player ever to connect
          // becomes the owner for the lifetime of the room — persisted
          // in DO storage so it survives hibernation and is not lost on
          // re-connect. Only the owner is allowed to disband (see
          // webSocketMessage handler for 'disband_party').
          if (!world.ownerId) {
            world.ownerId = playerId;
            yield* state.storage.put('ownerId', playerId);
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

          // Handle create_character and disband_party directly — they
          // mutate identity / lifecycle state and must not be deferred
          // into perPlayerEvents (which is drained by the tick).
          const regularEvents: SimEvent[] = [];
          let disbandRequested = false;
          for (const ev of parsed.events) {
            if (ev.kind === 'create_character') {
              const p = world.players[data.playerId];
              if (p) {
                // "Joined" announce fires on the *first* create_character
                // for this connection (when the name transitions from
                // the default-empty value to a real one). Subsequent
                // create_character events from a reconnect / re-roll
                // skip this so we don't spam the chat with re-joins.
                const wasUnnamed = !p.name;
                p.name = ev.name;
                p.sex = ev.sex;
                p.hairColor = ev.hairColor;
                p.armor = ev.armor;
                p.playerClass = ev.playerClass;
                if (wasUnnamed && p.name) {
                  pushSystem(world, `${p.name} joined the realm.`);
                }
              }
            } else if (ev.kind === 'disband_party') {
              // Owner-only. Silently ignore from any other sender —
              // we don't surface unauthorized attempts to the chat so
              // a forged event from a non-owner just goes nowhere.
              if (data.playerId === world.ownerId) {
                disbandRequested = true;
              }
            } else {
              regularEvents.push(ev);
            }
          }

          const existing = pendingEvents.get(data.sessionId) ?? [];
          pendingEvents.set(data.sessionId, [...existing, ...regularEvents]);

          // Disband flow: broadcast the terminal 'disbanded' message,
          // stop the tick loop, close every socket, and wipe DO storage
          // so the next connect to the same party ID starts fresh.
          // Done after queueing regular events so the owner's final
          // frame still gets processed.
          if (disbandRequested) {
            broadcast(JSON.stringify({ kind: 'disbanded' }));
            stopTickLoop();
            for (const { socket: s } of [...sessions.values()]) {
              yield* s.close(1000, 'party disbanded');
            }
            sessions.clear();
            pendingInputs.clear();
            pendingEvents.clear();
            yield* state.storage.deleteAll();
          }
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
            // Lifecycle announce — capture the name *before* the
            // player record is dropped. If the player disconnected
            // before naming themselves (rare: closed the tab during
            // character creation), skip the message.
            const leaving = world.players[data.playerId];
            if (leaving?.name) {
              pushSystem(world, `${leaving.name} left the realm.`);
            }
            delete world.players[data.playerId];
            // Re-anchor localPlayerId to any remaining player.
            const remaining = Object.keys(world.players)[0];
            if (remaining) world.localPlayerId = remaining;
          }
          if (sessions.size === 0) stopTickLoop();
          // RFC 6455 reserves 1005/1006/1015 as receive-only — they
          // describe an absence of a Close frame and MUST NOT be sent.
          // The Workers runtime enforces this and throws
          // InvalidAccessError, which crashes the DO. Browsers routinely
          // surface 1006 to webSocketClose on abnormal disconnect, so
          // fall back to a Normal Closure (1000) in that case. The
          // code we emit here goes to our own socket-half teardown,
          // not back to the already-gone browser.
          const RESERVED = code === 1005 || code === 1006 || code === 1015;
          yield* ws.close(RESERVED ? 1000 : code, reason);
        }),
      };
    });
  }),
) {}
