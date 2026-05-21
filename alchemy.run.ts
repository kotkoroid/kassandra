import * as Alchemy from 'alchemy';
import * as Cloudflare from 'alchemy/Cloudflare';
import * as Effect from 'effect/Effect';
import Gateway from './orchestrators/gateway/src/Gateway.ts';
import Realm from './services/realm/src/Realm.ts';

export default Alchemy.Stack(
  'Kassandra',
  {
    providers: Cloudflare.providers(),
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    const gateway = yield* Gateway;
    const realm = yield* Realm;

    const game = yield* Cloudflare.Vite('Game', {
      rootDir: './applications/game',
      compatibility: {
        flags: ['nodejs_compat'],
      },
      env: {
        VITE_GATEWAY_URL: gateway.url,
        VITE_REALM_URL: realm.url,
      },
    });

    return {
      url: game.url,
      gatewayUrl: gateway.url,
      realmUrl: realm.url,
    };
  }),
);
