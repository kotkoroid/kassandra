import * as Alchemy from 'alchemy';
import * as Cloudflare from 'alchemy/Cloudflare';
import { sign as signJwt } from '@kassandra/effect-conventions-foundation-library';
import * as Config from 'effect/Config';
import * as Effect from 'effect/Effect';
import * as Redacted from 'effect/Redacted';
import * as Etag from 'effect/unstable/http/Etag';
import * as HttpPlatform from 'effect/unstable/http/HttpPlatform';
import * as HttpRouter from 'effect/unstable/http/HttpRouter';
import * as HttpApiBuilder from 'effect/unstable/httpapi/HttpApiBuilder';
import * as Layer from 'effect/Layer';
import * as Path from 'effect/Path';
import { ApiDefinition } from './api/api.definition.ts';
import { CreatePartySuccess } from './api/parties/create-party.schema.ts';
import { CreateSessionSuccess } from './api/sessions/create-session.schema.ts';

const HttpPlatformStub = Layer.succeed(HttpPlatform.HttpPlatform, {
  fileResponse: () => Effect.die('HttpPlatform.fileResponse not supported'),
  fileWebResponse: () => Effect.die('HttpPlatform.fileWebResponse not supported'),
});

// PR-G2 dev fallback. The deployed Worker reads JWT_SECRET from its
// secret_text binding; local `bun run dev` falls back to this constant
// so the dev loop boots without manual env setup. Production deploys
// MUST set JWT_SECRET (the secret is the same one the Realm binds, so
// any divergence breaks verification immediately).
const DEV_JWT_SECRET_FALLBACK = 'dev-only-jwt-secret-replace-in-production';

export default class Gateway extends Cloudflare.Worker<Gateway>()(
  'Api',
  {
    main: import.meta.path,
    compatibility: {
      flags: ['nodejs_compat'],
    },
  },
  Effect.gen(function* () {
    // PR-G2: bind JWT_SECRET as a secret_text on this Worker's env.
    // The Realm Worker binds the same name with the same Config source,
    // so both sides see the same value at deploy time. At runtime the
    // session handler reads it via WorkerEnvironment.
    yield* Alchemy.Secret(
      'JWT_SECRET',
      Config.redacted('JWT_SECRET').pipe(
        Config.withDefault(Redacted.make(DEV_JWT_SECRET_FALLBACK)),
      ),
    );

    const partiesApi = HttpApiBuilder.group(ApiDefinition, 'Parties', (handlers) =>
      handlers.handle('create-party', () =>
        Effect.sync(() => new CreatePartySuccess({ id: crypto.randomUUID() })),
      ),
    );

    const sessionsApi = HttpApiBuilder.group(ApiDefinition, 'Sessions', (handlers) =>
      handlers.handle('create-session', ({ payload }) =>
        Effect.gen(function* () {
          const env = yield* Cloudflare.WorkerEnvironment;
          const secret = (env as Record<string, unknown>)['JWT_SECRET'] as string;
          const { token, exp } = yield* signJwt({
            secret,
            subject: payload.accountId,
          });
          return new CreateSessionSuccess({ token, exp });
        }),
      ),
    );

    return {
      fetch: HttpApiBuilder.layer(ApiDefinition).pipe(
        Layer.provide([partiesApi, sessionsApi]),
        Layer.provide([Etag.layer, HttpPlatformStub, Path.layer]),
        Layer.provide(HttpRouter.cors()),
        HttpRouter.toHttpEffect,
      ),
    };
  }),
) {}
