import * as Alchemy from 'alchemy';
import * as Cloudflare from 'alchemy/Cloudflare';
import * as Effect from 'effect/Effect';
import Worker from './applications/game/src/Worker.ts';

export default Alchemy.Stack(
  'Kassandra',
  {
    providers: Cloudflare.providers(),
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    const worker = yield* Worker;

    return {
      url: worker.url,
    };
  }),
);
