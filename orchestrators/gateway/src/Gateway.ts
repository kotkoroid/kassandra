import * as Cloudflare from 'alchemy/Cloudflare';
import * as Effect from 'effect/Effect';
import * as Etag from 'effect/unstable/http/Etag';
import * as HttpPlatform from 'effect/unstable/http/HttpPlatform';
import * as HttpRouter from 'effect/unstable/http/HttpRouter';
import * as HttpApiBuilder from 'effect/unstable/httpapi/HttpApiBuilder';
import * as Layer from 'effect/Layer';
import * as Path from 'effect/Path';
import { ApiDefinition } from './api/api.definition.ts';
import { CreatePartySuccess } from './api/parties/create-party.schema.ts';

const HttpPlatformStub = Layer.succeed(HttpPlatform.HttpPlatform, {
  fileResponse: () => Effect.die('HttpPlatform.fileResponse not supported'),
  fileWebResponse: () => Effect.die('HttpPlatform.fileWebResponse not supported'),
});

export default class Gateway extends Cloudflare.Worker<Gateway>()(
  'Gateway',
  {
    main: import.meta.path,
    compatibility: {
      flags: ['nodejs_compat'],
    },
  },
  Effect.gen(function* () {
    const partiesApi = HttpApiBuilder.group(ApiDefinition, 'Parties', (handlers) =>
      handlers.handle('create-party', () =>
        Effect.sync(() => new CreatePartySuccess({ id: crypto.randomUUID() })),
      ),
    );

    return {
      fetch: HttpApiBuilder.layer(ApiDefinition).pipe(
        Layer.provide(partiesApi),
        Layer.provide([Etag.layer, HttpPlatformStub, Path.layer]),
        Layer.provide(HttpRouter.cors()),
        HttpRouter.toHttpEffect,
      ),
    };
  }),
) {}
