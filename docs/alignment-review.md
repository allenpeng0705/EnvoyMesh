# Design ↔ implementation alignment review

This document records how **narrative requirements** ([UserStory.md](./UserStory.md)), the **structured backlog** ([scenarios.md](./scenarios.md)), and the **living plan** ([implementation-plan.md](./implementation-plan.md)) compare to the **current codebase** and [EMP](./protocol-standard.md).

**Purpose:** Confirm alignment, name gaps honestly, and avoid treating aspirational user text as shipped product.

**Major redesign:** When architecture shifts meaningfully, refresh this review and bump the snapshot date — see [redesign strategy](./redesign-strategy.md).

**Review snapshot:** 2026-05-20 (update when major milestones land).

---

## Executive summary

| Area | Alignment |
|------|-----------|
| **Identity, signed EMP, device certs, local profile** | **Strong** — matches Scenario 1 / US-A1 and the “identity first” pillar. |
| **P2P transport (TCP, Noise, Yamux), basic discovery** | **Partial** — matches “node body” and parts of Story F at the **transport** layer only. |
| **A2A tasks, mandates, journal, approvals, audits + correlation** | **Strong partial** — matches negotiation, policy, and observability stories for **two-party structured work**. |
| **Broadcast & kill (full narrative)** | **Partial** — local expiry, cancel closure, first **completed** result closure, and correlation in audits exist; **hop TTL**, **network-wide cancel**, **collect-N**, and **gossip fan-out** do not. |
| **Semantic / capability discovery** | **Weak** — design assumes gossip or DHT **topic** discovery + agent-card matching; code has **plumbing and schemas**, not the full **product flow**. |
| **Communication roles (chat vs agent vs data streams)** | **Shipped (15C)** — channel split + honest roles + **Assistant H2A lane** + Appendix D / wire semantics ADR. |
| **Voucher + verifiable chunked file transfer** | **Weak** — shared vault + search + policy direction match the *intent*; **voucher protocol** and **P2P verified chunk stream** are not implemented. |
| **Semantic firewall, Wasm agent, smart inbox / morning report** | **Weak / future** — envelope guard + audits exist; **LLM injection middleware**, **Wasm isolation**, and **consumer-grade inbox** are largely ahead of code. |
| **Trust mode / Phase 12 (`social.intro.*`, intro inbox, bond linkage)** | **Strong partial** — `@envoymesh/protocol` intents + **`bond.request`** optional refs shipped; node inbound + credential-bearing gate + Social Trust/inbox + gated **`mesh.intro.*`** tools; [EMP Appendix A](./protocol-standard.md#appendix-a-trust-mode-social-mediation-socialintro) + [US-TM1–TM4](./scenarios.md#epic-tm-trust-mode); Phase **F** hardening (`friendMatchingPreferencesSigned`, **`social.intro.*`** rate limits + nonce replay, **`bond.accept`** audits) + integration smoke (**`npm run smoke:local`**) shipped. |
| **Phase 13 actor disclosure & owner visibility** | **Strong partial** — [Epic AV US-AV1–AV4, AV7](./scenarios.md#epic-av--actor-disclosure--owner-visibility) shipped; US-AV5–AV6 blocked on **13C** / wire `report.create`. |

**Bottom line:** Implementation **aligns well** with the vision of a **local-first, signed, mandate-bound agent mesh with trust, vault, and correlated auditing**. It **does not yet align** with the most **differentiating mesh layers** in the user stories (scaled discovery, full broadcast semantics on the wire, complete role-mode coverage, commerce, multi-hop anonymity).

---

## Core scenarios (`UserStory.md`) vs implementation

| Scenario | User story asks for | Repo today | Verdict |
|----------|---------------------|------------|---------|
| **1 Identity birth** | Stable identity (directionally DID); all app messages signed; decentralized verify | Owner + device keys, device certificates, signed envelopes, `system.signal`; DID-style docs are directional | **Aligned** (crypto path); DID **document** not end-to-end product |
| **2 Blind discovery** | Minimal / hashed discovery; agent-card match | mDNS; optional DHT/bootstrap/relay/DCUtR; agent card **types** and card intents; **no** gossip topic discovery UX | **Design ahead of code** |
| **3 Broadcast & kill** | Hop TTL, expiry, correlation cancel, thresholds | Mandate `expiresAt`; optional `task.propose` `expiresAt`; `correlationId` + rich audit; `task-runtime-state.json` (cancel / satisfied / `closeOnFirstCompletedResult`); CLI flags — see Phase 4D in implementation plan | **Partial** |
| **4 Social handshake** | Bond + proof of context; policy; defer to owner | Trust store, bonds/policy, approvals; EMP **`bond.request`** payload + inbound path + CLI; **Trust mode**: **`social.intro.*`**, intro inbox / **`ownerCommitmentRef`** linkage on **`bond.request`** when approving intros ([scenarios.md](./scenarios.md) Epic TM); Phase **12 F** hardening + **`npm run smoke:local`** integration scenario | **Partial → strong partial** |
| **5 Intent-based file share** | Voucher; virtual view; CID-like chunks over P2P | `shared_vault`, indexing/search, vault audit, policy hooks | **Directionally aligned**; **not** voucher + verified **transfer** protocol |
| **6 Communication roles** | Roles; `/chat`, `/agent`, `/data` style split | Channel split + honest AI wire role + Activity feed (Phase **13**); agent-card orchestrator deferred | **Partial → strong partial** |

---

## Narrative journeys (`UserStory.md` stories A–F) vs implementation

| Story | Depends on | Repo today | Verdict |
|-------|------------|------------|---------|
| **A Trusted collaborator** | Pairing, primary↔satellite, remote vault-backed task | P2P + vault + tasks; **device pairing workflow** still largely planned | **Partial** |
| **B Shadow recruiter** | Scoped discovery broadcast, morning report UX | Tasks, audits, approvals, CLI/dashboard; **no** scoped discovery product | **Partial** (ops) / **weak** (discovery + report UX) |
| **C Privacy-preserving researcher** | Stranger policy, H2A channel, approvals | Policy + approvals + audit; **H2A** not a separate wire/product path | **Partial** |
| **D Multi-hop talent scout** | Recursive gossip, anonymity | Not implemented | **Not aligned** |
| **E Deal-maker** | Payments, vouchers, receipts | Not implemented | **Not aligned** |
| **F Crisis Envoy** | mDNS + “find DID on LAN” | mDNS and local TCP **work**; DID-targeted LAN discovery **not** a dedicated feature | **Half-aligned** |

---

## `scenarios.md` priority tiers (sanity check)

| Tier | Stories | Fit vs repo |
|------|---------|-------------|
| **P0** | US-A1, US-C1, US-G1, US-D2 | **Strong** — identity, correlation, audits, inbound rejects align with shipped work. |
| **P1** | US-C2, US-D1, US-F2, US-TM1–TM4, **US-AV1–AV4, US-AV7** | **Mixed** — US-C2 **partially** shipped; Trust mode **US-TM1–TM4** align with Phase **12**. **Phase 13** actor disclosure + Activity feed (**US-AV1–AV4, AV7**) shipped; US-AV5–AV6 deferred (**13C**). |
| **P2** | US-E1–E2, US-F1, US-F3–F4 | **Early** — vault/dashboard help; file **transfer** protocol and full chat/agent role split **not** there. |
| **P3** | US-B1–B2, US-F5, US-A2 | **Mostly future** — discovery at scale, LLM firewall, multi-device UX. |

---

## Document graph (how to use these files)

```text
UserStory.md          →  Vision + journeys + protocol pressure (narrative)
     ↓
scenarios.md          →  Epics + acceptance + explicit status
     ↓
implementation-plan.md →  Phased delivery + open questions
     ↓
protocol-standard.md   →  Normative EMP (what is really law)
```

**This file (`alignment-review.md`)** sits beside them as the **periodic audit**: when code or stories change materially, update the **snapshot date** and the tables above.

### Where open questions are tracked

This review names gaps; **resolved vs open vs backlog** Q&A is maintained in one place so status does not drift:

| Tracker | Purpose |
|---------|---------|
| [implementation-plan.md § Open questions](./implementation-plan.md#open-questions) | **Resolved or decided**, **Still open** (tables), and **Backlog** bullets. |
| [implementation-plan.md § Coverage vs UserStory and design docs](./implementation-plan.md#coverage-vs-userstory-and-design-docs) | Maps narrative pressure from UserStory / design docs to phases or explicit gaps. |

**Workflow:** When a gap in the tables above becomes actionable, add or update the matching **phase checkbox** or a row in **Open questions** / **Backlog** in the implementation plan. On the next alignment snapshot, reflect shipped vs planned changes in this file’s tables.

---

## Recommended next steps (engineering)

1. **Phase 15B (continued)** — operator sign-off row in [wan-connectivity-signoff.md](./wan-connectivity-signoff.md); QUIC on real hardware; richer WAN diagnostics.
2. **Phase 15A** — wire DHT capability topics to Search + broadcast substrate ADR.
3. **Phase 15C** — H2A Social channel + EMP optional role/channel ADR.
4. **Phase 15D** — SQLite gate metrics; Filecoin only if product confirms scope.
5. **Keep `UserStory.md` honest** — refresh alignment snapshot after each Phase 15 sub-ship.

---

## Changelog

| Date | Change |
|------|--------|
| 2026-05-20 | **Phase 15 complete + 15E scoping:** WAN sign-off ledger; parked backlog scope docs. |
| 2026-05-20 | **Phase 13 complete / Phase 14 start:** US-AV8 Activity filters; friend autopilot + knowledge syndication config; connectivity nightly CI; Pinata pinning stub. |
| 2026-05-19 | Phase **12 F**: Trust-mode hardening + **`npm run smoke:local`** intro→bond scenario; executive summary + Scenario 4 rows refreshed. |
| 2026-05-19 | Snapshot bump; executive summary + Scenario 4 + P1 tiers updated for **Phase 12 Trust mode** (EMP Appendix A, Epic TM **US-TM1–TM4**). |
| 2026-04-26 | Initial alignment review published. |
| 2026-04-26 | Linked canonical **Open questions** and **Coverage vs UserStory** trackers in [implementation-plan.md](./implementation-plan.md). |
