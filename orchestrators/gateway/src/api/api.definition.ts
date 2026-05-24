import {
  HttpApi,
  HttpApiEndpoint,
  HttpApiGroup,
} from 'effect/unstable/httpapi';
import * as HttpApiSchema from 'effect/unstable/httpapi/HttpApiSchema';
import { CreatePartySuccess } from './parties/create-party.schema.ts';
import {
  CreateSessionRequest,
  CreateSessionSuccess,
} from './sessions/create-session.schema.ts';

const ApiGroupParties = HttpApiGroup.make('Parties').add(
  HttpApiEndpoint.post('create-party', '/parties', {
    success: HttpApiSchema.status(201)(CreatePartySuccess),
  }),
);

// PR-G2: account-scoped JWT issuance. Client posts the accountId it
// holds in localStorage; gateway signs an HS256 token with the shared
// JWT_SECRET; realm verifies the token on every WS upgrade.
const ApiGroupSessions = HttpApiGroup.make('Sessions').add(
  HttpApiEndpoint.post('create-session', '/sessions', {
    payload: CreateSessionRequest,
    success: HttpApiSchema.status(201)(CreateSessionSuccess),
  }),
);

export const ApiDefinition = HttpApi.make('Api')
  .add(ApiGroupParties)
  .add(ApiGroupSessions);
