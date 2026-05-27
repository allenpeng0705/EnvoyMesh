# Parked scope — Multi-hop discovery & commerce (Stories D–E)

**Status:** Scoping (Phase 15E) — **not scheduled for implementation.**

**Stories:** [UserStory.md § Story D / E](./UserStory.md) · Epic alignment: discovery + task/mandate layers (no Epic yet in scenarios.md)

---

## Story D — Multi-hop talent scout

**User goal:** Find a rare capability via friends-of-friends without exposing the requester to every intermediate peer.

### Existing foundation

| Layer | Shipped |
|-------|---------|
| Direct bonds + trust tiers | `@envoymesh/bonds`, trust store |
| Trust-mode intros | Phase 12 `social.intro.*` |
| DHT capability topics | Phase 4F / 15A signed provider records |
| Relay broadcast substrate | Phase 8J `broadcast.request` fanout |
| Mandate bounds | `task.mandate`, TTL, `forwardToPeerIds` |

### Gaps before implementation

- **Recursive routing policy** — max hops, anonymity rules for intermediaries, referral proof format.
- **EMP intents** — likely extensions to `discovery.request` or new `discovery.forward` with signed hop chain; not normative yet.
- **Rate / abuse** — per-hop quotas distinct from single-hop anonymous discovery (Phase 8I).
- **UX** — Search/morning report shows 2nd-degree candidates; no “forward to my bonds” flow.

### Proposed first slice (when un-parked)

1. ~~Add scenario IDs **US-D1–US-D4** to [scenarios.md](./scenarios.md) with acceptance tests.~~ **Shipped:** Epic MH **US-MH1–US-MH4** (Story D).
2. Hop-limited `discovery.request` relay with owner approval for each forward tier. **Shipped (US-MH1):** hop fields, `requestMultiHopDiscovery`, `discovery_forward` approval, inbound forward queue.
3. Audit + Activity rows for each hop (`correlationId` stitches chain).

---

## Story E — Autonomous deal-maker

**User goal:** A2A purchase of a digital good under mandate spending caps with verifiable delivery.

### Existing foundation

| Layer | Shipped |
|-------|---------|
| Data transfer vouchers | Phase 5 `/envoymesh/data`, CID verify |
| Task negotiation | `task.propose` / `task.negotiate` / `task.result` |
| Approvals | Phase 9H queue |
| Local reputation | `task.feedback`, `PeerReputationStore`, `reputation-inbound.ts` |
| IPFS export | Phase 14D pin / publish |

### Gaps before implementation

- **Payment rail** — no stablecoin / fiat / escrow adapter; no `payment.*` EMP intents.
- **Receipt semantics** — no signed receipt linking payment → CID → task.result.
- **Atomic swap story** — voucher + payment ordering undefined.
- **Regulatory / policy** — owner jurisdiction, KYC, and refund flows out of scope until product legal review.

### Proposed first slice (when un-parked)

1. ~~**Receipt-only** path: signed `task.result` + vault CID attestation + Activity row (no money movement).~~ **Shipped (2026-05-27):** [commerce-receipt-stub-adr.md](./commerce-receipt-stub-adr.md).
2. Optional **payment mandate** schema extension behind feature flag.
3. Commerce stays **off** relay nodes; settlement only on normal nodes with owner approval.

---

## Decision

**Stay parked.** Do not add Phase 16 commerce until Story D routing privacy model is written and Story E payment scope is approved by product/legal.
