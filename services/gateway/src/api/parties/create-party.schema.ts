import * as Schema from 'effect/Schema';

export class CreatePartySuccess extends Schema.Class<CreatePartySuccess>('CreatePartySuccess')({
  id: Schema.String,
}) {}
