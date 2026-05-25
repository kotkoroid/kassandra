import { HttpApi, HttpApiEndpoint, HttpApiGroup } from 'effect/unstable/httpapi';
import * as HttpApiSchema from 'effect/unstable/httpapi/HttpApiSchema';
import { CreateRealmSuccess } from './realms/create-realm.schema.ts';

const ApiGroupParties = HttpApiGroup.make('Realms').add(
  HttpApiEndpoint.post('create-realm', '/realms', {
    success: HttpApiSchema.status(201)(CreateRealmSuccess),
  }),
);

// PR-G5: sessions are NOT defined in HttpApi. They need fine-grained
// control over `Set-Cookie` response headers (HttpOnly+Secure+SameSite
// +Domain attrs) which doesn't fit the HttpApi handler return-shape.
// Gateway.ts handles `POST /sessions` and `DELETE /sessions` directly
// via raw HttpServerResponse before delegating other paths to this
// HttpApi router.

export const ApiDefinition = HttpApi.make('Api').add(ApiGroupParties);
