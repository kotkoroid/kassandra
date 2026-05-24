// Shared KV namespace declaration for the PR-G5 server-side session
// store. Both Gateway and Realm import + `yield*` this single Effect so
// they end up bound to the same physical Cloudflare KV namespace.
//
// The pattern mirrors how the `PartyRoom` class is a module-level
// singleton that each Worker yields — but KV has no
// class-style Resource API in Alchemy, so we wrap the constructor call
// in a module-level constant instead.

import * as Cloudflare from 'alchemy/Cloudflare';

export const SessionsKvNamespace = Cloudflare.KVNamespace('Sessions');
