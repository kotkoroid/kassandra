import {
  HttpApi,
  HttpApiEndpoint,
  HttpApiGroup,
} from 'effect/unstable/httpapi';
import * as HttpApiSchema from 'effect/unstable/httpapi/HttpApiSchema';
import { CreatePartySuccess } from './parties/create-party.schema.ts';

const ApiGroupParties = HttpApiGroup.make('Parties').add(
  HttpApiEndpoint.post('create-party', '/parties', {
    success: HttpApiSchema.status(201)(CreatePartySuccess),
  }),
);

export const ApiDefinition = HttpApi.make('Api').add(ApiGroupParties);
