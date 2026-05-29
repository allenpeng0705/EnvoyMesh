# Design ↔ implementation alignment review

This document records how **narrative requirements** ([UserStory.md](./UserStory.md)), the **structured backlog** ([scenarios.md](./scenarios.md)), and the **living plan** ([implementation-plan.md](./implementation-plan.md)) compare to the **current codebase** and [EMP](./protocol-standard.md).

**Purpose:** Confirm alignment, name gaps honestly, and avoid treating aspirational user text as shipped product.

**Major redesign:** When architecture shifts meaningfully, refresh this review and bump the snapshot date — see [redesign strategy](./redesign-strategy.md).

**Review snapshot:** 2026-05-28 (Phase 16 EnvoyAI postures + third-party schema bundle).

---

## Executive summary

| Area | Alignment |
|------|-----------|
| **Identity, signed EMP, device certs, local profile** | **Strong** — matches Scenario 1 / US-A1. |
| **P2P transport (TCP, Noise, Yamux), relay, WAN path** | **Strong partial** — shipped; operator sign-off in [wan-connectivity-signoff.md](./wan-connectivity-signoff.md). |
| **A2A tasks, mandates, journal, approvals, audits + correlation** | **Strong** — two-party structured work with correlated JSONL. |
| **Communication roles + channel split** | **Shipped** — Phase 13 + 15C; [Appendix D](./protocol-standard.md#appendix-d-h2a-product-channel--wire-semantics-phase-15c). |
| **Trust mode (`social.intro.*`, bond linkage)** | **Strong partial** — Phase 12 + smoke:local; [Appendix A](./protocol-standard.md#appendix-a-trust-mode-social-mediation-socialintro). |
| **Actor disclosure & Activity (Phase 13)** | **Shipped** — honest wire roles, Activity feed, per-domain notify. |
| **EnvoyAI standing postures (Phase 16)** | **Strong partial (desktop)** — `social_proxy`, `document_acquisition`, `capability_provider` on home node; mobile stubs; bridge deferred. |
| **Third-party EMP standardization** | **Strong partial** — [protocol-standard.md](./protocol-standard.md), [emp-implementers-guide.md](./emp-implementers-guide.md), JSON Schema in `packages/protocol/schemas/emp-0.1/`. |
| **Broadcast & kill (full narrative)** | **Partial** — local mandate expiry, cancel, collect-N closure; no gossip fan-out / hop TTL on wire. |
| **Semantic / capability discovery at scale** | **Partial** — DHT topic plumbing + Search UI; not full anonymous discovery product. |
| **Voucher + verifiable chunked transfer** | **Strong partial** — share + data channel + verification shipped for bonded pull path. |
| **Commerce, multi-hop anonymity, Wasm sandbox** | **Not aligned** — parked / future. |

**Bottom line:** The **reference desktop node** aligns with EMP for identity, trust, chat, knowledge, share, tasks, Trust-mode intros, and **Phase 16 autonomous postures**. Gaps are **mobile parity**, **bridge exposure of posture jobs**, **scaled discovery**, and **parked commerce/anonymity** narratives.

---

## Phase 16 (EnvoyAI) vs code

| Track | Spec | Desktop node | Mobile | Bridge |
|-------|------|--------------|--------|--------|
| **16A Protocol** | `mandate.posture`, `posturePolicy`, `postureRef`, `supportedCapabilities` | Shipped in `@envoymesh/protocol` | Schema-only | N/A |
| **16B Social proxy** | US-SP1–SP5 | E2E shipped | Stub | chat only |
| **16C Document acquisition** | US-DA1–DA5 | Worker + RAG negotiate + pull-share E2E | Stub | Deferred |
| **16D UI disclosure** | US-AV9 | Settings + honest wire | Partial | N/A |
| **16E Capability routing** | In-process planner + executor | E2E shipped | Stub | Deferred |

**Wire vs orchestration:** Peers interoperate via EMP intents. Route IDs (`document.published-library`, etc.) and `mesh.*` tools are **reference orchestration**, not a second protocol.

---

## Core scenarios (`UserStory.md`) vs implementation

| Scenario | Verdict (2026-05-28) |
|----------|----------------------|
| **1 Identity birth** | **Aligned** (Ed25519 path; DID directional) |
| **2 Blind discovery** | **Partial** — agent card + DHT topics; not full gossip UX |
| **3 Broadcast & kill** | **Partial** — local/runtime guards; not network-wide gossip |
| **4 Social handshake** | **Strong partial** — bonds + Trust mode + Phase 16 social proxy |
| **5 Intent-based file share** | **Strong partial** — share + verified data transfer on bonded path |
| **6 Communication roles** | **Shipped** — channel split + agent roles + Activity |

---

## Document graph

```text
UserStory.md           →  Vision + journeys
scenarios.md           →  Epics + acceptance
implementation-plan.md →  Phased delivery
protocol-standard.md   →  Normative EMP (law)
emp-implementers-guide.md → Third-party signing/channels/schemas
alignment-review.md    →  This periodic audit
```

---

## Recommended next steps (engineering)

1. **Mobile parity** — implement or explicitly defer Phase 16 postures on `MobileNode`.
2. **Bridge posture API** — only after [capability-route-executor.md § Bridge exposure](./capability-route-executor.md#bridge-exposure-deferred) criteria.
3. **Conformance vectors** — signed envelope fixtures at `packages/protocol/test/fixtures/emp-conformance/` (regenerate: `npm run generate-conformance-vectors -w @envoymesh/protocol`).
4. **Phase 4 WAN** — circuit relay / DCUtR field proofs per implementation plan.
5. **Keep docs honest** — archive superseded specs (e.g. [agent-communication-protocol.md](./agent-communication-protocol.md) → protocol-standard).

---

## Changelog

| Date | Change |
|------|--------|
| 2026-05-28 | **Phase 16 snapshot:** EnvoyAI postures on desktop; JSON Schema bundle; `knowledge.response.suggestedRelativePath`; implementer's guide; archived Phase 1 agent-communication doc. |
| 2026-05-20 | Phase 15 complete + 15E scoping. |
| 2026-05-20 | Phase 13 complete / Phase 14 start. |
| 2026-05-19 | Phase 12 F Trust-mode hardening. |
| 2026-04-26 | Initial alignment review. |
