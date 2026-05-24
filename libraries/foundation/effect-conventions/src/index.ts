// @kassandra/effect-conventions-foundation-library
//
// Living documentation for repo-wide Effect 4.0 patterns. Every file in
// `./patterns/*.ts` is a compiling example — by being real TypeScript
// the snippets cannot rot when the Effect API moves. Consumers DO NOT
// import from `./patterns/*`; those are reference material only,
// indexed by `EFFECT_PATTERNS.md` at the repo root.
//
// The one piece of runtime code this library DOES export is the
// DurableObject ↔ Socket ↔ RpcServer bridge in `./realm-rpc-do.ts`,
// which is consumed by services/realm in PR-B to mount an
// `effect/unstable/rpc` server inside a hibernating WebSocket DO.

export * from './realm-rpc-do';
// PR-G2: HS256 JWT sign/verify via Web Crypto. Used by the gateway
// (issuance) and the realm (verification on WS upgrade).
export * from './jwt';
