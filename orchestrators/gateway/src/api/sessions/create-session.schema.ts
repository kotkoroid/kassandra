import * as Schema from 'effect/Schema';

// PR-G5: the wire body no longer carries a token. The session cookie
// is set on the response; the body only echoes the accepted accountId
// so the client can settle its identity state synchronously alongside
// the credential.
export class CreateSessionRequest extends Schema.Class<CreateSessionRequest>('CreateSessionRequest')({
  accountId: Schema.String,
}) {}

export class CreateSessionSuccess extends Schema.Class<CreateSessionSuccess>('CreateSessionSuccess')({
  accountId: Schema.String,
}) {}
