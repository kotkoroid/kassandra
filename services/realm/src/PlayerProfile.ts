import * as Cloudflare from 'alchemy/Cloudflare';
import * as Effect from 'effect/Effect';
import * as HttpServerResponse from 'effect/unstable/http/HttpServerResponse';

export default class PlayerProfile extends Cloudflare.DurableObjectNamespace<PlayerProfile>()(
  'PlayerProfile',
  Effect.gen(function* () {
    return Effect.gen(function* () {
      return {
        fetch: Effect.succeed(
          HttpServerResponse.text('PlayerProfile stub', { status: 200 }),
        ),
      };
    });
  }),
) {}
