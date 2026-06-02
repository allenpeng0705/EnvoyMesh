# ADR: H2A channel identity in EMP envelopes (Phase 15C)

**Status:** Accepted  
**Date:** 2026-05-20  
**Context:** Scenario 6 / Story C — human↔agent must be a first-class product channel without conflating peer human chat or A2A orchestration.

## Decision

1. **Product channel** — Owner ↔ home agent assist is surfaced in Social as the dedicated **Assistant** view (not a contact thread). Local turns use **`runOwnerAgentTurn`** (Phase 18; `runDocumentAgentTurn` deprecated) / `knowledgeQuery` RPC; cross-peer H2A uses existing EMP intents on the **message** protocol.

2. **Wire identity** — Do **not** add a required `channel` field to `EnvoyEnvelope` in v0.1. Channel semantics are derived from:
   - **libp2p protocol path** (`/envoymesh/chat` vs `/message` vs `/data`)
   - **`senderRole` / `recipientRole`** (Phase 13)
   - **`intent`** (typed EMP payload)

3. **Optional future extension** — v0.2 MAY add optional `channel?: "h2h" | "h2a" | "a2a" | "system"` for analytics and UI routing hints. Clients MUST NOT require it for validation in v0.1.

## Rationale

- Phase 13 shipped strict role validation; duplicating channel in every envelope adds migration cost without changing bond/policy gates today.
- libp2p already enforces conversational vs control split (`chat.message` only on chat protocol).
- Local H2A (owner typing in Assistant) never hits the wire — Activity rows record outcomes instead.

## Product mapping

| User action | Wire? | Path / RPC |
|-------------|-------|------------|
| Assistant vault Q&A | No | `runOwnerAgentTurn` → Activity `knowledge_answered` |
| Peer human chat | Yes | `chat.message` on `/envoymesh/chat` |
| Friend's agent knowledge assist | Yes | `knowledge.query` / `knowledge.response` on `/message` |
| A2A task negotiation | Yes | `task.*` on `/message`, roles agent↔agent |

## Consequences

- Social **Chat** lane = bonded human threads only; **Assistant** lane = owner ↔ home agent.
- Protocol appendix D documents the intent matrix ([protocol-standard.md](./protocol-standard.md)).
- Wire semantics tests live in `packages/api/test/h2a-wire-semantics.test.ts`.

## References

- [h2a-wire-semantics.md](./h2a-wire-semantics.md)
- [a2a-actor-visibility-plan.md](./a2a-actor-visibility-plan.md)
- [implementation-plan.md](./implementation-plan.md) Phase 15C
