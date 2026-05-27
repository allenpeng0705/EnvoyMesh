# Phase 15E — Parked backlog (scoping index)

Items here are **explicitly not** Phase 15 exit criteria. Phase 15 (reach, H2A semantics, platform scale) is **complete** as of 2026-05-20. This index tracks **directional scoping** and **first slices** before any item becomes a numbered phase.

**Related:** [implementation-plan.md §15E](./implementation-plan.md#15e--parked-backlog-not-phase-15-exit) · [UserStory.md](./UserStory.md) · [alignment-review.md](./alignment-review.md)

---

## Status (2026-05-27)

| Item | Source | Scope doc | Status | Un-park when |
|------|--------|-----------|--------|--------------|
| Multi-hop routing, commerce, payment receipts | Stories D–E | [parked-multihop-commerce-scope.md](./parked-multihop-commerce-scope.md) | **US-MH1–4 shipped (partial MH4 morning report)** | Story E commerce receipts |
| Thin satellite mobile app | Story A / Phase 4A | [parked-satellite-app-scope.md](./parked-satellite-app-scope.md) · [satellite-app-adr.md](./satellite-app-adr.md) | **ADR accepted** (no separate app) | Reopen only if product requires constrained satellite binary |
| DID as first-class product identity | Scenario 1 | [parked-did-product-scope.md](./parked-did-product-scope.md) | **Bonded lookup shipped** | WAN resolver / import UX |
| Global reputation ledger | Prioritization | [parked-global-reputation-scope.md](./parked-global-reputation-scope.md) | **Read-only slice shipped** | Federation write path + anchor policy |
| Distributed state (loro / yjs) | Key Decisions | [parked-distributed-state-scope.md](./parked-distributed-state-scope.md) | **Wire sync shipped** | US-MH2+ / structured loro overlays |
| Full §4 two-NAT relay sign-off | Phase 15B | [wan-connectivity-signoff.md](./wan-connectivity-signoff.md) | **Automated baseline `[x]`** (2026-05-27) | Optional physical two-NAT LAN operator row |

---

## Principles (all 15E items)

1. **No central account server** — any ledger or sync layer must remain optional and owner-sovereign.
2. **Policy before wire** — new intents and economics require Bond Engine + mandate bounds before implementation.
3. **Local-first default** — global or shared state is an explicit opt-in, never required for core mesh operation.
4. **Relay stays lean** — relays do not execute commerce, store reputation, or run CRDT merge logic.

---

## Shipped first slices (2026-05-20)

| Slice | Evidence |
|-------|----------|
| DID presentation + bonded Search | `getOwnerDidPresentation`, Search **By DID**, `contact-owner-keys.json` |
| Reputation read path | `reputation-anchors.json`, `getPeerReputationSummary`, Contacts meta |
| yjs Assistant draft | `apps/social/src/lib/assistant-draft-crdt.ts`, localStorage persistence |
| yjs wire sync | `sync.state` payload, `sendSyncStateUpdate`, `crdt:sync` event, AIChatPanel |
| US-MH1 multi-hop | `maxHops`/`currentHop`, `requestMultiHopDiscovery`, `discovery_forward` approval |
| US-MH2 privacy + hop-2 relay | `forwardPrivacy: anonymous`, `referralOwnerId`, `discovery-privacy.ts`, async hop-2 merge |
| US-MH4 aggregation UX | `multihop-discovery-sessions.json`, `getMultiHopDiscoverySession`, Search live refresh |
| §4 staging | [wan-two-nat-staging-runbook.md](./wan-two-nat-staging-runbook.md), `scripts/wan-relay-signoff-staging.sh` — **green 2026-05-27** |
| Story D scenarios | Epic MH **US-MH1–US-MH4** in [scenarios.md](./scenarios.md) |
| Satellite decision | [satellite-app-adr.md](./satellite-app-adr.md) — single Capacitor app |
| Commerce stub ADR | [commerce-receipt-stub-adr.md](./commerce-receipt-stub-adr.md) |
| §4 automated helper | `apps/node/test/wan-relay-signoff-e2e.test.ts` (requires `TEST_RELAY_ADDR`) |

---

## Recommended un-park order (when product confirms)

1. **Multi-hop discovery (Story D / US-MH1)** — builds on Phase 15A DHT + Trust mode intros; commerce (Story E) stays last.
2. **Distributed state wire sync** — extend yjs spike to paired devices.
3. **DID WAN resolver/import** — partner integration.
4. **Global reputation federation** — only after local reputation UX is product-stable.
5. **Thin satellite app** — **closed** per ADR unless constraints change.

**Do not** count 15E toward phase completion until a dedicated phase section ships with exit criteria.
