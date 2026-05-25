import * as Schema from 'effect/Schema';

export class CreateRealmSuccess extends Schema.Class<CreateRealmSuccess>('CreateRealmSuccess')({
  id: Schema.String,
}) {}
