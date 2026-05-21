import * as Alchemy from 'alchemy';
import * as Cloudflare from 'alchemy/Cloudflare';
import * as Effect from 'effect/Effect';
import Realm from './services/realm/src/Realm.ts';

export default Alchemy.Stack(
  'Kassandra',
  {
    providers: Cloudflare.providers(),
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    const game = yield* Cloudflare.Vite('Game', {
      rootDir: './applications/game',
      compatibility: {
        flags: ['nodejs_compat'],
      },
    });

    const realm = yield* Realm;

    return {
      url: game.url,
      realmUrl: realm.url,
    };
  }),
);
