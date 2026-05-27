# H2A wire semantics (Phase 15C)

Human↔agent (H2A) traffic splits into **local product turns** (Assistant UI) and **cross-peer EMP** intents. This doc is normative for Story C / Scenario 6.

## Protocol paths

| Path | Intents | Roles (typical) |
|------|---------|-----------------|
| `/envoymesh/chat/0.1.0` | `chat.message` only | human↔human, human↔agent, agent↔human (with credential when agent sends) |
| `/envoymesh/message/0.1.0` | All non-chat control/task/knowledge/discovery intents | Includes H2A `knowledge.query`, A2A `task.*`, `discovery.*`, `system.*` |
| `/envoymesh/data/0.1.0` | `share.chunk`, voucher bodies | After policy-approved transfer |

Enforcement: `@envoymesh/network` `validateEnvelopeProtocol()` — see `packages/network/test/chat-protocol-routing.test.ts`.

## Local H2A (no wire)

These run in-process on the home node when the owner uses **Assistant**:

| RPC | Activity kind | Domain |
|-----|---------------|--------|
| `runDocumentAgentTurn` | `knowledge_answered` or `task_progress` / `share_proposed` | `knowledge` / `home` |
| `knowledgeQuery` (fast vault path) | `knowledge_answered` | `knowledge` |

Rows appear in **Activity**; they are not sent as `chat.message` to a pseudo-contact.

## Cross-peer H2A (wire)

| Intent | When | Sender → recipient roles |
|--------|------|--------------------------|
| `knowledge.query` | Owner asks bonded peer's agent/vault | human → human (envelope to device; handler runs agent path) |
| `knowledge.response` | Reply with vault snippets | agent → human |
| `discovery.request` | Scoped metadata match | human → human or agent → human |

Policy: `@envoymesh/bonds` trust tier + rate limits on inbound handlers (`knowledge-query-inbound.ts`, `discovery-inbound.ts`).

## What is NOT H2A chat

- Long **agent↔agent** threads — use structured `task.*` / `agent.card.*` on `/message`.
- **Owner Activity** — local store only (`emitOwnerReport`, task journal hooks).
- **Assistant UI messages** — ephemeral session state in Social; persisted outcomes go to Activity.

## Code reference

Pure helpers: `packages/api/src/h2a-wire-semantics.ts`  
Tests: `packages/api/test/h2a-wire-semantics.test.ts`

## Related

- [emp-h2a-channel-adr.md](./emp-h2a-channel-adr.md) — optional envelope `channel` field decision (deferred)
- [protocol-standard.md](./protocol-standard.md) Appendix D
