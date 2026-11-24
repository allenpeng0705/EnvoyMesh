# Implementation Plan

Living plan for **active and recent** EnvoyMesh phases. Historical Phase **0–49** checklists live in [`implementation-plan-archived.md`](./implementation-plan-archived.md).

**Start here:** [`roadmap.md`](./roadmap.md) · **Market design:** [`p2p-market-plan.md`](./p2p-market-plan.md) · **Coding tab design:** [`../product_coding_tab_design.md`](../product_coding_tab_design.md) · **Family harness alignment:** [`family-harness-alignment-design.md`](./family-harness-alignment-design.md)

**Related:** [scenarios](./scenarios.md) · [UserStory](./UserStory.md) · [alignment-review](./alignment-review.md) · [protocol-standard](./protocol-standard.md) · [detailed-design](./detailed-design.md)

**For AI agents:** Read [`roadmap.md`](./roadmap.md) → epic design doc → only the relevant `## Phase N` section below. Use the [archived plan](./implementation-plan-archived.md) only when auditing old phases.

## Status Legend

- `[ ]` Not started
- `[~]` In progress
- `[x]` Done
- `[!]` Blocked or needs a decision

Maintenance: flip checkboxes when shipping; add one **Changelog** row; refresh **Current Milestone** and [`roadmap.md`](./roadmap.md). Keep narrative in epic docs, not here.

## On this page

- [User story traceability](#user-story-traceability)
- [Key Decisions](#key-decisions)
- [Current Milestone](#current-milestone)
- [Coverage vs UserStory](#coverage-vs-userstory-and-design-docs)
- [Open questions](#open-questions)
- [Historical phases 0–49](./implementation-plan-archived.md)
- [Phase 50 — Push notifications](#phase-50--push-notification-coverage-home-node--envoygo--shipped-50a--50b--deep-link)
- [Phase 51 — Family Network](#phase-51--family-network-multi-profile-private-social-network--51a51f-shipped)
- [Phase 52 — Collaboration roles](#phase-52--agent-network-collaboration-roles--assignment-modes)
- [Phase 53 — Artifact handoff](#phase-53--artifact-handoff--worker-stickiness)
- [Phase 54 — Envoy Local](#phase-54--envoyai-model-guidance--envoy-local-llamacpp)
- [Phase 55 — Ext Agent codex/claudecode](#phase-55--ext-agent-codex--claudecode-plan-b--daemon-supervisor)
- [Phase 56 — Ext Agent CLI pattern](#phase-56--ext-agent-cursor-agent--aider--mmx-one-shot-cli-pattern)
- [Phase 57 — Knowledge Base hardening](#phase-57--knowledge-base-production-hardening-markdown-first--anydoc-)
- [Phase 58 — Team jobs UX](#phase-58--team-jobs-ux-fleet-readiness-live-story-multi-node)
- [Phase 59 — Job input delivery](#phase-59--team-job-input-delivery-bytes-to-workers-not-vault-sync)
- [Phase 60 — AN deterministic execution](#phase-60--agent-network-deterministic-execution-provenance--recovery)
- [Phase 60.1 — Stabilize](#phase-601--stabilize-now)
- [Phase 61 — AN depth](#phase-61--agent-network-depth-hedged-wire-recovery-chaos-reliability-ux)
- [Phase 62 — Assigner intelligence](#phase-62--assigner-intelligence--capability-based-orchestrator-selection)
- [Phase 63 — Envoy Market](#phase-63--envoy-market-p2p-shop--search)
- [Phase 64 — AN multi-home reliability](#phase-64--agent-network-multi-home-reliability-remote-assigner-recovery)
- [Phase 65 — AN orchestration power](#phase-65--agent-network-orchestration-power-depth-long-running-artifacts)
- [Phase 66 — AN fleet ops](#phase-66--agent-network-fleet-ops-join-bond-lease-office--wan)
- [Phase 67 — AN product UX](#phase-67--agent-network-product-ux-templates-chat--job-live-progress)
- [Phase 68 — Coding tab](#phase-68--coding-tab-social--envoygo)
- [Changelog](#changelog-this-document)

## Current direction

EnvoyMesh is a TypeScript-first, owner-controlled, peer-to-peer agent network. Foundation through Phase 49 is **shipped** (see [archived plan](./implementation-plan-archived.md)).

**Active product epic:** [Phase 64D — AN release sign-off](#phase-64--agent-network-multi-home-reliability-remote-assigner-recovery) `[~]` (human per-OS / a11y / threat; automated 64–67 evidence refresh)

**Last shipped:** [Phase 68 — Coding tab](#phase-68--coding-tab-social--envoygo) `[x]` — Social **C1–C7**, EnvoyGo parity, **[68-FH](#68-fh--family-harness-alignment-envoyhome--envoycoder)** P0–P2 (waves 0–4). Prior: **Phase 67** AN product UX Wave 3.

**Still tracked in archive (not deleted):** Phase 26 DID WAN gateway, Phase 39 EnvoyAI calls, Phase 45F HTTP gateway, Phase 41 partial AN UX — open those sections in the archived file if you resume them.

## User story traceability

Shipped vs gap (see [alignment-review](./alignment-review.md) for narrative). Update **`[x]` / `[ ]`** when code or docs change.

| Theme ([UserStory.md](./UserStory.md)) | Primary phases | Shipped (`[x]`) · still missing (`[ ]`) |
|----------------------------------------|-----------------|----------------------------------------|
| Identity birth (Scenario 1) | 1, 4A, **15E** | `[x]` Signed envelopes, owner/device split, device certs · `[~]` DID presentation (`did:key` + Profile UI) · `[ ]` DID resolver/import product |
| Blind discovery (Scenario 2) | 4, **4E**, **WAN follow-on**, **4F** | `[x]` Transport discovery (mDNS, optional DHT/relay/DCUtR), Agent Card types, signed `discovery.request/response`, trust+rate-gated inbound handling, ranked digest baseline (`morning-report`) · `[ ]` global DHT capability “topic/provider” advertisement path (distinct from `discovery.request`); QUIC preference; richer narrative ranking/UX iteration |
| Broadcast & kill (Scenario 3) | 4B, **4D** | `[x]` Local mandate/propose expiry, cancel / satisfied, first completed result + `closeOnFirstCompletedResult`, `correlationId`, audits · `[x]` Hop TTL / gossip-wide cancel / collect-N (Phase 4D extended) |
| Social handshake (Scenario 4) | 2, 4B, 7, **12** | `[x]` Trust store, bonds/policy, approvals, mandates, A2A tasks, **EMP `bond.*` payloads + inbound bond path + CLI `bond.request`** · `[x]` **Design:** [Trust mode & bilateral social mediation](./trust-mode-social-protocol.md) · `[x]` Phase **12 A–F**: `@envoymesh/protocol` **`social.intro.*`** + **`bond.request`** refs; node inbound + Social Trust/inbox + **`mesh.intro.*`** tools + **`sendHello`** linkage + [EMP appendix](./protocol-standard.md#appendix-a-trust-mode-social-mediation-socialintro) + [Epic TM](./scenarios.md#epic-tm-trust-mode) + Phase **F** hardening (`friendMatchingPreferencesSigned`, **`social.intro.*`** rate limits + nonce replay, **`bond.accept`** audit) + integration smoke (**`trust-mode-intro-bond-flow.test.ts`**, **`npm run smoke:local`**) |
| Intent-based file share (Scenario 5) | 5, Scenario 6 pick | `[x]` Shared vault, indexing, search, policy hooks, audit · `[x]` Voucher + verified P2P chunk stream (`/envoymesh/data/0.1.0`) |
| Communication roles (Scenario 6) | Scenario 6 pick, **13** | `[x]` Required envelope roles, role-policy, channel split · `[x]` **Phase 13:** honest AI wire role, chat badges, Activity feed, A2A orchestrator ([Epic AV](./scenarios.md#epic-av--actor-disclosure--owner-visibility)) · `[ ]` **Phase 16D:** configurable UI disclosure (US-AV9) |
| **Story M** (delegated social presence) | **16**, **18** | `[x]` Social proxy runtime + standing mandate · `[x]` Assistant chat orchestration (Phase **18**) · `[x]` Human `bond.accept` inbound policy |
| **Story N** (document acquisition) | **16**, **18**, ADB | `[x]` Async acquisition worker + jobs · `[x]` ADB + library tools · `[x]` Assistant starts jobs from natural language (Phase **18**) |
| **Story O** (UI actor disclosure) | **16** | `[x]` Honest wire (Phase 13) · `[ ]` `showAgentBadges` / peer collapse settings |
| **Story A** (multi-device collaborator) | 4A, 5, 6, 7, **11**, **18**, **30** | `[x]` Mobile pairing + shared owner identity (Phase 11) · `[x]` **Phase 30:** **Remote home node** — phone uses **home** Terminals + EnvoyAI (PTY/LLM/vault on desktop/Tauri); mobile = UI + relay transport · `[ ]` Thin mobile / satellite app **parked** |
| **Stories B–C** (recruiter, researcher) | 4E, 2, 6, 7 | `[x]` Policy, approvals, audit, model path scaffolding · `[ ]` Discovery UX (**4E**), H2A wire path (**6**), morning report (**7**) |
| **Stories D–E** (multi-hop, deals) | **63** + MH | `[~]` **Envoy Market** shop/search/inquire → [p2p-market-plan.md](./p2p-market-plan.md) (**Phase 63**). Multi-hop MH deeper + payment rail remain parked ([commerce-receipt-stub-adr.md](./commerce-receipt-stub-adr.md) if present) |
| **Story F** (crisis / LAN) | 4, 4C | `[x]` mDNS, local TCP, correlated audits, optional P2P debug, owner-id LAN target resolution (`system.signal` owner→peer map) · `[ ]` live proofs outside CI (`Phase 4` `[!]`) |

## Key Decisions

- `[x]` Primary language: TypeScript.
- `[x]` Architecture style: P2P-first, no central social backend.
- `[x]` Privacy model: owner-controlled data and explicit shared vault.
- `[x]` Model strategy: local, cloud, and peer models are all allowed through policy.
- `[x]` Agentic topology: relay nodes stay lean; LLMs, vault RAG, tools, and agents run only on normal nodes.
- `[x]` Agentic protocol direction: reuse signed EMP intents (`knowledge.*`, `task.*`, `discovery.*`, `agent.card.*`, `bond.*`) instead of introducing a parallel JSON-RPC protocol.
- `[x]` Initial identity: Ed25519 signatures before DIDs.
- `[x]` Protocol standard: define EMP with owner identity, device identity, device certificates, node profiles, and core verbs.
- `[x]` A2A direction: Envoys act through signed mandates, Agent Cards, structured negotiation, and autonomous reporting.
- `[x]` Package manager: start with npm workspaces unless we decide to switch.
- `[x]` P2P stack: `js-libp2p` first, starting with TCP, Noise, Yamux, and mDNS.
- `[x]` AI runtime direction: `node-llama-cpp` for local models, with cloud and peer providers through the Model Router.
- `[x]` Sandbox direction: Wasm/WASI isolation later, with process boundaries first.
- `[x]` Distributed state direction: evaluate `loro` and `yjs` when shared social/task state is ready.
- `[x]` Decentralized identity direction: Ed25519 first, DIDKit/DIDs later.
- `[x]` Mobile v1 direction: ~~Thin UI Mode only; phone acts as secure UI/control channel to Primary Envoy.~~ **Superseded (2026-06-09):** Flutter thin-client rewrite as EnvoyGo. See [satellite-app-adr.md](./satellite-app-adr.md) and [Phase 31](./implementation-plan-archived.md#phase-31--flutter-thin-client-envoygo).
- `[x]` Terminals direction: **ship Slice 1 → 2 → 3 → 4** (manual home → mobile remote → Agent mode → EnvoyAI proxy); home = PTY/LLM; phone = UI after QR pair.
- `[x]` Terminals optional power-user paths (**after Slice 3**): external TmuxAI / herdr docs (30H/30J) — see [terminals-external-herdr.md](./terminals-external-herdr.md), [terminals-external-tmuxai.md](./terminals-external-tmuxai.md); Slices use **patterns only**, not binaries.
- `[x]` Trust mode social (design): Agents may assist introductions using tiered **owner-signed** profile disclosure; **`bond.*` tier upgrades remain human-committed**. Spec: [trust-mode-social-protocol.md](./trust-mode-social-protocol.md); implementation tracked as [Phase 12](./implementation-plan-archived.md#phase-12-trust-mode--bilateral-social-mediation-design-first).
- `[x]` EnvoyAI direction: **part of EMP (`emp/0.1`)** — standing **`posture` mandates**, honest wire + configurable UI disclosure; advertise via `supportedCapabilities` (not a separate protocol version). Spec: [protocol-standard § EnvoyAI](./protocol-standard.md#envoyai-ai-mediated-social-mesh).
- `[ ]` Storage: start with files for config, then add SQLite for records and audit.
- `[x]` P2P transport: start with local libp2p/mDNS after core schemas are stable.
- `[x]` First UI: developer CLI plus initial Electron dashboard for local operator tasks; richer composition flows later.

## Current Milestone

Milestone: **Phases 0–48 shipped for interop bridges** — Core protocol through Phase 47 Team job iteration + Phase 48 A2A/MCP bridges (48A–48D.5). Older banner detail (Phases 0–42 Voice/Agent Network stack) still applies as foundation. See [a2a-mcp-interop-design.md](./a2a-mcp-interop-design.md), [agent-network-iteration.md](./agent-network-iteration.md), [satellite-app-adr.md](./satellite-app-adr.md), and [agent_network.md](./agent_network.md).

**Last shipped:** **Phase 68 — Coding tab** `[x]` (C0–C7 + **68-FH** waves 0–4). Before that: **Phase 67** AN product UX Wave 3
(`[x]` 67-0 → 67C); Phases 64–66; Phase 63 Market.

**Active epic:** **Phase 64D — Agent Network release sign-off** `[~]`  
**Done (no longer active):** **Phase 68 — Coding tab** `[x]` — [product_coding_tab_design.md](../product_coding_tab_design.md) · [68-FH](#68-fh--family-harness-alignment-envoyhome--envoycoder)

### Next planning pulls

0. **Phase 68 — Coding tab** — **`[x]`** Social **C1–C7**; EnvoyGo Search palette, History filters, unified scheduler sheet (heartbeats + schedules), EH session task drawer.
1. **Phase 64D — AN release sign-off** — refresh automated evidence after 67; human per-OS / a11y / threat / Social+EnvoyGo spot-check.
2. **Phase 67 — AN product UX** — `[x]` 67-0 → 67C complete.
3. **Phase 66 — AN fleet ops** — `[x]` 66A/66B complete (+ review fixes).
4. **Phase 65 — AN orchestration power** — `[x]` 65A/65B/65C complete.
5. **Phase 64 — AN multi-home reliability** — `[x]` automated; human checklist → 64D.
6. **Phase 63 — Envoy Market** — `[x]` MKT-A–F done. Design: [p2p-market-plan.md](./p2p-market-plan.md).

### Phase 9 Architecture Overview

The agent runs on the **home node** (always-on computer), accessible via:
- **Mobile app** (owner on the go) → WebSocket connection
- **External agents** (OpenClaw/HomeClaw) → Local tools API (no libp2p direct access)
- **CLI** (direct on home computer)

Agent capabilities:
- Own peer identity derived from owner (via signed mandate)
- Reactive mode when owner is online, proactive mode when offline
- Maintains conversation sessions per contact
- Mimics owner's writing style (stealth mode)
- Proactive triggers based on time, events, topics
- All actions audited; sensitive actions require approval

### Archive (historical snapshot — narratives only)

**Do not infer Phase 9 status from this subsection.** Detailed exit criteria live in **[archived Phase 9](./implementation-plan-archived.md#phase-9-ai-augmented-agent)**.

The older **“next planning pulls”** list briefly showed **`[~]` on 9B–9F** while modules landed; daemon/runtime wiring for 9B–9J and **Phase 9 complete** followed in **[Changelog (this document)](#changelog-this-document)** (2026-05-07 — 2026-05-13). Treat those `[~]` lines as **historical backlog**, not current gaps.

**Source of truth** for shipped vs open work remains the **phase checklists** (`Phase 0`–`Phase 9`), **Open questions**, and **Coverage** below.

- `[x]` **Phase 8 complete:** real `knowledge.query` with vault+model routing, model provider config (mock/ollama/litellm/OpenAI-compatible/Anthropic-compatible), LLM chat drafts, capability manifests, contact-scoped matching, tool registry, sandbox hardening, anonymous discovery with queue, relay-assisted broadcast, local reputation + official credentials, bounded autonomy with kill switch.
- `[x]` **Docs:** `docs/scenarios.md`, `docs/UserStory.md`, `docs/alignment-review.md` in place as story / alignment spine.
- `[x]` **Monorepo bootstrap:** npm workspaces, `packages/protocol`, `packages/identity`, `packages/bonds`, `packages/network`, `apps/node` entry, first tests, two-node signed ping.
- `[x]` **Runtime slice:** EMP owner/device split, certified `system.signal`, Agent Card + mandate schemas, CLI (profile, audit, tasks, approvals, peers, vault), persisted trust store, `@envoymesh/local-store`, Social + Tauri (Electron retired); `npm run typecheck`, `npm test`, `npm run social:build && npm run node:build && npm run tauri:build` for native bundles.
- `[!]` **Live connectivity proofs** outside the default CI runner (mDNS / DHT / relay / DCUtR) — same as Phase 4 `[!]` items and [live-connectivity-testing.md](./live-connectivity-testing.md).
- **`[~]` Cross-network P2P readiness:** relay graph baseline is shipped; live multi-machine relay/DCUtR validation and operator defaults remain open ([scenarios](./scenarios.md), [alignment](./alignment-review.md)).

## Coverage vs UserStory and design docs

Periodic pass: compare this plan and [scenarios.md](./scenarios.md) to [UserStory.md](./UserStory.md), [alignment-review.md](./alignment-review.md), [detailed-design.md](./detailed-design.md), and [protocol-standard.md](./protocol-standard.md). The traceability table at the top of this file is the primary map; the bullets below call out **narrative pressure** that is easy to under-specify in phase checklists alone.

| Pressure (source) | In plan today? | Gap / where to track | Shipped (`[x]`) · missing (`[ ]`) |
|-------------------|----------------|----------------------|----------------------------------|
| Scenario 2 / Story B — **hashed or tag-scoped discovery** | Phase **4E** + **WAN follow-on** + **4F** | EMP `discovery.request/response` + inbound gates shipped (**`[x]`**). Global DHT capability topic/provider advertisements + QUIC preference remain **`[ ]`** (tracked explicitly to avoid conflating protocols). | `[~]` |
| Scenario 3 / US-C2 — **hop TTL, gossip cancel, collect-N** | Phase **4D** + 4D follow-on | TTL enforcement in guard, peer tracking in journal, auto-populate forwardToPeerIds on cancel, relay fan-out for task.cancel, collect-N threshold met. | `[x]` |
| Scenario 3 — **local expiry / cancel / first result / correlation** | Phase **4D** + 4C | CLI + `task-runtime-state` + audits. | `[x]` |
| Scenario 4 — **bond + proof-of-context on wire** | Phase **4B** Batch 6 + 2 / 4A | Batch 6 **`[x]`**; trust/approvals + policy today. | `[x]` |
| UserStory / Scenario 4 — **Trust mode (agent-assisted intros, human bond commit)** | **Phase 12** + [trust-mode-social-protocol.md](./trust-mode-social-protocol.md) | Design **`[x]`** · protocol + runtime/UI/tools **`[x]`** · EMP appendix + scenario IDs (**Phase E**) **`[x]`** · Phase **12 F** hardening + intro→bond integration smoke **`[x]`** | `[x]` |
| Scenario 5 — **vault path** | Phase 5 | Indexing, policy, audit. | `[x]` |
| Scenario 5 — **voucher + verified P2P chunk stream** | Phase 5 + Scenario 6 pick | `/envoymesh/data/0.1.0` voucher + chunk stream shipped. | `[x]` |
| Scenario 6 — **roles, `/chat` `/agent` `/data`** | Scenario 6 pick + **Open questions** | Strict roles + `/chat`/`/message`/`/data` split baseline shipped; **H2A Assistant product channel** + Appendix D + wire semantics ADR (Phase **15C**). | `[x]` |
| Story A — **pairing + thin mobile** | Phase **4A**, **31** | Pairing + offline defer baseline **`[x]`**; thin mobile rewrite as EnvoyGo **`[x]`** (Phase 31 31A–31H shipped, 31I push notifications stubbed). | `[x]` |
| Story A — **offline primary, defer / notify** | Phase **4A** | Baseline defer + owner surface in approval/audit path; richer notify/retry UX later. | `[~]` |
| Story B — **morning report / ranked discovery UX** | Phase **7** | Morning report digest baseline in dashboard + CLI. Relay graph routing now supplies bounded relay-reachability lookup beneath higher-level discovery. | `[x]` |
| Story C — **H2A as distinct channel** | Scenario 6 pick + Phase 8 | Phase 8A real `knowledge.query` path shipped; **Assistant** lane + local Activity on H2A turns (Phase **15C**). | `[x]` |
| Agent stories — **interest/book/stranger/E2EE buffer** | Phase 8 + bonds/policy | Agentic next-step design **`[x]`** · direct/contact LLM workflows **`[x]`** · anonymous discovery/broadcast **`[x]`** | `[x]` |
| **Story M — social proxy** | **Phase 16** + 12/14 | Design **`[x]`** ([EMP § EnvoyAI](./protocol-standard.md#envoyai-ai-mediated-social-mesh)) · runtime loop **`[ ]`** | `[ ]` |
| **Story N — document acquisition** | **Phase 16** + ADB | ADB layers **`[x]`** · async orchestrator **`[ ]`** | `[~]` |
| **Story O — UI disclosure** | **Phase 16D** + 13 | Honest wire **`[x]`** · badge collapse settings **`[ ]`** | `[~]` |
| Story F — **DID-targeted LAN discovery** | Phase **4** | LAN identity match by owner-id target resolution **`[x]`**; live proofs **`[!]`** | `[~]` |
| **Semantic firewall** (UserStory + US-F5) | Phase **6** | `evaluateSemanticFirewall` + `routeModelRequest` integration. | `[x]` |
| **`knowledge.query` handler** | Phase 3 + **Phase 8A** | Inbound mock + CLI; EMP payload schema in protocol **`[x]`** · real policy-gated vault + model + signed `knowledge.response` path **`[x]`**. | `[x]` |
| **Agentic normal node / LLM first** | **Phase 8** | Design captured in [Agentic next step](./next-step.md); all 8A–8L sub-phases complete (knowledge.query, chat assist, capability matching, tool registry, sandbox, anonymous discovery, broadcast, reputation, bounded autonomy). | `[x]` |
| **Distributed state (`loro` / `yjs`)** | Key Decisions | Direction only; no build checkbox. | `[ ]` |
| Tooling / persistence | Key Decisions + detailed-design | SQLite Key Decision **`[ ]`**. | `[~]` |

## Open questions

**How to maintain this section:** When a question is answered, move it to **Resolved or decided** with a one-line outcome and a pointer (PR, doc section, or Key Decisions). Keep **Still open** short and decision-shaped. Large features that are not one-liners belong in **Backlog (framed in scenarios)** or in phase checklists.

### Resolved or decided

| Status | Topic | Outcome | Where to look |
|--------|-------|---------|----------------|
| `[x]` | Language, architecture, privacy, model strategy | TypeScript; P2P-first; owner vault; policy-gated local/cloud/peer models | Key Decisions |
| `[x]` | Protocol v1 shape for core mesh | EMP: signed envelopes, owner/device split, mandates, task lifecycle, reports | Phase 1, [protocol-standard.md](./protocol-standard.md) |
| `[x]` | P2P baseline stack | `js-libp2p`; TCP, Noise, Yamux, mDNS first; optional DHT, relay, DCUtR | Phase 4, `packages/network` |
| `[x]` | **npm vs pnpm (near term)** | **Ship with npm workspaces**; pnpm is a later migration if monorepo pain justifies it | Key Decisions |
| `[x]` | **SQLite vs “Phase 1”** | **SQLite not part of Phase 1 protocol/identity**; **local-store is JSONL + JSON files** until query/reporting needs justify SQLite | Key Decisions (storage line), [detailed-design.md](./detailed-design.md) (open implementation decisions) |
| `[x]` | **Local “when do we stop work on a task?”** | Mandate + propose **wall-clock expiry**, **`task.cancel`**, **satisfied** after first **completed** `task.result` when `closeOnFirstCompletedResult`, persisted **`task-runtime-state.json`**, **`correlationId`** in envelopes and audit | Phase **4D**, [scenarios.md](./scenarios.md) US-C2 / US-C3 partial |
| `[x]` | AI runtime local default | `node-llama-cpp` direction for local models | Key Decisions |
| `[x]` | Agentic topology | Relay nodes remain lean; normal nodes host LLM, vault, tools, OpenClaw/HomeClaw adapters, policy, approvals, and audit | Key Decisions, [Agentic next step](./next-step.md) |
| `[x]` | Agentic protocol shape | Reuse signed EMP envelopes/intents; do not introduce a separate JSON-RPC base protocol for node-to-node agent traffic | Key Decisions, [Agentic next step](./next-step.md) |
| `[x]` | Mobile v1 | Thin UI Mode; explicit deferral of full mesh on phone | Key Decisions, Phase 4A |
| `[x]` | First operator UI | Developer CLI + Electron dashboard shell | Phase 7 |

### Still open

| Status | Topic | Why it matters | Notes |
|--------|-------|----------------|-------|
| `[ ]` | **pnpm migration** | Repo scale, install determinism | Discretionary; no trigger metric locked. |
| `[~]` | **SQLite introduction** | Audit/query/reporting at scale | Gate and triggers in [sqlite-adoption.md](./sqlite-adoption.md); migration TBD when thresholds met. |
| `[ ]` | **libp2p `PeerID` vs Envoy cryptographic identity** | Discovery logs, multi-key stories, DID mapping | Still open in [detailed-design.md](./detailed-design.md); affects addressing docs. |
| `[ ]` | **Cloud model providers (first)** | Vendor keys, compliance, rate limits | `packages/models` is pluggable; product default unset. |
| `[ ]` | **Default policy for redacted / non-public context to cloud** | Story C and semantic firewall | Tied to approvals + redaction pipeline; not normative in EMP yet. |
| `[x]` | **First real model provider default** | Phase 8A/8B needs a predictable dev path | Mock provider for tests is clear; Ollama runbook exists at `docs/run-local-model.md`; product default (Ollama vs LiteLLM vs node-llama-cpp) still open. |
| `[ ]` | **Anonymous discovery default** | Determines whether strangers can reach normal-node matching at all | Phase 8H proposes `off`, `contacts-only`, `public-preview`, `public-auto-answer`; default should likely be conservative. |
| `[ ]` | **First broadcast substrate** | Broadcasting can be contact fanout, relay-assisted fanout, DHT provider records, or gossipsub | Defer until Phase 8I after direct/contact flows are verified. |
| `[ ]` | **External agent adapter contract** | OpenClaw/HomeClaw should extend EnvoyMesh without bypassing policy | Phase 8G should define local API boundary before real integration. |
| `[ ]` | **Official feature-node credential format** | Needed for official relays/domain experts without central accounts | Phase 8K; likely signed credentials from configured trust anchors. |
| `[ ]` | **Broadcast termination on the wire** — hop TTL, **network-wide** cancel propagation, **collect-N** (`k > 1`), correlation-only cancel | Scenario 3, US-C2/US-C3 | Phase 4D is **per-receiver local** only; fan-out EMP/gossip shape TBD. |
| `[x]` | **Sender / receiver role** (human vs agent) | Scenario 6, UserStory header sketch | Required envelope roles and strict validation shipped with channel split (`/chat` vs `/message`); violations are rejected in schema/runtime/network send paths. |
| `[ ]` | **Live mDNS / DHT / relay proofs outside CI** | Story F, wide-area connectivity | Blocked on environment; [live-connectivity-testing.md](./live-connectivity-testing.md). |
| `[~]` | **WAN bootstrap/relay operating model** | Real cross-network P2P (not LAN-only) | Relay protocol/runtime baseline shipped: local relay roster, relay book, relay summaries, summary-guided forwarding, loop/negative-cache controls, relay health checks, supervisor recipes, `relay-status`, and dashboard Relay Manager. Still open: live relay/DCUtR/AutoNAT validation, operator fleet defaults, and heavier multi-process smoke. |

### Backlog (track in scenarios / phases, not as single-line Q&A)

- `[x]` **Phase 4E** — semantic discovery baseline (Scenario 2, Story B, US-B1).
- `[~]` **Phase 4A** — device pairing; primary-offline defer / owner surface baseline shipped. *Thin mobile channel: **parked** (see Prioritization).*
- `[x]` **Scenario 6 vertical (first)** — voucher + `/envoymesh/data` shipped (Scenario 5).
- `[x]` **Scenario 6 vertical (next baseline)** — explicit role fields + strict `/chat` vs `/message` split with rejection semantics.
- `[x]` **Phase 8** — agentic normal node roadmap (`knowledge.query` path, chat assist, manifests, tool registry, sandbox, discovery/broadcast, reputation trajectory, autonomy controls); see [archived Phase 8](./implementation-plan-archived.md#phase-8-agentic-normal-node-llm-first).
- `[~]` **Cross-network P2P rollout** — WAN-first profile, bootstrap/relay strategy, relay graph routing, diagnostics, and non-LAN smoke.
- `[x]` **Phase 13** — A2A routing, actor disclosure, owner Activity feed ([a2a-actor-visibility-plan.md](./a2a-actor-visibility-plan.md); Epic AV **US-AV1–AV8**).
- `[x]` **Phase 14** — friend autopilot + knowledge syndication + WAN CI signal + external pinning.
- `[x]` **Phase 15** — reach, H2A semantics, platform scale ([Phase 15](./implementation-plan-archived.md#phase-15-reach-semantics--platform-scale)).
- `[~]` **Stories D / E** — **Phase 63 Envoy Market** designed ([p2p-market-plan.md](./p2p-market-plan.md)); multi-hop deeper + payment rail still parked.
- `[x]` **Optional vault / IPFS** — content-addressing + owner-approved Kubo export, discovery CID, gateway verify ([external-distribution-ipfs-plan](./external-distribution-ipfs-plan.md) F1–F4); Filecoin later.

---


## Historical phases (0–49)

Full checklists moved to **[`implementation-plan-archived.md`](./implementation-plan-archived.md)**.

| Range | Notes |
|-------|--------|
| 0–9 | Protocol, bonds, P2P, vault, models, agentic node, Phase 9 agent |
| 10–11 | HomeClaw bridge; Capacitor mobile (**legacy / removed product path**) |
| 12–30 | Trust mode through Terminals |
| 31–49 | EnvoyGo, Agent Network 32–48, Pi |

---

## Phase 50 — Push Notification Coverage (home node → EnvoyGo) **`[x]` shipped (50A + 50B + deep-link)**

**Goal:** Every message the user cares about — direct chat, group chat, EnvoyAI replies, Ext Agent replies, Pi responses + tool requests, bond requests, approval items — should trigger a push notification to EnvoyGo when the user is backgrounded. Today only 3 of 10 sources push, and the most important one (direct chat) was broken in production.

**Authoritative design:** [push-notification-coverage.md](./push-notification-coverage.md)

**Design decisions (2026-07-28):**

| Decision | Rationale |
|---|---|
| Pushes fire only when EnvoyGo has no active WS (skip-if-online) | Matches the call path; prevents double-notification (WS in-app + system push). Uses `wsServerForEvents.hasClientForOwner`. |
| All pushes target one ownerId (the home owner) | EnvoyGo pairs to one home; no fan-out. Each member's home handles its own owner. |
| Reuse `dispatchChatPush` payload shape where possible | The `data` block already carries `threadType`/`messageId`/`senderOwnerId`/`roomId` — enough for deep-link routing without schema changes. |
| Deep-link routing is a separate workstream | Server already sends routing fields; the client-side subscriber is the gap. Phase 50 covers the server; deep-link wiring is its own slice. |

### 50A — Unified push listener + highest-priority fixes **`[x]` shipped 2026-07-28**

**Design pivot:** instead of 8 per-source slices, ONE unified `chat:message` listener on NodeServiceImpl catches all chat sources (direct, group, EnvoyAI, Ext Agent, Pi). Sources stay decoupled — they just emit messages as they do today.

- `[x]` **Bond request dead code fixed.** `dispatchBondPush` was fully implemented but had zero call sites. Wired into the `hello:request` callback at `index.ts:2314` with skip-if-online gate.
- `[x]` **Unified `chat:message` listener** added to NodeServiceImpl constructor. Catches direct chat, group chat, EnvoyAI replies, Ext Agent replies — all in one place. Skip-if-online gate prevents double-notification when EnvoyGo has an active WebSocket.
- `[x]` **`pi:proposal` listener** added for Pi tool-action request pushes.
- `[x]` **Pi `sendToPi` emits `chat:message` on completion** so the unified listener catches Pi responses too.
- `[x]` Removed the per-source `dispatchChatPushIfOffline` hook from Slice A (replaced by the unified listener — cleaner, catches more sources).
- `[x]` **`isOwnerOnline()` bug fixed.** The push gate was checking AI status settings (not WS connectivity) → always returned `true` → pushes NEVER fired. Fixed to use `_thinClientOnlineCheck` (hasRecentlyActiveClientForOwner). This was the critical fix that made push actually work.
- `[x]` **Pi `sendToPi` emits `push:message`** (not `chat:message`) to avoid polluting the chat UI / Inbox.
- `[x]` **In-app push toggle** (`PushPreferences`) in Me → Preferences — users can turn pushes on/off within the app.

### 50B — Server-side completion `[x]` shipped

- `[x]` **Approval-queue push.** `bindApprovalQueue` now diffs for newly-added pending items on `onChange`; items added in the last 60s trigger `dispatchApprovalPush` when the owner is offline. Seeded on bind (no startup flood); pruned on resolve.
- `[x]` **Token cleanup.** `sendAndCleanup()` wraps all `sendApns`/`sendFcm` calls. Unregisters on APNs 410 (Unregistered) and FCM 400/404 (bad token format). All dispatch methods use it.
- `[x]` **Feed push skip-if-online.** `index.ts` feed push handler now gates on `isOwnerOnline()`.
- `[x]` **Path B chat push skip-if-online.** Legacy desktop path at `index.ts:1904` now also gates on `isOwnerOnline()`.
- `[x]` **Bond push `senderOwnerId`** added to payload for deep-link routing.
- `[x]` **`dispatchApprovalPush`** (new method) — payload carries `{ type: "approval", itemId }`.
- `[x]` **Push credential config file** — `push-config.json` in profile dir for DMG builds (env vars still take priority). Relative path resolution for `.p8` keys. Bundled into DMG via `stage-bundle-node-runtime.sh/.ps1`.

### Deep-link navigation (client-side) `[x]` shipped

- `[x]` EnvoyGo: `GlobalKey<NavigatorState>` on `EnvoyGoApp`; `_routeNotificationTap` in `main.dart` subscribes to `onNotificationTap`.
- `[x]` Map payload → screen: `{threadType, senderOwnerId}` → `ChatDetailScreen`; `{type: "feed_notify", url}` → `BrowserScreen`; `{type: "bond_request"}` → Inbox tab; `{type: "approval"}` → Inbox tab; `{type: "pi_proposal"}` → Pi chat thread.
- `[x]` `getInitialMessage()` for Android cold-launch — buffered as `_pendingInitialTap`, replayed via `consumePendingInitialTap()` after the subscriber attaches.
- `[x]` Cold-start race fixes: `PushNotificationService().initialize()` moved to `main()` before `runApp()` so `getInitialMessage()` resolves before `initState` drains the buffer. `_pendingColdStartTap` buffers taps when `activeNode` is null; replays after `loadPairedNodes()` completes.
- `[x]` Listener cleanup: `_pushTapSub` stored + cancelled in `dispose()`.
- `[x]` Server: `senderOwnerId` + `senderName` added to `dispatchBondPush` + `dispatchChatPush` payloads for deep-link routing.
- `[ ]` Add foreground push handling (`FirebaseMessaging.onMessage` listener → in-app banner) — **deferred** (cosmetic; WS event reaches the app when foregrounded).
- `[ ]` Optionally register `envoy://` as a system-openable scheme (universal links / app links) — **deferred** (different feature; tap routing works without it).

### Remaining (UX polish, not blocking) `[ ]`

- `[ ]` **Notification channels** (Android) / interruption levels (iOS) — distinguish direct message (active) from feed update (passive).
- `[ ]` **Badge count management** — server sends static `badge: 1`; app doesn't clear on foreground.
- `[ ]` **Per-contact mute / global quiet-hours / DND.**
- `[ ]` **Foreground push banner** (in-app notification when app is open).

### Exit Criteria (Phase 50 overall)

- `[x]` Direct chat, group chat, bond request, EnvoyAI reply, Ext Agent reply, Pi response + tool-action all push when EnvoyGo is backgrounded (unified listener).
- `[x]` No push fires when EnvoyGo has an active WebSocket (skip-if-online for all paths — `isOwnerOnline()` fixed to check WS connectivity, not AI status).
- `[x]` Stale tokens are cleaned up on APNs 410 / FCM 400+404 (sendAndCleanup).
- `[x]` Approval items push (`dispatchApprovalPush` + onChange diff).
- `[x]` Tapping a push navigates to the relevant screen (deep-link routing in `main.dart`; cold-start + activeNode race fixed).
- `[x]` Push credential config (`push-config.json`) for DMG builds (env vars + config file + bundle staging).
- `[x]` In-app push toggle (Me → Preferences → Push notifications on/off).
- `[ ]` Per-thread / per-contact mute + global DND available (deferred — UX polish).

---

## Phase 51 — Family Network (multi-profile private social network) **`[x]` 51A–51F shipped**

**Goal:** Turn one EnvoyMesh home node into a **private family social network**. The home computer becomes a personal server — family members pair their phones via EnvoyGo, get their own profiles, chat with each other, talk to AI, and share nothing with Big Tech. No cloud. No subscription.

**Authoritative design:** [family_network.md](./family_network.md)

**Core idea:** One home node, multiple profiles. The **owner** keeps the **full current EnvoyMesh product**. **Family members** get a focused subset: EnvoyAI, character bots, Ext Agent **chat**, family direct + group chat, push. No terminal, Pi coding agent UI, vault, external mesh contacts, or infrastructure settings.

**Design decisions (2026-07-30, revised):**

| Decision | Rationale |
|---|---|
| Profiles are lightweight, local-only identities (not mesh DIDs) | Family members don't need P2P identity — the home node is their server |
| No profile switching | Device locked to one profile at pairing. Your phone = your stuff |
| Family contacts derived from `family-profiles.json` — **not** the mesh trust store | Avoids synthetic `family:*` peers and `BondLevel: "family"`. Trust store stays owner mesh-only, unchanged |
| Owner = full features; family = AI + Ext Agent chat + family chat + push | Cuts inbound mesh profile-routing and OS isolation work |
| Family invite QR ≠ normal pairing QR | Prefer Phase 35A invite lifecycle with `kind: "family"` |
| Family messages are local-only (no mesh) | Instant; home node is the family server |
| Family groups are family-only (no mesh members in the same room) | Avoids mixing `memberProfileIds` with wire `memberOwnerIds` |
| Model config shared; secrets stripped from non-owner config sync | One API key; non-owners must not receive credentials |
| Bots per-profile | Private — Dad's bots ≠ Mom's bots |
| EnvoyGo thin-client only | Phase 11 shared-identity mobile stays "owner's other device," not a family profile |

**Estimate:** ~8 days (51A–51F).

### 51A — Profile model + pairing `[x]`

**Server side:**
- `[x]` `packages/local-store/src/family-profile-store.ts` — CRUD for `FamilyProfile[]` → `<profileDir>/family-profiles.json` (mode `0600`, atomic rename). Methods: `list()`, `get(id)`, `create(...)`, `rename`, `setAvatarColor`, `deactivate`, `delete`, `getOwner()`.
- `[x]` `packages/api/src/family-profile.ts` — `FamilyProfile`, invite helpers, `familyThreadKey(a, b)`, `isFamilyThreadKey`, `threadVisibleTo` stub (filled in 51B/51C).
- `[x]` Export from `packages/api/src/index.ts`.
- `[x]` `ws-protocol.ts` / `node-service.ts` — RPCs: `createFamilyProfile`, `updateFamilyProfile`, `deleteFamilyProfile`, `generateFamilyInviteToken`, `listFamilyProfiles`; surface `familyProfiles` on `NodeConfig` (read path). Dedicated RPCs + owner guard (not writable via `updateNodeConfig`).
- `[x]` Implement RPCs in `node-service-impl.ts` + `json-rpc-router.ts`; wire list into `getNodeConfig`.
- `[x]` `session-token-store.ts` — add `profileId?: string` (+ prefer client `deviceId` UUID). Backfill missing `profileId` → owner profile id on WS connect.
- `[x]` `pairThinClient` — bind `profileId`; family-invite path creates/selects non-owner profile; reject creating a second owner.
- `[x]` `ws-server.ts` — attach `profileId` from session to RPC context (`runWithRpcCaller`).
- `[x]` `requireOwnerProfile(session)` — apply to: `updateNodeConfig`, company invites, family admin RPCs. (Terminal/Pi/vault/bond guards continue in later slices as those paths are touched.)
- `[x]` First-boot migration: create owner profile if `family-profiles.json` missing.
- `[x]` Config sync: broadcast `familyProfiles` metadata; **strip model API keys / secrets** for non-owner sessions (`redactNodeConfigForCaller` + per-client `home:config-updated`).
- `[x]` `packages/mobile-node` — proxy stubs for new RPCs.
- `[x]` Company invite `kind?: "company" | "family"` for family invite tokens.

**EnvoyGo:**
- `[x]` Dart RPC wrappers for the 4 family RPCs.
- `[x]` Pairing confirm: family invite → name + avatar form (or select existing); normal QR → owner profile.

### 51B — Thread namespacing + data isolation `[x]`

**Server side:**
- `[x]` Namespace EnvoyAI / bots / Ext Agent threads with `:<profileId>` from session (`sendToOpenClaw`, `sendToAiBot`, `sendToBridge`).
- `[x]` `listChatHistory` / thread listing: resolve keys via profile session; migrate bare `__envoy_ai__` → `__envoy_ai__:owner` on read when missing; enforce `threadVisibleTo` ACL.
- `[x]` Migrate `node-config.aiBots` → owner profile's `aiBots` in `family-profiles.json`.
- `[x]` Push: `PushTokenRecord.profileId`; dispatch by profile; `isProfileOnline(profileId)` + `wsServer.hasClientForProfile(profileId)`.
- `[x]` Profile-scoped live WS: `emitEventToProfile` + `chat:message` routing (AI/bot/bridge/family).
- `[x]` Owner-only RPC gate expanded for mesh chat / bonds / vault library reads.
- `[x]` **No** per-profile vault for family (vault remains owner-only via 51A guard).
- `[x]` Mesh DM / mesh room / Pi coding threads: **unchanged keys**, owner-only access.

**EnvoyGo:**
- `[x]` Chat provider loads AI/bot/bridge history with profile-scoped keys (server is source of truth from session).

### 51C — Family contacts + direct chat `[x]`

**Server side:**
- `[x]` **Do not** modify trust store schema. No `family:*` peerOwnerIds, no `level: "family"`.
- `[x]` Family contact list = other active rows in `family-profiles.json` (clients sync from config).
- `[x]` `sendFamilyMessage({ toProfileId, text })` — thread `family:<sorted(a,b)>`; persist; `emitEventToProfile`; push if offline.
- `[x]` `ws-server.ts` — `emitEventToProfile(profileId, event, data)`.
- `[x]` Presence: `lastSeenAt` + `isProfileOnline(profileId)`.
- `[x]` Deactivate profile → `active = false`; stays listed for history; appears offline.
- `[x]` Mesh inbound chat: **no profile routing** — continues to deliver to owner sessions only (existing behavior).

**EnvoyGo:**
- `[x]` `ChatThreadType.family`, `sendFamilyMessage`, `syncFamilyContacts(profiles)`.

### 51D — Family group chat `[x]`

**Server side:**
- `[x]` Family rooms: local store with `memberProfileIds` (separate from mesh `memberOwnerIds` rooms, or a clear `kind: "family"` discriminant). Filter `list` by membership. Emit to member profiles' WS sessions only.
- `[x]` Do **not** mix family profiles into mesh room sync payloads.

**EnvoyGo:**
- `[x]` Create Group picker: family contacts only for non-owners; owner may keep existing mesh group UI separate from family groups.

### 51E — EnvoyGo UI `[x]`

- `[x]` Pairing profile form (if not fully done in 51A).
- `[x]` Sync family profiles → Family section in chat list (between AI and Contacts).
- `[x]` Family DM detail → `sendFamilyMessage`.
- `[x]` `isOwnerProfile` feature gating: hide Terminals, Node, Discover, Model Provider, Pi coding UI, vault, mesh Contacts for non-owners.
- `[x]` Me: profile name/avatar; Bots + Push only for non-owners.
- `[x]` Push toggle keyed by `profileId` in SharedPreferences.

### 51F — Social UI (owner desktop) `[x]`

- `[x]` Settings → Family tab: list / create / rename / deactivate / delete profiles.
- `[x]` Generate family invite QR (reuse pairing QR renderer).
- `[x]` Chat sidebar: Family section for owner.
- `[x]` Desktop always runs as owner profile (no switcher).

### Exit Criteria (Phase 51 overall)

- `[x]` Owner creates profiles; family members pair via family invite QR + profile create/select
- `[x]` Isolated EnvoyAI / bots / Ext Agent threads + push per profile — no cross-profile visibility
- `[x]` Family contacts appear automatically (from profiles, not trust store)
- `[x]` Family direct chat + family-only group chat work locally
- `[x]` Push routes per profile (Dad online ≠ suppress Mom's push)
- `[x]` Non-owners cannot access: terminal, Pi coding UI, vault, external mesh bonding, node settings, model provider config
- `[x]` Owner mesh / vault / terminal / Pi unchanged for the owner profile
- `[x]` Single-user installs upgrade transparently (owner profile auto-created; bots migrated)

---

## Phase 52 — Agent Network collaboration roles + assignment modes

> **Status:** `[x]` 52A–52D shipped (2026-08-08).  
> **Design:** [agent-network-roles.md](./agent-network-roles.md) · vocabulary update in [agent-network-vocabulary.md](./agent-network-vocabulary.md) · plan+assign [agent-network-plan-assign.md](./agent-network-plan-assign.md).

**Goal:** Let owners set a **manual primary collaboration role** on their Agent Network profile (`roles[]`, `roles[0]` = primary; multi-role later). Team jobs choose **Skill based** (default) or **Role based** assignment. The Assigner LLM decides exact seats, substitutes, and skill fallbacks via an extensible prompt; the UI surfaces structured `planWarnings`.

### 52A — Profile roles + announce `[x]`

- `[x]` `agentNetworkProfile.roles[]` + helpers (`agentNetworkPrimaryRole`, coerce, well-known + `custom:`)
- `[x]` Social primary-role picker; skill presets relabeled (not “roles”)
- `[x]` Custom collaboration roles in Social (`custom:<slug>` free-text, label helper)
- `[x]` Roster / worker chip shows primary role; Agent Card announces roles
- `[x]` E2E: `chain-plan-assign-roles-e2e.test.ts` (card announce)

### 52B — Assignment mode plumbing `[x]`

- `[x]` `ChainDefaultsConfig.assignmentMode` (`skill` \| `role`, default `skill`)
- `[x]` `chainPreviewGoal` / `chainStartFromGoal` accept `assignmentMode`
- `[x]` Per-chain `assignmentModes` / `planWarnings`; request-scoped `planChain(..., { assignmentMode })` (no global latch race)
- `[x]` Start adopts preview `planWarnings` with `plannedSubtasks` (not `lastPlanMeta`)
- `[x]` Optional `ChainSubtask.requiredRole`

### 52C — Prompt + parse + materialize `[x]`

- `[x]` Modular `buildPlanAssignPrompt` (skill vs role + substitute guidance)
- `[x]` `parsePlanAssignResult` / `materializePlanAssignWithMeta` + honesty hygiene
- `[x]` Mock `__plan_assign_from_roster__` role-mode synthesizer
- `[x]` Unit tests: `chain-plan-assign.test.ts`, `mock-plan-assign.test.ts`

### 52D — Transparency UI `[x]`

- `[x]` ChainStartDialog: assignment mode toggle + `planWarnings` list; wait for defaults before first preview
- `[x]` New team job composer: Skill vs Role chooser + empty local-role soft guide; emphasize `no_role_peers`
- `[x]` `chainGetState` / ChainDetailPanel: assignment mode badge + plan warnings
- `[x]` ChainDefaultsPanel: default assignment mode
- `[x]` Docs: roles design, vocabulary, plan-assign, operator guide, `agent_network.md`

### Exit criteria

- `[x]` Owner can set one primary role; peers see it on cards
- `[x]` Team job create offers Role based / Skill based
- `[x]` Role-based plans emit structured warnings on substitute / skill fallback
- `[x]` Skill-based behavior unchanged when mode=`skill`
- `[x]` Missing roles never block launch
- `[x]` Stall reassign prefers same `requiredRole` / sticky thread peer (**Phase 53**)
- `[ ]` Multi-role editor UI (schema ready; UI later)

---

## Phase 53 — Artifact handoff + worker stickiness

> **Status:** `[x]` 53A–53E shipped (2026-08-09).  
> **Design:** [agent-network-artifacts.md](./agent-network-artifacts.md) · plan-assign [agent-network-plan-assign.md](./agent-network-plan-assign.md).

**Goal:** Make parent→child Team-job results **first-class** (`inputArtifacts` on propose) and pin **ownership threads** (`threadId`) so related steps stay on one preferred worker. Keep `prior[...]` constraint strings as a backward-compatible fallback.

### 53A — Protocol `[x]`

- `[x]` `NamedArtifactSchema`; `ChainSubtaskPartial.namedArtifacts`
- `[x]` `TaskChainProposePayload.inputArtifacts`
- `[x]` `ChainSubtask.threadId` / `produces` / `expects`

### 53B — Orchestrator handoff `[x]`

- `[x]` `buildInputArtifacts` + `prepareSubtaskPropose` (size cap 48k)
- `[x]` Wire launch / advance / stall / counter-bid propose paths
- `[x]` Retain `prior[...]` constraint enrichment for old workers

### 53C — Worker consume / emit `[x]`

- `[x]` Cache `inputArtifacts` from propose; pass into executor
- `[x]` OpenClaw prompt `## Input: {key}` (text/structured/file refs)
- `[x]` Final partial emits `namedArtifacts: [{ key: "result", … }]`

### 53D — Stickiness `[x]`

- `[x]` Materialize: shared `threadId` → same `preferredWorkerPeerId`
- `[x]` `pickStallReassignWorker`: sticky thread peer → same `requiredRole` → list order

### 53E — Tests + docs `[x]`

- `[x]` Protocol + `chain-artifacts-handoff` + executor unit tests
- `[x]` Docs: artifacts design, plan-assign, roles pointer, this phase

### Exit criteria

- `[x]` Child propose carries typed parent text/structured/file refs within caps
- `[x]` Worker prompt includes parent inputs; final emits named `result`
- `[x]` Shared `threadId` keeps one preferred worker
- `[x]` Stall prefers sticky / same role when available
- `[x]` Old path via `prior[...]` still present

---

## Phase 54 — EnvoyAI model guidance + Envoy Local (llama.cpp)

**Status:** `[x]` 54A–54E landed (manual platform smoke remains operator-side)  
**Design:** [envoy-local-design.md](./envoy-local-design.md)

**Problem:** Fresh installs default `modelProviders.mode: "disabled"`. Opening EnvoyAI shows OpenClaw-offline noise or a dead end instead of guiding the user to configure a model. Users who want local AI should not need a giant installer — and users who prefer **cloud only** must never be forced to download llama.cpp.

**Hard rules:**
- **Never package** `llama-server`, cudart, or any GGUF in the app bundle / Tauri `resources/`.
- Downloads go to `{appData}/envoy-local/` **after** EnvoyMesh install.
- **Cloud / Ollama / Envoy Local** are equal Configure AI choices; skipping local is fully supported.

**Consumers of Envoy Local (via `modelProviders` openai-compatible):** EnvoyAI/OpenClaw, native brain, **Pi inherit**. Not HomeClaw/Hermes/OpenHuman (own LLMs).

### 54A — Configure AI guidance `[x]`

- `[x]` `hasUsableModelProvider()` in `@envoymesh/api` (stricter than `isModelProviderConfigured`; mock ≠ usable)
- `[x]` EnvoyAI banner / empty-state: Configure AI (cloud first-class; Ollama / Envoy Local optional)
- `[x]` Deprioritize OpenClaw-offline banner when the real issue is missing model
- `[x]` One-shot turn CTA; i18n (en + zh)
- `[x]` Unit + Social component tests (`hasUsableModelProvider`, `ConfigureAiBanner`)

### 54B — Scaffold `[x]`

- `[x]` Port `18790` in `service-ports.ts` (+ offset)
- `[x]` Preset `envoy-local` (key-optional openai-compatible); Setup validation key-optional
- `[x]` Config shape `envoyLocal` (enabled, serverParams, activeModelId)

### 54C — Auto download + sidecar `[x]`

- `[x]` Platform × accel runtime resolver + download to `{profileDir}/envoy-local/` (pinned llama.cpp tag; sha256 fail-closed when manifest lists digests)
- `[x]` Default GGUF download on enable
- `[x]` `llama-server` OpenAI loopback sidecar + watchdog
- `[x]` Wire `modelProviders` + OpenClaw reload
- `[x]` Settings progress UI / cancel / disk gates
- `[x]` Pin release asset sha256 digests in `envoy-local-manifest.ts` (GitHub Releases digests for `b10331`)

### 54D — Catalog + params `[x]`

- `[x]` Search / list / download / set-active / delete models (curated allowlist + `models.json`)
- `[x]` Settings simple + advanced server params; reset defaults

### 54E — Hardening `[x]`

- `[x]` CUDA→CPU fallback (`-ngl 0` + Settings note); engine update channel (`check`/`updateEnvoyLocalEngine`)
- `[x]` Tests (accel mapping, checksum fail-closed, catalog Qwen/Llama/Gemma, mirrors)
- `[ ]` Manual smoke: macOS Metal + Windows CPU (+ CUDA if available) — operator checklist

### Exit criteria

- `[x]` No usable model → clear Configure AI with cloud-first option (local optional)
- `[x]` Envoy Local enable downloads engine+default model without bundling them
- `[x]` Cloud-only path never triggers llama download
- `[x]` Pi inherit uses Envoy Local when it is the active provider (`modelProviders` openai-compatible)
- `[x]` Installer size unchanged by Phase 54 assets (post-install download only)

---

## Phase 55 — Ext Agent: codex + claudecode (Plan B + daemon supervisor)

**Status:** `[~]` 55A + 55A.1 + 55D + 55B + 55C + 55D.1 + 55E shipped
- 2026-08-10 — 55A `daemon-supervisor.ts` (~785 LOC) + 49 unit tests shipped. Async-ENOENT on macOS handled with a 100ms stability grace after the first passing healthcheck.
- 2026-08-10 — 55A.1 install detection shipped: `ExtAgentInstallGuide` + `InstallState` + `getExtAgentInstallGuide(agentId, installState?)` factory in `packages/api/src/ext-agent.ts`; `ExtAgentReachability` extended with `installState` + `installGuide?`; `probe.ts` classifies via `defaultBinaryOnPath` (`command -v` on POSIX, `where` on Windows). Per-agent install command table for codex / claudecode / hermes / openhuman. Tests: 16 in `ext-agent-install-guide.test.ts` + 14 new in `ext-agent-probe.test.ts` (39 total for both files, all pass).
- 2026-08-10 — 55D backend + ports + docs + i18n shipped. `DEFAULT_EXT_AGENTS` extended with codex (`:8023`) and claudecode (`:8024`); `ExtAgentSidecarKind` extended; `manager.ts` adds `ENVOYMESH_CODEX_PORT` / `ENVOYMESH_CLAUDECODE_PORT` env overrides; `backends.ts` `createBackend` switch throws "not yet implemented" for codex/claudecode (55B/55C replace these). `probe.ts` is resilient to `createBackend` throwing (falls back to `reachable: false` + the installState/installGuide the supervisor's own probe will eventually surface). `index.ts` re-exports `DaemonSupervisor` + `InstallMissingError`. `Ext_Agent_guide.md` adds Codex / Claude Code sections + Install guide table + Troubleshooting rows. `en-settings-ai.ts` / `zh-settings-ai.ts` get `aiEngine.installCard.*` + `aiEngine.status.*` (7 keys each, +24 lines). 5 new tests in `ext-agent-adapter.test.ts` (kinds, sidecar list, createBackend throws, sync logs error, env override recognised).
- 2026-08-10 — 55B codex backend shipped. `apps/node/src/ext-agent-adapter/codex-backend.ts` (~600 LOC) drives `codex app-server` JSON-RPC over stdio, supervised by the 55A `DaemonSupervisor`. Wire: `initialize` once → `thread/start` (cached by `sessionKey`) → `turn/start` → wait for `turn/completed` notification → extract assistant text from `turn.items[].text`. New `sendStdin()` and `getChildProcess()` methods on the supervisor so the codex backend can write JSON-RPC to the child and parallel-parse stdout. Supervisor's `stdio` changed from `["ignore", "pipe", "pipe"]` to `["pipe", "pipe", "pipe"]` so the child has a writable stdin (bug found by the codex tests — pipe was previously `ignore` for stdin). `createBackend("codex")` now returns the real `CodexBackend`. 10 new tests in `apps/node/test/ext-agent-adapter-codex.test.ts` (ask / probe / install-missing / crash / stop / createBackend integration) using fake `node` scripts as codex app-server stand-ins. Test for `syncExtAgentSidecar` with codex on PATH now expects the sidecar to start; the "no binary" path is covered separately. Combined 55A + 55A.1 + 55D + 55B test count: 121/121 pass in ~12s.
- 2026-08-10 — 55C claudecode backend shipped. `apps/node/src/ext-agent-adapter/claudecode-backend.ts` (~325 LOC) drives `@anthropic-ai/claude-agent-sdk` **in-process** — no subprocess, no separate port from the agent side. Wire: `query({ prompt, options: { resume, model, abortController, permissionMode: "bypassPermissions", allowedTools: [] } })` (resume populated from a cached `session_id` once a `system/init` message arrives) → iterate the resulting `AsyncIterable<SDKMessage>` → on `result` (subtype `success`) return `result: string`; on `result` (subtype `error_*`) reject with `errors[]`. The library is lazy-loaded (top-level type-only import + dynamic `loadSdk()`) so a missing install surfaces a clear error at first `ask()` / `probe()`, not at boot. **Chat-bridge use case disables all built-in tools** (`allowedTools: []`); the sidecar manager's policy gate stays in charge of tool authorization — Ext Agent chat stays conversational. **Permission mode `bypassPermissions` + `allowDangerouslySkipPermissions: true`** so the model never blocks on a permission prompt. **Per-ask timeout via `AbortController`**; the SDK's `AbortError` is re-thrown as a friendlier "stalled" message. `probe()` is cheap: SDK loadable + `ANTHROPIC_API_KEY` set (no network roundtrip). `createBackend("claudecode")` now returns the real `ClaudeCodeBackend`. 16 new tests in `apps/node/test/ext-agent-adapter-claudecode.test.ts` using a fake `queryFn` that yields `system/init` + `assistant` + `result` messages: basic shape, ask happy path, sessionId caching per sessionKey + `resume` propagation, separate SDK sessions per sessionKey, error_during_execution rejection, missing API key error, stalled-stream rejection (50ms timeout + AbortController), empty sessionKey rejection, probe true/false, start/stop idempotent, SDK module loadable (parity guard), `isAbortError` duck-type on name + constructor. The two 55D tests that asserted `createBackend("claudecode")` throws "not yet implemented" + `syncExtAgentSidecar` for claudecode stays down are flipped to assert the sidecar starts. Combined 55A + 55A.1 + 55D + 55B + 55C test count: 137/137 pass in ~12s. New dep: `@anthropic-ai/claude-agent-sdk ^0.3.156` in `apps/node/package.json` (the SDK ships its own platform-specific native binary as an `optionalDependency`; pulling the main package triggers the right one per platform automatically).
- 2026-08-10 — 55D.1 chat switcher + offline banner tri-state UX shipped. **Shared `ExtAgentInstallGuideCard`** (`apps/social/src/components/ExtAgentInstallGuideCard.tsx`, ~190 LOC) — single card backing Settings + Chat switcher + OfflineBanner; renders install command (with Copy-to-clipboard that flips to "Copied" for 1.5s), verify command, docs link, common-issues checklist, optional Retry / Dismiss buttons. **New `ExtAgentSwitcherInstallDialog`** (`apps/social/src/components/ExtAgentSwitcherInstallDialog.tsx`, ~85 LOC) — `ModalPortal` wrapper around the card with ESC + overlay-click + Dismiss-button close + auto-close when parent reports the agent is now installed (via `resolved={true}` prop). **Refactored `ExtAgentSwitcher`** to tri-state UX after a switch: `installState` ∈ {`not-installed`, `unsupported`, `unknown`} → install modal opens (with the dialog's Retry re-probing + auto-closing on success); `installState === "installed"` & `!reachable` → 3-second toast with start hint + Retry; `reachable === true` → silent. **Refactored `ExtAgentOfflineBanner`** to render the install card inline (no modal) when the active agent is `not-installed` / `unsupported` / `unknown`; falls back to the existing simple "is not running" hint for `installed + unreachable`. **Settings Ext Agent panel** (`AgentSettings.tsx`) — view + edit mode both use the install card for external agents (built-in Pi / HomeClaw keep the simple hint fallback because the card returns null for `installed: true`). **CSS** — new `.ext-agent-install-card`, `.ext-agent-install-dialog`, `.ext-agent-switcher-toast` (with slide-in animation), `.ext-agent-offline-banner--install` variant. **Tests** — 10 new in `ExtAgentInstallGuideCard.test.tsx`, 7 new in `ExtAgentSwitcherInstallDialog.test.tsx`, rewrote `ExtAgentSwitcher.test.tsx` (7 cases covering the tri-state UX + auto-close on retry success), rewrote `ExtAgentOfflineBanner.test.tsx` (6 cases covering the install-card path + the simple-hint path). All 30 social 55D.1 tests pass in ~1s; combined 55A + 55A.1 + 55D + 55B + 55C + 55D.1 = 167/167 pass. **Bug found and fixed in `ExtAgentOfflineBanner`**: the previous `useCallback([nodeService, …])` changed identity every render because the test mock returns a fresh `nodeService` object each call → useEffect re-fired → probe hammered (3-4× on mount). Refactored to a `useRef` for `probeExtAgent` / `activeId` / `bridgeEnabled` so the callback is stable. **i18n** — added `chat.extAgentInstallDialogTitle` + `chat.extAgentOfflineToastHint` + `chat.extAgentOfflineToastRetry` in `en-chat.ts` / `zh-chats.ts`; the `aiEngine.installCard.*` + `aiEngine.status.*` keys added in 55D are now actually used (the Settings panel and the new card both consume them).
- 2026-08-10 — 55E Hermes / OpenHuman autostart supervisor shipped. **New `apps/node/src/ext-agent-adapter/supervised-hermes-backend.ts`** (~290 LOC) and **`supervised-openhuman-backend.ts`** (~280 LOC) — wrap the existing `createHermesBackend()` / `createOpenHumanBackend()` HTTP backends with a `DaemonSupervisor` (55A) that lazily spawns the daemon on the first `ask()` when it isn't already running. **Hermes** spawns `hermes gateway run`; **OpenHuman** spawns `openhuman serve`. Healthcheck is a cheap HTTP GET (`:8642/v1/models` for Hermes, `:7788/health` for OpenHuman) — same endpoint the existing unwrapped `probe()` already hits, so the "is the daemon up?" answer is consistent across the supervisor, the probe, and the 55D.1 offline banner. Pre-spawn check is `command -v <binary>` (POSIX) / `where` (Windows) so the install-missing surface matches the codex / claudecode flow without an actual spawn. `ask()` short-circuits when the supervisor was already healthy (skips a microtask hop) and caches the last `InstallMissingError` so repeated failed calls don't re-spawn ENOENT. `apps/node/src/ext-agent-adapter/backends.ts` — `createBackend("hermes" | "openhuman")` now reads `ENVOYMESH_EXT_AGENT_AUTOSTART` (default off; aliases: `1` / `true` / `yes` / `on` enable, anything else disables) and returns the supervised version only when the user opts in. This preserves the existing default (most Hermes users run their own `hermes gateway run`, and OpenHuman desktop users have the .app running; the node should not spawn a second instance on the same port). `apps/node/src/ext-agent-adapter/index.ts` re-exports the new classes for downstream callers. **Tests** — 10 new in `apps/node/test/ext-agent-supervised-hermes.test.ts` (basic shape, factory, ask happy path, supervisor-short-circuit when already healthy, install-missing cache + retry, ask error propagation, probe delegation, start/stop idempotency, isEverHealthy via the supervisor's "healthy" event, healthcheck probe 2xx/5xx/fetch-reject); 10 new in `apps/node/test/ext-agent-supervised-openhuman.test.ts` (same shape); 8 new in `apps/node/test/ext-agent-adapter.test.ts` (env-var dispatch: default-off, `1` / `true` / `yes` / `on` enable, `0` / `false` / `no` / `off` / `` / `random` disable, `isAutostartEnabled` helper parity, codex / claudecode unaffected). **Combined 55 test count**: 55A + 55A.1 + 55D + 55B + 55C + 55D.1 + 55E = 172/172 pass in ~12s.
**Scope:** M2 from the [plan options M1/M2/M3](#phase-55-design-notes) discussed in chat on 2026-08-10. Adds **codex** and **claudecode** as `registerAgentHarness`-style backends in `apps/node/src/ext-agent-adapter/`, plus a generic **daemon supervisor** that wraps external processes with spawn / healthcheck / exponential-restart. Hermes + OpenHuman keep their existing HTTP transport and gain supervisor wrapping as 55E (optional, see [open questions](#open-questions-phase-55)).

### Problem

EnvoyMesh's Ext Agent bridge currently supports four swappable external agents, each in its own workspace, with EnvoyMesh acting as a thin "super channel" (see [Ext_Agent_guide.md](./Ext_Agent_guide.md) and [`packages/api/src/ext-agent.ts`](./../packages/api/src/ext-agent.ts)):

| id | Implementation | Transport | Default port |
|---|---|---|---|
| `pi` | in-process (`apps/node/src/pi-runtime.ts`) | n/a (in-proc) | 8022 |
| `homeclaw` | separate channel (`homeclaw-core-ws.ts`) | WS | 8010 |
| `hermes` | `createHermesBackend` (backends.ts:741) | HTTP `POST /v1/chat/completions` → :8642 | 8020 |
| `openhuman` | `createOpenHumanBackend` (backends.ts:791) | HTTP `/rpc` (JSON-RPC) or `/v1` (OpenAI-compat) → :7788 | 8021 |

Users want **codex** (OpenAI Codex CLI) and **claudecode** (Anthropic Claude Code) added to the same picker. Both have native **long-lived protocols** that the current one-shot HTTP pattern doesn't exercise:

- **codex** — `codex app-server` JSON-RPC over stdio (already used inside `packages/openclaw/extensions/codex/` for OpenClaw). Stdio gives session continuity via `threadId`, real-time event streams, proper subprocess lifecycle.
- **claudecode** — `@anthropic-ai/claude-agent-sdk` library (renamed from `@anthropic-ai/claude-code-sdk`). Library form means no subprocess to spawn; sessions come from the `system/init` message's `session_id`; `canUseTool` hooks map to upstream policy.

Independent gap in the existing two: **Hermes and OpenHuman daemons must be manually started by the user**. EnvoyMesh sidecar assumes they're up. No auto-spawn, no healthcheck, no restart. A new **daemon supervisor** helper fixes this and is also what `codex` (subprocess form) needs.

Third gap (UX, surfaced in chat on 2026-08-10): **what happens when the user picks an agent that isn't installed?** Today the answer is "cryptic error somewhere in the bridge log" — `ENOENT` for codex, a generic network error for hermes/openhuman when their binary isn't on `$PATH`. We need runtime **install detection** so the Settings UI can show a guided install card with the right command, and runtime errors mention the install path instead of just failing.

### Goals (vs non-goals)

**In scope (55A–55D):**
- New `codex` + `claudecode` backends via Plan B (long-lived native protocol each).
- New `daemon-supervisor.ts` helper used by codex and (optionally) Hermes/OpenHuman.
- `codex` = managed subprocess (auto-restart on crash).
- `claudecode` = in-process SDK call (no subprocess).
- Settings UX + `Ext_Agent_guide.md` updates.
- Backward compat: existing `bridge-config.json` users with no `codex` / `claudecode` configured keep working unchanged.

**Out of scope:**
- Touching the OpenClaw `extensions/codex/` extension (already uses the same SDK; kept for OpenClaw's own consumption, not unified into ext-agent-adapter for now).
- Changing Hermes / OpenHuman HTTP transport (only supervisor wrapping is in scope, and that's 55E / backlog).
- Persisting sessionKey → external session ID across restarts (sessions are in-memory only — restart drops the mapping, new session ID is allocated on next ask, same as Hermes/OpenHuman today).
- Modifying `homeclaw-core-ws.ts` (separate channel, not ext-agent-adapter territory).
- Auth flows for codex / claudecode beyond reusing existing env vars (`OPENAI_API_KEY` for codex app-server, `ANTHROPIC_API_KEY` for Claude Code).

### Hard rules

- **Plan B is for new code only.** Don't rewrite Hermes/OpenHuman's HTTP transport — they already have it. Plan B applies to codex + claudecode, where a real long-lived protocol exists.
- **Ext Agent is a black box.** We only `ask(text, sessionKey)` and `probe()`. No tool execution, no bond engine, no vault context — those belong to built-in OpenClaw. (See [Ext_Agent_guide.md §Architecture](./Ext_Agent_guide.md) for the "super channel" contract.)
- **Session is per-sessionKey, in-memory only.** Restart drops the mapping. User experience: "first ask after restart is a fresh session; subsequent asks in the same EnvoyMesh session continue." This matches the Hermes/OpenHuman session header behavior already in `backends.ts`.
- **Tool execution stays inside the external agent.** Ext Agent `ask()` returns a string. Claude Code's `canUseTool` callback runs inside its own VM; codex's `tool_use` runs inside its own app-server. EnvoyMesh never sees tool payloads.
- **Daemon supervisor is a generic helper.** It is used by codex (subprocess) and (optionally) Hermes/OpenHuman (subprocess). ClaudeCode does not need it (library call).
- **Stdout/stderr go to `[ext-agent:<name>]` log lines** (envoy's existing log prefix pattern; same shape as `pi-runtime.ts` already uses for its child process).
- **No new global ports below 1024.** Sidecars bind 8020/8021/8022/8023/8024 (additive to existing).
- **Pre-existing mobile-node typecheck error stays untouched** (see AGENTS.md: "we don't need to consider mobile node, it's useless and maybe removed later").

### Architecture

```
                    EnvoyMesh bridge (PostgreSQL-style P2P relay / P2P mesh)
                                       │
                                       │  activeExtAgentId = "codex" / "claudecode" / ...
                                       ▼
                            Ext Agent Sidecar  (127.0.0.1:<port>/message)
                                       │
        ┌──────────────┬──────────────┴──────────────┬──────────────┐
        │              │                             │              │
   Hermes (HTTP)  OpenHuman (HTTP)             Codex (stdio)   ClaudeCode (in-proc)
   :8642          :7788                       codex app-server  @anthropic-ai/
                                                (supervised)    claude-agent-sdk
   supervisor     supervisor                                 (no supervisor needed)
```

Key shapes:

- **Sidecar HTTP contract is unchanged.** `startExtAgentHttpServer` in `http-server.ts:44` stays the only thing the bridge talks to. New backends just plug into `ExtAgentBackend` (`types.ts:28`).
- **Manager picks one sidecar at a time.** `syncExtAgentSidecar` in `manager.ts:77` already supports this; we just add two new ports (`DEFAULT_PORTS.codex = 8023`, `claudecode = 8024`) and env overrides (`ENVOYMESH_CODEX_PORT`, `ENVOYMESH_CLAUDECODE_PORT`).
- **Daemon supervisor is its own module.** `apps/node/src/ext-agent-adapter/daemon-supervisor.ts` is independent of any specific backend, so each backend declares its own spawn spec + healthcheck and reuses the helper.

```ts
// apps/node/src/ext-agent-adapter/daemon-supervisor.ts (sketch)
export interface DaemonSupervisorOptions {
  name: string;              // "codex" / "hermes" / "openhuman"
  command: string;
  args: string[];
  env?: NodeJS.ProcessEnv;
  cwd?: string;
  healthcheck: () => Promise<boolean>;
  healthcheckIntervalMs?: number;     // default 5_000
  restartPolicy: {
    initialDelayMs?: number;          // default 1_000
    maxDelayMs?: number;              // default 30_000
    backoffMultiplier?: number;       // default 2
    maxRestartsInWindow?: number;     // default 5 in 5 min
    windowMs?: number;                // default 300_000
  };
}
export class DaemonSupervisor {
  constructor(options: DaemonSupervisorOptions);
  start(): Promise<void>;        // resolves when healthcheck passes (or timeoutMs)
  stop(): Promise<void>;         // SIGTERM → wait grace → SIGKILL
  isRunning(): boolean;
  isHealthy(): boolean;
  restartsInWindow(): number;
  on(event: "start" | "stop" | "crash" | "healthy" | "unhealthy", fn: (...args: unknown[]) => void): this;
}
```

### 55A — `daemon-supervisor` helper `[x]`

- **New file:** `apps/node/src/ext-agent-adapter/daemon-supervisor.ts` (~785 LOC)
- **Test:** `apps/node/test/daemon-supervisor.test.ts` (~988 LOC, **49 cases**)
- Spawn via `node:child_process.spawn` (stdin/stdout/stderr piped, captured as `stdout` / `stderr` events for callers to log with `[ext-agent:<name>:<stream>]` prefix).
- Healthcheck is caller-supplied (HTTP GET, JSON-RPC ping, file-exists, anything that returns boolean).
- Restart: exponential backoff `1s → 2s → 4s → 8s → 16s → 30s` capped; `maxRestartsInWindow` (default 5 / 5 min) trips a "stuck" state — supervisor stops trying and emits `crash.stuck` for the manager to surface in Settings.
- Graceful shutdown: SIGTERM, wait `killGraceMs` (default 5s), then SIGKILL. Idempotent; `start()` after `stop()` is a fresh start.
- **`start()` semantics:** resolves when the first healthcheck passes (with a 100ms stability grace window after — see below) OR after `startupTimeoutMs` elapses; rejects with `InstallMissingError` on pre-check fail or spawn ENOENT (sync or async). Concurrent `start()` calls share the same promise.
- **Stability grace (100ms):** on macOS, `spawn()` for a non-existent binary returns a `ChildProcess` (with `pid: undefined`) that immediately fires the `error` event with `ENOENT` — `spawn()` itself does NOT throw. The healthcheck can pass before the `error` event fires, so we hold off on resolving `start()` until the process has been "stable" for a brief moment. If the `error` event sets `installMissing` during the grace, `start()` rejects with `InstallMissingError`.
- **Stdio cleanup:** `cleanupProc()` destroys piped stdout/stderr and removes `exit` / `error` listeners. Without this, the async-ENOENT path leaks a half-open `ChildProcess` and keeps the event loop alive (we hit this in test dev — fixed).
- **Test cases (49):** constructor validation (4); basic lifecycle (spawn / stop / `start()` after `stop()` / concurrent `start()` / start-while-healthy no-op / start event / stop event) (9); install detection (pre-check fail + reason + installHint + sync ENOENT + async ENOENT + ENOENT hint + no restart after install-missing + preSpawnCheck throws) (8); crash handling (crash event + restart + crash.stuck + backoff cap + backoff reset on healthy) (5); signals (SIGTERM-then-SIGKILL on hung / quick stop) (2); stdio (stdout event / stderr event) (2); env + cwd (override / inherit / cwd) (3); healthcheck lifecycle (periodic / healthy event / unhealthy event / no spurious initial unhealthy / timeout abort) (5); state getters (isRunning / isHealthy / restartsInWindow / window cleanup) (6); `InstallMissingError` (name+message+info / no hint) (2); `_test.runHealthcheckOnce` (success / throw / timeout) (3).

### 55A.1 — Install detection + install guide `[x]`

- **MOD:** `apps/node/src/ext-agent-adapter/daemon-supervisor.ts` — extend `start()` to detect ENOENT-class spawn failures and return a structured `InstallState` instead of just an error string. New event `"install-missing"` on the supervisor.
- **MOD:** `packages/api/src/ext-agent.ts` — add `ExtAgentInstallGuide` interface + `getExtAgentInstallGuide(agentId, installState?)` factory. Reuses `getExtAgentInstallInfo` for the link fields.
- **MOD:** `packages/api/src/node-service.ts` (or wherever `ExtAgentReachability` lives — `ext-agent.ts:81`) — add `installState: "installed" | "not-installed" | "unsupported" | "unknown"` and `installGuide?: ExtAgentInstallGuide` (only set when not installed).
- **MOD:** `apps/node/src/ext-agent-adapter/probe.ts` — distinguish "not installed" (ENOENT / module-not-found / CLI not on PATH) from "not running" (daemon absent) from "unreachable" (network). Surface as `installState`.

```ts
// packages/api/src/ext-agent.ts (sketch, new)
export interface ExtAgentInstallGuide {
  agentId: string;
  installed: boolean;                       // best-effort: probe() passed AND install check passed
  command: string;                          // "codex" / "hermes" / "claudecode"
  installCommand: string;                   // "npm install -g @openai/codex"
  verifyCommand: string;                    // "codex --version"
  startHint: string;                        // existing defaultExtAgentStartHint()
  homepageUrl: string;
  homepageLabel: string;
  commonIssues: string[];                   // 2-4 bullets for the Settings card
}

export type InstallState = "installed" | "not-installed" | "unsupported" | "unknown";

export function getExtAgentInstallGuide(
  agentId: string,
  installState: InstallState = "unknown",
): ExtAgentInstallGuide { /* per-id table */ }
```

**Per-agent install command table** (the one I need you to confirm — see [open questions](#open-questions-phase-55)):

| id | installCommand | verifyCommand | homepageUrl |
|---|---|---|---|
| `codex` | `npm install -g @openai/codex` *(proposed — see open question)* | `codex --version` | https://github.com/openai/codex |
| `claudecode` | `npm install -g @anthropic-ai/claude-code` | `claude --version` | https://docs.claude.com/en/docs/claude-code |
| `hermes` | `curl -fsSL https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh \| bash` | `hermes --version` | https://hermes-agent.nousresearch.com/docs |
| `openhuman` | `curl -fsSL https://raw.githubusercontent.com/tinyhumansai/openhuman/main/scripts/install.sh \| bash` | `openhuman --version` | https://tinyhumans.ai/openhuman |

**Test cases for 55A.1** (extend `daemon-supervisor.test.ts` + new `ext-agent-install-guide.test.ts`):
- spawn nonexistent command → supervisor emits `"install-missing"` with `{ command, installHint }` instead of generic crash
- probe() on missing `codex` → `installState: "not-installed"`, `installGuide` populated
- probe() on present but unhealthy `codex` → `installState: "installed"`, no `installGuide`
- `getExtAgentInstallGuide("codex", "not-installed")` returns the table row with `installed: false`
- Settings state shape matches `ExtAgentReachability` extended fields (snapshot test)

### 55B — `codex` ext agent backend `[x]`

- **New file:** `apps/node/src/ext-agent-adapter/codex-backend.ts` (~350 LOC)
- **Test:** `apps/node/test/ext-agent-adapter-codex.test.ts` (~200 LOC, ≥8 cases)
- Protocol: `codex app-server` JSON-RPC over **stdio** (matches existing `extensions/codex/src/app-server/`; no extra TCP port).
- Library: `@openai/codex` (same major as `extensions/codex/package.json`; verify exact pin at implementation time). If the library's `app-server` client is private to the extension, we vendor the wire types from the extension's `src/app-server/` (license-compatible) — same JSON-RPC shapes the OpenClaw extension already speaks.
- Wire sequence (per `ask`):
  1. `initialize` (capabilities, client info) — once per process.
  2. `thread/start` if no threadId for `sessionKey`; reuse otherwise.
  3. `turn/start` with `userMessage`; subscribe to `item/agentMessage/delta` stream; collect final `turn/completed` text.
  4. Cache `threadId` per `sessionKey` in an in-memory `Map<string, string>`.
- `createCodexBackend()` returns an `ExtAgentBackend` with:
  - `ask(text, sessionKey) → Promise<string>` (final text from `turn/completed`)
  - `probe()` → `thread/list` JSON-RPC call; treat any 2xx + valid response as healthy
- Spawned by `daemon-supervisor` (55A) with `command: "codex"`, `args: ["app-server"]`, `env: { OPENAI_API_KEY: ... }` (env discovery reuses `openaiApiKey()` pattern from `openclaw-workspace.ts` if helpful).
- Default sidecar port `8023`; override `ENVOYMESH_CODEX_PORT`.
- **Test cases:** wire init / thread/start / turn/start mock server; ask with new sessionKey creates thread; ask with same sessionKey reuses thread; probe returns true on healthy `thread/list`; probe returns false on bad response; `createSupervisor` returns supervisor that surfaces crash; **missing `codex` binary → probe() returns `installState: "not-installed"` with `installGuide` from 55A.1 (NOT a generic ENOENT error)**; `probe()` for present-but-unhealthy binary returns `installed: true` without `installGuide`.

### 55C — `claudecode` ext agent backend `[ ]`

- **New file:** `apps/node/src/ext-agent-adapter/claudecode-backend.ts` (~250 LOC)
- **Test:** `apps/node/test/ext-agent-adapter-claudecode.test.ts` (~150 LOC, ≥6 cases)
- Library: `@anthropic-ai/claude-agent-sdk` (renamed from `@anthropic-ai/claude-code-sdk`; confirm exact package name at implementation time). Pin exact version.
- No subprocess — library runs in-process. `createClaudeCodeBackend()` returns an `ExtAgentBackend` directly; no supervisor needed.
- Wire sequence (per `ask`):
  1. Build `AsyncIterable<SDKMessage>` that yields one `UserMessage(text)`.
  2. `for await (const msg of query({ prompt, options: { ... } }))` collect assistant text; resolve on `result` subtype.
  3. Cache `sessionId` (from `system/init` message) per `sessionKey`; pass to next `query` via `options.resume` if available.
- Auth: `ANTHROPIC_API_KEY` env var, OR Bedrock/Vertex/Foundry via the SDK's existing env wiring (delegate to SDK; do not re-implement).
- Model: from `ask()` params (let the bridge pass the model the user picked in Settings); default to `claude-sonnet-4-6`.
- `probe()`: cheap noop `query` (synthetic "ping" prompt) with a 2s timeout; treat 2xx reply as healthy.
- Default sidecar port `8024`; override `ENVOYMESH_CLAUDECODE_PORT`.
- **Test cases:** mock `query` module; ask with new sessionKey captures sessionId from `system/init`; ask with same sessionKey passes `resume`; probe returns true on reply; probe returns false on throw; **missing `claude` CLI → probe() returns `installState: "not-installed"` with `installGuide` (no SDK import is tried without CLI present)**; missing `ANTHROPIC_API_KEY` env var → clear error message pointing to env var setup, distinct from not-installed.

### 55D — Settings UX + guide updates `[x]`

- **MOD:** `packages/api/src/ext-agent.ts`
  - `DEFAULT_EXT_AGENTS`: append `{ id: "codex", ... }` and `{ id: "claudecode", ... }` with `enabled: true` defaults (users can disable in Settings if they don't have the binary).
  - `defaultExtAgentStartHint()`: add cases for `codex` (`Install \`codex\` CLI, ensure \`codex app-server\` works; set \`OPENAI_API_KEY\``) and `claudecode` (`Install Claude Code, ensure \`claude --version\` works; set \`ANTHROPIC_API_KEY\``).
  - `getExtAgentInstallInfo()`: add cases for both with `homepageUrl` + `homepageLabel` (Anthropic / OpenAI docs).
- **MOD:** `apps/node/src/ext-agent-adapter/manager.ts` — add `codex` / `claudecode` to `DEFAULT_PORTS` + `listenPortFor()` env override arms (same shape as existing `pi` / `hermes` / `openhuman`).
- **MOD:** `apps/node/src/ext-agent-adapter/types.ts` — extend `ExtAgentSidecarKind` union with `"codex" | "claudecode"`; `EXT_AGENT_SIDECAR_KINDS` array; `isExtAgentSidecarKind` arms.
- **MOD:** `apps/node/src/ext-agent-adapter/backends.ts` — `createBackend` switch arms; (55E) optional supervisor-wrapping for hermes / openhuman.
- **MOD:** `apps/node/src/ext-agent-adapter/index.ts` — re-export new factory + supervisor helper.
- **MOD:** `apps/node/test/ext-agent-adapter.test.ts` — extend `isExtAgentSidecarKind` test + `createBackend` switch test + `syncExtAgentSidecar` for both new kinds.
- **MOD:** `docs/Ext_Agent_guide.md` — add **Codex** and **Claude Code** sections (install, env var, port override, supervisor behavior, known limitations). Update the picker table. Add **Install guide** section with the install command table from 55A.1 and the troubleshooting matrix.
- **NOT a public RPC surface change.** All additions are additive; `bridge-config.json` users with no `codex` / `claudecode` continue to work.
- **Settings UI behavior** (Social `Settings → External Agent Bridge`):
  - When user switches `activeExtAgent` to an agent whose `installState` is `"not-installed"`, the panel shows an **Install required** card with: install command, verify command, "Open install docs" link, and `commonIssues` bullets. No user action is blocked — they can still see the picker; the card just makes the gap obvious.
  - The Settings status indicator next to the active agent changes color: green for installed+reachable, amber for installed+unreachable, red for not-installed.
  - i18n keys added to `en.ts` / `zh.ts`: `ext_agent.install_card.title`, `ext_agent.install_card.command_label`, `ext_agent.install_card.verify_label`, `ext_agent.install_card.docs_label`, `ext_agent.status.installed`, `ext_agent.status.not_installed`, `ext_agent.status.unsupported`.

### 55D.1 — Chat list switcher problem dialog `[ ]`

The chat list's `ExtAgentSwitcher` component (`apps/social/src/components/ExtAgentSwitcher.tsx`, 216 LOC) already does a soft `probeExtAgent()` after a switch (line 88) but only renders a one-line tooltip hint (line 91-96). When 55A.1 extends `ExtAgentReachability` with `installState` + `installGuide?`, the switcher needs to surface that data too — otherwise the same `codex not installed` confusion happens in the chat list.

- **MOD:** `apps/social/src/components/ExtAgentSwitcher.tsx` — replace the `offlineHint` tooltip with a `problemDialog` state. Behavior:
  - `installState === "not-installed"` → open a **modal** (`<ExtAgentSwitcherInstallDialog>`) showing the install card inline with one-click "Copy command" + "Open docs" buttons. User can dismiss to keep the (broken) selection.
  - `installState === "installed"` && `reachable === false` → open a **toast** (3-second auto-dismiss) with the start hint + "Retry" button that re-runs the probe. Modal is too heavy for "just start the daemon".
  - `installState === "installed"` && `reachable === true` → silent switch, no popup (current behavior preserved).
- **NEW:** `apps/social/src/components/ExtAgentSwitcherInstallDialog.tsx` (~150 LOC) — the install-required modal. Reuses the same `ExtAgentInstallGuide` data the Settings panel uses; can share the inner card component with `SettingsAITab.tsx` (refactor into `ExtAgentInstallGuideCard` so both consume the same visual + i18n).
- **MOD:** `apps/social/src/components/views/SettingsAITab.tsx` — use the shared `ExtAgentInstallGuideCard` for the Ext Agent Bridge panel; replace inline "start hint" text.
- **MOD:** `apps/social/src/components/views/ExtAgentOfflineBanner.tsx` — when `installState === "not-installed"`, render the install card inline (currently the banner only shows when daemon is running but unhealthy).
- **Test cases** (extend `ExtAgentSwitcher.test.tsx` — if it doesn't exist, create at ~200 LOC):
  - Switch to `codex` when binary missing → modal opens with install command visible; "Copy command" copies to clipboard; "Open docs" opens new tab.
  - Switch to `codex` when installed but unhealthy → toast (3s) with start hint + "Retry" → re-runs probe.
  - Switch to `pi` (built-in) → no popup, silent.
  - Switch back to current agent → no-op (existing behavior preserved).
  - Dismiss modal → state stays on the new agent (we don't roll back the switch — the user explicitly chose it).
  - Snapshot test: i18n keys resolve in both `en` and `zh`.
- **i18n keys added** (to `en.ts` / `zh.ts` and copied to the 4 other locales via `mergeMessages` fallback):
  - `ext_agent.switcher.install_required.title` / `body` / `copy_command` / `open_docs` / `dismiss`
  - `ext_agent.switcher.unreachable.toast` / `retry` / `dismiss`
  - `ext_agent.switcher.shared.start_hint_label` / `verify_label` / `docs_label`

### 55E — `hermes` / `openhuman` supervisor wrap (optional / backlog) `[x]`

- **MOD:** `apps/node/src/ext-agent-adapter/backends.ts` — `createBackend("hermes" | "openhuman")` reads `ENVOYMESH_EXT_AGENT_AUTOSTART` (default off) and uses the supervised version when set. Off = unwrapped HTTP backends (preserves the existing default).
- **NEW:** `apps/node/src/ext-agent-adapter/supervised-hermes-backend.ts` (~290 LOC) — `HermesSupervisedBackend` class wrapping `createHermesBackend()` with a `DaemonSupervisor` (55A). `command: "hermes"`, `args: ["gateway", "run"]`; pre-spawn check is a `command -v hermes` PATH probe; healthcheck is `GET :8642/v1/models` (same as the existing unwrapped `probe()`). `ask()` short-circuits when the supervisor was already healthy (saves a microtask hop on the hot path) and replays the last install-missing error without re-spawning.
- **NEW:** `apps/node/src/ext-agent-adapter/supervised-openhuman-backend.ts` (~280 LOC) — same pattern for OpenHuman. `command: "openhuman"`, `args: ["serve"]`; healthcheck is `GET :7788/health`.
- Toggled by `ENVOYMESH_EXT_AGENT_AUTOSTART=1` (default off; only ship if 55B/55C succeed cleanly).
- This is the bridge-side "no manual daemon startup" feature that makes Ext Agent feel like a one-click swap.
- **NEW tests** — `apps/node/test/ext-agent-supervised-hermes.test.ts` (10 cases) + `apps/node/test/ext-agent-supervised-openhuman.test.ts` (10 cases) + 8 new dispatch cases in `ext-agent-adapter.test.ts` covering: default-off, env-var `1` / `true` / `yes` / `on` aliases, off aliases (`0` / `false` / `no` / `off` / `` / `random`), and the `isAutostartEnabled` helper. All 20 supervised tests + 31 ext-agent-adapter tests pass.
- **Combined 55 test count**: 55A + 55A.1 + 55D + 55B + 55C + 55D.1 + 55E = 172/172 pass in ~12s.

### File map (M2 — all slices together)

| Kind | Path | LOC (est) |
|---|---|---|
| NEW | `apps/node/src/ext-agent-adapter/daemon-supervisor.ts` | ~785 (55A; 55A.1 folded in — see above) |
| NEW | `apps/node/src/ext-agent-adapter/codex-backend.ts` | ~350 |
| NEW | `apps/node/src/ext-agent-adapter/claudecode-backend.ts` | ~250 |
| NEW | `apps/node/test/daemon-supervisor.test.ts` | ~250 (55A + 55A.1) |
| NEW | `apps/node/test/ext-agent-adapter-codex.test.ts` | ~220 |
| NEW | `apps/node/test/ext-agent-adapter-claudecode.test.ts` | ~170 |
| NEW | `apps/node/test/ext-agent-install-guide.test.ts` | ~80 (55A.1 table tests) |
| NEW | `apps/social/src/components/ExtAgentSwitcherInstallDialog.tsx` (55D.1) | ~150 |
| NEW | `apps/social/src/components/ExtAgentInstallGuideCard.tsx` (55D.1 shared) | ~120 |
| NEW | `apps/social/src/components/ExtAgentSwitcher.test.tsx` (if not exists) (55D.1) | ~200 |
| MOD | `apps/node/src/ext-agent-adapter/types.ts` | +30 |
| MOD | `apps/node/src/ext-agent-adapter/backends.ts` | +40 |
| MOD | `apps/node/src/ext-agent-adapter/manager.ts` | +30 |
| MOD | `apps/node/src/ext-agent-adapter/probe.ts` | +50 (InstallState classification) |
| MOD | `apps/node/src/ext-agent-adapter/index.ts` | +15 |
| MOD | `apps/node/test/ext-agent-adapter.test.ts` | +100 |
| MOD | `packages/api/src/ext-agent.ts` | +150 (ExtAgentInstallGuide + table + extended ExtAgentReachability with installState/installGuide) |
| MOD | `packages/api/src/node-service.ts` | +20 |
| MOD | `apps/social/src/components/ExtAgentSwitcher.tsx` | +80 (replace tooltip with dialog/toast state) |
| MOD | `apps/social/src/components/views/SettingsAITab.tsx` | +60 (use shared install card) |
| MOD | `apps/social/src/components/views/ExtAgentOfflineBanner.tsx` | +40 (render install card when not-installed) |
| MOD | `apps/social/src/i18n/{en,zh}.ts` | +50 (8 Settings keys + 7 Switcher keys × 2 langs) |
| MOD | `docs/Ext_Agent_guide.md` | +180 |
| MOD | `package.json` (`@openai/codex`, `@anthropic-ai/claude-agent-sdk` deps) | +2 deps |
| MOD | `docs/implementation-plan.md` | this section + changelog |
| **Total** | | **~2,800 LOC + 2 npm deps** |

### Exit criteria

- [ ] `codex` and `claudecode` show in Settings → External Agent Bridge picker.
- [ ] Selecting `codex` spawns `codex app-server` via supervisor; sidecar replies to `POST /message` with the agent's final text.
- [ ] Selecting `claudecode` boots sidecar that uses Claude Agent SDK; same `/message` round-trip works.
- [ ] `sessionKey` → external session ID mapping persists within a single EnvoyMesh run; restart starts fresh (documented behavior, matches Hermes/OpenHuman).
- [ ] `codex` subprocess crash → supervisor restarts with exponential backoff; `claudecode` has no subprocess so N/A.
- [ ] **Picking an agent that isn't installed shows an Install Required card in Settings, NOT a cryptic error.** The card includes the install command, verify command, "Open install docs" link, and `commonIssues` bullets. Confirmed for `codex`, `claudecode`, `hermes`, `openhuman`.
- [ ] **Status indicator color reflects install state** — green (installed+reachable), amber (installed+unreachable), red (not-installed).
- [ ] **Switching ext agent from the chat list to an uninstalled one pops a modal with the install card** (not a cryptic error, not a tooltip). Switching to an installed-but-unreachable agent pops a 3-second toast with start hint + Retry. Switching to a healthy agent is silent.
- [ ] Switching back to `pi` / `hermes` / `openhuman` / `homeclaw` works unchanged (no regression).
- [ ] `npm run test:dev` passes all new tests + existing ext-agent tests.
- [ ] `npm run typecheck` clean (pre-existing `packages/mobile-node/src/index.ts:506` error stays as-is).
- [ ] `Ext_Agent_guide.md` updated; `defaultExtAgentStartHint` cases for both new kinds; new **Install guide** section with the 4-agent install command table.

### Risks & mitigations

| # | Risk | Mitigation |
|---|---|---|
| 1 | `@openai/codex` and `@anthropic-ai/claude-agent-sdk` are not yet in `apps/node`'s `package.json` | Add as workspace deps in 55B/55C; pin exact versions; document the pin in code comments. |
| 2 | Stdio JSON-RPC parsing for codex is finicky (NDJSON vs LSP framing) | Same transport code as `extensions/codex/src/app-server/`; if exportable, reuse; if private to the extension, vendor the wire types with explicit license. Test against a mock JSON-RPC server first. |
| 3 | `@anthropic-ai/claude-agent-sdk` is pre-1.0 — breaking changes possible between minor versions | Pin exact version; update test fixtures to match; document `knownFragile: ["claude-agent-sdk@<x>"]` in code comment. |
| 4 | New ports 8023 / 8024 may conflict on some hosts | Same env-override pattern as existing (`ENVOYMESH_CODEX_PORT`, `ENVOYMESH_CLAUDECODE_PORT`); document in `Ext_Agent_guide.md`. |
| 5 | Process leak on EnvoyMesh shutdown | `daemon-supervisor.stop()` registered on `process.on("SIGTERM"/"SIGINT")` in `manager.ts`; tests verify cleanup. |
| 6 | Backward compat with existing `bridge-config.json` (no `codex` / `claudecode` keys) | New kinds are purely additive in `DEFAULT_EXT_AGENTS`; old configs still resolve `pi` / `hermes` / `openhuman`; `syncExtAgentSidecar` already handles "no matching kind" by no-op. |
| 7 | `probe()` for codex is non-trivial (a full `thread/list` round-trip); for claudecode it spawns a cheap turn | Time-bound `probe()` with `AbortSignal.timeout(2_000)` (matches Hermes `probe()` in `backends.ts:746`); sidecar `/status` endpoint already awaits probe — `http-server.ts` design unchanged. |
| 8 | `claudecode` running in-process shares Node.js heap with EnvoyMesh; resource contention? | Library is designed for it (used in `@anthropic-ai/claude-code` SDK for production IDEs); measure with `process.memoryUsage()` in tests; document in guide. |
| 9 | Daemon supervisor's stuck-state trip is hard to test deterministically | Use `vi.useFakeTimers()` for the windowMs math; document the trip behavior in the supervisor's JSDoc. |
| 10 | Mobile (EnvoyGo) doesn't run ext-agent-adapter — only `homeclaw-core-ws` channel | No change needed; mobile uses HomeClaw or direct P2P bridge. Confirm via `grep -r ext-agent-adapter apps/envoygo/`. |
| 11 | **User picks an agent that isn't installed — cryptic `ENOENT` in bridge log; no clear path to fix** | **55A.1 install detection** — supervisor's `start()` distinguishes ENOENT → structured `installState: "not-installed"` + populated `installGuide`. Settings UI renders an Install Required card with the right command. Tested explicitly per backend. |
| 12 | Settings UI needs a way to surface `installState` cleanly | Extend `ExtAgentReachability` (`packages/api/src/ext-agent.ts:81`) with `installState: "installed" \| "not-installed" \| "unsupported" \| "unknown"` + `installGuide?`; status indicator color (green/amber/red) so the user can tell at a glance. |

### Open questions (Phase 55)

| Status | Question | My recommendation |
|---|---|---|
| `[x]` (settled) | codex transport: stdio vs ws? | **stdio** (matches existing `extensions/codex/`; one fewer port; cleaner supervisor model). |
| `[x]` (settled) | claudecode transport: per-ask subprocess or in-process SDK? | **in-process SDK** (no subprocess lifecycle to manage; library is designed for it; faster; simpler). |
| `[x]` (settled) | Should 55E (Hermes/OpenHuman supervisor) ship together? | **No — backlog for first ship.** Get 55A–55D stable, gather user feedback, then revisit. Hermes/OpenHuman already have a working HTTP pattern; autostart is a UX nicety, not a blocker. |
| `[x]` (settled) | Should we unify with the existing `extensions/codex/`? | **No, not in this phase.** The OpenClaw extension wraps the codex SDK for OpenClaw's own consumption (different prompt/permission/sandbox model). Unifying risks cross-coupling; defer to a follow-up "share codex wire types" refactor. |
| `[x]` (settled) | Do we add a new RPC method (e.g. `restartCodexSidecar`)? | **No, not needed.** Sidecar restart is internal to the supervisor; surfaced in Settings status if stuck. |
| `[x]` (settled — user confirmed 2026-08-10) | Primary install command for `codex` / `claudecode` | **Both are wanted.** Primary paths: `codex` = `npm install -g @openai/codex`; `claudecode` = `npm install -g @anthropic-ai/claude-code`. Alternatives (brew / official installer) documented as `commonIssues[]` bullets. |
| `[x]` (settled — user confirmed 2026-08-10) | Where does the Install Required card live in the Social UI? | **Two surfaces:** (1) `Settings → AI → Ext Agent Bridge` panel for the rich card; (2) `ExtAgentSwitcher` in the chat list for the pop-up modal/toast (55D.1). Shared `ExtAgentInstallGuideCard` component backs both. |

### Design notes

- M1 = just codex + claudecode (no supervisor for hermes/openhuman) — ~1,200 LOC, 2-3 commits.
- M2 = this plan, ~1,750 LOC, 4-5 commits.
- M3 = M2 + extending the supervisor to wrap `pi` (which is currently in-process) and `homeclaw-core-ws`. **Not recommended** for this phase — `pi` is intentionally in-process and `homeclaw` has its own channel; touching them is unrelated risk.
- The "Plan B" framing here distinguishes **protocol** (long-lived socket vs HTTP one-shot) from **process lifecycle** (supervised subprocess). Hermes and OpenHuman already do "Plan B-light" over HTTP — we just give them a supervisor for autostart.

---

## Phase 56 — Ext Agent: cursor-agent + aider + mmx (one-shot CLI pattern)

**Status:** `[x]` shipped — 56A/56B/56C/56D/56E all landed. 38+16+20+6+21 = **101 new tests**, all green

**Background.** After 55 shipped (codex long-lived JSON-RPC + claudecode in-process SDK + supervised hermes/openhuman), the user asked for three more agents:

- **Cursor CLI** (`cursor-agent`) — Anysphere's official CLI. Install via `curl https://cursor.com/install -fsS | bash`. Has `--prompt "..."` for one-shot asks and `--output json` for structured output. Multi-turn interactive also available but for the chat-bridge we want one-shot.
- **Aider** (`aider`) — Open source terminal AI pair programmer. `pip install aider-chat` (or `python -m pip install aider-install` then `aider-install`). One-shot: `aider --message "..."` exits when done. We **must** pass `--no-auto-commits` and `--no-git` (defaults commit everything to a local repo — destructive for chat-bridge use case).
- **MMX-CLI** (`mmx`) — **MiniMax's own CLI** (`github.com/MiniMax-AI/cli`, 2026-04-09). Designed *for AI agents* — clean JSON output via `--output json`, semantic exit codes, async non-blocking. Install: `npm install -g mmx-cli` or `npx skills add MiniMax-AI/cli -y -g`. `mmx text chat --message "..." --output json` returns structured JSON.

All three are **one-shot CLIs per ask** — no long-lived protocol, no daemon to supervise. Different from codex (JSON-RPC) and claudecode (in-process SDK). This calls for a **third backend shape** in `apps/node/src/ext-agent-adapter/`:

```
                 codex (55B)            claudecode (55C)          cursor / aider / mmx (56)
                 ─────────              ────────────────          ────────────────────────
                 DaemonSupervisor       @anthropic-ai/            one-shot CLI per ask
                 + stdio JSON-RPC       claude-agent-sdk          + sessionKey as prompt
                 sessionKey→threadId    in-process                (no thread/session concept
                                       sessionKey→sessionId      — relies on agent's own
                                                                  in-process history)
```

### Goals (vs non-goals)

**In scope (56A–56E):**

- Three new one-shot CLI backends, sharing a common base class `OneShotCliBackend` (~200 LOC).
- `DEFAULT_EXT_AGENTS` extended with `cursor` (`:8025`), `aider` (`:8026`), `mmx` (`:8027`).
- `manager.ts` port mapping + `ENVOYMESH_CURSOR_PORT` / `ENVOYMESH_AIDER_PORT` / `ENVOYMESH_MMX_PORT` env overrides.
- `INSTALL_TABLE` in `packages/api/src/ext-agent.ts` for the three new agents.
- `getExtAgentInstallInfo` for the three new agents + `defaultExtAgentStartHint`.
- `apps/node/src/ext-agent-adapter/index.ts` re-exports.
- `docs/Ext_Agent_guide.md` extended with three new sections.
- i18n: only keys that are actually used by the new install cards / status messages.

**Out of scope (deferred — not Phase 57 KB):**

- GLM as a model endpoint provider (GLM is a model, not an agent — its OpenAI-compatible API at `open.bigmodel.cn/api/paas/v4` is a model router concern, not an ext-agent-adapter concern). Future **Model Router / Providers** phase, not Phase 57 Knowledge Base.
- Touching the existing `pi` / `homeclaw` / `hermes` / `openhuman` / `codex` / `claudecode` backends.
- "Add as model endpoint" wiring for GLM / MiniMax-M3 (model router is a separate package, not ext-agent-adapter).
- Long-lived multi-turn support for any of the three (each ask is fresh; the agent's own in-process history handles context).
- Aider's `architect` / `code` chat-mode UX features (one-shot is the chat-bridge contract).

### Hard rules

- **One-shot pattern only.** No long-lived subprocess. `ask()` spawns the CLI, waits for stdout, kills the process on timeout, returns the parsed text.
- **Per-ask timeout (default 60s).** Configurable per agent; codex-style 120s long-running cap. Most one-shot CLIs complete in <30s.
- **ENOENT → `InstallMissingError`.** Reuse the same error shape as codex / 55A so the 55A.1 / 55D.1 install card surfaces the install guide automatically.
- **Aider must NOT auto-commit.** Pass `--no-auto-commits --no-git` so aider does not write to a real git repo from the bridge.
- **MMX-CLI uses `--output json`** for clean structured output (no ANSI / progress bar to strip).
- **No new global ports below 1024.** Sidecars bind 8025 / 8026 / 8027 (additive to 8010 / 8020-8024).
- **Pre-existing mobile-node typecheck error stays untouched.**

### Sub-slices (56A → 56E)

| Slice | LOC | Tests | Description |
|---|---|---|---|
| **56A** | ~250 + 3×60 | ~38 | `one-shot-cli-backend.ts` shared base + `cursor-agent-backend.ts` + test. |
| **56B** | ~120 + ~310 | ~16 | `aider-backend.ts` (one-shot, safety flags baked in) + test. |
| **56C** | ~120 + ~310 | ~20 | `mmx-backend.ts` (one-shot, 5-field output parser) + test. |
| **56D** | +92 + 73 | +6 | Registration: `DEFAULT_EXT_AGENTS` (3 rows), `manager.ts` ports, `INSTALL_TABLE`, `getExtAgentInstallInfo`, env overrides. |
| **56E** | +233 (docs) + Dart rewrite + 21 Dart tests | 21 | Docs: 3 new sections in `Ext_Agent_guide.md` + **architectural fix**: `apps/envoygo/lib/ext_agent/ext_agent_presets.dart` mirror replaced with empty const (home node is source of truth). 4 sync points in EnvoyGo: (1) app start, (2) `bridge:status` event, (3) `home:config-updated` event, (4) **bridge reconnect** (re-register handlers + immediate `_reload()`). New agents in `packages/api/src/ext-agent.ts` now auto-propagate to EnvoyGo — no Dart update ever needed. |

Each sub-slice is a separate commit. Test count target: 50-60 new tests total.

### Architecture sketch

```ts
// apps/node/src/ext-agent-adapter/one-shot-cli-backend.ts (56A — shared base)
export abstract class OneShotCliBackend implements ExtAgentBackend {
  readonly kind: ExtAgentSidecarKind;
  readonly label: string;

  protected abstract buildArgs(text: string, sessionKey: string): string[];
  protected abstract parseOutput(stdout: string, stderr: string, exitCode: number): string;

  async ask(text: string, sessionKey: string): Promise<string> {
    if (!text.trim()) return "";
    if (!sessionKey) throw new Error(`${this.kind} ask(): sessionKey is required`);
    // 1. pre-spawn `command -v` check → surface InstallMissingError early
    // 2. spawn process with buildArgs + env, capture stdout/stderr
    // 3. set timeout (requestTimeoutMs, default 60_000)
    // 4. on exit, parseOutput → return text; on error, throw
  }

  async probe(): Promise<boolean> {
    // Cheap: run `<command> --version` (or `auth status` for mmx) with 5s timeout
  }
}

// apps/node/src/ext-agent-adapter/cursor-agent-backend.ts (56A)
export class CursorAgentBackend extends OneShotCliBackend {
  protected buildArgs(text: string, _sessionKey: string): string[] {
    return ["--prompt", text, "--output", "json"];
  }
  protected parseOutput(stdout: string): string {
    // cursor-agent --output json: { "result": "...", "session_id": "..." } OR plain text fallback
    return parseJsonOrText(stdout);
  }
}
```

Aider and mmx backends are similarly small — just override `buildArgs` and `parseOutput`.

### File map (56 — all slices together)

```
新增:
  apps/node/src/ext-agent-adapter/one-shot-cli-backend.ts          # 56A shared base
  apps/node/src/ext-agent-adapter/cursor-agent-backend.ts          # 56A
  apps/node/src/ext-agent-adapter/aider-backend.ts                 # 56B
  apps/node/src/ext-agent-adapter/mmx-backend.ts                   # 56C
  apps/node/test/one-shot-cli-backend.test.ts                      # 56A (shared)
  apps/node/test/ext-agent-adapter-cursor.test.ts                  # 56A
  apps/node/test/ext-agent-adapter-aider.test.ts                   # 56B
  apps/node/test/ext-agent-adapter-mmx.test.ts                     # 56C
修改:
  apps/node/src/ext-agent-adapter/types.ts                         # +3 enum values
  apps/node/src/ext-agent-adapter/manager.ts                       # +3 port mappings
  apps/node/src/ext-agent-adapter/backends.ts                      # +3 createBackend cases
  apps/node/src/ext-agent-adapter/index.ts                         # +3 re-exports
  apps/node/test/ext-agent-adapter.test.ts                         # +6 dispatch tests
  packages/api/src/ext-agent.ts                                    # +3 INSTALL_TABLE rows
  docs/Ext_Agent_guide.md                                          # +3 sections (56E)
  docs/implementation-plan.md                                      # (this section)
```

### Exit criteria

- [ ] `npm run test:dev` is green after each sub-slice.
- [ ] `npm run typecheck` is green (only the pre-existing mobile-node error is allowed).
- [ ] For each new agent, `createBackend(<id>)` returns a real `*Backend` instance and `syncExtAgentSidecar` starts the sidecar.
- [ ] For each new agent, when the binary is missing, `ask()` rejects with `InstallMissingError` and the install card surfaces (matches 55A.1 / 55D.1 behavior).
- [ ] Cursor / Aider / MMX-CLI each have a working `INSTALLED` reachability probe (cheap `--version` or equivalent).
- [ ] Aider `--no-auto-commits --no-git` is passed unconditionally.
- [ ] MMX-CLI uses `--output json` and parses the JSON cleanly.
- [ ] `Ext_Agent_guide.md` documents install + start for all three.

### Risks & mitigations

- **Cursor / Aider / MMX output format may change between versions.** Pin to a known-good flag set; if the user upgrades and the parser breaks, fail loud (rejected Error, not silent truncation).
- **Aider's first run is slow** (Python venv creation, model handshake). Default 60s timeout may be too short; bump to 120s for the first ask only (or pre-warm with a `probe()` on first use).
- **MMX-CLI requires an API key** (`mmx auth login --api-key ...`). Surface this in the install card and the `defaultExtAgentStartHint`.
- **Cursor CLI auth** is OAuth-based — `cursor-agent login` opens a browser. The install card should mention "first run will prompt for browser login".

### Design notes

- The `OneShotCliBackend` base deliberately does **not** reuse `DaemonSupervisor` (55A) — `DaemonSupervisor` is for long-lived processes; one-shot CLIs are simpler.
- Session continuity is the responsibility of the CLI itself, not EnvoyMesh. Cursor's `--resume <sessionId>` and Aider's `--chat-history-file` could be added in a follow-up, but the chat-bridge contract (`ask(text, sessionKey) → string`) doesn't require it.
- MiniMax's own MMX-CLI is a natural fit for "Ext Agent bridge on the home node" — the same node that runs EnvoyMesh can route asks to MMX-CLI, which then calls the MiniMax API. Future: an "MMX in-loop" path could skip the CLI entirely and use the MiniMax SDK directly. Out of scope for Phase 56.
- GLM is **deferred to a future Model Router / Providers phase** (not Phase 57 below) — GLM is a model, not an agent, and the right plumbing is `@envoymesh/models` not `ext-agent-adapter`. Phase **57** is Knowledge Base production + anydoc.

---

## Phase 57 — Knowledge Base production hardening (Markdown-first + anydoc) `[x]`

**Status:** `[x]` **57A–57E + item-4 shipped.**

#### Item-4 — Markdown corpus → Obsidian `[x]`

| Task | Status |
|------|--------|
| Import originals → `documents/`; `.md` → `notes/imports/` | `[x]` |
| anydoc/legacy materialize to `notes/imports/*.md` on import | `[x]` |
| Library **Convert to Markdown note** RPC + UI | `[x]` |
| Obsidian activate/Sync collects loose `.md` into `notes/` | `[x]` |
| No second live MD mirror (originals = Envoy backup) | `[x]` |

**Design docs:** [knowledge-base-and-rag.md](./knowledge-base-and-rag.md) (architecture + anydoc subsection) · Phase 44 (shipped foundation).

**Upstream:** [firecrawl/anydoc](https://github.com/firecrawl/anydoc) (MIT) — Rust office→GFM converter with Node bindings `@firecrawl/anydoc`.

### Goals

1. **P0 — Vault / RAG production** — reliable Markdown-centric ingestion and retrieval for EnvoyAI, chat assist, and `knowledge.query`.
2. **anydoc as primary extractor** — replace the uneven plain-text stitch (`pdf-parse` / `mammoth` / `xlsx` / …) with one GFM pipeline; keep legacy extractors as fallback.
3. **P1 — Obsidian polish** — optional enrich plugin stays production-usable without replacing the vault.
4. **P2 — MCP external KB** — Notion-class search via MCP only (no first-class Notion OAuth sync).
5. **Secondary anydoc surfaces** — Library convert-to-note, attachments, acquisition (after 57A).

### Locked product decision

**Keep original files** under `vault/documents/` (Library download/share / Envoy backup). **Markdown corpus** lives under `notes/` (Obsidian-managed when the plugin is active). Import materializes anydoc/legacy GFM to `notes/imports/`; Library **Convert to Markdown note** does the same for existing files. RAG still falls back to extract-at-index when no on-disk MD exists.

Scanned / image-only PDFs that anydoc rejects as `unsupported` stay local-first: surface a clear UI error — **no** Firecrawl cloud OCR in this phase.

### Architecture (ingestion)

```
Import / file change
    → vault stores original bytes
    → extractVaultDocumentText() tries @firecrawl/anydoc first
    → fallback to legacy extractors if native binding missing / ConvertError
    → chunk GFM → embed → rag-vectors.sqlite + HNSW
```

Primary code touchpoints:

| Area | Location |
|------|----------|
| Extract API | `packages/vault/src/document-text-extract.ts` |
| Extensions | `packages/vault/src/vault-formats.ts` |
| RAG orchestration | `apps/node/src/rag-service.ts` |
| Vault search / inject | `apps/node/src/ai-context.ts` |
| Mesh knowledge.query | `apps/node/src/knowledge-query-inbound.ts` |
| MCP external search | `packages/rag/src/mcp-knowledge-client.ts` |
| Obsidian plugin | `packages/kb-obsidian/` |

### Sub-phases

#### 57A — P0 Vault / RAG + anydoc ingestion `[x]`

| Task | Status |
|------|--------|
| Add `@firecrawl/anydoc` dependency to `@envoymesh/vault`; primary path in `extractVaultDocumentText` | `[x]` |
| Legacy extractors remain fallback when native load fails or ConvertError (`encrypted` / `unsupported` / …) | `[x]` |
| Extend `VAULT_EXTRACTABLE_EXTENSIONS` for anydoc formats (odt/ods/odp/epub/docm/xlsb/…) | `[x]` |
| Reindex invalidation includes extractor id/version (manifest / content-hash) | `[x]` |
| Embedding misconfig / index-status honesty in Settings → AI (build on existing backfill backoff) | `[x]` |
| Sensitivity overrides still gate snippets after GFM extract | `[x]` |
| Fixture tests: docx/pptx/xlsx/pdf/odt → GFM has expected structure; fallback path covered | `[x]` |
| NOTICE / attribution for MIT anydoc | `[x]` (`packages/vault/THIRD_PARTY_NOTICES.md`) |

**Exit criteria:**

- `[x]` Import Office/PDF → searchable vault snippets (unit-covered); EnvoyAI / `knowledge.query` path unchanged + sensitivity still gates
- `[x]` No cloud OCR dependency; image-only PDF fails with clear reason (anydoc `unsupported` → legacy; both empty → no chunks)
- `[x]` Vault + rag + sensitivity unit coverage green; Envoy Local inherit → mock embeddings (chat GGUF ≠ embed model)

#### 57B — P0 Prompt / query path hardening `[x]`

| Task | Status |
|------|--------|
| Audit inject paths: `rag-service`, `ai-context`, `knowledge-query-inbound`, OpenClaw turn context | `[x]` |
| Confirm owner / friends / public ceilings + Phase 44B stranger rate limits + syndication ceiling | `[x]` (audit; rate limit remains 5/min — no hourly cap in code) |
| Align call-site matrix in `knowledge-base-and-rag.md` with code | `[x]` |
| Wire `sensitivityOverrides` on vault search (was reindex-only) | `[x]` |
| Unit/e2e coverage: stranger vs bonded vs owner | `[x]` inbound + Agent Mode contact-draft scope tests |
| Agent Mode contact drafts: contact-scoped vault/chat RAG (not full owner vault) | `[x]` |

**Exit criteria:**

- `[x]` Documented call-site matrix matches code
- `[x]` Stranger / bonded / owner sensitivity behavior covered by tests (policy + override load)
- `[x]` Agent Mode contact drafts use `knowledgeScope: "public"` + contact `knowledgeAccess` + single-contact bond chat

#### 57C — P1 Obsidian polish `[x]`

| Task | Status |
|------|--------|
| Activate/config UX (Settings → KB plugins); shared vault = Obsidian folder + Sync now | `[x]` |
| `published:` ↔ sensitivity sync reliability (documentId key + published-library + reverse frontmatter write) | `[x]` |
| Link-graph rebuild on activate; agent traversal helpers remain sensitivity-aware | `[x]` (rebuild on activate/Sync; traversal APIs already in kb-obsidian) |
| Deactivate plugin without deleting notes or sensitivity labels | `[x]` (link graph only) |

**Exit criteria:**

- `[x]` Same folder works in Obsidian + EnvoyMesh (shared vault root)
- `[x]` Publish via frontmatter or Library Published toggle
- `[x]` Deactivate plugin leaves vault + RAG + sensitivity intact

#### 57D — P2 MCP external KB (Notion-class) `[x]`

| Task | Status |
|------|--------|
| Harden `externalProvider: "mcp"` (`mcp-knowledge-client.ts`): timeouts, error surfacing | `[x]` |
| Settings copy: “Notion/MCP search — not vault sync” | `[x]` |
| Optional gated write-back via existing MCP note formatter → attributed `notes/mcp/` | `[x]` |
| **No** first-class Notion OAuth / bidirectional sync in 57D | `[x]` (explicitly out of scope) |

**Exit criteria:**

- `[x]` Configured MCP search merges into owner prompts (soft-fail + `lastExternalKbError`)
- `[x]` Vault remains source of truth for mesh share / `knowledge.query`

#### 57E — Secondary anydoc surfaces `[x]` (after 57A)

| Task | Status |
|------|--------|
| Library “Convert to Markdown note” (explicit; originals retained) | `[x]` (+ auto on import → `notes/imports/`) |
| Collect loose `.md` into `notes/` on Obsidian activate/Sync | `[x]` |
| Chat attachment text extract via anydoc | `[x]` (`buildAgentAttachmentContext`) |
| Document-acquisition / share ingest prefer anydoc | `[x]` (inbox keeps extension; inbound transfer materializes) |

**Exit criteria:**

- `[x]` Library convert + import materialize ship with tests
- `[x]` At least one non-KB call site (chat attachments + acquisition/share ingest)

### Settled defaults

| Topic | Default |
|-------|---------|
| Canonical bytes | Originals kept; MD for RAG |
| OCR / scanned PDF | Unsupported locally; clear UI error |
| Packaging | npm `@firecrawl/anydoc`; fallback extractors if native load fails |
| Notion | MCP only in 57D |
| WASM / agent skill CLI | Deferred past 57A |

### Risks & mitigations

- **Native napi / Tauri bundling** — ship platform natives; if load fails, fall back to legacy extractors and log once.
- **Extractor upgrade changes chunk hashes** — bump extractor id in manifest so reindex is intentional, not silent drift.
- **Quality vs mammoth on edge DOCX** — keep fallback; add fixtures when regressions appear.

### Out of scope

- Firecrawl hosted Parse / cloud OCR
- Replacing Obsidian or vault-as-foundation
- First-class Notion workspace sync
- GLM / model-provider work (separate future phase)

---

## Phase 58 — Team jobs UX (fleet readiness, live story, multi-node)

> **Status:** `[x]` **58A–58E shipped**.  
> **Design:** [agent-network-ux-team-jobs.md](./agent-network-ux-team-jobs.md)

**Goal:** Actionable fleet readiness, live job story, per-step control, worker UX, EnvoyGo unblock, Advanced Assigner — **without** chat recruitment.

### Explicitly out of scope

- Chat / 1:1 / group “Run as team job” recruitment
- Standing vault sync (byte delivery → Phase 59)
- Competitive bid inbox on EnvoyGo

### 58A — Fleet readiness checklist `[x]`

- `[x]` `FleetReadinessPanel` + `fleet-readiness.ts` (Join → engine → bond → peer Join → card → online → other ready)
- `[x]` Skip Preview when `skipPreview` (empty pool / Join off / engine down)
- `[x]` Wire start dialog, Team jobs empty, detail no-workers
- `[x]` EnvoyGo thin readiness hints
- `[x]` i18n en+zh + unit/component tests
- `[x]` Phase 43 zero-worker criterion closed

### 58B — Live job story + artifact honesty `[x]`

- `[x]` `ChainGetStateResult.steps[]` with objectives / deps / waitingOn / produced
- `[x]` Social detail DAG + attachment honesty copy
- `[x]` EnvoyGo step list (light)

### 58C — Per-step control + worker UX `[x]`

- `[x]` Cancel/reassign one step; observed read-only badges

### 58D — EnvoyGo control surface `[x]`

- `[x]` `waitingForOwner` → `chainResolveIteration`; observed list

### 58E — Assigner picker (Advanced) `[x]`

- `[x]` Orchestrate on this node / bonded peer via existing handoff

### Exit criteria

- `[x]` 58A cold-start checklist
- `[x]` 58B live job story + honesty
- `[x]` 58C–58E as designed

---

## Phase 59 — Team job input delivery (bytes to workers, not vault sync)

> **Status:** `[x]` **59A–59E complete**.
> **Design (source of truth):** [agent-network-job-input-delivery.md](./agent-network-job-input-delivery.md)
> **Related:** [agent-network-artifacts.md](./agent-network-artifacts.md) (Phase 53 refs) · [p2p-file-sharing-plan.md](./p2p-file-sharing-plan.md) (voucher + `/envoymesh/data`) · [agent-network-ux-team-jobs.md](./agent-network-ux-team-jobs.md) (Phase 58)

**Goal:** When a Team job has composer attachments (and optional file outputs to forward), **deliver bytes once** into each relevant worker’s **job-scoped vault workspace** so remote agents can open real files — without mirroring vaults or implying ongoing sync.

**Hard rules:**

- **Handoff, not sync** — one-shot copy under `imports/team-jobs/<chainId>/in/…`; GC with the job (`on_terminal` default).
- **Reuse** Data Transfer Voucher + `/envoymesh/data/0.1.0` (skip `share.*` negotiation for job inputs).
- Deliver only to **awarded / needed** workers (bonded + AN), not the whole contact list.
- Keep Phase 53 small text/structured `inputArtifacts` packs; do not force a data-channel hop for tiny payloads.
- Size caps, sensitivity ≤ job/mandate ceiling, path sanitization, full audit (`chainId` / `correlationId`).

### Explicitly out of scope

- Bidirectional or continuous vault sync
- Delivering the owner’s entire Library / vault tree
- Auto-publish into peer public knowledge
- Chat-first “share into Team job” as the primary path
- New `task.chain.input.*` intents in v1 (parked)

### 59A — Design lock + schema `[x]`

- `[x]` Settle open questions (auto-on-award; referenced+fallback; GC on terminal; WAN fail+Retry)
- `[x]` Attachment manifest + delivery record types in `@envoymesh/api` (`chain-input-delivery.ts`); optional fields on `ChainGetStateResult`
- `[x]` Wire: reuse voucher + `/envoymesh/data` + inbound path remap; no parallel byte protocol
- `[x]` Document vault layout + caps (composer staging → `chainId/in/`; 8×25 MiB; voucher TTL 60m)

### 59B — Assigner deliver-on-award `[x]`

- `[x]` On award (direct + competitive accept): push selected attachments via voucher + `/envoymesh/data` (voucher path = worker `imports/team-jobs/<chainId>/in/…`)
- `[x]` Verify `contentHash` on worker write (existing inbound data-transfer checks)
- `[x]` Skip network for local “You” worker (mark verified; optional vault copy helper)
- `[x]` Unit tests: referenced select / self skip / remote push / push failure

### 59C — Executor path wiring `[x]`

- `[x]` After verified delivery, propose/`inputArtifacts` use **worker-local** path
- `[x]` Required-file steps block or stall clearly until verified (no silent run without file)
- `[x]` OpenClaw / Ext prompt sees local path; unit coverage

### 59D — Social + EnvoyGo UX `[x]`

- `[x]` Start copy: “Workers receive a copy of these inputs when assigned” (updates 58B honesty)
- `[x]` Detail: delivery chips per attachment × worker; Retry
- `[x]` Optional Advanced: deliver-all vs referenced-only
- `[x]` EnvoyGo: status + retry (thin)
- `[x]` i18n + component tests

### 59E — Multi-home E2E + GC `[x]`

- `[x]` Two-home E2E: voucher + `/envoymesh/data` → `imports/team-jobs/<chainId>/in/…` → GC (award path covered by 59B/C units)
- `[x]` GC `imports/team-jobs/<chainId>/` on terminal
- `[x]` Docs: guide + artifacts pointer; Phase 53 non-goal remains “sync”; delivery is this phase

### Exit criteria (overall)

- `[x]` Remote worker can open a labeled composer attachment as a local vault file for that `chainId` after award
- `[x]` Owner sees per-worker delivery success/failure and can retry
- `[x]` No standing vault mirror; job workspace GC policy implemented
- `[x]` Tiny text packs still use Phase 53 without mandatory data-channel hop
- `[x]` Design doc authoritative; Phase 58 complete; **59A–59E complete**

---

## Phase 60 — Agent Network deterministic execution, provenance & recovery

> **Status: `[x]` implementation complete 2026-08-26** (60A–60F landed). Open
> release follow-ups: human a11y/threat sign-off, and per-OS packaged smoke via
> `scripts/agent-network-three-process-smoke.sh`. Normative design:
> [agent-network-next-generation-design.md](./agent-network-next-generation-design.md).
> Canonical Agent Network overview:
> [agent_network.md §15](./agent_network.md#15-next-generation-agent-network-phase-60).

**Goal:** make Team Jobs deterministic, explainable, restart-safe, and
measurably reliable across Envoy Harness, OpenClaw, and Ext Agent workers.

### 60A — Attempt model, orchestration journal, and provenance foundation `[x]`

- `[x]` Add stable `attemptId` and attempt-aware state while retaining current
  `awards` / `partials` compatibility projections.
- `[x]` Replace snapshot-only active recovery with append-only per-chain JSONL
  events plus atomic checkpoints and journal-tail replay. Checkpoint + journal
  tail are authoritative; `active-team-jobs.json` remains a compatibility mirror.
- `[x]` Record semantic assignment, transport, partial, verification,
  reassignment, artifact, recovery, synthesis lineage, and publish events.
- `[x]` Add lazy `chainGetStepProvenance` RPC and compact provenance summaries
  to active state/reports (Node, DirectCall, Social, EnvoyGo).
- `[x]` Add Social execution-details panel and EnvoyGo summary bottom sheet.
- `[x]` Migrate existing `active-team-jobs.json` once without losing active
  chains or duplicating ledger reservations.

### 60B — Signed worker leases `[x]`

- `[x]` Add `agent.worker.lease`, `.revoke`, and `.request` protocol intents,
  role policies, parsers, and schema/security tests.
- `[x]` Publish 30-second signed leases every 10 seconds with runtime, skills,
  capacity, and connectivity classes.
- `[x]` Add bounded lease store with sequence/replay/TTL/clock-skew checks.
- `[x]` Select new awards from leases; retain penalized legacy ready-probe
  fallback for mixed-version peers.
- `[x]` Stop interpreting Agent Card `lastSeenAt` as runtime availability.

### 60C — Deterministic strategies and calibrated reliability `[x]`

- `[x]` Add balanced, fastest, cheapest, highest-confidence, privacy-local,
  and diverse-model presets with versioned resolved snapshots.
- `[x]` Persist deterministic score components and stable exclusion reasons.
- `[x]` Record quality, completion, latency, delivery, and connectivity
  observations keyed by worker/runtime/model-family/skill/path.
- `[x]` Add Beta-posterior confidence bounds, sample sizes, latency estimates,
  and hierarchical sparse-data fallback.
- `[x]` Keep current 3-tuple reputation as the compatibility projection.
- `[x]` Preview/runtime badges and confidence/sample-size UX (Social + EnvoyGo).

### 60D — Protocol-aware restart reconciliation `[x]`

- `[x]` Add signed `task.chain.reconcile.request/response` intents.
- `[x]` Add bounded worker attempt-receipt store.
- `[x]` Restore into `RECOVERING`; pause watchdog/reassignment timers until
  peer reconciliation or grace expiry.
- `[x]` Deduplicate recovered finals and preserve budget reservations without
  re-awarding or charging twice.
- `[x]` Surface recovery state and conflicts in provenance UX.

### 60E — Bounded speculative execution `[x]`

- `[x]` Add immediate-dual mode on the award wire path (policy helpers also
  define hedged / verify-only; those modes are policy-gated only until a
  dedicated wire path lands).
- `[x]` Require criticality/policy, disclosure permission, independent
  workers, idempotency, and worst-case budget preflight.
- `[x]` Select via deterministic rules plus independent verification or owner
  review; never use first-response-wins for critical disagreement
  (`disagree_needs_verify` / `none_pass` block dependent advance).
- `[x]` Cancel losing attempts (including stall-reassign cleanup of
  speculative siblings), sibling wait timeout, account committed cost
  honestly, and retain late finals without silently replacing the selected
  artifact (dual-award wire path + per-attempt partials + cancel losers).

### 60F — Deterministic three-node lab and diagnostics simulation `[x]`

- `[x]` Create the lab foundation: virtual clock and deterministic
  fault-injecting transport, bonds, runtime, fixtures, and event predicates
  (`apps/node/test/support/agent-network-lab/`).
- `[x]` Lab event predicates + shared fixtures (`lab-events`, `lab-fixtures`).
- `[x]` `agent-network-lab-matrix.test.ts` covers design §10.3 scenarios 1–14
  in-process. Several scenarios are focused unit slices (ranking / reconcile /
  journal) on the shared lab clock+bonds rather than full three-process
  meshes; the filename avoids default `*e2e*`/`*three-node*` unit excludes.
- `[x]` Packaged three-process smoke entry:
  `scripts/agent-network-three-process-smoke.sh` →
  `apps/node/test/agent-network-three-process-smoke.test.ts` (libp2p three
  homes: lease wire + lease-backed preview + assigner award). Operator guide:
  `docs/agent-network-three-process-smoke.md`. Does **not** replace the lab
  matrix (PR unit gate). Full execute→report remains Phase 43
  `npm run test:e2e:chain-three-home` when worker engines are available.
- `[x]` No-spend readiness/dry-plan/failover/verification/recovery simulation
  APIs (`agentNetworkDiagnosticsSnapshot` / `Simulate` / `ExportDiagnostics`).
  Dry-plan uses live strategy ranking (`findAgentNetworkWorkersRanked`).
- `[x]` Social “Test Agent Network,” EnvoyGo diagnostic card, and redacted
  JSON export.

### Phase 60 release gates

- `[x]` Protocol schema, role policy, focused Node/API lab + speculation +
  diagnostics tests pass in the unit suite. Full typecheck / Social production
  build / EnvoyGo analyzer remain the standard `test:dev` / release checklist
  (run before tag).
- `[x]` Fourteen deterministic three-node lab scenarios pass without internet,
  paid models, arbitrary protocol sleeps, or reputation mutations
  (`agent-network-lab-matrix.test.ts`).
- `[x]` Chaos / recovery paths covered by lab scenarios 5–7 and 14 (reconcile
  dedup, late-final retention, corrupt journal tail) — no duplicate selected
  artifact or re-ingest of recovered finals.
- `[x]` Security/privacy unit coverage for lease spoof/replay/TTL, privacy-local
  hard gate, speculative late-final retention, and diagnostics redaction.
  Formal threat-model sign-off remains a human release review step.
- `[x]` Social and EnvoyGo localization strings for Test Agent Network /
  diagnostics landed (en/zh + Flutter gen-l10n fallbacks). Accessibility /
  high-contrast / reduced-motion remain design-system defaults — spot-check
  in UI before release (`docs/agent-network-release-checklist.md`).

---

## Phase 60.1 — Stabilize (Now)

> **Status: `[~]` in progress** — UX honesty, disagree owner path, engine-backed
> three-process smoke, release checklist. Normative design unchanged.

**Goal:** tighten owner-facing copy so Agent Network capabilities are not
over-promised; close the execute→report gap in packaged smoke; give owners a
minimal path when speculative results disagree.

### Release gates (stabilize)

- `[x]` Lab matrix remains PR unit gate (`agent-network-lab-matrix.test.ts`).
- `[x]` Three-process smoke asserts leases + award + **report** when workers use
  mock Team-job engines (assigner not in worker pool).
- `[x]` Human checklist: `docs/agent-network-release-checklist.md` (per-OS smoke,
  a11y spot-check, threat sign-off placeholders).

### Polish strategy / provenance / recovery copy

- `[x]` Social + EnvoyGo: strategy hints — hedged / verify-only are policy-only;
  wire dual-award only when immediate-dual gates pass.
- `[x]` Test Agent Network mode hints — dry-plan uses live ranking; failover /
  recovery are light label simulations.
- `[x]` Worker pick cards: assignment reason codes + calibrated reliability hint.

### Disagree UX

- `[x]` `chainGetState.speculationReview` when `disagree_needs_verify` /
  `none_pass` blocks dependents.
- `[x]` `chainResolveSpeculation` — owner **pick** one final or **reassign** step.
- `[x]` Social chain detail banner + actions.

### Exit criteria

- `[ ]` Per-OS manual smoke signed off (see release checklist).
- `[ ]` Human a11y + threat spot-check recorded for the tag.
- `[~]` Automated companion evidence started under Phase **64D**
  ([agent-network-release-checklist.md](./agent-network-release-checklist.md)
  evidence log).

---

## Phase 61 — Agent Network depth (hedged wire, recovery chaos, reliability UX)

> **Status: `[x]` complete 2026-08-27** (61A–61D landed). Optional follow-ups:
> hedged lab-matrix scenario, packaged recovery-chaos script (mirror three-process
> smoke). Release tags still use Phase 60.1 manual checklist. Builds on Phase 60
> (speculation policy, reconcile, reliability store). Normative design:
> [agent-network-next-generation-design.md](./agent-network-next-generation-design.md).

**Goal:** wire the remaining speculation modes, prove restart recovery on real
processes (not just in-process lab matrix), and surface sparse-data honesty in
Team job preview/start.

### 61A — Hedged wire (`fastest`) `[x]`

- `[x]` After primary accept, schedule hedge when `decideSpeculationForSubtask`
  returns `mode: hedged` (p75×1.25 delay, default 30s when no history).
- `[x]` `trackChain` tick launches speculative sibling when hedge deadline elapses
  (unless primary partial already arrived).
- `[x]` Unit test: hedge fires after delay, not at award time.
- `[ ]` Lab matrix scenario for hedged path (optional follow-up).

### 61B — Verify-only path (`balanced` + high criticality) `[x]`

- `[x]` Policy already returns `verify_only` (no dual execution at award).
- `[x]` Explicit gate: block advance until verify loop completes on critical steps
  (`requiresVerifyOnlyForSubtask`, `verifyOnlyBlockedSubtasks`, unit test).

### 61C — Recovery chaos (real processes) `[x]`

- `[x]` `restartPhase13NodeService` harness helper (same profileDir + mesh; no `stopNode`).
- `[x]` `agent-network-recovery-chaos-smoke.test.ts`: award → restart assigner mid-run →
  assert `recovery.phase === recovering` → grace → running.
- `[x]` Post-restart execute→report in same test (`flushRecoveryAdvancePending` +
  tracking completion tick; disable iteration extend in smoke).
- `[ ]` Optional packaged script (mirror three-process smoke).

### 61D — Reliability → ranking feedback UX `[x]`

- `[x]` `reliabilityFallbackLevel` on ranked workers + preview suggestedWorkers.
- `[x]` Social start dialog: sparse-data hint when fallback ≠ exact or samples low.
- `[x]` EnvoyGo start screen sparse-data chip + l10n.

### Phase 61 release gates

- `[x]` Hedged unit test (`chain-speculation-wire.test.ts`) passes in unit suite.
- `[x]` Verify-only wire unit test (`chain-verify-only-wire.test.ts`) passes.
- `[x]` Recovery chaos E2E passes under `RUN_E2E=1`
  (`agent-network-recovery-chaos-smoke.test.ts`: award → assigner restart →
  RECOVERING → reconcile → execute→report).
- `[x]` Preview/start surfaces `reliabilityFallbackLevel` when reliability store
  is sparse (Social start dialog + EnvoyGo start screen).
- `[ ]` Phase 60.1 manual checklist still applies for release tags (per-OS smoke,
  a11y/threat sign-off — see [agent-network-release-checklist.md](./agent-network-release-checklist.md)).

---

## Phase 62 — Assigner intelligence & capability-based orchestrator selection

> **Status: `[x]` complete (2026-08-27)** — enhances the **existing** Team job orchestrator
> (plan → award → gather partials → synthesize → report), not a replacement.
> Assign / gather / finalize are LLM-heavy; when enabled, the **Assigner** may
> be a bonded peer with stronger model capability than the job creator. **Off by
> default** (`assignerSelection: "local"`). Normative handoff wire already
> shipped (Phase 40E / [agent-network-plan-assign.md](./agent-network-plan-assign.md)).

**Goal:** make one-shot Team jobs reliably produce a good report from natural
language, and optionally route orchestration (plan+assign, iteration judge,
merge/synthesis) to the best-capable eligible home in the fleet.

**Design principle:** the **creator** starts the job and owns the mandate; the
**Assigner** runs the LLM loops. Today they are the same node unless the owner
manually picks a remote Assigner in Advanced settings (`assignerPeerId`). Phase
62 adds deterministic **capability scoring** + an opt-in default.

```text
Owner (creator home)                Remote Assigner (optional)
        │                                    │
        │  chainStartFromGoal                │
        │  assignerSelection: best_capable   │
        ├──────── task.chain.handoff ───────►│ plan+assign (LLM)
        │  (same chainId)                    │ award workers (A2A)
        │                                    │ gather partials
        │◄─────── chain:state / report ──────│ synthesize + publish
        │  observes progress                 │
```

### 62A — Assigner intelligence (plan + completion) `[x]`

**Assign (planning layer):**

- `[x]` Default to LLM **plan+assign** when the Assigner has a usable model
  (`allowLlmDecompose` + live providers); keyword single-step remains fallback.
- `[x]` Preview/start surfaces plan warnings and step count before launch.
- `[x]` Completion **invariants:** tracking loop + recovery flush must publish
  when all open-round subtasks have finals (extend/iteration cannot strand jobs
  — harden 61C lesson: explicit extend knobs + “all steps awarded?” guard).

**Gather (coordination layer):**

- `[x]` Document and test extend vs one-shot defaults (`extendMaxStepsPerRound: 0`
  for smoke; product default unchanged until UX review).
- `[x]` Disagree / verify-only owner unblock paths tested in multi-step smokes
  (Phase 61 coverage; not re-tested in Phase 62).

### 62B — Synthesis & final report quality `[x]`

- `[x]` When Assigner has `llmMerge`, synthesize prefers `merge_structured`
  (report-style goals get clearer provenance); concatenate fallback unchanged.
- `[x]` Owner-visible synthesis line in report (“Merged by Assigner …”).
- `[x]` Iteration judge uses Assigner model (already handoff-carried); Social start
  dialog surfaces continue/stop hint from **job** `iterationMaxRounds` (not only
  node defaults).

### 62C — Capability-based Assigner selection (optional, off by default) `[x]`

**Config (default off):**

- `[x]` `chainDefaults.assignerSelection?: "local" | "best_capable"` — default
  **`"local"`** (creator’s agent is Assigner; today’s behavior).
- `[x]` Per-job override on `ChainStartFromGoalParams` (+ preview params).
- `[x]` Explicit `assignerPeerId` still wins (Advanced picker unchanged).

**Scoring (deterministic, auditable):**

- `[x]` Candidate pool = bonded peers eligible as Assigner today
  (`task.execute` + Join Agent Network + fresh agent card); exclude creator-only
  when a strictly better remote exists only if policy allows.
- `[x]` `scoreAssignerCapability(peer)` using signals already on the mesh:
  - Assigner-side **modelProviders** tier (cloud preset > local/ollama > mock/disabled)
  - `agentNetworkProfile.modelFreshness`, `contextWindow`, `spendPosture`
  - Engine readiness: local = OpenClaw/Harness/Ext check; remote =
    lease-ready or card has `chain.orchestrate` (online/same-LAN required to hand off)
  - Reachability: mesh online or same-LAN dialable; legacy probe penalized in score
- `[x]` Stable tie-break: same-LAN peer → higher freshness → lexicographic peer id.
- `[x]` If `best_capable` and top scorer ≠ local agent →
  `_handoffChainGoalToAssigner` (existing Phase 40E path); else local `_runChainGoal`.
- `[x]` Audit + journal: `chain.assigner_selected` with
  `{ mode, selectedPeerId, creatorPeerId, score, reasonCodes[] }`.
- `[x]` Preview RPC returns `suggestedAssignerPeerId` + human reason when mode ≠ local.

**UX (honest, opt-in):**

- `[x]` Social: Chain defaults — “Best capable peer” (off by default); Start dialog
  toggle + suggested Assigner hint. EnvoyGo: reads home `assignerSelection`
  defaults (no separate mobile defaults editor); shows suggested Assigner reason.
- `[x]` Start dialog: when mode is `best_capable`, show suggested Assigner before
  Start; Advanced “Orchestrate on” override still wins.
- `[x]` Mobile remains observe/approve-first; Assigner suggestion visible when
  home defaults enable `best_capable`.

**Security / policy:**

- `[x]` Only **direct**-bond Assigner candidates (same as worker recruitment).
- `[x]` Mandate budget + sensitivity stay on creator-signed chain mandate; remote
  Assigner cannot raise limits without owner RPC on creator home.
- `[x]` No Assigner selection across owners without existing bond + Join gate.

### 62D — Engine matrix & handoff E2E `[x]`

- `[x]` `chain-assigner-handoff-e2e.test.ts` extended: weak-local creator +
  strong-remote Assigner → plan+assign+report on remote.
- `[x]` `chain-assigner-capability-select.test.ts` — unit tests for scorer +
  tie-breaks (mock/disabled vs cloud preset profiles).
- `[x]` Three-process smoke variant: creator starts with `best_capable`, worker
  pool on third home, Assigner on second.
- `[~]` Recovery chaos smoke: Assigner restart when **remote** Assigner owns journal
  (local assigner restart covered by Phase 61C; **moved to Phase 64A/64C**).

### Phase 62 release gates

- `[x]` Default unchanged: `assignerSelection: "local"` — no behavior change until
  owner enables `best_capable` in defaults or per job.
- `[x]` With `best_capable` on, libp2p two-home handoff smoke reaches report.
- `[x]` Completion invariant tests pass (extend disabled + enabled matrix).
- `[x]` Preview shows suggested Assigner + reason when capability mode on.
- `[ ]` Phase 60.1 manual checklist still applies for release tags.

### Exit criteria

- `[x]` Owner on a weak-local home can opt in and get a cloud-capable Assigner
  without manually picking peer ids.
- `[x]` Assign / gather / finalize loops run on the selected Assigner’s model,
  not the creator’s, for plan+assign + merge + iteration judge.
- `[x]` Creator home still receives `chain:state` + final report for the same
  `chainId`.

### Cross-references

- [agent-network-plan-assign.md](./agent-network-plan-assign.md) — plan+assign + handoff
- [agent-network-iteration.md](./agent-network-iteration.md) — judge / extend on Assigner
- `_handoffChainGoalToAssigner` — `apps/node/src/node-service-chain-orchestration.ts`
- Phase 58E — Advanced Assigner picker (manual); Phase 62 automates when opted in
- Phase 60A journal — Assigner restart recovery when remote owns chain

---

## Phase 63 — Envoy Market (P2P shop + search)

> **Status:** `[x]` **63A–63F complete** (2026-08-31)  
> **Design (source of truth):** [p2p-market-plan.md](./p2p-market-plan.md) · **Index:** [roadmap.md](./roadmap.md)  
> **Not** Phase 24 Agent Marketplace (agent negotiation among workers).

**Goal:** Every owner runs a **Shop** (list + price). **Publish** is the core mesh feature. Each listing chooses visibility: **`public`** (default, mesh strangers) or **`bonds`** (contacts only). Each user has a **Market** view with **search**. Flow: search → EnvoyAI shortlist → listing-scoped chat → optional bond. Payments/escrow deferred (MKT-F).

### 63A — Local Shop (MKT-A) `[x]`

- `[x]` Shop profile + listing CRUD + media paths on home node (`shop/` under profile dir)
- `[x]` Listing `visibility`: `public` \| `bonds`, **default `public`**; clear publish UI
- `[x]` Shop types + helpers in `@envoymesh/api` (`shop.ts`); wire Zod in protocol when MKT-B announces
- `[x]` `NodeService` shop RPCs + Social **Market** tab (Browse stub + My Shop) + i18n (en/zh/de/fr/ja/ko/it)
- `[x]` EnvoyGo list/read stubs (Social Market tab + Me → My Shop; thin client → home)
- **Exit:** Owner creates/edits/prices listings offline; unit tests for schema + store
- **Polish (2026-09-01):** large listing photos mirror to public web `photos/market/{id}.*` → `thumbnailRef` (`envoy://…` + contentHash); tiny images still inline ≤20KB; Clear history chip (Social + EnvoyGo); Social **Add from photo** capture→draft

### 63B — Publish to bonds + Market + inquire (MKT-B) `[x]`

- `[x]` `market.announce` to direct (+ referred) bonds; Market tab Browse uses MarketCache
- `[x]` Listing-scoped chat (extend `chat.message` with `listingId`)
- `[x]` Share link URI (`envoy://shop?ownerId=&listingId=`) copy affordance
- **Exit:** Two bonded nodes: A publishes → B Market → B inquires → thread on A (manual / mesh path ready; unit coverage for cache + announce schema)

### 63C — Public publish + stranger search (MKT-C) `[x]`

- `[x]` `visibility: public` served via `market.search` / `market.search.result`
- `[x]` Fan-out to bonds + connected + peer-directory + DHT/`market:shop` rendezvous; rate-limit strangers; bonds-only filtered
- `[x]` Block/report UI (local block + audit); public listing share URI
- `[x]` Two-node stranger e2e (`market-search-stranger-e2e.test.ts`)
- **Exit:** Unbonded node can discover public listings from reachable peers and inquire via listing-scoped chat without vault access

### 63D — EnvoyAI shortlist + ranking (MKT-D) `[x]`

- `[x]` `mesh.market.search` + `mesh.market.shortlist` tools; rank freshness
- `[x]` Browse keyword chips + auto-fill (history / interests / categories) — §7.6
- `[x]` “Add bond” CTA after commerce inquire; Feed teaser deferred to follow-up
- **Exit:** NL “find 2–3 …” returns cards via tools; Browse shows chips + Suggested for you

### 63E — Capture→draft + seller FAQ assist (MKT-E) `[x]`

- `[x]` EnvoyGo photo → draft listing → publish on home (`shopSaveListingMedia` / `shopDraftListing` / `shopUpsertListing`)
- `[x]` Seller suggested replies from listing text (propose / approve) — Social + EnvoyGo chat; audited
- **Exit:** Phone capture path + audited proposal path

### 63F — Soft close + credits hook (MKT-F) `[x]`

- `[x]` Listing status reserved/sold announce (`sold` upserts as sold; Browse hides terminal listings)
- `[x]` Payments ADR hook (off-chain credits; no chain required) — [market-payments-credits-adr.md](./market-payments-credits-adr.md)
- **Exit:** Sold propagates; payment roadmap documented

### Phase 63 release gates (when MKT-C ships)

- `[x]` Open discovery + listing-scoped stranger chat without granting bond privileges
- `[x]` Bonds-only listings invisible to strangers
- `[x]` Same NodeService surface for Social + EnvoyGo
- `[x]` Focused unit + two-node stranger-search tests green

### Cross-references

- Design: [p2p-market-plan.md](./p2p-market-plan.md)
- Reuse patterns: [ai-document-backbone-plan.md](./ai-document-backbone-plan.md) (metadata ≠ bytes), bonds public tier, Feed/`share.*`
- Stories D–E payment rail remains parked after Market core

---



## Phase 64 — Agent Network multi-home reliability (remote Assigner recovery)

> **Status: `[x]` Wave 0 product + automated** — 64A–64C done; **64D** automated
> gates green (`npm run test:dev`, lab-matrix, 64C). Human per-OS / a11y / threat
> rows remain open until a **release tag**. Phase **65** started.
> **64A `[x]` / 64B `[x]` / 64C `[x]` / 64D automated `[x]`** (2026-09-05).
> Honest reclaim + remote-Assigner kill→reclaim under `RUN_E2E=1` (same `chainId`
> resume **and** creator report via receipt apply). Checklist:
> [agent-network-release-checklist.md](./agent-network-release-checklist.md).
>
> **Program defaults (locked):** Hybrid mesh; **same-owner office fleet UX first**;
> friends-mesh stays bonded+Join only. No standing vault sync. Chat→job is
> eligibility-gated (Phase 67B), never default chrome.
>
> **Baseline (do not reinvent):** `chain-orchestrator.ts`,
> `node-service-chain-orchestration.ts`, `chain-assigner-select.ts`,
> `chain-handoff.ts`, `chain-active-journal.ts`, `chain-reconcile-recovery.ts`,
> `worker-attempt-receipt-store.ts`. Operator guide:
> [agent-network-guide.md](./agent-network-guide.md) · Next-gen design:
> [agent-network-next-generation-design.md](./agent-network-next-generation-design.md).

**Goal:** A Team job that handoffs to a remote Assigner can lose that home mid-run
and still finish or fail cleanly under owner control.

### 64A — Remote Assigner journal ownership `[x]`

- `[x]` Persist **creator vs Assigner ownership** on journal/checkpoint
  (`chainId`, `assignerPeerId`, `creatorPeerId`, ownership epoch) —
  `chain-remote-reclaim.ts`, `DelegatedChainStore`, `ChainStore.setOwnership`.
- `[x]` On Assigner restart: restore from Assigner journal (Phase 60A path),
  bump ownership epoch (Assigner-only), wire `task.chain.ownership` notify to
  creator, local `chain:state` / audit.
- `[x]` Scaffold permanent-loss path: `evaluateAssignerStranded` /
  `shouldMarkAssignerStranded` (body in 64B).
- `[x]` Wire: thin hooks in handoff send/accept + recovery restore; core logic in
  [`chain-remote-reclaim.ts`](../apps/node/src/chain-remote-reclaim.ts).
- `[x]` Prefer new focused module over growing allowlisted orch files.
- `[x]` Optional `ownershipEpoch` on `task.chain.reconcile.request`.
- `[x]` Unit tests: `apps/node/test/chain-remote-reclaim.test.ts`.
- **Exit:** Creator observes Assigner restart; ownership epoch advances without
  double-award. **Met** (wire notify + Assigner-only epoch bump).

### 64B — Stranded-job heal `[x]`

- `[x]` Creator-side scanner: active jobs whose Assigner is unreachable past TTL →
  surface in Social/EnvoyGo (“Assigner offline — reclaim or cancel”).
- `[x]` Cancel: `chainCancelDelegated` marks cancelled + best-effort
  `task.chain.cancel` to Assigner.
- `[x]` **Honest reclaim:**
  - Assigner fans `task.chain.status` to **creator** (not only workers); creator
    persists `statusMirror` on delegated ownership.
  - `chainReclaimAssigner` hydrates the **same `chainId`** from the mirror when
    awarded workers exist, then runs reconcile with empty `knownAttempts` +
    `seedMissingAttempts` (worker receipts replace placeholder attempt ids).
  - Does **not** cancel workers on reclaim; Assigner stop is best-effort and
    local-only when creator cancel arrives.
  - Fallback `mode: "restart"` + `newChainId` only when the mirror is insufficient
    (honest — UI copy distinguishes resume vs restart).
- `[x]` Audit summaries: `chain.assigner_lost`, `chain.reclaimed mode=resume|restart`,
  `chain.stranded_cancelled`.
- `[x]` Social `ChainDetailPanel` + EnvoyGo active detail stranded banners.
- `[ ]` Optional polish: full EnvoyGo arb l10n (EN hardcoded strings today);
  redirect UI to `newChainId` after restart-mode reclaim.
- **Exit:** Owner can reclaim (prefer mid-flight) or cancel a stranded
  remote-Assigner job from UI.

### 64C — Multi-home chaos tests `[x]`

- `[x]` Sibling smoke: `agent-network-remote-assigner-chaos-smoke.test.ts` —
  **creator + remote Assigner + worker**; kill Assigner mid-partial → creator
  reclaim (`mode=resume`, same `chainId`, awarded runtime hydrated) → worker
  final receipt applied on creator → published report.
- `[x]` Three-process smoke script also runs the remote-Assigner-kill variant
  (`scripts/agent-network-three-process-smoke.sh`).
- `[x]` Gate on `RUN_E2E=1` like existing chaos.
- `[x]` Harness routes `task.chain.reconcile.*` like production; reclaim polls
  receipts; running-only reclaim responses keep peers pending until final/grace.
- `[~]` Full mesh reconcile **response** delivery creator←worker can still miss
  in this harness when agent→owner card routing is stale; the smoke applies the
  worker receipt store into creator recovery (same `applyReconcileReports` path).
- **Exit:** Remote Assigner kill → stranded → honest reclaim → report on creator
  under `RUN_E2E=1`. **Met** (with receipt-apply note above).

### 64D — Phase 60.1 sign-off (parallel, release-blocking) `[~]`

- `[x]` Checklist doc updated for Phase 64 (64C gate + stranded UX spot-check +
  automated evidence log).
- `[x]` **Automated evidence** on Darwin (pre-67): `npm run test:dev` green
  (8399 pass), lab-matrix, reclaim/reconcile units, 64C (receipt-apply).
- `[x]` **Post-67 refresh** — `npm run test:dev` on HEAD (`ae5c0ca1`+); evidence in [`agent-network-release-checklist.md`](./agent-network-release-checklist.md).
- `[~]` Per-OS manual smoke: **macOS Darwin dev** spot-check + automated green slice; **Linux / Windows** still open before tag.
- `[~]` Human a11y + threat spot-check: coding/AN automated coverage refreshed; full tag sign-off still open.
- `[ ]` No new features in this checklist — honesty + manual proof only.
- **Exit for Wave 0 / Phase 65 start:** **Met** (automated). **Exit for release
  tag:** human rows still required; post-67 automated refresh in progress.

### Phase 64 release gates

- `[x]` Remote Assigner kill→reclaim E2E green under `RUN_E2E=1` (64C; resume
  same `chainId` + creator report via receipt apply).
- `[x]` Stranded reclaim UX ships (Social + EnvoyGo observe/act).
- `[x]` 60.1 / 64D automated checklist green (`test:dev`); human sign-off open
  for tag.

### Cross-references

- Phase 61C local Assigner chaos; Phase 62D deferred remote path
- Phase 60A journal / 60D reconcile
- Modules: `chain-handoff.ts`, `chain-reconcile-recovery.ts`, `chain-active-journal.ts`

---

## Phase 65 — Agent Network orchestration power (depth, long-running, artifacts)

> **Status: `[x]` Wave 1** — **65A + 65B + 65C complete**. Mandate-bounded; no
> unbounded depth or spend.

**Goal:** Complex jobs across machines = deeper graphs, longer life, richer
job-scoped artifacts.

### 65A — Deeper DAGs + controlled depth-4 `[x]`

- `[x]` Raise protocol max depth **3 → 4** with `allowDepth4` on mandate
  (default off; `allowDepth3` remains common opt-in) —
  [`packages/protocol/src/agent-network.ts`](../packages/protocol/src/agent-network.ts).
- `[x]` Depth resolution helper:
  [`apps/node/src/chain-depth-mandate.ts`](../apps/node/src/chain-depth-mandate.ts)
  (+ unit tests); wired into planChain / bid / plan-assign clamps.
- `[x]` Enforce budget tree + sub-mandate verification at each depth
  (`verifySubChainMandate` / `verifySubChainSelfConsistency` on
  `acceptHandoff` + inbound `task.chain.delegate`).
- `[x]` Strengthen `task.chain.delegate` subtree ownership: inbound handler
  records B as owner in the arbitration ledger (and persists
  `applyArbitration` results).
- `[x]` Cap negotiation rounds / fanout still hard-bounded (bid
  `negotiationRound` max **3**; worker fanout caps unchanged; tree depth
  orthogonal).
- `[x]` Opt-in depth-4 job completes across ≥2 homes (E2E) —
  [`apps/node/test/chain-depth4-two-home-e2e.test.ts`](../apps/node/test/chain-depth4-two-home-e2e.test.ts).
- **Exit:** Met.

### 65B — Long-running multi-round jobs `[x]`

- `[x]` Extend Phase 47 iteration: higher safe `maxOuterRounds` (hard cap
  **48**, was 10) under mandate + spend/deadline ledger gates
  (`CHAIN_ITERATION_MAX_ROUNDS`).
- `[x]` Checkpoint cadence: `persistNow` before each outer round continue and
  after inbound `task.chain.delegate` ownership record.
- `[x]` Idle/worker lease renewals: dead leases pause the open round
  (`pausedForLease` / `lease_stale`) instead of silent stall-reassign forever.
- `[x]` Long-running iteration survives Assigner restart (Wave 0 checkpoint +
  Map/Set restore fix) —
  [`apps/node/test/chain-iteration-restart-smoke.test.ts`](../apps/node/test/chain-iteration-restart-smoke.test.ts).
- **Exit:** Met.

### 65C — Richer cross-machine artifacts `[x]`

- `[x]` Extend Phase 59 job-scoped delivery
  ([`chain-input-delivery-runtime.ts`](../apps/node/src/chain-input-delivery-runtime.ts)):
  **intermediate artifacts** (worker → Assigner → next worker) as content-addressed
  blobs + refs on `task.chain.partial` / merge — **not** vault mirror —
  [`chain-artifact-transfer.ts`](../apps/node/src/chain-artifact-transfer.ts) +
  [`packages/api/src/chain-artifact-delivery.ts`](../packages/api/src/chain-artifact-delivery.ts).
- `[x]` Surface artifact graph in `chainGetStepProvenance` + Social live steps
  (`ChainLiveSteps` artifact handoff panel).
- `[x]` Size/sensitivity gates stay on mandate `maxSensitivity` +
  [`chain-sensitivity-gate.ts`](../apps/node/src/chain-sensitivity-gate.ts)
  (`chainArtifactPathWithinJobWorkspace`).
- `[x]` Prefer `chain-artifact-transfer.ts` for new transfer logic.
- `[x]` Intermediate artifact handoff across ≥2 homes —
  [`apps/node/test/chain-intermediate-artifact-two-home-e2e.test.ts`](../apps/node/test/chain-intermediate-artifact-two-home-e2e.test.ts).
- **Exit:** Met.

### Phase 65 release gates

- `[x]` Depth-4 opt-in E2E across ≥2 homes **met**; intermediate artifacts E2E
  **met** (65C).
- `[x]` Long-running round checkpoint + lease-pause tested; Assigner-restart
  iteration survival E2E met.

### Cross-references

- [agent-network-iteration.md](./agent-network-iteration.md) ·
  [agent-network-job-input-delivery.md](./agent-network-job-input-delivery.md) ·
  [agent-network-artifacts.md](./agent-network-artifacts.md)

---

## Phase 66 — Agent Network fleet ops (Join / bond / lease, office + WAN)

> **Status: `[x]` shipped** — Wave 2 supporting track. 66A reliability + 66B
> office/WAN discovery. Same-owner office fleet UX first; friends-mesh stays
> explicit bond+Join.

**Goal:** Office + WAN fleets “just work” for same-owner setups; friends-mesh
remains explicit bond+Join. No public/stranger workers.

### 66A — Join / bond / lease reliability `[x]`

- `[x]` Harden refresh path: stale cards, Join-off peers, lease expiry → one
  actionable gap per worker (`fleet-worker-gaps` + Fleet readiness panel).
- `[x]` Auto-heal: after any `bond:established` (LAN accept, sponsor, hello),
  debounced `refreshAgentNetworkWorkers` once (parity with LAN soft pool).
- `[x]` Wire 60F diagnostics reasons into readiness checklist + named gaps.
- `[x]` NodeService / Tauri: start lease broadcaster when Join is on
  (`ensureWorkerLeaseBroadcasterStarted` on online + Join toggle).
- **Exit:** Cold Join→lease-visible path without peer-id debugging for common gaps.

### 66B — Office + WAN discovery `[x]`

- `[x]` Same-LAN (and loopback) boost stays; WAN “online” requires live relay
  reservation plus circuit/public dial hints (`evaluateWanPeerOnlineGate`).
- `[x]` One-click **Ensure Join and leases** in Team jobs → **Manage workers**
  (`ensureFleetWorkersJoinAndLease` via `agent-network-sections.tsx`) — local
  Join + lease publish, then `agent.worker.lease.request` to bonded peers.
  Not on the chain-start dialog (by design: readiness tooling stays in Manage
  workers).
- `[x]` Public / blocked strangers are skipped (no recruitment).
- `[x]` Three-home LAN smoke: bond → Join+lease ensure → lease-visible by
  ownerId → Team job start (`agent-network-three-process-smoke`).
- **Exit:** Three homes (LAN loopback; WAN+relay gated on reservation) → cold
  start → Join → lease-visible → Team job start.

### Cross-references

- [agent-network-fleet.md](./agent-network-fleet.md) ·
  [agent-network-ux-team-jobs.md](./agent-network-ux-team-jobs.md) Phase 58A ·
  `capability-index.ts`, `worker-lease-store.ts`, `agent-network-sections.tsx`

---

## Phase 67 — Agent Network product UX (templates, chat→job, live progress)

> **Status: `[x]` complete** — Wave 3 (67-0 → 67C). Phases **64–67** program exit met
> for product code; human release sign-off remains **64D**.

**Goal:** Complex runs stay operable on Social + EnvoyGo; templates and chat
entry without diluting Team jobs. Land new UX in focused modules after 67-0.

### 67-0 — Fleet / Lease / probe extract (maintainability) `[x]`

Phase 66 review P2: extract wrappers out of allowlisted `node-service-impl.ts`
before 67A–67C product code.

- `[x]` `node-service-chain-probe-reachability.ts` — `chainProbeReachability` + WAN gate call
- `[x]` `node-service-worker-lease.ts` — `ensureWorkerLeaseBroadcasterStarted` / `startWorkerLeaseBroadcaster`
- `[x]` `node-service-agent-network-refresh.ts` — `refreshAgentNetworkWorkers`
- `[x]` `node-service-fleet-ops.ts` — `ensureFleetWorkersJoinAndLease` deps bag
- `[x]` `node-service-chain-ownership.ts` — reclaim/cancel/scan (Phase 64 body)
- **Exit:** Extracted Fleet/Lease/probe/ownership helpers out of allowlisted
  `node-service-impl.ts` (~547 LOC removed); existing fleet/lease/three-process
  tests green; file must not grow for 67A–67C. **Honest note:** RPC methods
  like `chainStartFromGoal` / `chainReclaimAssigner` remain substantial on the
  class — true “thin wrappers + service partials” is Phase **68+**, not 67-0.

### 67A — Local templates `[x]`

- `[x]` Unpark **local** chain templates (built-ins + save-as-template from a
  completed job) via `chain-recipes-store` / recipe RPCs.
- `[x]` Mesh template marketplace stays parked; optional share = export/import
  or bond-only announce — **not** Market Phase 63 commerce.
- **Exit:** Owner starts a saved local template from Social (and EnvoyGo light).

### 67B — Chat → Team job (eligibility-gated) `[x]`

- `[x]` Unpark parked design in [agent-network-ux-team-jobs.md](./agent-network-ux-team-jobs.md) §3:
  **optional** “Start team job with these bonded peers” only when each peer is
  Join + card + lease-ready.
- `[x]` Never default chat chrome; overflow / Advanced only.
- **Exit:** Eligibility-gated entry from contact/group; non-ready peers blocked with clear copy.

### 67C — Live progress + EnvoyGo parity `[x]`

- `[x]` Social: clearer multi-home story (Assigner home, worker homes, reclaim
  banner from 64B, artifact steps from 65C).
- `[x]` EnvoyGo: stranded-Assigner reclaim/cancel + template start; live steps.
- `[x]` **Not** full competitive bid inbox on mobile (desktop-first stays).
- **Exit:** Owner starts template job, watches cross-machine progress, reclaims
  if Assigner dies — without opening Settings.

### Explicit non-goals (Phases 64–67)

- Standing cross-home vault sync
- Public/stranger workers
- Unbounded depth or unbounded spend
- Rewriting Social Team jobs into a new product surface
- Recreating Capacitor `apps/mobile/`

### Maintainability note

Oversized allowlisted modules (`node-service-impl.ts`, `chain-orchestrator.ts`,
`node-service-chain-orchestration.ts`) must **not** grow for Wave 1–3 features:
land new behavior in focused modules; split only when a wave touches that area.
**67-0** is the Phase 66 review follow-up for Fleet/Lease wrappers.

### Cross-references

- [agent-network-ux-team-jobs.md](./agent-network-ux-team-jobs.md) ·
  Social `ChainsView.tsx` · EnvoyGo `lib/screens/chains/*`

---

## Phase 68 — Coding tab (Social + EnvoyGo)

> **Status: `[x]` shipped** — **C0–C7** complete (Social + EnvoyGo); **[68-FH](#68-fh--family-harness-alignment-envoyhome--envoycoder)** P0–P2 (execution waves 0–4).  
> New Coding work = follow-up epic or explicit product ask; keep checkboxes here as the shipped record.

**Epic design (canonical):** [`../product_coding_tab_design.md`](../product_coding_tab_design.md)  
**Cursor working plan (pointer):** `~/.cursor/plans/coding_tab_implement_84cc6a05.plan.md`

**Goal:** Dedicated **Coding** tab on Social + EnvoyGo — unified chrome for coding harnesses; Chat loses Pi/EH; Terminal becomes shell-only **after strip gate**; promote the EH timeline/task model (don’t invent parallel stores).

### UI reference plan (Paseo → Social / EnvoyGo)

Canonical detail: design **[§3e](../product_coding_tab_design.md#3e-paseo-ui-reference-map-social--envoygo--think-carefully)**. Build must follow this split:

| Surface | Take from Paseo | Do not take |
|---------|-----------------|-------------|
| **Social** | Desktop three-pane: list \| agent stream \| Changes; status-first / cwd-grouped sidebar; **New session create sheet** (harness + folder); left-rail Settings → AI; tracks + permission container; harness fixed at create | Paseo Unistyles skin; git/worktree as primary chrome; full ACP catalog day one; schedules / multi-host |
| **EnvoyGo** | **Inside Coding tab only:** resume-first status list → push session; FAB for new; session anatomy (app bar / timeline / permissions / tracks / composer); Changes + permissions as sheets; status **meanings** + text | Replace bottom nav with Paseo three-panel app shell; pixel-copy Paseo colors; Flutter SSH; edge-swipe file explorer app-wide; in-session list drawer before **C4** |

**EnvoyGo build principles (gate C1b.2):**

1. Bottom tab = product entry; Paseo patterns apply inside Coding only.
2. Open Coding → existing home sessions first (status buckets).
3. One session at a time (push/pop like Chat/Terminal).
4. New session via FAB — not default empty composer when sessions exist.
5. Permissions sticky until answered (sheet).
6. Visual = EnvoyGo `AppTheme` / Material 3; Paseo = interaction patterns.
7. Pi TUI-in-Coding = transitional chrome until C2 stream (not a Paseo pattern).

### Status dashboard (update step by step)

| Step | Name | Status |
|------|------|--------|
| **68-C0** | Design lock | `[x]` |
| **68-C1.1** | Social nav + CodingView shell + Inbox icon-only | `[x]` |
| **68-C1.2** | EH rehost under Coding + peer identity (+ group-by-cwd OK) | `[x]` |
| **68-C1.2b** | Social left-rail chrome (create sheet, cwd groups, settings) | `[x]` |
| **68-C1.3** | Pi transitional TUI-in-Coding (desktop) | `[x]` |
| **68-C1.4** | Strip gate → remove Chat Coding + Terminal Pi/EH | `[x]` |
| **68-C1.5** | AuthZ / tests (`CODING_GATED_RPC`, owner-only) | `[x]` |
| **68-C1b.1** | EnvoyGo per-profile tab list + Coding tab | `[x]` |
| **68-C1b.2** | EnvoyGo Coding list/session (EH) + Pi TUI-in-Coding | `[x]` |
| **68-C1b.3** | EnvoyGo strip Chat/Terminal Pi/EH (gated) | `[x]` |
| **68-C1c** | Manual `host:port` + Tailscale/VPN docs (no Flutter SSH) | `[x]` (EnvoyGo connection sheet + §68-C1c) |
| **68-C2** | `sinceRevision` + Pi timeline + mesh peer-review CTA | `[x]` (invite via chat deep-link; read-only open; EnvoyGo + Social; no remote IDE) |
| **68-C3** | Tier B: Claude Code, Codex, OpenCode, Cursor, CodeWhale | `[x]` |
| **68-C4** | Polish docks/tracks/a11y/i18n | `[x]` (EnvoyGo in-session task list sheet) |
| **68-C5** | Coding Search (Cmd/Ctrl+K) + History rail filters | `[x]` (Social + EnvoyGo palette + filters) |
| **68-C6** | Coding heartbeats MVP (cron → existing task) | `[x]` (Social + node + EnvoyGo UI) |
| **68-C7** | Full Schedules (new task each cron fire) | `[x]` (Social + node; EnvoyGo scheduler sheet) |
| **68-FH** | Family harness alignment (EnvoyHome / EnvoyCoder) | `[x]` waves 0–4 · [design](./family-harness-alignment-design.md) |

---

### 68-C0 — Design lock `[x]`

- `[x]` Product + UI design in [`product_coding_tab_design.md`](../product_coding_tab_design.md)
- `[x]` DeepSeek review corrections applied (promote EH; strip gate; phone Pi; host:port not Flutter SSH)
- `[x]` Scope decisions locked in design §0 (incl. UI IA Social / EnvoyGo)
- `[x]` **§3e Paseo UI reference map** — Social three-pane vs EnvoyGo-inside-Coding (no app-shell clone)
- **Exit:** Design accepted; ready to start **68-C1.1** when explicitly asked

---

### 68-C1.1 — Social nav + shell `[x]`

- `[x]` `ViewName "coding"` in `apps/social/src/App.tsx`
- `[x]` Header order: Social | Coding | Knowledge | Terminal | Team jobs | Settings
- `[x]` Inbox icon-only (remove `header-inbox-label`; keep aria/title)
- `[x]` `codingEverOpened` keep-alive slot
- `[x]` New `CodingView.tsx` + `CodingSidebar.tsx` — **three-pane scaffold** (list \| session \| Changes) per design §3 / §3e (empty panes OK)
- `[x]` i18n `nav.coding` (all Social locales)
- `[x]` In-page `envoymesh:open-coding` CustomEvent (mirror `open-terminal-nav.ts`)
- **Exit:** Coding tab opens with three-pane shell; Inbox has no text label ✓

---

### 68-C1.2 — EH under Coding `[x]`

- `[x]` Rehost `EnvoyHarnessPanel` inside Coding session panel
- `[x]` List via `listEnvoyHarnessChats` / `EhChatTaskSummary`; id = `chatId`
- `[x]` Timeline via existing `eh:*` + `reduceEhTimeline`; UI buckets from `EhAgentStateName` (panel)
- `[x]` Surface `EhExecutionIdentity` (“running on peer”) on agent-state strip
- `[x]` Create: folder picker → `createEnvoyHarnessChat`; harness immutable after create
- `[x]` Cap: keep `MAX_ENVOY_HARNESS_CHATS = 5`
- **Exit:** Full EH coding loop available in Coding tab (Chat may still have coding until **68-C1.4**) ✓

---

### 68-C1.2b — Social left-rail chrome `[x]`

- `[x]` `CodingNewSessionSheet` — harness picker (EH enabled; Pi stub until C1.3) + folder
- `[x]` `CodingSidebar` — New session CTA, group-by-cwd (status buckets when available), settings footer → Settings AI
- `[x]` Keep `EnvoyHarnessPanel` in center; EH create/remove still works
- `[x]` Tests: open create sheet; EH create; settings control present
- **Exit:** Paseo/Codex-like common Coding left rail on Social ✓

---

### 68-C1.3 — Pi transitional (desktop) `[x]`

- `[x]` Coding entry for Pi: `sessionKind: tui` → `ensurePiTerminalSession` under Coding chrome (`TerminalPanel`)
- `[x]` Enable Pi in `CodingNewSessionSheet`; list `role: pi` sessions in CodingSidebar
- `[x]` Do **not** treat dead `PiChatPanel.tsx` as rehost
- **Exit:** Pi reachable from Coding (not required from Terminal yet) ✓

---

### 68-C1.4 — Strip gate + remove old UI `[x]`

- `[x]` Remove Chat Coding / Envoy Harness section (`ChatSidebar` / `ChatView`) — EH only under Coding; legacy EH thread keys redirect via `openCoding`
- `[x]` Provisional map: every EH chat + Pi TUI openable from Coding (C1.2 + C1.3)
- `[x]` Live `role: pi|envoy-harness` PTYs: hide from Terminal list; selecting a stale coding id opens Coding
- `[x]` Strip Terminal Pi/EH create (`TerminalSidebar`); **Coding** CTA → `openCoding({ startNew: true })`
- `[x]` `openTerminal({ startPi })` → `openCoding({ harness: "pi" })` (App + TerminalView listeners)
- `[~]` No-orphan check / read-only legacy fallback — covered by hide+redirect; formal script deferred if needed
- **Exit:** Cannot open Pi/EH from Chat or Terminal without Coding path ✓

---

### 68-C1.5 — AuthZ / tests `[x]`

- `[x]` `CODING_GATED_RPC` exported; includes `setEnvoyHarnessAutoRunPolicy`; deny path tested in `owner-only-rpc.test.ts`
- `[x]` Component tests: Coding nav (`Header`); Chat strip (`ChatSidebar`); Terminal strip (`terminal-sidebar-e2e` + `openTerminal` → Coding)
- `[x]` Bucket derivation unit test (`deriveCodingUiBucket` / `EhAgentStateName` → UI bucket) in `packages/api`
- `[x]` Filtered vitest green for touched AuthZ / Coding / Terminal strip area
- **Exit:** Fail-closed family coding; Social C1 complete ✓

**Note:** Prefer landing light AuthZ/test checks with **C1.2**; use **C1.5** as the C1 exit gate after strip.

---

### 68-C1b.1 — EnvoyGo tabs `[x]`

- `[x]` Per-profile **tab-id list** (not `isOwner` index math) in `home_screen.dart` / `owner_tabs.dart`
  - Owner: Social, Coding, Knowledge, Terminal, Me
  - Family+coding: Chats, Coding, Me
  - Family−coding: Chats, Me
- `[x]` Persist selected tab by id (`HomeTabPreferences`)
- `[x]` `navCoding` ARBs + `flutter gen-l10n`
- `[x]` Placeholder `CodingHomeScreen` (C1b.2 fills list/session)
- **Exit:** Family tabs correct; Coding visible when allowed ✓

---

### 68-C1b.2 — EnvoyGo Coding screens `[x]`

- `[x]` `coding_home_screen.dart` — **resume-first** list (EH threads + Pi TUI sessions; empty + FAB)
- `[x]` Session: open existing `EnvoyHarnessChatScreen` / `TerminalDetailScreen` (Pi) from Coding — EnvoyGo theme; fuller Paseo anatomy polish later
- `[x]` New session via FAB (not default empty composer when sessions exist)
- `[x]` Pi transitional TUI under Coding
- `[x]` FAB → harness + `HomeFolderBrowser` (`coding_new_task_sheet.dart`)
- `[x]` **Do not** replace bottom nav with Paseo three-panel app shell
- **Exit:** EH list/resume on phone; Pi reachable in Coding; UX matches §3e EnvoyGo principles ✓

---

### 68-C1b.3 — EnvoyGo strip `[x]` **[blocker]**

- `[x]` Remove Coding section from `chat_list_screen.dart`
- `[x]` Migrate EH chat **and** terminal `role: pi|envoy-harness` rows
- `[x]` Strip `terminal_create_actions` New Pi/Envoy; Terminal = shell only
- `[x]` Thread adapters: `<nodeId>:eh:<chatId>` local; home id = `chatId`
- **Exit:** Same strip criteria as C1.4 on phone ✓

---

### 68-C1c — Home-link add-ons `[x]` (parallel OK after C1b)

- `[x]` Manual `host:port` candidate in EnvoyGo / `HomeRemoteClient`
- `[x]` Document Tailscale/VPN as host:port
- `[x]` **No** Flutter SSH
- **Exit:** Manual host works when reachable ✓

---

### 68-C2 — Resume + Pi stream + mesh `[x]`

- `[x]` `sinceRevision` (or equiv.) on EH history fetch — `getEnvoyHarnessChatHistory(chatId?, sinceRevision?)`; per-chat `eh-timeline-revision`; Social + EnvoyGo skip `timeline.replace` when up to date
- `[x]` Pi agent timeline mirroring `eh:*`; **full TUI deprecate done** — Coding Shell tab no longer embeds Pi TUI (Pi tasks are Chat-only via `PiCodingPanel`); Terminal tab remains for plain shells; EH Shell tab unchanged (placeholder)
- `[x]` Promote task fields on `EhChatTaskSummary` (`harness`, `uiBucket`, `agentState`)
- `[x]` Harden soft-denied `listEnvoyHarnessChats` if required — soft-deny returns `[]` (not `CODING_GATED_RPC` throw); covered by owner-only-rpc test
- `[x]` Mesh: “Invite bonded peer to review this task” — invite via chat deep-link (`[envoymesh-coding-review]…`); Social + EnvoyGo `createCodingReviewInvite` → `sendChat`; peer CTA → read-only EH; no remote IDE
- `[x]` Audit events for start/cancel/permission/review (`apps/node/src/eh-audit.ts`)
- **Exit:** Incremental reconnect; Pi stream (Social + EnvoyGo); peer-review CTA — complete (resume + summary + audit + Pi Chat timeline + TUI-in-Coding deprecate + mesh invite/read-only on Social + EnvoyGo); remote IDE out of scope

---

### 68-C3 — Tier B harnesses `[x]`

- `[x]` Claude Code, Codex, OpenCode, Cursor, CodeWhale adapters + probe/install
  - Shared ids: `packages/api/src/coding-harness.ts` (Tier A/B lists + `codingHarnessToExtAgentId`)
  - Ext Agent: `opencode` (:8028) + `codewhale` (:8029) one-shot backends (aider/mmx already own 8026/8027)
  - Install/probe rows in `INSTALL_TABLE` / `BINARY_FOR_AGENT` (public install URLs; Paseo IA reference only — no source copy)
  - Coding: localStorage Tier B sessions + `ExtAgentCodingPanel` → `askExtAgent` RPC; create sheet probe badges
  - EnvoyGo: Tier B create/list/`ExtAgentCodingScreen` + `askExtAgent` (stream for codex/claudecode); probe/install hints
- `[x]` Same Coding chrome; harness fixed at create
- `[x]` Settings Coding → Harnesses; contact chat → Open in Coding
  - Sidebar footer points to Settings → AI → Ext Agent for install; Open in Coding already routes EH
- **Exit:** Tier B usable on Social + EnvoyGo with honest missing-binary state; codex/claudecode stream via `eh:timeline` (`__ext__:`)

---

### 68-C4 — Polish `[x]`

- `[x]` Reuse EH docks / EnvoyGo review sheets (don’t rebuild) — Social track pills toggle/focus `EhChangesDock` + `EhInputQueue`; Coding Changes overlay lists EH touched files and can open turn/git review
- `[x]` Tracks pills + queue lane; a11y status not color-only; i18n pass
  - EH sidebar: status **chip text** + aria-label (not color-only); header status from `uiBucket`
  - Pi/Ext header: live busy / probe (Ready · Busy · Install); Ext sidebar probe chips
  - `EhTrackPills`: Changes + Queue counts (Subagents skipped); wired above EH composer dock stack
  - `codingView` keys in en + zh; status/track/invite/extAgent blocks in de/fr/it/ja/ko
- `[x]` EnvoyGo in-session session-list sheet (hamburger on EH chat; switch EH/Pi/Ext)
- **Exit:** Design §10 polish criteria met for Social + EnvoyGo session switcher

---

### 68-C5 — Search + History-as-list-power `[x]` (Social)

- `[x]` Coding command palette (Cmd/Ctrl+K): projects, tasks, top-level cwd files (`listHomeFsEntries`), actions — **metadata only** (not transcript search)
- `[x]` History power on the same Coding left rail: All / Needs you / Recent (14d) / Archived; archive via row menu (localStorage); optional flat “All tasks”
- `[x]` EnvoyGo Search palette + History filters (All / Action / Recent / Archived) + flat “All tasks”
- `[x]` **68-C6 Heartbeats MVP** — see below
- **Exit:** Social Coding Search + History filters usable; heartbeats follow as C6

---

### 68-C6 — Coding heartbeats MVP `[x]` (Social + node + EnvoyGo)

- `[x]` API `CodingHeartbeat` + NodeService CRUD / `runCodingHeartbeatNow`
- `[x]` Home-node store (`coding-heartbeats.json`) + ~60s ticker; reuse `isCronMatch` (incl. `*/N`); dispatch EH / Pi / Ext
- `[x]` Cap 20; skip already-firing / EH turn busy with honest `lastError`; audit `coding.heartbeat.fired|failed`
- `[x]` Social: task “Add heartbeat…”, Heartbeats list panel (pause/delete/run now); en+zh i18n
- `[x]` EnvoyGo: Coding home Heartbeats sheet + EH/Pi/Ext “Add heartbeat…”; `NodeServiceClient` wrappers; en+zh
- **Exit:** Owner can schedule prompts against existing Coding tasks on Social and EnvoyGo

### 68-C7 — Coding schedules `[x]` (Social + node)

- `[x]` API `coding-schedule` (cwd + harness + cron + prompt); shared cron presets; cap 20
- `[x]` Home-node store (`coding-schedules.json`) + shared ~60s ticker with heartbeats
- `[x]` On fire: create **new** task (EH `forceNew`, Pi ensure, Tier B new `streamSessionId`) then run prompt; `lastTaskId`; skip busy; audit `coding.schedule.fired|failed`
- `[x]` Social: Schedules footer + panel (pause/delete/run now) + create modal; palette “New schedule”; en+zh
- `[x]` EnvoyGo schedules in unified scheduler sheet (`coding_scheduler_ui.dart` + `coding_schedules_ui.dart`)
- **Exit:** Owner can cron-create new Coding tasks and run a prompt once per fire (not Team jobs)

---

### 68-FH — Family harness alignment (EnvoyHome / EnvoyCoder)

> **Status: `[x]` shipped** — P0/P1/P2 checklist complete (Wave 4 mesh-lite + subagents).  
> **Canonical design:** [`family-harness-alignment-design.md`](./family-harness-alignment-design.md) (P0 / P1 / P2, waves, open decisions Q1–Q5).  
> **Goal:** Keep Coding EH + Tier B + Ext Agent **honest on the wire**; learn from EnvoyHome (embed / continuation / subagent caps) and EnvoyCoder (`agent-catalog` semantics) **without** porting `harness-host` or EnvoyCoder daemon.

**Prerequisite for new Tier B featured agents:** P0-B row + P0-C test row before merge.

| Wave | Steps | When |
|------|-------|------|
| 0 | P0-A, P0-B audit, P0-D spike | First |
| 1 | P0-C, P0-D ship, P1-B | After wave 0 |
| 2 | P1-C, P1-E, re-audit P0-B | Parallel Phase 68 polish / EnvoyGo schedules |
| 3 | P1-A, P1-D | Hardening |
| 4 | P2-* | Only after Q1–Q5 in design doc |

#### P0 — Correctness & gates

| ID | Deliverable | Status |
|----|-------------|--------|
| **FH-P0-A** | Doc: four harness host patterns (ACP EH, embed worker, catalog ACP, Ext HTTP) in [`envoy-harness-integration-EnvoyMesh.md`](./envoy-harness-integration-EnvoyMesh.md) (or appendix); cross-links from [`Ext_Agent_guide.md`](./Ext_Agent_guide.md) + [`product_coding_tab_design.md`](../product_coding_tab_design.md) §6 | `[x]` |
| **FH-P0-B** | Catalog drift audit: every `CODING_FEATURED_HARNESSES` id vs `../EnvoyCoder/packages/agent-catalog` — transport, `askingControl`, mode vs permission, launch argv; artifact [`family-catalog-drift-audit.md`](./family-catalog-drift-audit.md) (or committed snapshot JSON) | `[x]` |
| **FH-P0-C** | Table-driven composer / catalog tests mirroring audit (`coding-composer.test.ts`, optional `packages/harness/test/`); CI fails on new featured agent without row | `[x]` (`check:family-catalog` + `coding-composer-family-snapshot.test.ts`) |
| **FH-P0-D** | EH long-turn continuation: `ENVOYMESH_EH_CONTINUATION_PHASES` (default 2, clamp 0–3); schedule/unattended = 0; incomplete UX (`eh:turn_incomplete` or footer + continue); spike peer `envoy-harness` ACP first | `[x]` |

**P0 exit:** Doc readable; audit complete; featured harnesses covered by tests; continuation behavior specified and implemented or explicitly blocked with reason in audit.

#### P1 — Product quality

| ID | Deliverable | Status |
|----|-------------|--------|
| **FH-P1-A** | EH tool surface policy via harness / ACP (`session/set_policy` or harness config) — inventory vs EHUI; no broken advertised tools in default Coding cwd | `[x]` (`stripMeshHarnessAutoTools`, `session/set_policy` sync on host start) |
| **FH-P1-B** | User copy: Ext Agent vs Coding tab (Settings + install guide); link to full Envoy harness path | `[x]` (Ext Agent guide + Settings AI one-liner) |
| **FH-P1-C** | EnvoyGo composer parity: EH `default\|plan\|review`; permissions honest per P0-C; deepseek-harness env not `set_mode` | `[x]` (`coding_composer.dart` + family snapshot test) |
| **FH-P1-D** | Chain worker `task` caps: document in [`agent-harness-integration.md`](./agent-harness-integration.md); optional tune `agent-runtime-envoy` | `[x]` (`chain-harness-caps.ts` + `ENVOYMESH_CHAIN_MAX_*`) |
| **FH-P1-E** | PR / implementation checklist for new `coding-provider-catalog` entry (asking control + spawn argv + composer row) | `[x]` (§ below + `.github/pull_request_template.md`) |

**P1 exit:** Social + EnvoyGo agree on mode/permission semantics for EH + featured Tier B; Ext Agent messaging clear.

#### P2 — Strategic (optional; do not block Coding MVP)

| ID | Deliverable | Status |
|----|-------------|--------|
| **FH-P2-A** | Shared family `agent-catalog` package (peer repo; Mesh + EnvoyCoder consumers) | `[x]` (`envoy-harness/packages/agent-catalog`; Mesh + `@envoydev/agent-catalog` delegate `askingControl`) |
| **FH-P2-B** | EH Coding `task` subagent UX (Q3 **C**): caps + allow-lists (EnvoyHome `harness-subagents` patterns); Subagents track/dock + timeline events; no full `harness-host` port | `[x]` (host allow-tools + account cap; Subagents dock Social/Go; per-call timeline ids) |
| **FH-P2-C** | **Mesh-lite** (Q5 **B**): mesh-native work items (deep-link, bond/chat trigger, optional ticket store) → `startEnvoyHarnessTurn`; **no** external Sources v1; EnvoyCoder owns full superagent | `[x]` (store/RPC + Social queue/invite + `openCoding` queue/run/enqueue + EnvoyGo sheet/RPC) |
| **FH-P2-D** | EH session compact / flush ownership in node (daemon thresholds; harness RPC if any) | `[x]` (`ENVOYMESH_EH_AUTO_COMPACT_AFTER_MSGS` / `_KEEP`; post-turn `session/compact`) |

**Open decisions:** design doc §11 — **all decided:** Q1(B) Q2(B) Q3(C) Q4(A) Q5(B). Mesh-lite superagent → FH-P2-C.

#### FH-P1-E — New `coding-provider-catalog` entry (checklist)

Use this when adding or promoting a harness in `packages/api/src/coding-provider-catalog.ts`
(Tier B featured agent or EH catalog row):

1. **Catalog API** — Add the harness id, transport, ports, and `askingControl` / spawn argv
   consistent with EnvoyCoder `../EnvoyCoder/packages/agent-catalog` (hand-sync until FH-P2-A).
2. **Harness backend** — `packages/harness`: probe, install, session spawn; permission delivery
   matches `askingControl` (see Coder `askingOffLaunchArgs` patterns for `asking-off` agents).
3. **Social composer** — `apps/social/src/lib/coding-composer-capabilities.ts` row
   (`canSetMode`, `permissions`, `agentModeIds` honest).
4. **EnvoyGo parity** — `apps/envoygo/lib/coding/coding_harness_wire.dart` + composer when the
   harness is featured on mobile.
5. **Family snapshot** — Regenerate `scripts/family-catalog-snapshot.json` and run
   `npm run check:family-catalog` (or orchestrator `dev`).
6. **Drift audit** — Update `CODER_ASKING_CONTROL` in `scripts/family-catalog-mesh-export.ts`
   when EnvoyCoder `asking-control.ts` changes; note in [`family-catalog-drift-audit.md`](./family-catalog-drift-audit.md).
7. **PR** — Check the Coding provider box in [`.github/pull_request_template.md`](../.github/pull_request_template.md).

#### 68-FH cross-references

- Mesh EH ACP: `apps/node/src/agent-runtime-envoy/persistent-acp-host.ts`, `node-service-impl` EH RPCs
- Tier B: `packages/harness`, `apps/social/src/lib/coding-composer-capabilities.ts`
- EnvoyHome reference: `../EnvoyHome/packages/daemon/src/home-harness-bridge.ts`, `harness-subagents.ts`
- EnvoyCoder reference: `../EnvoyCoder/packages/agent-catalog/src/{asking-control,mode-delivery,features}.ts`
- Chain worker embed: `apps/node/src/agent-runtime-envoy/runtime.ts`

---

### Explicit non-goals (Phase 68)

- Full IDE; Flutter SSH; Paseo code copy without NOTICE; inventing parallel timeline store in C1; merging Terminal away; moving EnvoyAI into Coding; replacing EnvoyGo bottom nav with Paseo three-panel app shell; pixel-clone Paseo skin

### Cross-references

- Design: [`../product_coding_tab_design.md`](../product_coding_tab_design.md) — esp. §3 / §3b / **§3e** (Paseo UI map)
- Family harness: [`family-harness-alignment-design.md`](./family-harness-alignment-design.md) · checklist **[68-FH](#68-fh--family-harness-alignment-envoyhome--envoycoder)**
- EH: `packages/api/src/eh-timeline.ts`, `eh-chat-task.ts`
- Gate: `apps/node/src/json-rpc-router.ts` `CODING_GATED_RPC`
- Social: `ChatSidebar.tsx`, `TerminalSidebar.tsx`, `EnvoyHarnessPanel.tsx`
- EnvoyGo: `home_screen.dart`, `chat_list_screen.dart`, `envoy_harness_chat_screen.dart`

---

## Changelog (this document)
| Date | Change |
|------|--------|
| 2026-11-24 | **Phase 68 + milestone docs** — Phase header `[x]` shipped; **Current direction** active epic → **64D**; [`roadmap.md`](./roadmap.md) index synced. |
| 2026-11-24 | **68-FH Wave 4 closeout** — P2-A–P2-D shipped; mesh-work deep-link (`openCoding` queue/run/enqueue); EnvoyGo mesh-work sheet; design Wave 4 checklist `[x]`. |
| 2026-11-24 | **68-FH improve envoy-harness** — P2-B subagent caps/docks; P2-C mesh work store/RPC/UI; P2-D auto-compact. |
| 2026-11-24 | **68-FH P1-D/E** — Chain worker sub-agent cap doc + env knobs; coding-provider PR checklist + template. |
| 2026-11-24 | **68-FH P1-A/C commit** — EH tool surface + EnvoyGo composer parity + Wave 0 catalog/continuation. |
| 2026-11-24 | **68-FH Wave 4 (partial).** FH-P2-B host child allow-tools + Subagents dock parity; FH-P2-D auto-compact env; FH-P1-B Settings Ext vs Coding one-liner; sync 68-C1c table. |
| 2026-11-24 | **68-FH Wave 0** — P0-A/B/C/D + P1-B guide cross-link; catalog snapshot + `check:family-catalog`; EH continuation phases + unattended heartbeats/schedules. |
| 2026-11-24 | **68-FH open decisions closed** — Q1(B) Q2(B) Q3(C) Q4(A) Q5(B); see design §11 summary. |
| 2026-11-24 | **68-FH Family harness alignment** — P0/P1/P2 checklist under Phase 68; design [`family-harness-alignment-design.md`](./family-harness-alignment-design.md). Gates new Tier B agents on P0-B + P0-C. |
| 2026-09-11 | **EnvoyGo heartbeats UI (68-C6).** Coding home Heartbeats sheet + EH/Pi/Ext “Add heartbeat…” dialog; Dart models + `NodeServiceClient` CRUD/runNow; en+zh. Schedules EnvoyGo still deferred. |
| 2026-09-11 | **68-C7 Coding schedules.** Cron creates a new Coding task (cwd + harness) then runs the prompt once; node store+ticker; Social Schedules panel/modal + palette. Distinct from heartbeats. EnvoyGo UI deferred. Not Team jobs / TriggerStore. |
| 2026-09-11 | **68-C6 Coding heartbeats MVP.** Cron wakes an existing EH/Pi/Ext task; node store+ticker; Social add/list/run-now. EnvoyGo UI deferred. Not Team jobs / TriggerStore. |
| 2026-09-11 | **68-C5 Search + History.** Social Coding Cmd/Ctrl+K palette (projects/tasks/cwd files/actions; no transcript search); left-rail filters All/Needs you/Recent/Archived + flat All tasks; archive in row menus. EnvoyGo + Schedules deferred. |
| 2026-09-11 | **EnvoyGo Tier B + mesh invite.** Tier B create/list/`ExtAgentCodingScreen` + `askExtAgent` (stream for codex/claudecode); mesh review invite parity (parser, CTA, read-only EH, AppBar invite). |
| 2026-09-11 | **Tier B streaming.** Codex/Claude Code `onDelta` → `eh:timeline` under `__ext__:${sessionId}`; ExtAgentCodingPanel merges live assistant row. Cursor/OpenCode/CodeWhale stay one-shot. |
| 2026-09-11 | **68-C4 polish.** Live Coding header status (EH `uiBucket`, Pi busy, Ext probe/busy); sidebar status chips (not color-only); `EhTrackPills` Changes+Queue above EH composer docks; Changes overlay lists EH touched files + open review; codingView i18n (en/zh + de/fr/it/ja/ko status/track/invite/ext). EnvoyGo in-session drawer deferred. |
| 2026-09-11 | **68-C3 Tier B harnesses.** Shared `coding-harness` ids; Ext Agent `opencode`/`codewhale` (ports 8028/8029) + install/probe; Social Coding create sheet Tier B + local sessions + `ExtAgentCodingPanel`/`askExtAgent`; EnvoyGo sheet lists Tier B disabled (Social desktop first). Paseo used as IA reference only. |
| 2026-09-11 | **68-C2 EnvoyGo mesh invite parity.** Parser + `createCodingReviewInvite` RPC; chat “Open review” CTA; EH `readOnlyReview`; AppBar invite → bonded peer `sendChat`. |
| 2026-09-11 | **68-C2 wrap-up: full Pi TUI deprecate.** Coding Shell tab no longer embeds Pi TUI (`coding-pi-tui*` removed); Pi tasks Chat-only; Terminal tab keeps real shells. EnvoyGo Coding opens Pi timeline stream (not `TerminalDetailScreen`). |
| 2026-09-11 | **68-C2 mesh peer-review MVP.** `coding-review-ref` deep-link; `createCodingReviewInvite` RPC + `eh.review.invited`; Social invite modal → `sendChat`; chat “Open review” → read-only `openCoding`; no remote IDE. EnvoyGo invite deferred. |
| 2026-09-11 | **68-C2 Pi agent timeline.** `piTimelineChatId` + `pi-timeline` adapter; node bridge emits `eh:timeline` on `sendToPi({ sessionId })`; Social Coding Chat → `PiCodingPanel`; Shell keeps Pi TUI. Mesh peer-review still `[ ]`. |
| 2026-09-11 | **68-C2 foundation.** `sinceRevision` resume; promote `EhChatTaskSummary` (`harness`/`uiBucket`/`agentState`); soft-deny list test; `eh-audit` on start/cancel/permission/review. Pi stream + mesh peer-review → **C2b**. |
| 2026-09-11 | **68-C1c complete.** EnvoyGo Me + connection sheet: direct home address (Tailscale/VPN/`host:port`); save → `forceReconnect`; candidate `public` after LAN. No Flutter SSH. Next: **68-C2**. |
| 2026-09-11 | **68-C1b.3 complete.** EnvoyGo: Coding removed from Chat list; Terminal shell-only (hide `pi`/`envoy-harness`, FAB = New Terminal); stale coding taps → Coding tab. Next: **68-C1c** host:port or **68-C2** resume/Pi stream. |
| 2026-09-11 | **68-C1b.2 complete.** EnvoyGo Coding home: resume-first EH + Pi list, FAB → New task sheet, open `EnvoyHarnessChatScreen` / Pi `TerminalDetailScreen`. Chat Coding section remains until **68-C1b.3** strip. |
| 2026-09-11 | **68-C1b.1 complete.** EnvoyGo id-based bottom tabs + Coding placeholder; `navCoding` l10n; persist tab id; `pi_proposal` → Coding. Next: **68-C1b.2** EH list/session under Coding. |
| 2026-09-11 | **Social Coding Task IA.** Left rail **Projects** + **New task** CTA (not Sessions); create sheet / empty copy; denser project groups; Pi task strip. Next: **68-C1b** EnvoyGo. |
| 2026-09-11 | **68-C1.5 complete — Social C1 done.** Exported `CODING_GATED_RPC` (+ `setEnvoyHarnessAutoRunPolicy`); deny-path tests; `deriveCodingUiBucket` + unit tests; Coding nav / Chat / Terminal strip coverage. Next: **68-C1b** EnvoyGo Coding tab. |
| 2026-09-11 | **68-C1.4 complete.** Terminal is shell-only: Pi/EH create removed; coding PTYs hidden from list; `openTerminal({ startPi })` → Coding. Chat EH already stripped. Next: **68-C1.5** AuthZ/tests exit. |
| 2026-09-11 | **68-C1.3 complete.** Pi transitional TUI under Coding: create sheet enables Pi → `ensurePiTerminalSession` + `TerminalPanel`; Pi rows in cwd-grouped list; legacy console banner. Next: finish **68-C1.4** Terminal strip. |
| 2026-09-11 | **Chat EH removed.** Envoy Harness no longer in Social Chat — Coding tab is the empty→create home. Legacy `__envoy_harness__` threads redirect via `openCoding`. Terminal Pi/EH strip still pending C1.3/C1.4. |
| 2026-09-11 | **68-C1.2b complete.** Social Coding left rail: `CodingNewSessionSheet` (harness + folder), cwd-grouped list, settings footer → AI. Design §3/§3e updated. Next: **68-C1.3** Pi TUI-in-Coding (enable Pi in create sheet). |
| 2026-09-11 | **68-C1.2 complete.** Coding tab lists EH chats, opens `EnvoyHarnessPanel`, create/remove via project picker; execution identity on agent-state strip. Chat Coding section still present until C1.4. Next: **68-C1.3** Pi TUI-in-Coding. |
| 2026-09-11 | **68-C1.1 complete.** Social Coding tab shell: `ViewName coding`, header order Social\|Coding\|Knowledge\|Terminal\|…, Inbox icon-only, `CodingView` three-pane scaffold, `openCoding` / `envoymesh:open-coding`, i18n. Next: **68-C1.2** EH under Coding. |
| 2026-09-10 | **Phase 68 — Paseo UI reference plan added.** Design §0/§3e locked (Social three-pane vs EnvoyGo-inside-Coding); Phase 68 section “UI reference plan”, C0/C1.1/C1b.2/C4/non-goals updated. Still no product code. |
| 2026-09-10 | **Phase 68 — Coding tab planned.** Design locked in [`product_coding_tab_design.md`](../product_coding_tab_design.md); checklist 68-C0 `[x]`, 68-C1…C4 `[ ]`. Active product epic → Phase 68 (code not started). Parallel 64D remains. |
| 2026-09-05 | **67C committed** (`4725ad4b`). Active epic → **64D** post-67 automated refresh + human sign-off. |
| 2026-09-05 | **67C complete.** Creator `statusMirror` → live steps; Social/EnvoyGo multi-home labels; EnvoyGo artifact graph; stranded reclaim stays top-of-detail. Phase 67 exit met. |
| 2026-09-05 | **67B complete.** Chat overflow “Run as team job” (contact/group): Join+card+lease gate, blocked readiness panel, seeds `preferredWorkerPeerIds`. Next: 67C. |
| 2026-09-05 | **67A complete.** Local templates: resolve saved `templateId` in preview/start; Social list/pick/delete + save-from-report; EnvoyGo light chips via `chainListRecipes`. Marketplace still parked. Next: 67B. |
| 2026-09-05 | **67-0 complete.** Added `node-service-chain-ownership.ts` (reclaim/cancel/scan). Impl thin wrappers only; next is 67A local templates. |
| 2026-09-05 | **Phase 67 started (67-0).** Added maintainability slice: extract Fleet/Lease/probe from `node-service-impl.ts` (`node-service-{fleet-ops,worker-lease,agent-network-refresh,chain-probe-reachability}.ts`). Product 67A–67C follows. |
| 2026-09-05 | **Phase 66 review closed.** OpenClaw mock in Phase13 harness (EADDRINUSE); Ensure Join i18n; FleetReadinessPanel + stranger ensure tests. |
| 2026-09-05 | **Phase 66A + 66B complete.** 66A: debounced refresh on `bond:established`, named Fleet gaps, lease broadcaster on NodeService Join-on. 66B: WAN online gate (reservation + dial hints), `ensureFleetWorkersJoinAndLease` one-click (strangers skipped), three-home cold-start smoke. |
| 2026-09-05 | **Phase 66A in progress.** Debounced `refreshAgentNetworkWorkers` on any `bond:established`; per-worker Fleet gaps from card+lease+60F; lease broadcaster on NodeService Join-on / online; Social Fleet panel named gaps. 66B (WAN online gate, fleet one-click, three-home WAN E2E) deferred. |
| 2026-09-05 | **Phase 65C complete.** Intermediate artifacts: stage under `imports/team-jobs/<chainId>/out/`, voucher deliver to child `in/`, provenance `artifactGraph` + Social live steps; path confinement via `chainArtifactPathWithinJobWorkspace`. E2E two-home handoff. Phase 65 Wave 1 exit met. Next: Wave 2 (Phase 66) or Wave 3 UX. |
| 2026-09-05 | **Phase 65A + 65B complete.** Depth-4 two-home E2E; iteration restart smoke (fixed ChainStore Map/Set restore for `hedgeSchedule` / `verifyOnlyBlockedSubtasks`). Next: 65C intermediate artifacts. |
| 2026-09-05 | **Phase 65B start.** `CHAIN_ITERATION_MAX_ROUNDS` 10→48; checkpoint before outer continue + after delegate; `pausedForLease` on dead worker leases; Social start/defaults allow up to 48 rounds. Restart-survival E2E still open. |
| 2026-09-05 | **Phase 65A continue.** Sub-mandate verify on `acceptHandoff` + inbound `task.chain.delegate`; arbitration store persist fix; `allowDepth3/4` forwarded through `chainStartFromGoal`; plan-assign/decomposer depth-4 prompts; journal/result lineage depth max 4; planChain depth-4 unit gates. ≥2-home E2E still open. |
| 2026-09-05 | **Phase 64D automated green + Phase 65A start.** `npm run test:dev` green (8399 pass). Protocol `CHAIN_MAX_DEPTH` 3→4 + `allowDepth4`; `chain-depth-mandate.ts` + units. Human 64D checklist rows still open for tag. |
| 2026-09-05 | **Phase 64 continue — Social e2e exclude + 64C flake.** Exclude `**/test/e2e/**` and `*e2e*.test.tsx` from default vitest. Fix gated OpenClaw mock TOCTOU hang on `release()`. 64C×4 green (receipt-apply still honest). `test:dev` 98 fail (not release-green). |
| 2026-09-05 | **Phase 64D continue — test:dev hang fixed.** CLI `setup` unit tests were spawning `scripts/setup.sh`/`pnpm install`, deleting `vitest` mid-suite. Forward `setup --help`; stop running the installer in units. Membership-gate fixtures updated past 7-day prune. Source-guard line slices for reconcile/`reliabilityFallbackLevel` + `task.chain.ownership` count. 64C reconfirmed; 61C + three-process still fail on this host (live OpenClaw `:18789`). |
| 2026-09-05 | **Phase 64C full + 64D evidence refresh.** Remote-Assigner kill now asserts creator report (receipt apply after reclaim). Harness routes reconcile intents; reclaim keeps peers pending on running-only receipts; transport resolver uses membership index. 64D checklist updated; human rows still open. |
| 2026-09-05 | **Phase 64C review + 64D start.** Clarified 64C exit (resume same chainId, not creator report). Fixed Social typecheck (`busyDeliveryKey`, reclaim RPC client). Logged automated 64D evidence; human per-OS/a11y/threat still open. |
| 2026-09-05 | **Phase 64C remote-Assigner chaos.** `agent-network-remote-assigner-chaos-smoke.test.ts` + three-process script variant; strand grace overridable via `ENVOYMESH_ASSIGNER_STRAND_*_GRACE_MS`. |
| 2026-09-05 | **Phase 64B honest reclaim.** Creator status mirror via `task.chain.status` fan-out; mid-flight resume same `chainId` + reconcile seed; restart only when mirror insufficient (`mode` on API). |
| 2026-09-05 | **Phase 64A foundation.** `chain-remote-reclaim.ts` + creator `DelegatedChainStore`; checkpoint `ownership`; handoff/accept + restore epoch bump; `chainGetState.remoteOwnership` / stubs `chainReclaimAssigner` / `chainCancelDelegated`; unit tests. Creator wire notify + reclaim body remain for 64A finish / 64B. |
| 2026-09-05 | **Phases 64–67 planned — Agent Network full improvement program.** Wave 0 reliability (remote Assigner restart/heal, stranded reclaim, multi-home chaos, 60.1→64D) → Wave 1 orchestration (depth-4, long-running, intermediate artifacts) → Wave 2 fleet ops → Wave 3 product UX (local templates, eligibility-gated chat→job, EnvoyGo parity). Same-owner office fleet first; closes Phase 62D deferred remote restart. Active epic = Phase 64. |
| 2026-09-01 | **Phase 63 polish (thumbs / history / Social capture).** Listing photos → web mirror `photos/market/` + `thumbnailRef` (libraryRead); Clear history UI; Social Add from photo → draft. |
| 2026-09-01 | **Phase 63 polish.** Category/price filters; EnvoyGo Browse suggestions + block/report; inline listing thumbs on announce; Feed teaser + bond-first ranking; payment honesty copy. |
| 2026-08-31 | **Phase 63F (MKT-F) complete.** Sold/reserved soft close + announce fidelity; Social/EnvoyGo status actions; [market-payments-credits-adr.md](./market-payments-credits-adr.md). Phase 63 Market epic closed. |
| 2026-08-31 | **Phase 63E (MKT-E) complete.** EnvoyGo capture→draft→publish; seller FAQ suggested replies (Social + EnvoyGo); `shop-draft` / media helpers + tests. Next: MKT-F optional. |
| 2026-08-31 | **Phase 63C follow-up + 63D complete.** DHT `market:shop` rendezvous; block/report; stranger e2e; EnvoyAI shortlist tools; Browse suggestions/history; Add-bond CTA. Next: MKT-E capture→draft. |
| 2026-08-31 | **Phase 63C (MKT-C) complete.** `market.search` / `.result`; stranger rate limit; bonds-only filter; Browse mesh fan-out. Next: MKT-D EnvoyAI shortlist. |
| 2026-08-31 | **Phase 63B (MKT-B) complete.** `market.announce` to bonds; MarketCache + `marketSearch`; listing-scoped `chat.message.listingId`; Social/EnvoyGo Browse + inquire; share URI. Next: MKT-C public search. |
| 2026-08-31 | **Phase 63A (MKT-A) complete.** Local shop store + RPCs; Social Market CRUD + full locale set; EnvoyGo Market list/read + Me shortcut. Next: MKT-B bonds announce. |
| 2026-08-31 | **Phase 63A (MKT-A) landing.** Local shop store + `shop*` NodeService RPCs; Social **Market** tab (Browse stub + My Shop CRUD); unit tests. EnvoyGo stubs still open. |
| 2026-08-31 | **Phase 63 Envoy Market designed.** Open shop + P2P market/search; bond-as-outcome; MKT-A–F checklist. Design [p2p-market-plan.md](./p2p-market-plan.md). Added [roadmap.md](./roadmap.md) as AI/human entry index. Stories D–E row updated. |
| 2026-08-27 | **Phase 62 review fixes.** Social `assignerSelection` stale-closure; remote engineReady requires lease or online+`chain.orchestrate`; orchestrate weight + dampened remote freshness; defaults validation; honest audit intent; Assigner-labeled provenance; EnvoyGo passes home `assignerSelection`; plan checkbox honesty. |
| 2026-08-27 | **Phase 62 complete.** Capability-based Assigner selection (`assignerSelection: local \| best_capable`, default local); `scoreAssignerCapability` + handoff integration; completion invariant (`hasUnawardedActiveSubtasks`); synthesis provenance section; Social/EnvoyGo UX; unit + E2E tests. |
| 2026-08-27 | **Phase 62 planned.** Assigner intelligence (plan+assign, completion invariants, synthesis quality) + optional capability-based Assigner selection (`assignerSelection: local \| best_capable`, off by default) via existing `task.chain.handoff`. |
| 2026-08-27 | **Phase 61 depth complete.** Hedged speculation tick; verify-only advance gate; recovery chaos E2E (assigner restart → report via `flushRecoveryAdvancePending`); `reliabilityFallbackLevel` in Social + EnvoyGo. |
| 2026-08-27 | **Phase 61 depth started.** Hedged speculation wire + `trackChain` tick; recovery chaos E2E (assigner restart on libp2p homes); `reliabilityFallbackLevel` in preview + Social sparse-data hint. |
| 2026-08-27 | **Phase 60.1 stabilize.** UX honesty (strategy / Test AN / reliability copy); `chainResolveSpeculation` + Social disagree banner; three-process smoke execute→report via `wireMockTeamJobEngine`; `docs/agent-network-release-checklist.md`. |
| 2026-08-26 | **Phase 60 three-process smoke.** Dedicated libp2p smoke (`agent-network-three-process-smoke.test.ts`) for lease wire + lease-backed preview + chain report; script + `docs/agent-network-three-process-smoke.md`; lab matrix remains the PR unit gate. |
| 2026-08-26 | **Phase 60 review fixes.** 60E: speculative sibling wait timeout, stall-reassign clears speculative sibling, disagree/none_pass blocks dependents; 60A: journal recover default + selection on `selected` only; restore prefers runtimeSnapshot; 60C: lease modelFamily + diversity + legacy-probe penalty + reliability keys use worker family; 60D: RECOVERING partial gate, unknown grace, cancel receipts; advertise `chain-attempt-v1`; dry-plan uses real ranking; docs honesty on hedged/verify-only and smoke wrapper. |
| 2026-08-26 | **Dropped mixed-version release gate** — pre-release; no need for new/old assigner↔worker skew fixtures. |
| 2026-08-26 | **Phase 60F complete + release gates updated.** §10.3 scenarios 1–14 in `agent-network-lab-matrix.test.ts`; packaged smoke script; EnvoyGo Test Agent Network card + diagnostics RPCs; Social Test UI already present. |
| 2026-08-26 | **Phase 60E dual-award wire + 60F lab/diagnostics.** Speculative `immediate_dual` accept path, per-attempt partials, cancel losers, late-final retention; `agent-network-three-node-e2e` lab scenarios; `agentNetworkDiagnostics*` RPCs + Social Test Agent Network. Next: remaining 14-scenario matrix, packaged three-process smoke, EnvoyGo diagnostic cards. |
| 2026-08-26 | **Phase 60C UX + 60D + 60E core + 60F lab predicates.** Strategy/reliability/lease badges in Social; Agent Card `features` ads (`worker-lease-v1`, `chain-reconcile-v1`, `chain-provenance-v1`). 60D: reconcile intents, receipt store, RECOVERING gate, recovery UX, attemptId on awards. 60E: speculation policy gates + deterministic final selection helpers. 60F: `lab-events` / `lab-fixtures`. Next: dual-award wire path, three-node E2E, diagnostics simulation. |
| 2026-08-26 | **Phase 60B review fixes + 60C core.** 60B: reject stale post-revoke resurrection, credential owner binding, lease short-circuit in award probe, no sequence bump on empty runtimes. 60C: versioned team strategy presets + hard gates + golden fixtures; `WorkerReliabilityStore` Beta posterior with hierarchical fallback; ranking uses strategy components; verdicts feed reliability observations. Next: strategy/reliability UX badges, then 60D reconcile. |
| 2026-08-26 | **Phase 60B runtime leases landed.** `WorkerLeaseStore` (TTL/sequence/replay/skew), inbound `agent.worker.lease*` handlers, periodic publisher (30s TTL / ~10s jittered refresh), selection prefers lease-ready workers and falls back to legacy ready-probe. Ranking no longer treats Agent Card `lastSeenAt` as engine availability. Next: lease UI/diagnostics snapshot + feature advertisement polish. |
| 2026-08-26 | **Phase 60A complete; 60B schemas started.** Closed journal/migration exit gates (checkpoint-primary restore, one-shot legacy import, no duplicate ledger). Journaled `artifact.selected` + `synthesis.lineage` on report publish; Social Execution details + EnvoyGo provenance bottom sheet with lazy RPC. Protocol: `agent.worker.lease` / `.revoke` / `.request` intents, role policies, Zod parsers, and schema tests. Next: lease publisher, verifier/store, selection. |
| 2026-08-26 | **Phase 60A implementation continued.** Added a pure attempt-projection journal reducer, atomic per-chain materialized checkpoints, and restart recovery that replays only the valid journal tail after `checkpoint.lastSeq`. Added owner-only lazy `chainGetStepProvenance`, wired through Node, DirectCall, Social, and EnvoyGo clients, plus semantic planning, transport, partial/artifact, verification, attempt-state, and report-publish events. The legacy active snapshot remains authoritative for non-attempt chain fields until the full-chain reducer lands. Focused provenance/recovery gate: 72 tests pass; typecheck clean. Earlier cross-repo Envoy Harness + Node build also passed. Next: authoritative full-chain projection/migration, compact provenance UI, then 60B signed leases. |
| 2026-08-14 | **Phase 59E shipped — GC + two-home E2E.** `gcChainInputWorkspace` / `chainInputJobWorkspaceDir`; terminal hooks on Assigner + worker; `chain-input-delivery-two-home-e2e.test.ts`. Phase 59 closed. |
| 2026-08-14 | **Phase 59D shipped — Social + EnvoyGo delivery UX.** Honesty copy update; delivery chips + `chainRetryInputDelivery`; Advanced/start scope `referenced`/`all`; EnvoyGo status + retry + i18n. Next: **59E**. |
| 2026-08-14 | **Phase 59C shipped — Executor local-path wiring.** Deliver-before-accept; `inputArtifacts` merge worker-local file refs; stall award on pending/failed delivery; OpenClaw prompt labels Team job workspace paths. Next: **59D**. |
| 2026-08-14 | **Phase 59B shipped — Deliver-on-award.** `deliverChainInputsOnAward` after direct/competitive accept; voucher path = worker `imports/team-jobs/<chainId>/in/…`; self skip; `inputDeliveries` on chain state. Next: **59C**. |
| 2026-08-14 | **Phase 59A shipped — Job input delivery design lock.** Settled auto-on-award, referenced+fallback scope, GC on terminal, WAN fail+Retry; reuse voucher + `/envoymesh/data` (no `share.*` / no new byte protocol). Types + helpers in `@envoymesh/api` `chain-input-delivery.ts`; optional `inputAttachments` / `inputDeliveries` on `ChainGetStateResult`. Next: **59B** deliver-on-award. |
| 2026-08-14 | **Phase 59 designed — Team job input delivery (bytes to workers, not vault sync).** Design doc [agent-network-job-input-delivery.md](./agent-network-job-input-delivery.md); checklist 59A–59E after Phase 58. Standing vault sync remains a non-goal; one-shot job-scoped handoff planned instead. TOC + Related + Next planning pulls + Phase 58 out-of-scope pointer updated. **No code yet.** |
| 2026-08-14 | **Phase 58 complete (58A–58E).** Fleet readiness, live steps + honesty, per-step cancel/reassign + observed badges, EnvoyGo iteration/observed, Advanced Assigner picker. Next: **Phase 59** job input delivery. |
| 2026-08-14 | **Phase 58B shipped — Live job story + attachment honesty.** `buildChainLiveSteps` → `chainGetState` / listActive / `chain:state`; Social `ChainLiveSteps` + honesty; EnvoyGo step list. Next: **58C**. |
| 2026-08-14 | **Phase 58A shipped — Fleet readiness checklist.** `FleetReadinessPanel` + skip Preview; Social + EnvoyGo; Phase 43 zero-worker closed. Next: **58B**. Design: [agent-network-ux-team-jobs.md](./agent-network-ux-team-jobs.md). |
| 2026-08-13 | **Phase 57 security follow-up.** Materialize + MCP write-back default **private** (path heuristic for `notes/imports/` + `notes/mcp/`, sensitivity override on write); owner-gate `saveExternalMcpSearchAsNote` / `convertLibraryItemToMarkdown` / `reindexRagKnowledge`; Obsidian collect triggers RAG reindex when paths move. |
| 2026-08-13 | **Phase 57E complete.** Chat/Ext Agent attachments extract Office/PDF/HTML via `extractVaultDocumentText`; acquisition inbox preserves real extensions; inbound share/chat transfer best-effort materializes to `notes/imports/`. Phase 57 closed. |
| 2026-08-13 | **Phase 57D MCP external KB.** Soft-fail MCP search with timeout/URL validation; `lastExternalKbError` on RAG status; Settings copy clarifies search≠vault sync; gated `mcpWriteBackEnabled` + `saveExternalMcpSearchAsNote` → `notes/mcp/`. Next: remaining **57E**. |
| 2026-08-13 | **Item-4 Markdown corpus.** Import rewrites to `documents/` (office) / `notes/imports/` (md); anydoc materialize on import + Library Convert → `notes/imports/` with `source:` frontmatter; Obsidian activate/Sync collects loose MD into `notes/`. Originals remain the Envoy backup. Next: **57D** MCP. |
| 2026-08-13 | **Embedding stability UX.** Confirm when effective embedder `modelKey` changes (KB settings or chat inherit); `reindexRagKnowledge` RPC + Settings **Rebuild knowledge index**; auto-reindex after embedder change on config save; docs: Obsidian collects MD when active, else self-managed `notes/`. |
| 2026-08-13 | **Phase 57C Obsidian polish.** Activate runs frontmatter→sensitivity/`published-library` sync + link-graph rebuild (keyed by `documentId`); Library Published reverse-writes `published:` frontmatter when Obsidian is active; Settings Sync now + hint; deactivate drops link graph only. Next: **item-4** MD collect into Obsidian when active. |
| 2026-08-13 | **Phase 57B complete.** Audited KB inject paths; wired `vault-sensitivity-overrides.json` into vault **search**; Agent Mode contact drafts use public scope + contact `knowledgeAccess` + single-contact bond chat (no full owner vault leak via OpenClaw). Next: **57C** Obsidian polish; item-4 MD-into-Obsidian deferred until after 57C. |
| 2026-08-13 | **Phase 57A complete.** anydoc primary extract + legacy fallback; format expansion; manifest `extractorId`; Settings index-status honesty (`embedderModelKey` / `lastEmbedError`); Envoy Local inherit → mock embeddings (chat GGUF ≠ embed API) + UI banner; sensitivity still path/override-gated after GFM. Next: **57B**. |
| 2026-08-13 | **Phase 57A code started — anydoc vault extract.** `@firecrawl/anydoc` primary in `extractVaultDocumentText` with legacy fallback; extended extractable formats (odt/ods/odp/epub/docm/xlsb/…); RAG manifest `extractorId` (`VAULT_TEXT_EXTRACTOR_ID`) forces reindex; vault fixture tests + `packages/vault/THIRD_PARTY_NOTICES.md`. Remaining 57A: Settings embedding honesty + sensitivity spot-check + `test:dev` gate. |
| 2026-08-13 | **Phase 57 designed — Knowledge Base production hardening (Markdown-first + anydoc).** Checklist 57A–57E: P0 vault/RAG + `@firecrawl/anydoc` GFM ingestion (originals kept; MD at extract time) → P0 query-path audit → P1 Obsidian polish → P2 MCP/Notion-class search (no OAuth sync) → secondary anydoc surfaces. Investigation notes + settled defaults in phase section; anydoc subsection in [knowledge-base-and-rag.md](./knowledge-base-and-rag.md). TOC + Next planning pulls updated. **No code yet.** |
| 2026-08-10 | **Phase 55 designed — Ext Agent codex + claudecode (Plan B + daemon supervisor).** Two new backends (codex via `app-server` stdio, claudecode via `@anthropic-ai/claude-agent-sdk`); generic `daemon-supervisor.ts` for spawn + healthcheck + exponential restart; existing Hermes/OpenHuman keep their HTTP transport (55E optional). Status: `[!]` awaiting review. |
| 2026-08-10 | **Phase 55 — 55A daemon-supervisor shipped.** `apps/node/src/ext-agent-adapter/daemon-supervisor.ts` (~785 LOC) + `apps/node/test/daemon-supervisor.test.ts` (49 cases, all pass in ~11s). `DaemonSupervisor` class with `start()` / `stop()` / `isRunning()` / `isHealthy()` / `restartsInWindow()`; events `start` / `stop` / `crash` / `crash.stuck` / `healthy` / `unhealthy` / `install-missing` / `stdout` / `stderr`. Exponential backoff `1s→2s→4s→8s→16s→30s` capped; `maxRestartsInWindow` defaults 5/5min. Async ENOENT on macOS (where `spawn()` returns a child that immediately emits `error`) handled with a 100ms stability grace after the first passing healthcheck. `InstallMissingError` thrown by `start()` for both pre-check fail and ENOENT (sync or async); also emitted as `install-missing` event. 55A.1 install detection already included in this commit (state.installMissing flag, `installHint` option). |
| 2026-08-10 | **Phase 55 — 55A.1 install guide + installState shipped.** `packages/api/src/ext-agent.ts` extended with `InstallState` type, `ExtAgentInstallGuide` interface, `getExtAgentInstallGuide(agentId, installState?)` factory, and per-agent install command table for codex / claudecode / hermes / openhuman (npm install + curl one-liner + verify command + 3 common-issues bullets each). `ExtAgentReachability` extended with `installState: "installed" \| "not-installed" \| "unsupported" \| "unknown"` and `installGuide?`. `apps/node/src/ext-agent-adapter/probe.ts` adds `defaultBinaryOnPath` (`command -v` / `where`) + `classifyExtAgentInstallState`; probe now returns `installState` and (when not installed) `installGuide`. Built-in Pi is always `"installed"`; homeclaw stays `"unknown"` (separate channel); external agents PATH-checked. Tests: 16 new in `apps/node/test/ext-agent-install-guide.test.ts` + 14 new cases in `apps/node/test/ext-agent-probe.test.ts` (39 total for the two files, all pass). `defaultExtAgentStartHint` extended with `codex` / `claudecode` cases; `getExtAgentInstallInfo` extended with the same. |
| 2026-08-10 | **Phase 55 — 55D Settings UX + guide + ports shipped.** `packages/api/src/ext-agent.ts` `DEFAULT_EXT_AGENTS` extended with codex (`:8023`, enabled) and claudecode (`:8024`, enabled) — additive, no `bridge-config.json` migration. `apps/node/src/ext-agent-adapter/types.ts` `ExtAgentSidecarKind` extended with `codex` / `claudecode`; `EXT_AGENT_SIDECAR_KINDS` array + `isExtAgentSidecarKind` arms. `manager.ts` adds `ENVOYMESH_CODEX_PORT` / `ENVOYMESH_CLAUDECODE_PORT` env overrides + `DEFAULT_PORTS.codex = 8023` / `claudecode = 8024` (additive, all > 1024). `backends.ts` `createBackend` switch throws "not yet implemented" for codex (until 55B) / claudecode (until 55C); `probe.ts` is resilient to that throw and falls back to `reachable: false` so the installState/installGuide still surface. `index.ts` re-exports `DaemonSupervisor` + `InstallMissingError` for downstream callers (55B/55C). `docs/Ext_Agent_guide.md` adds Codex + Claude Code sections (install + env var + port override + supervisor behavior + known limitations + minimal checklist), an **Install guide** section with the per-agent install command table, and Codex/Claude Code rows in the Troubleshooting matrix + Architecture notes. `en-settings-ai.ts` / `zh-settings-ai.ts` get `aiEngine.installCard.*` (7 keys: title / notInstalledBody / unknownBody / commandLabel / verifyLabel / docsLabel / copyCommand / retry / dismiss) + `aiEngine.status.*` (4 keys: installed / notInstalled / unsupported / unknown). 5 new tests in `apps/node/test/ext-agent-adapter.test.ts` (`isExtAgentSidecarKind` includes codex/claudecode; `EXT_AGENT_SIDECAR_KINDS` lists 5 kinds; `createBackend("codex"|"claudecode")` throws "not yet implemented"; `syncExtAgentSidecar` for codex/claudecode logs error and stays down; `ENVOYMESH_CODEX_PORT` / `ENVOYMESH_CLAUDECODE_PORT` env overrides recognized; `DEFAULT_EXT_AGENTS` includes codex + claudecode). Combined 55A + 55A.1 + 55D test count: 111/111 pass. |
| 2026-08-10 | **Phase 55 — 55B codex backend shipped.** `apps/node/src/ext-agent-adapter/codex-backend.ts` (~600 LOC) implements `ExtAgentBackend` for the OpenAI Codex CLI's `app-server` JSON-RPC over stdio, supervised by the 55A `DaemonSupervisor`. Wire: `initialize` (once, with `clientInfo` + `capabilities`) → `thread/start` (cached per `sessionKey` in `Map<sessionKey, threadId>`) → `turn/start` (with `input: [{ type: "text", text }]`) → wait for `turn/completed` server notification → extract assistant text from `turn.items[].text`. New `DaemonSupervisor.sendStdin(chunk)` + `getChildProcess()` methods let the codex backend write JSON-RPC to the child and parallel-parse stdout (the supervisor's `stdout` event still fires for log lines; the codex backend attaches a second listener). Supervisor's `stdio` changed from `["ignore", "pipe", "pipe"]` to `["pipe", "pipe", "pipe"]` so the child has a writable stdin (the codex tests caught this — the prior `ignore` on stdin meant `proc.stdin` was `null` and every `sendStdin()` returned `false`). `createBackend("codex")` returns the real `CodexBackend` (the "not yet implemented" throw is removed); `claudecode` still throws until 55C. On `crash` event the codex backend drops its in-memory `sessionKey → threadId` cache and rejects all pending requests — restart starts a fresh thread. On `install-missing` event, all pending requests reject. 10 new tests in `apps/node/test/ext-agent-adapter-codex.test.ts` using fake `node` scripts as codex app-server stand-ins (NDJSON over stdio): `ask` initializes + creates thread + sends turn/start + returns assistant text; `ask` reuses threadId per sessionKey (different sessions get different threads); `probe` returns true on healthy `thread/list`; `probe` returns false on error; `start` surfaces `InstallMissingError` for missing binary; `start` surfaces `install-missing` event before rejecting; `ask` rejects when supervisor crashes mid-call; `stop` is idempotent + detaches listeners; `createBackend("codex")` returns a CodexBackend. Combined 55A + 55A.1 + 55D + 55B test count: 121/121 pass in ~12s. |
| 2026-08-10 | **Phase 55 — install detection added (55A.1).** New sub-slice detects ENOENT / missing CLI at supervisor `start()`; surfaces `installState` + `installGuide` through `ExtAgentReachability`; Settings UI shows an Install Required card (install command + verify command + docs link + `commonIssues[]`) with green/amber/red status indicator. `getExtAgentInstallGuide(agentId, installState?)` factory + per-agent install command table added to `packages/api/src/ext-agent.ts`. Total Phase 55 LOC revised: ~1,750 → ~2,300. |
| 2026-08-10 | **Phase 55 — chat switcher problem dialog (55D.1).** `ExtAgentSwitcher.tsx` (216 LOC) replaces single-line tooltip with rich problem dialog/toast: not-installed → modal with install card (Copy command + Open docs); installed+unreachable → 3s toast with start hint + Retry; healthy → silent. New `ExtAgentSwitcherInstallDialog.tsx` + shared `ExtAgentInstallGuideCard.tsx` (reused by Settings + Chat + OfflineBanner). Open questions Q1 (install commands) + Q2 (UI surface) settled by user. Phase 55 LOC: ~2,300 → ~2,800. |
| 2026-08-09 | **Phase 54 HF GGUF search.** Live Hub search + `hf:` download ids; curated refresh to Qwen3.5 0.8B/4B + Gemma 4; Settings debounce/badges. |
| 2026-08-09 | **Phase 54 runtime lifecycle tests.** Mocked spawn/fetch coverage for enable→wireProviders, CUDA→CPU `-ngl 0` fallback, catalog CN failover + abort. |
| 2026-08-09 | **Phase 54 runtime mirrors + tests.** llama.cpp GitHub downloads fail over via CN proxies / `RUNTIME_MIRROR_BASE` (sha256 unchanged); download helper + mirror unit tests. |
| 2026-08-09 | **Phase 54 catalog refresh.** Edge allowlist → Qwen3 (0.6B/4B), Gemma 4 (E2B/E4B + chat-template), Llama 3.2 3B (labeled vs Llama 4); default enable model Qwen3-0.6B. |
| 2026-08-09 | **Phase 54E — Envoy Local hardening.** CUDA→CPU fallback; engine update RPC; checksum fail-closed helpers/tests; curated edge catalog Qwen + Llama + Gemma; CN ModelScope/hf-mirror already in place. |
| 2026-08-09 | **Phase 54D — Envoy Local catalog + server params.** Curated GGUF allowlist (search/download/set-active/delete); Settings simple/advanced params with restart; pinned llama.cpp `b10331` asset sha256 digests (fail-closed). |
| 2026-08-09 | **Phase 54C — Envoy Local auto download + sidecar.** `enableEnvoyLocal` downloads pinned llama.cpp + default tiny Qwen GGUF into profile `envoy-local/`, spawns loopback `:18790`, wires `modelProviders` + OpenClaw reload; Settings progress UI. Never packaged. |
| 2026-08-09 | **Phase 54 designed — EnvoyAI model guidance + Envoy Local.** Configure AI UX (cloud / Ollama / optional local); never package llama.cpp/GGUF; post-install download + OpenAI `llama-server` for EnvoyAI/native/Pi inherit. Design: [envoy-local-design.md](./envoy-local-design.md). |
| 2026-08-09 | **Phase 53 — Artifact handoff + worker stickiness shipped (53A–53E).** `namedArtifacts` / propose `inputArtifacts`; `threadId` stickiness; stall prefer sticky peer / `requiredRole`; OpenClaw consume+emit; docs [agent-network-artifacts.md](./agent-network-artifacts.md). |
| 2026-08-09 | **AN engine Step 2 — node-local Ext Agent for Team jobs.** `agentNetworkWorkerEngine` (`openclaw` \| `ext`); Ext sync executor via `askExtAgent`/`forwardToAgent`; Social worker-profile picker; local “You” readiness follows configured engine. Skills advertisement deferred. Design: [agent-network-engine.md](./agent-network-engine.md). |
| 2026-08-09 | **Phase 52 follow-up — custom roles + New team job mode chooser.** Social worker profile accepts `custom:<slug>` roles (mirrors custom skills); New team job composer offers Skill-based vs Role-based (seeded from defaults) with soft empty-role guidance; `no_role_peers` emphasized in preview. |
| 2026-08-08 | **Phase 52 — Agent Network collaboration roles + assignment modes shipped (52A–52D).** Manual `agentNetworkProfile.roles[]` (primary = `[0]`); Team job assignment mode `skill` \| `role`; Assigner prompt modules + `planWarnings`; Social picker / start dialog / defaults; mock role synthesizer; card-announce E2E + unit coverage. Design: [agent-network-roles.md](./agent-network-roles.md). |
| 2026-08-28 | **Phase 46E designed.** [dynamic-relay-roster.md](./dynamic-relay-roster.md): signed remote fleet feed, N→K≈4 active set, hot-reload, preset-vouched hints; ops add relay #N without DMG/EXE/EnvoyGo after one-time capability ship. |
| 2026-08-28 | **Phase 46E Path C + fleet sync shipped.** Homes poll any relay `GET /relay-roster.json`; new relay publishes via join-token PUT after join; DMG seed; [add-relay-runbook.md](./add-relay-runbook.md). |
| 2026-08-31 | **Split archive.** Phases 0–49 → [`implementation-plan-archived.md`](./implementation-plan-archived.md); living plan keeps Phase 50–63 + milestone/traceability. |

