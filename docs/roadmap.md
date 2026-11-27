# EnvoyMesh roadmap index (AI- and human-friendly)

**Purpose:** Short entry point so agents and humans do **not** need to load all of [`implementation-plan.md`](./implementation-plan.md).

**Rule:** Detailed design lives in **epic docs**. The living implementation plan keeps **Phase 50+ checklists + status**. Phases **0–49** are in [`implementation-plan-archived.md`](./implementation-plan-archived.md).

---

## How to use (for AI agents)

1. Read **this file** first for “what’s active / what’s next.”
2. Open the **epic design doc** for the phase you’re implementing.
3. Open only the matching `## Phase N` section in [`implementation-plan.md`](./implementation-plan.md) (Phases 50+).
4. For historical Phase 0–49 checklists, open [`implementation-plan-archived.md`](./implementation-plan-archived.md) — do **not** load both full files unless auditing.

When shipping: flip checkboxes in that phase section, add one **Changelog** row, refresh **Current Milestone** / this index if the active epic changed.

---

## Document roles

| Doc | Holds | Does not hold |
|-----|--------|----------------|
| [`roadmap.md`](./roadmap.md) (this file) | Active epic, next pulls, links | Long checklists |
| [`implementation-plan.md`](./implementation-plan.md) | Phase **50–68** checklists, milestone, changelog (recent) | Phase 0–49 detail |
| [`implementation-plan-archived.md`](./implementation-plan-archived.md) | Phase **0–49** historical checklists + older changelog | Active epic editing |
| Epic `*-plan.md` / `*-design.md` / repo-root `product_*.md` | Goals, invariants, protocol sketches, phased deliverables | Day-to-day checkbox churn |
| [`scenarios.md`](./scenarios.md) / [`UserStory.md`](./UserStory.md) | Acceptance stories | Implementation order |

**Pattern already used well:** ADB → [`ai-document-backbone-plan.md`](./ai-document-backbone-plan.md); FS → [`p2p-file-sharing-plan.md`](./p2p-file-sharing-plan.md); Market → [`p2p-market-plan.md`](./p2p-market-plan.md).

---

## Active / next (update when milestone moves)

| Status | Item | Design / checklist |
|--------|------|--------------------|
| **Active epic** | Phase 64D — AN release sign-off (automated 64–67 done; human per-OS / a11y / threat) | [`agent-network-release-checklist.md`](./agent-network-release-checklist.md) |
| **Next pull** | Phase 69 closeout polish (optional C1 chips / Market idle later) after **69A–D1** shipped during 64D | [Story P](./UserStory.md#story-p-dual-mode-autonomy) · [Epic 69](./scenarios.md#epic-69-dual-mode-autonomy) · [Phase 69](./implementation-plan.md#phase-69--dual-mode-envoyai-autonomy-chat--background) |
| Done | Phase 68 — Coding tab (Social **C1–C7** + EnvoyGo parity; **68-FH** waves 0–4) | [`../product_coding_tab_design.md`](../product_coding_tab_design.md) · [`implementation-plan.md` Phase 68](./implementation-plan.md#phase-68--coding-tab-social--envoygo) · [`family-harness-alignment-design.md`](./family-harness-alignment-design.md) |
| Done | Phase 67 — AN product UX | [`implementation-plan.md` Phase 67](./implementation-plan.md#phase-67--agent-network-product-ux-templates-chat--job-live-progress) |
| Done | Phase 66 — Fleet ops (66A/66B) | [`implementation-plan.md` Phase 66](./implementation-plan.md#phase-66--agent-network-fleet-ops-join-bond-lease-office--wan) |
| Done | Phase 65 — Orchestration power | [`implementation-plan.md` Phase 65](./implementation-plan.md#phase-65--agent-network-orchestration-power-depth-long-running-artifacts) |
| Done | Phase 64 — Multi-home reliability | [`implementation-plan.md` Phase 64](./implementation-plan.md#phase-64--agent-network-multi-home-reliability-remote-assigner-recovery) |
| Shipped | Phase 63 — Envoy Market | [`p2p-market-plan.md`](./p2p-market-plan.md) |
| Parked | Multi-hop MH deeper / payment rail | Story E |
| Historical | Phases 0–49 | [`implementation-plan-archived.md`](./implementation-plan-archived.md) |

---

## Epic catalog (open when relevant)

| Area | Design doc |
|------|------------|
| Coding tab (Social + EnvoyGo) | [product_coding_tab_design.md](../product_coding_tab_design.md) · [Phase 68 checklist](./implementation-plan.md#phase-68--coding-tab-social--envoygo) |
| Family harness alignment (EnvoyHome / EnvoyCoder learnings) | [family-harness-alignment-design.md](./family-harness-alignment-design.md) |
| Envoy Market (shop / P2P listings) | [p2p-market-plan.md](./p2p-market-plan.md) |
| Agent Network / Team jobs | [agent_network.md](./agent_network.md) · [agent-network-next-generation-design.md](./agent-network-next-generation-design.md) |
| Knowledge / RAG | [knowledge-base-and-rag.md](./knowledge-base-and-rag.md) |
| Document publish/find/share | [ai-document-backbone-plan.md](./ai-document-backbone-plan.md) |
| File share | [p2p-file-sharing-plan.md](./p2p-file-sharing-plan.md) |
| Trust mode / intros | [trust-mode-social-protocol.md](./trust-mode-social-protocol.md) |
| EnvoyGo | [satellite-app-adr.md](./satellite-app-adr.md) · [ADR-0002 social-lite dual persona](./adr/0002-envoygo-social-lite-dual-persona.md) · [wire compat](./envoygo-social-lite-wire-compat.md) · [archived Phase 31](./implementation-plan-archived.md) |
| Relays | [relay-server-design.md](./relay-server-design.md) · [HTTP/WS endpoints](./relay-http-endpoints.md) · [Capacity tuning](./relay-capacity-tuning.md) · [Add-relay runbook](./add-relay-runbook.md) · [Deployment / liveness](./relay_server_deployment.md) |
| Web content / Browser | [web-content-browsing-design.md](./web-content-browsing-design.md) |

---

## Naming collision note

**Phase 24 — Agent Marketplace** (shipped, archived) = agent negotiation / service mesh among agents.  
**Phase 63 — Envoy Market** = human shop listings + P2P search + commerce chat. Different products; do not merge docs.

---

## Changelog (this index)

| Date | Change |
|------|--------|
| 2026-11-27 | **Phase 69A–D1** shipped (tools, proxy digest, bonded shortlist, Autonomy chrome + EnvoyGo). Optional C polish remains. |
| 2026-11-26 | **Phase 69** next pull — dual-mode autonomy (Story P / Epic 69); 69A tool honesty starts alongside 64D. |
| 2026-11-24 | **Phase 68 shipped** — C0–C7 + **68-FH** P0–P2 (waves 0–4). Active epic → **64D** release sign-off. |
| 2026-11-24 | **Family harness alignment** design (P0–P2): learnings from EnvoyHome + EnvoyCoder for Ext Agent / Coding EH. [`family-harness-alignment-design.md`](./family-harness-alignment-design.md). |
| 2026-09-10 | **Phase 68 Coding tab** added to living plan; active epic → 68 (design locked, code not started). Design: [`product_coding_tab_design.md`](../product_coding_tab_design.md). |
| 2026-09-05 | **67C committed**; active epic → **64D** release sign-off (automated refresh + human rows). |
| 2026-09-05 | **67C complete** (creator mirror progress + multi-home UX). Phase 67 product UX exit met. |
| 2026-09-05 | **67B complete** (chat→team job eligibility-gated); next **67C**. |
| 2026-09-05 | **67A complete** (local templates Social + EnvoyGo light); next **67B**. |
| 2026-09-05 | **67-0 complete** (ownership extract); **67A** local templates next. |
| 2026-09-05 | Phase 67 started: 67-0 Fleet/Lease/probe extract before product UX (67A–67C). |
| 2026-09-05 | Active epic → Phase 64–67 Agent Network program (reliability first); Phase 63 Market marked shipped. |
| 2026-08-31 | Created; pointed Phase 63 Envoy Market as next product epic. |
| 2026-08-31 | MKT-F complete (sold/reserved soft close + payments ADR); Phase 63 Market closed. |
| 2026-08-31 | MKT-E complete (EnvoyGo capture→draft; seller FAQ replies); next MKT-F optional. |
| 2026-08-31 | MKT-A–D complete (DHT market:shop, block/report, stranger e2e, EnvoyAI shortlist); next MKT-E. |
| 2026-08-31 | MKT-A/B/C complete; next product step MKT-D (EnvoyAI shortlist). |
| 2026-08-31 | MKT-A/B complete; next product step MKT-C (public search). |
| 2026-08-31 | MKT-A complete; next product step MKT-B (bonds announce + inquire). |
| 2026-08-31 | Documented Phase 0–49 split into `implementation-plan-archived.md`. |
