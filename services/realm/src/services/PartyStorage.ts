// PartyStorage — DO-backed persistence for the realm world.
//
// PR-E: a party's full simulation state is serialized to the DO's
// SQLite storage on every save (alarm-driven + on last-disconnect),
// then rehydrated on next connect. While the DO instance is
// unloaded, no tick runs — `world.time` advances only while there's
// a live tick fiber.
//
// Wire shape: `PersistentWorld` from the protocol library (see
// libraries/foundation/protocol/src/persistentWorld.ts). It differs
// from the runtime `World` in two ways: Maps collapse to Records
// (spawnPointRespawnAt, players), and a few derived/transient fields
// drop (entityById is rebuilt on restore; recentEvents/inputQueue
// start empty).
//
// PR-D3e.3: the Mulberry32 state moved from `world.rng` to the
// `RandomState` service. `save` now takes an explicit `rngSeed` arg
// (PartyRoom yields `RandomState.getSeed()` before calling) and
// `restore` returns both the rehydrated world AND the persisted
// seed so PartyRoom can wire `makeRandomLayer(seed)` and bind
// `world.rng` to the shared callable.
//
// Versioning: payloads carry `version: 1`. A schema-changing PR
// bumps the literal and adds a migrator (or, simpler, returns None
// from restore on a mismatch so the party gets a fresh world).

import { PersistentWorld } from '@kassandra/protocol-foundation-library';
import { createWorld, type World } from '@kassandra/simulation-domain-library';
import * as Cloudflare from 'alchemy/Cloudflare';
import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Option from 'effect/Option';
import * as Schema from 'effect/Schema';

const STORAGE_KEY = 'world';

const decodePersistent = Schema.decodeUnknownResult(PersistentWorld);
const encodePersistent = Schema.encodeUnknownSync(PersistentWorld);

export interface RestoredWorld {
  readonly world: World;
  readonly rngSeed: number;
}

export interface PartyStorageShape {
  /**
   * Serialize the current world + Mulberry32 seed to DO storage.
   * Caller (PartyRoom) yields `RandomState.getSeed()` before this so
   * the persisted seed reflects exactly the post-last-tick state.
   */
  readonly save: (world: World, rngSeed: number) => Effect.Effect<void>;
  /**
   * Read the persisted world + rng seed from DO storage. Returns
   * `None` when nothing has been stored yet OR when the stored
   * payload fails to decode (treated as "fresh party") so the
   * bug-on-schema-bump cost is at worst a party reset, not a crash
   * loop.
   */
  readonly restore: Effect.Effect<Option.Option<RestoredWorld>>;
  /** Wipe the stored world. Called on owner disband. */
  readonly clear: Effect.Effect<void>;
}

export class PartyStorage extends Context.Service<PartyStorage, PartyStorageShape>()(
  'kassandra/realm/PartyStorage',
) {}

/**
 * Build the storage service bound to a specific DurableObjectState.
 * Construction is cheap; the encode/decode work happens at the
 * call sites, not here.
 */
export const makePartyStorage = (
  state: Cloudflare.DurableObjectState['Service'],
): Effect.Effect<PartyStorageShape> =>
  Effect.succeed({
    save: Effect.fn('PartyStorage.save')(function* (world, rngSeed) {
      const payload: typeof PersistentWorld.Type = {
        version: 1,
        rngSeed,
        time: world.time,
        tick: world.tick,
        localPlayerId: world.localPlayerId,
        ownerId: world.ownerId,
        players: world.players,
        entities: world.entities,
        projectiles: world.projectiles,
        healingCircles: world.healingCircles,
        lootBags: world.lootBags,
        chat: { messages: world.chat.messages },
        spawnPointsInitialized: world.spawnPointsInitialized,
        // Map → Record for JSON storage.
        spawnPointRespawnAt: Object.fromEntries(world.spawnPointRespawnAt),
        nextId: world.nextId,
      };
      // Pre-encode through Schema so the row we store is guaranteed
      // to round-trip via decode without surprises.
      const encoded = encodePersistent(payload);
      yield* state.storage.put(STORAGE_KEY, encoded);
    }),

    restore: Effect.gen(function* () {
      const raw = yield* state.storage.get<unknown>(STORAGE_KEY);
      if (raw === undefined) return Option.none<RestoredWorld>();

      const decoded = decodePersistent(raw);
      if (decoded._tag === 'Failure') {
        // Corrupt or version-mismatched payload. Drop it and start
        // fresh — better than crashing the DO on every fetch. The
        // alternative (return Some(crashing-world)) would prevent
        // even an owner disband from recovering the party.
        yield* Effect.logWarning('PartyStorage.restore: payload failed to decode, dropping', {
          error: String(decoded.failure),
        });
        return Option.none<RestoredWorld>();
      }

      const persisted = decoded.success;

      // Rebuild the runtime world from the persisted shape. Start
      // from a fresh empty world (same defaults) and overwrite the
      // persisted fields — this keeps the shape additive (new
      // optional World fields keep their defaults instead of being
      // `undefined`). `world.rng` here is the default Mulberry32
      // closure baked into createWorld; PartyRoom rebinds it to the
      // shared `RandomState` callable after this returns, using the
      // `rngSeed` we hand back below.
      const world = createWorld();
      world.time = persisted.time;
      world.tick = persisted.tick;
      world.localPlayerId = persisted.localPlayerId;
      world.ownerId = persisted.ownerId;
      world.players = persisted.players as World['players'];
      world.entities = persisted.entities as World['entities'];
      world.projectiles = persisted.projectiles as World['projectiles'];
      world.healingCircles = persisted.healingCircles as World['healingCircles'];
      world.lootBags = persisted.lootBags as World['lootBags'];
      world.chat.messages = persisted.chat.messages as World['chat']['messages'];
      world.spawnPointsInitialized = persisted.spawnPointsInitialized;
      world.spawnPointRespawnAt = new Map(
        Object.entries(persisted.spawnPointRespawnAt),
      );
      world.nextId = persisted.nextId;

      // entityById is a runtime O(1) lookup — rebuilt from
      // entities[]. Cheaper than persisting and risking drift.
      world.entityById = new Map(world.entities.map((e) => [e.id, e]));

      // inputQueue + recentEvents are per-tick scratch; they start
      // empty for the first post-restore tick.
      world.inputQueue = [];
      world.recentEvents = [];

      return Option.some<RestoredWorld>({ world, rngSeed: persisted.rngSeed });
    }).pipe(Effect.annotateLogs({ service: 'PartyStorage' })),

    clear: Effect.gen(function* () {
      yield* state.storage.delete(STORAGE_KEY);
    }),
  });

export const PartyStorageLayer = (state: Cloudflare.DurableObjectState['Service']) =>
  Layer.effect(PartyStorage)(makePartyStorage(state));
