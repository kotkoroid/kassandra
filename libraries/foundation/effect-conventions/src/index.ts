// @kassandra/effect-conventions-foundation-library
//
// Living documentation for repo-wide Effect 4.0 patterns. Every file in
// `./patterns/*.ts` is a compiling example — by being real TypeScript
// the snippets cannot rot when the Effect API moves. Consumers DO NOT
// import from `./patterns/*`; those are reference material only,
// indexed by `EFFECT_PATTERNS.md` at the repo root.
//
// The runtime exports:
//   - `realm-rpc-do.ts` — DurableObject ↔ Socket ↔ RpcServer bridge
//     consumed by services/realm to mount an `effect/unstable/rpc`
//     server inside a hibernating WebSocket DO.
//   - `session.ts` — PR-G5 server-side session model (opaque IDs in
//     HttpOnly cookies, KV-backed records, sliding TTL) consumed by
//     the gateway (issuance + revocation) and the realm (verification
//     on WS upgrade).
//   - `sessionsKv.ts` — the shared `Cloudflare.KVNamespace('Sessions')`
//     declaration so both Workers bind to the same physical namespace.

export * from './authConfig';
export * from './realm-rpc-do';
export * from './session';
export * from './sessionsKv';
