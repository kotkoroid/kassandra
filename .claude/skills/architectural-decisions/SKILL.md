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
