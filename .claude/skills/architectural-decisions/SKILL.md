---
name: architectural-decisions
description: Recall the project's architectural decisions and the reasoning behind them. Use whenever the user asks about a technology choice, considers swapping a platform/transport/library, or proposes a change that touches one of the recorded decisions. Also use proactively when answering a design question whose outcome depends on a constraint already settled here — cite the decision instead of re-deriving it.
---

# Architectural decisions

Append-only ledger of decisions that shaped kassandra's architecture. Each entry captures **what was decided, why, what was rejected, and under what condition it should be revisited.**

## How to read this file

- Decisions are listed newest-first.
- Each entry is self-contained — you should be able to act on a decision without reading prior context.
- A decision is "live" until explicitly superseded by a later entry that references it by ID.
- If you're about to recommend something that contradicts a live decision, **cite the decision** and explain why the current proposal warrants revisiting it, rather than silently reversing course.

## How to add a decision

Use this template. Keep entries terse — one screen each is the target.

```markdown
### ADR-NNN — <short imperative title>

**Date:** YYYY-MM-DD
**Status:** Accepted | Superseded by ADR-MMM | Withdrawn
**Context:** <1–3 sentences on the situation that forced the decision>
**Decision:** <what we chose, in one sentence>
**Rationale:** <why this beat the alternatives — name them>
**Consequences:** <what this commits us to, including the painful parts>
**Revisit when:** <the concrete condition that would justify reopening>
```

Number monotonically. Don't reorder; don't renumber. A withdrawn or superseded entry stays in place so the reasoning trail survives.

Reference prior work by **commit hash** (linked to the GitHub commit), not by `PR-` identifiers or ticket numbers. Commit hashes don't drift, survive repo renames, and are unambiguous in `git log`. Internal `PR-X` codes used in commit messages are fine in those commit messages — but ADR entries treat the commit hash as the canonical anchor.

## Decisions

### ADR-001 — Stay WebTransport-ready, ship on WebSocket + DO hibernation

**Date:** 2026-05-24
**Status:** Accepted

**Context.** WebTransport (HTTP/3 / QUIC) offers material wins for a real-time game realm — independent streams, unreliable datagrams, connection migration, no head-of-line blocking. Adoption is blocked today by three external constraints we cannot fix: no Cloudflare server-side WT support ([workerd#6451](https://github.com/cloudflare/workerd/issues/6451)), no Durable Object hibernation parity for WT (which would collapse the per-request billing model that justifies running on DOs at all), and partial browser support (Safari only in Technology Preview). All three dissolve on independent external timelines.

**Decision.** We commit to *WT-readiness* as a standing **hard** design constraint, without committing to *WT adoption*. Every change must be evaluated against the question: "would this still work if the transport were WebTransport?" If the answer is no, the PR description must contain a written justification for the WS-specific shape. Reviewers reject PRs that introduce WS-only patterns without that justification. We continue to ship on WebSocket + DO hibernation today and indefinitely until the external blockers clear.

**Rationale.** The cost of WT-readiness is small and amortized across many PRs (cookie auth, binary-friendly wire format, transport-agnostic RPC layer, no reliance on WS-specific framing or HoL-blocking ordering). The cost of *not* being WT-ready is concentrated: every WS-specific shortcut becomes a multi-PR rewrite entangled with the migration the day the platform blockers clear. Commit [62e64c1](https://github.com/kotkoroid/kassandra/commit/62e64c1) (cookie sessions replacing the `Sec-WebSocket-Protocol: bearer.<jwt>` shape from [6b270fa](https://github.com/kotkoroid/kassandra/commit/6b270fa)) validates the trade — it shipped as a single PR while we were unblocked and would have been weeks of work entangled with WT later. Pre-paying small costs to defer concentrated ones is the trade.

**Consequences (the painful parts).**
- No WS-specific shortcuts. Subprotocol-as-credential, custom upgrade headers, framing tricks all need a WT-equivalent path before they ship — or an explicit justification in the PR description.
- Wire format moves toward binary (msgpack/CBOR/protobuf) so it ports cleanly when datagrams enter the picture.
- RPC abstractions stay transport-agnostic — domain code does not expose `Socket` / `WebSocket` / `WS` types.
- Unreliable-delivery semantics need a place to live in the RPC layer (a per-RPC annotation, even if today it's a no-op) so the schema doesn't have to break later.
- We use Effect's `Socket` / `RpcServer.Protocol` abstractions correctly — we do NOT invent a parallel transport-abstraction layer.
- DO hibernation is *not* WT-portable; we accept that durability is a separate concern (covered by its own future ADR, not this one).

**Revisit when** Cloudflare ships server-side WebTransport for Workers / Durable Objects **with** hibernation parity ([workerd#6451](https://github.com/cloudflare/workerd/issues/6451)) AND browser support reaches stable across Chrome, Edge, Firefox, and Safari. At that point this ADR is superseded by a migration ADR; until then it stands without time pressure.


### ADR-002 — Character is per-realm, not per-account

**Date:** 2026-05-24
**Status:** Accepted

**Context.** PR-G3 ([aa3b300](https://github.com/kotkoroid/kassandra/commit/aa3b300)) introduced a `PlayerProfile` Durable Object keyed by `accountId` to hold one canonical `CharacterRecord`. PR-G4 layered debounced save-back on top so progression made during play landed back in that DO. The intent was an "account = identity + save vault" model: one character, carried into every party. Smoke-testing the dev loop made the consequence concrete — disbanding a party and creating a new one rejoined with the same character, no character-creation prompt, no opportunity to roll a different class for a different realm. That isn't the game we want.

**Decision.** Character identity and progression are **per-realm** (per-party). The `PartyRoom` DO is the sole source of truth for a player's character within that realm; rejoining the same `PartyRoom` rehydrates your character (via the world snapshot persisted under PR-E in [d1d8863](https://github.com/kotkoroid/kassandra/commit/d1d8863)), joining a different one rolls fresh. The `PlayerProfile` DO + RPC + client + boot-time load are deleted in their entirety. The session cookie minted by [62e64c1](https://github.com/kotkoroid/kassandra/commit/62e64c1) continues to gate access — account = authentication, not save data.

**Rationale.** `PartyRoom` already persists the full world (`PartyStorage` from PR-E), which includes each player's `Player` record indexed by `playerId === accountId` once you connect. That gives per-realm-per-account semantics for free. `PlayerProfile` was a second source of truth layered *over* a system that didn't need one — every save had to flow through both layers, and the account-wide override defeated the per-realm distinctness we now want. Subtraction wins over feature-flagging the "show creation panel on rejoin" path because the underlying storage model was wrong, not the UI flow. ~250 LOC + one DO class + one KV-less RPC group go away; the boot path collapses from `initAuth → initProfile → mount` to `initAuth → mount`.

**Consequences (the painful parts).**
- No cross-realm progression carry-over. Level 40 in Realm A doesn't help in Realm B — that's the game-design commitment, not a limitation.
- Account-wide data (friends list, settings, achievements, cosmetics owned, the "your characters across realms" roster) has no home today. When one is needed, a new account-scoped DO can be added with a shape fit to *that* use case — not retrofitted onto the deleted CharacterRecord vault.
- `CharacterCreation.svelte` runs every time the local player's name is empty on first snapshot, including reconnects to a *new* realm. UX-side: this means a fresh party with no character → creation panel; a party where you already created → straight to game. Determined entirely by `world.players[localPlayerId].name === ''` on first snapshot.
- `App.svelte` no longer has a "skip creation" cached path — the snapshot decides, not a client-side flag.

**Revisit when** account-wide persistent data is needed (cosmetics inventory, cross-realm friend list, ranked-mode rating) AND the natural shape of that data is a single struct co-located with character identity. Until then, the per-realm `PartyRoom` storage is sufficient and a separate per-account DO would only be reintroducing the problem this ADR solved.

> **Naming note (added 2026-05-25, per ADR-003):** `PartyRoom` was renamed to `RealmRoom`; `partyId` to `realmId`; the URL routes `/parties/:id/ws` and `POST /parties` to `/realms/:id/ws` and `POST /realms`; the UI labels "Create Party" / "Disband Party" / "Leave Party" to their "…Realm" equivalents. The decision in this ADR is unchanged — the rename just made the code match the language ADR-002 already used.


### ADR-003 — Rename Party → Realm across the codebase

**Date:** 2026-05-25
**Status:** Accepted

**Context.** ADR-002 settled "character is per-realm, not per-account" and consistently used the word "realm" for the storage unit (the DO that holds the world for a group of players). But the codebase itself still used `PartyRoom`, `partyId`, `/parties/:id/ws`, "Create Party", etc. — vocabulary inherited from an earlier moment when the DO was conceived as an ad-hoc grouping rather than a persistent world. Every reader had to do a mental translation from ADR language to code language. Worse, the social roster section was now called "Party" too (PR after PR-G renamed "Guild" → "Party" for the "people I'm playing with right now" list), which collided with the storage-unit "Party" and added a second layer of overload.

**Decision.** Rename everywhere. `PartyRoom` → `RealmRoom`; `PartyStorage` → `RealmStorage`; `PartySession` → `RealmSession`; `partyId` → `realmId`; `/parties/:id/ws` → `/realms/:id/ws`; `POST /parties` → `POST /realms`; `?party=<id>` → `?realm=<id>`; "Create/Disband/Leave Party" UI labels → "…Realm"; `disbandParty()` / `leaveParty()` client funcs → `disbandRealm()` / `leaveRealm()`; SocialPanel section "Party" → "Realm". File renames: `services/realm/src/PartyRoom.ts` → `RealmRoom.ts`; `services/realm/src/services/PartyStorage.ts` → `RealmStorage.ts`; `applications/game/src/ui/PartySetup.svelte` → `RealmSetup.svelte`; `orchestrators/gateway/src/api/parties/create-party.schema.ts` → `api/realms/create-realm.schema.ts`. The View enum variant `'party'` in `App.svelte` becomes `'realm-select'` to read sensibly (the screen where the user picks a realm to enter).

**Rationale.** Three independent reasons converged:
1. ADR-002's prose was already canonical — the rename closes the code-to-doc gap rather than the other way around.
2. The Worker subdomain shipped today is `realm.kassandra.kotkoroid.com`. Treating the DO it routes to as anything other than a realm forces a mental translation at the most-read code boundary (the URL).
3. The "Party" social-panel section had become the second meaning of "party" in the codebase — keeping the original would have required either renaming the social section again (low-value churn) or accepting a permanent overload.

Considered: keep "Party" as the user-facing label for backwards-compatible UX. Rejected because there is no UX backwards-compatibility constraint yet (pre-launch), and the marginal user familiarity gain ("party" as MMO jargon) was outweighed by the cost of permanent code/doc/UI disagreement on what the unit is called.

**Consequences (the painful parts).**
- DO class rename → state migration. The Cloudflare DO class name keys all persistent state. Renaming `PartyRoom` → `RealmRoom` orphans every existing `PartyRoom` DO instance. Pre-launch, no real user state to lose; `bun run destroy && bun run dev` clears local state cleanly. Production: the just-deployed `PartyRoom` instances on Cloudflare are orphaned by this commit — anyone who'd created a test realm before today would lose it on next deploy. Accepted because there are no real users yet.
- `RealmStorage` interface still exports an internal shape typed as `RealmStorageShape` and the file lives at `services/realm/src/services/RealmStorage.ts`. The protocol library's `PersistentWorld` schema kept its name (it describes a *world*, not a realm — narrower scope).
- The `realm.svelte.ts` client module already used "realm" for the WebSocket-connection state; that file didn't need renaming, which means the client distinguishes `realm.realmId` (the realm we're connected to) from `realm.connected` (whether the WS is open). Slightly redundant-looking on the surface; semantically tight (the `realm` $state is the *connection state*, the `realmId` is the *room identifier*).

**Revisit when** the rename ever causes confusion that the old name didn't (e.g. external tooling, third-party docs, MMO-genre users who expect "party" terminology specifically). None of those exist today.
