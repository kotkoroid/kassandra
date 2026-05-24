// ProfileStorage — DO-backed persistence for one account's character.
//
// PR-G1: each PlayerProfile DO instance is keyed by accountId and
// stores at most one CharacterRecord. `load` returns Option<None>
// for a fresh account; `save` overwrites; `clear` wipes for account
// reset / deletion (no caller today, but cheap to have for parity
// with PartyStorage.clear).
//
// Like PartyStorage, the encode happens through `Schema.encodeUnknownSync`
// so what lands in storage is guaranteed round-trippable. Restore
// returns None on decode failure (logs a warning) — better than
// crashing the DO and locking the player out of their account.

import { CharacterRecord } from '@kassandra/protocol-foundation-library';
import * as Cloudflare from 'alchemy/Cloudflare';
import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Option from 'effect/Option';
import * as Schema from 'effect/Schema';

const STORAGE_KEY = 'character';

const decodeCharacter = Schema.decodeUnknownResult(CharacterRecord);
const encodeCharacter = Schema.encodeUnknownSync(CharacterRecord);

export interface ProfileStorageShape {
  /** Read this account's character; None for first-time use. */
  readonly load: Effect.Effect<Option.Option<CharacterRecord>>;
  /** Overwrite this account's character. */
  readonly save: (character: CharacterRecord) => Effect.Effect<void>;
  /** Delete the stored character (account reset). */
  readonly clear: Effect.Effect<void>;
}

export class ProfileStorage extends Context.Service<
  ProfileStorage,
  ProfileStorageShape
>()('kassandra/realm/ProfileStorage') {}

export const makeProfileStorage = (
  state: Cloudflare.DurableObjectState['Service'],
): Effect.Effect<ProfileStorageShape> =>
  Effect.succeed({
    load: Effect.gen(function* () {
      const raw = yield* state.storage.get<unknown>(STORAGE_KEY);
      if (raw === undefined) return Option.none<CharacterRecord>();

      const decoded = decodeCharacter(raw);
      if (decoded._tag === 'Failure') {
        // Same fail-soft policy as PartyStorage — drop the row and
        // treat the account as fresh so the player can re-create
        // their character. Locking them out would be worse.
        yield* Effect.logWarning(
          'ProfileStorage.load: payload failed to decode, dropping',
          { error: String(decoded.failure) },
        );
        return Option.none<CharacterRecord>();
      }
      return Option.some(decoded.success);
    }).pipe(Effect.annotateLogs({ service: 'ProfileStorage' })),

    save: Effect.fn('ProfileStorage.save')(function* (character) {
      const encoded = encodeCharacter(character);
      yield* state.storage.put(STORAGE_KEY, encoded);
    }),

    clear: Effect.gen(function* () {
      yield* state.storage.delete(STORAGE_KEY);
    }),
  });

export const ProfileStorageLayer = (state: Cloudflare.DurableObjectState['Service']) =>
  Layer.effect(ProfileStorage)(makeProfileStorage(state));
