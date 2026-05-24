# Effect 4.0 Patterns

Repo-wide Effect 4.0 / Alchemy 2.0 conventions for Kassandra. Each
pattern is a **compiling reference** in
`libraries/foundation/effect-conventions/src/patterns/`; the source
files are the source of truth. This index summarises when to use each
pattern and which in-repo sites apply it.

> **Why compiling examples?** Markdown snippets rot when APIs move. The
> pattern files are real TypeScript that builds with the rest of the
> repo (`@kassandra/effect-conventions-foundation-library:types:check`).
> Drift is impossible by construction.

## Pattern index

| # | Pattern | File | When to use |
|---|---|---|---|
| 1 | **Service** | [service.ts](libraries/foundation/effect-conventions/src/patterns/service.ts) | Any unit of behaviour with dependencies. Replaces module-level singletons. Always pair with `.layer` + optional `.layerTest`. |
| 2 | **Tagged error** | [tagged-error.ts](libraries/foundation/effect-conventions/src/patterns/tagged-error.ts) | Every error crossing a fiber, layer, or transport boundary. `Schema.TaggedErrorClass`, caught by tag with `Effect.catchTag`. |
| 3 | **Scope-based lifecycle** | [scope.ts](libraries/foundation/effect-conventions/src/patterns/scope.ts) | Anything that must clean up on interruption — sockets, fibers, alarms, audio contexts. |
| 4 | **Periodic work** | [periodic.ts](libraries/foundation/effect-conventions/src/patterns/periodic.ts) | Replaces all `setInterval` / `setTimeout`. `Effect.repeat(Schedule.spaced(…))` under `forkScoped`. |
| 5 | **Shared state (Ref family)** | [ref.ts](libraries/foundation/effect-conventions/src/patterns/ref.ts) | `Ref` (single owner), `SubscriptionRef` (reactive read), `SynchronizedRef` (atomic effectful updates). |
| 6 | **Inbound queue** | [queue.ts](libraries/foundation/effect-conventions/src/patterns/queue.ts) | Event-driven producer ↔ pull-based consumer hand-off. `Queue.bounded` for back-pressure, `Queue.unbounded` when upstream already throttles. |
| 7 | **Schema boundary** | [schema-boundary.ts](libraries/foundation/effect-conventions/src/patterns/schema-boundary.ts) | Decode wire data ONCE at every transport boundary. Replaces `JSON.parse + as never` casts. |
| 8 | **Logger / observability** | [logger.ts](libraries/foundation/effect-conventions/src/patterns/logger.ts) | `Effect.fn(name)` for free stack traces + tracing spans; `Effect.annotateLogs` for structured context. Replaces `console.*`. |
| 9 | **Random / determinism** | [random.ts](libraries/foundation/effect-conventions/src/patterns/random.ts) | `effect/Random` everywhere. `Math.random` banned in sim code from PR-D. `Random.withSeed` for reproducible tests. |
| 10 | **Layer composition** | [layer.ts](libraries/foundation/effect-conventions/src/patterns/layer.ts) | `Layer.mergeAll` for siblings, `Layer.provide(B, A)` when B needs A, `Layer.fresh` for test isolation. |
| 11 | **Reactive bridge (Svelte ↔ Effect)** | [svelte-bridge.ts](libraries/foundation/effect-conventions/src/patterns/svelte-bridge.ts) | One-way mirror of `SubscriptionRef<A>` into a Svelte 5 `$state` proxy. Effect owns truth; Svelte mirrors. |
| 12 | **Typed RPC over WebSocket** | [rpc-group.ts](libraries/foundation/effect-conventions/src/patterns/rpc-group.ts) | `effect/unstable/rpc` `RpcGroup` for typed contracts. Replaces hand-rolled `ClientMessage` / `ServerMessage`. |
| 13 | **Cloudflare DO integration** | [do-integration.ts](libraries/foundation/effect-conventions/src/patterns/do-integration.ts) | The `Cloudflare.DurableObjectNamespace<Self>()(name, Effect.gen)` shape with all four lifecycle handlers (fetch, webSocketMessage, webSocketClose, alarm). |
| 14 | **Testing** | [testing.ts](libraries/foundation/effect-conventions/src/patterns/testing.ts) | `@effect/vitest`'s `it.effect` / `it.layer` for unit and integration; `alchemy/Test/Vitest` for deploy. |

## Load-bearing runtime export

| | File | Purpose |
|---|---|---|
| 🔧 | [realm-rpc-do.ts](libraries/foundation/effect-conventions/src/realm-rpc-do.ts) | DurableObject ↔ Socket ↔ RpcServer bridge. The only non-documentation runtime code in this library. PR-B imports it from `services/realm/src/PartyRoom.ts` to mount an `effect/unstable/rpc` server over the realm's hibernating WebSockets. |

## In-repo target use sites (PR-B onward)

| Pattern | Replaces (current state) | Replacement target | Lands in |
|---|---|---|---|
| Service | [PartyRoom.ts:125–130](services/realm/src/PartyRoom.ts) `createWorld` + 3 Maps | `WorldRef`, `SessionsRef`, `InputQueue`, `SnapshotBroadcast`, `PartyOwner` services | PR-B |
| Service | [world.svelte.ts](applications/game/src/world.svelte.ts) `$state<World>` | `ClientWorld` service over `SubscriptionRef` | PR-C |
| Tagged error | [PartyRoom.ts:226–230](services/realm/src/PartyRoom.ts) silent `try/catch` | `WorldDecodeError` + `catchTag` | PR-B |
| Scope-based lifecycle | [PartyRoom.ts:316–318](services/realm/src/PartyRoom.ts) manual `sessions.delete()` | Scope finalizer registered at accept time | PR-B |
| Scope-based lifecycle | [realm.svelte.ts:12–14,82–83](applications/game/src/realm.svelte.ts) handler-nulling close | `RealmRpcClient` scoped lifetime | PR-C |
| Periodic work | [PartyRoom.ts:148–178](services/realm/src/PartyRoom.ts) `setInterval` | `Effect.forkScoped(tickLoop)` with `Schedule.spaced(50ms)` | PR-B |
| Shared state | [PartyRoom.ts:125](services/realm/src/PartyRoom.ts) mutable `world` | `WorldRef` over `Ref` (server) | PR-B |
| Shared state | [world.svelte.ts](applications/game/src/world.svelte.ts) `$state<World>` | `ClientWorld` over `SubscriptionRef` | PR-C |
| Inbound queue | [PartyRoom.ts:129–130](services/realm/src/PartyRoom.ts) two pending `Map`s | per-session `Queue<ClientMessage>` | PR-B |
| Schema boundary | [PartyRoom.ts:226–230](services/realm/src/PartyRoom.ts) `JSON.parse + as ClientMessageType` | `Schema.fromJsonString(ClientMessage)` | PR-B |
| Schema boundary | [realm.svelte.ts:184–251](applications/game/src/realm.svelte.ts) `applySnapshot` with 3 `as never` | `Schema.decodeUnknownEffect(Snapshot)` | PR-C |
| Logger / observability | scattered `console.log('[realm] …')` in [realm.svelte.ts](applications/game/src/realm.svelte.ts) and [PartyRoom.ts](services/realm/src/PartyRoom.ts) | `Effect.fn` + `Effect.annotateLogs` | PR-B, PR-C |
| Logger / observability | [consoleBridge.ts](applications/game/src/consoleBridge.ts) `console.*` monkey-patch | custom Effect Logger piping into chat `Queue<ChatMessage>` | PR-C |
| Random / determinism | [rng.ts](libraries/domain/simulation/src/rng.ts) Mulberry32 closure + `world.rng` field | `effect/Random` + per-test `Random.withSeed` | PR-D |
| Reactive bridge | [world.svelte.ts](applications/game/src/world.svelte.ts) `$state<World>` direct | `bindSubscriptionRef(clientWorld.ref, mirror)` | PR-C |
| Typed RPC | [messages.ts](libraries/foundation/protocol/src/messages.ts) hand-rolled envelopes | `RealmRpc` RpcGroup in `libraries/foundation/protocol/src/rpc.ts` | PR-B |
| Cloudflare DO integration | [PartyRoom.ts](services/realm/src/PartyRoom.ts) current shape | full §1.13-template rewrite using `WorldRef` + `Tick` + bridge | PR-B |
| Testing | one `sim` project in [vite.config.ts](vite.config.ts) | five projects (`sim`, `ui`, `scene`, `workers`, `deploy`) | PR-F |

## Cross-cutting conventions

- **Pin exact versions** — `effect@4.0.0-beta.66` and `alchemy@2.0.0-beta.44`, no `^`, no `overrides`. Each PR after PR-A1 starts with a version-bump commit before substantive work.
- **No `setInterval` / `setTimeout`** in server or service code from PR-B onward. UI-component timers (e.g., level-up banner hide in `Hud.svelte`) stay Svelte. Grep gate enforced in CI.
- **No `JSON.parse`** in service code from PR-B onward. Wire data goes through `Schema.fromJsonString`. UI fetch boundaries (e.g., `PartySetup.svelte` `createParty()`) are the exception until they migrate to RPC.
- **No `as never` / `as any`** in any new code. Existing instances tracked in plan §2.1 for surgical removal.
- **`yield* Ref.get(ref)` not `yield* ref`** — Refs are not Effect subtypes in 4.0.
- **Layer naming**: lowercase `.layer` (canonical) + `.layerTest` (variant). No v3 `.Default` / `.Live`.

## See also

- Master plan (memory): `~/.claude/projects/-Users-johndoe-Workspace-Dev-kotkoroid-kassandra/memory/project_master_plan.md`
- Full PR roadmap with verification: `~/.claude/plans/i-want-the-codebase-cheeky-book.md`
- Effect 4.0 migration guides: `~/Workspace/Dev/kotkoroid/effect-smol/migration/*.md`
- Alchemy 2.0 docs site: `~/Workspace/Dev/kotkoroid/alchemy-effect/website/`
