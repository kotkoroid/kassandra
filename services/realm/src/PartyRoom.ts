import * as Cloudflare from 'alchemy/Cloudflare';
import * as Effect from 'effect/Effect';
import {
  createWorld,
  tick,
  type ClientMessageType,
  type FrameInputs,
  type PlayerId,
  type ServerMessageType,
  type World,
} from '@kassandra/simulation-domain-library';

// --- Snapshot builder -------------------------------------------
// Maps the simulation World to the protocol Snapshot shape.
// Done as plain JSON-compatible objects so JSON.stringify works
// without going through the Effect Schema encoder.

function worldToSnapshot(world: World) {
  const players = Object.entries(world.players).map(([id, p]) => {
    const isLocal = id === world.localPlayerId;
    return {
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
      alive: isLocal ? world.death.alive : true,
      deathX: isLocal ? world.death.deathX : 0,
      deathZ: isLocal ? world.death.deathZ : 0,
    };
  });

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
      // Latest frame inputs per session, consumed at the top of each tick.
      const pendingInputs = new Map<string, FrameInputs>();

      // Rehydrate in-memory session map after hibernation.
      for (const socket of yield* state.getWebSockets()) {
        const data = socket.deserializeAttachment<SessionData>();
        if (data) {
          sessions.set(data.sessionId, { socket, playerId: data.playerId });
          pendingInputs.set(data.sessionId, { moveX: 0, moveZ: 0 });
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
          // Cap dt so a long pause doesn't cause a physics explosion.
          const dt = Math.min((now - lastTickAt) / 1000, 1 / 5);
          lastTickAt = now;

          // Phase 3: route the first connected player's inputs to the sim.
          // Full per-player input dispatch comes in a later phase.
          let inputs: FrameInputs = { moveX: 0, moveZ: 0 };
          for (const v of pendingInputs.values()) {
            inputs = v;
            break;
          }
          pendingInputs.forEach((_, k) => pendingInputs.set(k, { moveX: 0, moveZ: 0 }));

          tick(world, dt, inputs);
          broadcast(JSON.stringify(worldToSnapshot(world)));
        }, 50); // 20 Hz
      }

      function stopTickLoop() {
        if (tickInterval === null) return;
        clearInterval(tickInterval);
        tickInterval = null;
      }

      // Resume the loop if sessions survived hibernation.
      if (sessions.size > 0) startTickLoop();

      return {
        fetch: Effect.gen(function* () {
          const [response, socket] = yield* Cloudflare.upgrade();
          const sessionId = crypto.randomUUID();
          // First connection re-uses the world's local player id so the
          // existing simulation systems work without modification.
          const playerId = sessions.size === 0 ? world.localPlayerId : crypto.randomUUID();
          const data: SessionData = { sessionId, playerId };
          socket.serializeAttachment(data);
          sessions.set(sessionId, { socket, playerId });
          pendingInputs.set(sessionId, { moveX: 0, moveZ: 0 });
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
          for (const event of parsed.events) {
            world.inputQueue.push(event);
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
          }
          if (sessions.size === 0) stopTickLoop();
          yield* ws.close(code, reason);
        }),
      };
    });
  }),
) {}
