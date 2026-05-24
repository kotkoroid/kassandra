import * as Schema from 'effect/Schema';

export class CreateSessionRequest extends Schema.Class<CreateSessionRequest>('CreateSessionRequest')({
  accountId: Schema.String,
}) {}

export class CreateSessionSuccess extends Schema.Class<CreateSessionSuccess>('CreateSessionSuccess')({
  token: Schema.String,
  exp: Schema.Number,
}) {}
