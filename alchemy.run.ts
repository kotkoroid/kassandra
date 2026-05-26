import * as Alchemy from 'alchemy';
import * as Cloudflare from 'alchemy/Cloudflare';
import * as Output from 'alchemy/Output';
import * as Effect from 'effect/Effect';
import Game from './applications/game/Game.ts';
import Gateway from './orchestrators/gateway/src/Gateway.ts';
import Realm from './services/realm/src/Realm.ts';

/**
 * Public URL of an alchemy Worker/Vite resource. Prefers the custom
 * domain (only set when alchemy actually attached one — i.e. in
 * deploy mode) and falls back to alchemy's `.url` (the workers.dev
 * URL in prod, the localhost URL in dev).
 *
 * `worker.url` is hardcoded to the workers.dev URL even when a
 * custom `domain:` is set; the custom hostname only appears in
 * `worker.domains[]`. There is no native "publicUrl" — confirmed
 * upstream that this util IS the intended pattern (a Worker can serve
 * multiple domains, so alchemy can't pick a "primary" for you).
 *
 * `domains[0]` is unambiguous for us because every Worker we declare
 * attaches exactly one custom domain. Once alchemy/alchemy-effect#432
 * lands, `domains[]` order is also officially deterministic.
 */
const urlOf = (r: {
  url: Output.Output<string | undefined>;
  domains: Output.Output<ReadonlyArray<{ hostname: string }>>;
}): Output.Output<string> =>
  Output.map(Output.all(r.domains, r.url), ([domains, workerUrl]) => {
    const primary = domains[0];
    return primary ? `https://${primary.hostname}` : workerUrl!;
  });

export default Alchemy.Stack(
  'Kassandra',
  {
    providers: Cloudflare.providers(),
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    const gateway = yield* Gateway;
    const realm = yield* Realm;
    const game = yield* Game({
      VITE_GATEWAY_URL: urlOf(gateway),
      VITE_REALM_URL: urlOf(realm),
    });

    return {
      gameUrl: urlOf(game),
      gatewayUrl: urlOf(gateway),
      realmUrl: urlOf(realm),
    };
  }),
);
