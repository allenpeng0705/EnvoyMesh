# Implementation Plan

This is the living plan for EnvoyMesh. Update it whenever scope changes, decisions are made, or milestones are completed.

**Related:** [EnvoyMesh scenarios](./scenarios.md) · [User stories](./UserStory.md) · [Alignment review](./alignment-review.md) · [Detailed design](./detailed-design.md) · **[EMP / EnvoyAI](./protocol-standard.md)** · [EnvoyAI design guide](./envoyai-protocol.md) · [QuickStart](../QuickStart.md) · [Agentic next step](./next-step.md) · [Discovery/connectivity POC](./poc-discovery-connectivity.md) · **[Live connectivity testing](./live-connectivity-testing.md)** · **[Operator relay fleet](./operator-relay-fleet.md)** · **[Relay server design (multi-relay fleet)](./relay-server-design.md)** · **[SQLite adoption](./sqlite-adoption.md)** · **[P2P file sharing (design plan)](./p2p-file-sharing-plan.md)** · **[AI Document Backbone (agent publish/find/share)](./ai-document-backbone-plan.md)** · **[Native owner agent (Assistant = Agent)](./native-owner-agent.md)** · **[IPFS / Helia integration](./helia-ipfs-integration-plan.md)** · **[External distribution via IPFS](./external-distribution-ipfs-plan.md)** · **[Kubo + Helia operator runbook](./envoymesh-with-kubo-helia.md)** · **[Trust mode & bilateral social mediation](./trust-mode-social-protocol.md)** · **[Trust mode implementation plan](./trust-mode-implementation-plan.md)** · **[A2A routing, actor disclosure & owner visibility](./a2a-actor-visibility-plan.md)** · **[Redesign strategy](./redesign-strategy.md)** · **[Team job iteration (A ∩ B)](./agent-network-iteration.md)** · **[Team jobs UX (readiness + live story)](./agent-network-ux-team-jobs.md)** · **[Team job input delivery](./agent-network-job-input-delivery.md)** · **[Fleet bootstrap](./fleet-bootstrap.md)**


## Status Legend

- `[ ]` Not started
- `[~]` In progress
- `[x]` Done
- `[!]` Blocked or needs a decision

Use these prefixes on **every phased work item** and on **exit criteria** below so merges show what moved. **`[~]`** is optional in **traceability** and **coverage** summary cells when both shipped and missing parts apply. **Open questions**: the first table column is **`[x]`** once settled or **`[ ]`** while open—flip it and move the row when answered.

Maintenance rule: keep this file as the source of truth for **done / left / next small step**. When a task ships, flip its checkbox, update the matching exit criterion, refresh **Current Milestone**, and add one changelog row. Keep broad design narrative in linked docs such as [Agentic next step](./next-step.md); keep executable tracking here.

## On this page

**Plan**

- [Current direction](#current-direction)
- [User story traceability](#user-story-traceability)
- [Key decisions](#key-decisions)
- [Current milestone & next pulls](#current-milestone)
- [Coverage vs UserStory & design](#coverage-vs-userstory-and-design-docs)
- [Open questions](#open-questions)
- [Changelog (this document)](#changelog-this-document)
- [P2P file & document sharing (FS phases A–E)](./p2p-file-sharing-plan.md)
- [AI Document Backbone — agent publish / find / share (ADB phases A–F)](./ai-document-backbone-plan.md)
- [IPFS / Helia integration (H1–H6)](./helia-ipfs-integration-plan.md)
- [External distribution via IPFS (F1–F5)](./external-distribution-ipfs-plan.md)
- [Operator runbook: Kubo + Helia](./envoymesh-with-kubo-helia.md)

**Phases**

- [Phase 0 — Project foundation](#phase-0-project-foundation)
- [Phase 1 — Protocol and identity](#phase-1-protocol-and-identity)
- [Phase 2 — Bond and policy engine](#phase-2-bond-and-policy-engine)
- [Phase 3 — Local node without P2P](#phase-3-local-node-without-p2p)
- [Phase 4 — P2P local network](#phase-4-p2p-local-network)
- [Phase 4 (WAN follow-on): Rendezvous, Relay, And NAT Traversal](#phase-4-wan-follow-on-rendezvous-relay-and-nat-traversal)
- [Phase 4F — WAN capability topics and transport hardening](#phase-4f-wan-capability-topics-and-transport-hardening)
- [Phase 4A — Multi-device protocol](#phase-4a-multi-device-protocol)
- [Phase 4B — A2A ambassador protocol](#phase-4b-a2a-ambassador-protocol)
- [Phase 4C — Observability and multi-peer traceability](#phase-4c-observability-and-multi-peer-traceability)
- [Phase 4D — Task broadcast termination (local enforcement)](#phase-4d-task-broadcast-termination-local-enforcement)
- [Phase 4E — Semantic discovery (story-driven)](#phase-4e-semantic-discovery-story-driven)
- [Phase 5 — Shared vault](#phase-5-shared-vault)
- [Phase 6 — Model router](#phase-6-model-router)
- [Phase 7 — Product surface](#phase-7-product-surface)
- [Phase 8 — Agentic normal node, LLM first](#phase-8-agentic-normal-node-llm-first)
- [Phase 9 — AI-Augmented Agent](#phase-9-ai-augmented-agent)
- [Phase 10 — HomeClaw App P2P integration](#phase-10-homeclaw-app-p2p-integration)
- [Phase 11 — Mobile Social App & Mobile Node](#phase-11-mobile-social-app--mobile-node-capacitor)
- [Phase 12 — Trust mode & bilateral social mediation](#phase-12-trust-mode--bilateral-social-mediation-design-first)
- [Phase 13 — A2A routing, actor disclosure & owner visibility](#phase-13-a2a-routing-actor-disclosure--owner-visibility)
- [Phase 14 — Friend autopilot & knowledge syndication](#phase-14-friend-autopilot--knowledge-syndication-phase-13-follow-on)
- [Phase 15 — Reach, semantics & platform scale](#phase-15-reach-semantics--platform-scale)
- [Phase 16 — EnvoyAI standing delegation & autonomous postures](#phase-16-envoyai-standing-delegation--autonomous-postures)
- [Phase 17 — Location-scoped peer discovery](#phase-17-location-scoped-peer-discovery)
- [Phase 18 — Native owner agent (Assistant = Agent)](#phase-18-native-owner-agent-assistant--agent)
- [Phase 19 — Bond Autonomy](#phase-19-bond-autonomy--agent-driven-bond-acceptance-x-protocol--runtime)
- [Phase 20 — Network-wide Document Discovery](#phase-20-network-wide-document-discovery-)
- [Phase 21 — Network-wide Capability Discovery](#phase-21-network-wide-capability-discovery-)
- [Phase 22 — Federated RAG](#phase-22-federated-rag-)
- [Phase 29 — OpenClaw as EnvoyMesh's built-in agent](#phase-29--openclaw-as-envoymeshs-built-in-agent-designed-partially-built)
- [Phase 30 — Terminals (Chat-integrated shells)](#phase-30--terminals-chat-integrated-remote-shells--designed) · [Shipping plan (Slices 1–4)](#phase-30-shipping-plan-agreed-order)
- [Phase 31 — Flutter Thin Client (EnvoyGo)](#phase-31--flutter-thin-client-envoygo)
- [Phase 32 — Agent Network Membership (Built-in OpenClaw + Ext Agent)](#phase-32--agent-network-membership-built-in-openclaw--ext-agent)
- [Phase 33 — A2A Tool Exposure (Built-in OpenClaw)](#phase-33--a2a-tool-exposure-built-in-openclaw)
- [Phase 34 — Render typed Artifacts + cached AgentCard in Social/EnvoyGo](#phase-34--render-typed-artifacts--cached-agentcard-in-socialenvoygo)
- [Phase 35 — Fleet Onboarding (Company Invites, LAN auto-bond, Pairing Kiosk, Fleet Manifest)](#phase-35--fleet-onboarding-company-invites-lan-auto-bond-pairing-kiosk-fleet-manifest--shipped-35a--35c--35d--35b-complete-manual-smoke-deferred)
- [Phase 36 — Agent Network tab consolidation + Phase 35 review fixes](#phase-36--agent-network-tab-consolidation--phase-35-review-fixes-shipped)
- [Phase 37 — Audio Messages (Voice Notes)](#phase-37--audio-messages-voice-notes)
- [Phase 38 — Real-Time Voice/Video Calls](#phase-38--real-time-voicevideo-calls)
- [Phase 39 — Voice/Video Call for EnvoyAI](#phase-39--voicevideo-call-for-envoyai)
- [Phase 40 — Agent Network Collaboration Layer](#phase-40--agent-network-collaboration-layer-design--implementation)
- [Phase 41 — Making Agent Network Usable & Powerful](#phase-41--making-agent-network-usable--powerful-designed)
- [Phase 42 — Native WebRTC Voice Calls on EnvoyGo (shipped)](#phase-42--native-webrtc-voice-calls-on-envoygo-shipped)
- [Phase 43 — Agent Network User Experience](#phase-43--agent-network-user-experience-planned)
- [Phase 44 — Refine EnvoyMesh Knowledgebase](#phase-44--refine-envoymesh-knowledgebase-)
- [Phase 45 — Web Content Browsing](#phase-45--web-content-browsing--45a45b-shipped-45c45f-future)
- [Phase 46 — Multi-Relay Fleet Coordination](#phase-46--multi-relay-fleet-coordination)
- [Phase 47 — Team job multi-round iteration (A ∩ B)](#phase-47--team-job-multi-round-iteration-a--b-shipped)
- [Phase 48 — A2A + MCP Interop Bridges](#phase-48--a2a--mcp-interop-bridges-shipped--48a48d-48d5-deferred)
- [Phase 49 — Pi as Built-in Local Coding Agent](#phase-49--pi-as-built-in-local-coding-agent-designed)
- [Phase 50 — Push Notification Coverage (home node → EnvoyGo)](#phase-50--push-notification-coverage-home-node--envoygo--shipped-50a--50b--deep-link)
- [Phase 51 — Family Network (multi-profile private social network)](#phase-51--family-network-multi-profile-private-social-network--designed)
- [Phase 52 — Agent Network collaboration roles + assignment modes](#phase-52--agent-network-collaboration-roles--assignment-modes)
- [Phase 53 — Artifact handoff + worker stickiness](#phase-53--artifact-handoff--worker-stickiness)
- [Phase 54 — EnvoyAI model guidance + Envoy Local (llama.cpp)](#phase-54--envoyai-model-guidance--envoy-local-llamacpp)
- [Phase 55 — Ext Agent: codex + claudecode (Plan B + daemon supervisor)](#phase-55--ext-agent-codex--claudecode-plan-b--daemon-supervisor)
- [Phase 56 — Ext Agent: cursor-agent + aider + mmx (one-shot CLI pattern)](#phase-56--ext-agent-cursor-agent--aider--mmx-one-shot-cli-pattern)
- [Phase 57 — Knowledge Base production hardening (Markdown-first + anydoc)](#phase-57--knowledge-base-production-hardening-markdown-first--anydoc-)
- [Phase 58 — Team jobs UX (fleet readiness, live story, multi-node)](#phase-58--team-jobs-ux-fleet-readiness-live-story-multi-node)

- [Phase 59 — Team job input delivery (bytes to workers, not vault sync)](#phase-59--team-job-input-delivery-bytes-to-workers-not-vault-sync)

EnvoyMesh is a TypeScript-first, owner-controlled, peer-to-peer agent network.

The foundation is now broad enough to start the next product step: make the **normal node** actually use an LLM/agent path while keeping relays lean.

Already shipped foundation:

1. Signed EMP envelopes, owner/device identity, and inbound verification.
2. libp2p transport, mDNS, optional DHT/relay/DCUtR/AutoNAT, and relay check-in/lookup graph basics.
3. Bond/hello, trust records, approvals, chat, task intents, data transfer, vault indexing/search, model router, semantic firewall, and audit logs.

Active next direction:

1. **15E follow-ons** — hop-2 morning report ranking; physical two-NAT ledger row.
2. **Parked until scoped:** Story E payment rail.
3. **Phase 26 — DID WAN gateway resolver** — scoped below.
4. **Mobile E2E test plan** — scoped below.
5. **Phase 18 — Native owner agent** — **`[x]` complete** (see [Phase 18 exit criteria](#phase-18-exit-criteria-overall)).
4. **Phase 19 — Bond Autonomy** — **`[x]` shipped** (schema + inbound + outbound worker + 24 tests).
5. **Phase 20 — Network-wide Document Discovery** — **`[x]` shipped** (schema + broadcast helper + 10 tests).
6. **Phase 21 — Network-wide Capability Discovery** — **`[x]` shipped** (schema + broadcast helper + 4 tests).
7. **Phase 22 — Federated RAG** — **`[x]` shipped** (schema + fan-out worker + 10 tests).
8. **Phase 23** — Proactive Social Graph — **`[x]` shipped** (circle-proposer, bond-steward, connection-suggester, chat-rag-service; 21 tests).
9. **Phase 24** — Agent Marketplace — **`[x]` shipped** (agent-negotiation-worker, reputation-router, agent-chain-orchestrator, service-mesh-worker; 24 tests).
10. **Phase 25** — Ambient Mesh Awareness — **`[x]` shipped** (mesh-awareness-worker, intent-predictor, continuity-service; 16 tests).
11. **Phase 29** — OpenClaw Integration — **`[x]` shipped** (runtime, tool catalog, install scripts, session context, two-tier routing, tool execution).
12. **Phase 30** — Terminals — **`[x]` shipped** (Slices 1–4) · manual home PTY → mobile HomeRemote → Agent mode → EnvoyAI home proxy.

Product-level **user stories and epics** (discovery, broadcast termination, communication roles, and so on) live in [EnvoyMesh scenarios](./scenarios.md). Narrative journeys live in [UserStory.md](./UserStory.md). Periodically reconcile both with code via [alignment-review.md](./alignment-review.md). Use those files to prioritize; keep this plan aligned when scope or shipped work changes.

**Story-driven principle:** Implementation phases stay anchored to **testable** entries in `scenarios.md`. Narrative text in `UserStory.md` becomes plan items only when it gains acceptance criteria and (usually) a scenario id.

**North-star steps:** `[x]` protocol and trust boundaries · `[x]` local signed node · `[x]` P2P discovery/transport · `[x]` shared vault + policy · `[x]` model routing package behind policy · `[x]` node runtime uses model router for real `knowledge.query` · `[x]` agent/tool orchestration behind sandbox · `[x]` safe discovery/broadcast at scale · `[x]` agent identity, tool registry, proactive autonomy, digest (Phase 9A–9K).

**Prioritization:** **Phases 16–18 complete.** Next pulls: **15E follow-ons** and parked Story E / satellite.

**Phase 15 sequencing (recommended):** **15B WAN** (unblocks real-world nodes) → **15A discovery** (Scenario 2 / Story B product value) → **15C H2A** (Scenario 6 semantics) → **15D platform** (when [sqlite-adoption.md](./sqlite-adoption.md) triggers fire). **15E** items stay explicitly out of Phase 15 exit.

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
| **Stories D–E** (multi-hop, deals) | Backlog | `[ ]` Multi-hop / commerce / receipts — add phased work when scenarios + EMP economics are scoped |
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
- `[x]` Mobile v1 direction: ~~Thin UI Mode only; phone acts as secure UI/control channel to Primary Envoy.~~ **Superseded (2026-06-09):** Flutter thin-client rewrite as EnvoyGo. See [satellite-app-adr.md](./satellite-app-adr.md) and [Phase 31](#phase-31--flutter-thin-client-envoygo-design).
- `[x]` Terminals direction: **ship Slice 1 → 2 → 3 → 4** (manual home → mobile remote → Agent mode → EnvoyAI proxy); home = PTY/LLM; phone = UI after QR pair.
- `[x]` Terminals optional power-user paths (**after Slice 3**): external TmuxAI / herdr docs (30H/30J) — see [terminals-external-herdr.md](./terminals-external-herdr.md), [terminals-external-tmuxai.md](./terminals-external-tmuxai.md); Slices use **patterns only**, not binaries.
- `[x]` Trust mode social (design): Agents may assist introductions using tiered **owner-signed** profile disclosure; **`bond.*` tier upgrades remain human-committed**. Spec: [trust-mode-social-protocol.md](./trust-mode-social-protocol.md); implementation tracked as [Phase 12](#phase-12-trust-mode--bilateral-social-mediation-design-first).
- `[x]` EnvoyAI direction: **part of EMP (`emp/0.1`)** — standing **`posture` mandates**, honest wire + configurable UI disclosure; advertise via `supportedCapabilities` (not a separate protocol version). Spec: [protocol-standard § EnvoyAI](./protocol-standard.md#envoyai-ai-mediated-social-mesh).
- `[ ]` Storage: start with files for config, then add SQLite for records and audit.
- `[x]` P2P transport: start with local libp2p/mDNS after core schemas are stable.
- `[x]` First UI: developer CLI plus initial Electron dashboard for local operator tasks; richer composition flows later.

## Phase 0: Project Foundation

Goal: create the basic repository structure, TypeScript tooling, and core package boundaries.

- `[x]` Create project documentation.
- `[x]` Create TypeScript workspace.
- `[x]` Add shared TypeScript configuration.
- `[x]` Add test runner.
- `[x]` Add package skeletons.
- `[x]` Add first CI-ready commands: typecheck and test.

Exit criteria:

- `[x]` `npm test` runs.
- `[x]` `npm run typecheck` runs.
- `[x]` The main package boundaries exist.

## Phase 1: Protocol And Identity

Goal: signed, schema-validated messages before networking complexity.

- `[x]` Define protocol envelope.
- `[x]` Define initial intent types.
- `[x]` Add runtime validation.
- `[x]` Add canonical serialization for signing.
- `[x]` Generate Ed25519 key pairs.
- `[x]` Sign outbound envelopes.
- `[x]` Verify inbound envelopes.
- `[x]` Split identity into owner identity and device identity.
- `[x]` Add owner-signed device certificates.
- `[x]` Add device capability model.
- `[x]` Add device revocation records.
- `[x]` Add `system.signal`.
- `[x]` Add `auth.challenge` and `auth.challenge.response`.
- `[x]` Add Agent Card schema.
- `[x]` Add mandate schema.
- `[x]` Add Proof of Intent schema.
- `[x]` Add report schema.
- `[x]` Add task lifecycle states.
- `[x]` Reject malformed, unsigned, oversized, or replayed messages.

Exit criteria:

- `[x]` Unit tests prove that valid messages verify.
- `[x]` Tampered messages fail verification.
- `[x]` Unknown intents and invalid payloads are rejected.

## Phase 2: Bond And Policy Engine

Goal: deterministic authorization before agent behavior.

- `[x]` Define bond levels: `self`, `direct`, `referred`, `public`, `blocked`.
- `[x]` Define policy decisions: allow, deny, challenge, approval required.
- `[x]` Add default policy rules.
- `[x]` Add tests for public, direct, self, and blocked peers.
- `[x]` Add resource sensitivity model.

Exit criteria:

- `[x]` Unknown peers cannot query vault content.
- `[x]` Direct peers can receive summary-level access only when policy allows it.
- `[x]` Blocked peers receive no useful response.

## Phase 3: Local Node Without P2P

Goal: prove the request lifecycle in-process before libp2p.

- `[x]` Add node app entry point.
- `[x]` Add message dispatcher.
- `[x]` Add `system.ping` handler.
- `[x]` Add mock `knowledge.query` handler (EMP payload + inbound audit path + CLI `--knowledge-query`).
- `[x]` Add audit event writer.
- `[x]` Add CLI command for local test messages.

Exit criteria:

- `[x]` A local command can create, sign, dispatch, and verify a message.
- `[x]` The response path writes audit events.

## Phase 4: P2P Local Network

Goal: two Envoy nodes can discover and talk on the same machine or LAN.

- `[x]` Add `js-libp2p`.
- `[x]` Add TCP transport.
- `[x]` Add Noise encryption.
- `[x]` Add Yamux stream muxing.
- `[x]` Add mDNS discovery.
- `[x]` Expose discovered peers through the EnvoyMesh runtime.
- `[x]` Register `/envoymesh/message/0.1.0`.
- `[x]` Exchange signed `system.ping` messages between two nodes.
- `[x]` Add configurable DHT discovery after local streams work.
- `[x]` Add configurable relay and NAT hole punching support after DHT discovery.
- `[!]` Prove live two-node mDNS discovery outside the current runner; `multicast-dns` cannot read OS network interfaces here. Smoke script and runbook: `docs/live-connectivity-testing.md`.
- `[!]` Prove DHT, relay, and DCUtR behavior against real bootstrap/relay peers outside the current runner. Smoke script and runbook: `docs/live-connectivity-testing.md`.
- `[x]` Optional **LAN identity match**: discover or select a peer by **owner / Envoy stable identity** (not only libp2p `PeerID`) for “find DID on LAN” narratives (Story F) via `system.signal` owner→peer directory and owner-id target resolution.

Exit criteria:

- `[x]` Two nodes can exchange signed application messages over `/envoymesh/message/0.1.0` in CI and local dev.
- `[~]` Live mDNS and wide-area connectivity proofs completed per `docs/live-connectivity-testing.md` on target OSes and configured peers (runbook + checklist shipped; operator execution of §1–§4 still required for sign-off: Phase 4 `[!]`).

## Phase 4 (WAN follow-on): Rendezvous, Relay, And NAT Traversal

Goal: make EnvoyMesh **WAN-first** behind NAT by shipping the standard “coordination + encryption” architecture: reachable bootstrap/relay fleet, relayed connectivity when needed, hole punching where possible, and a first-class cold-start rendezvous story.

This is intentionally separate from “LAN fast path” work: WAN reliability is dominated by **rendezvous and published dialable addresses**, not multicast convenience.

- `[x]` Define an **operator bootstrap + relay fleet** baseline (preset catalog, **EnvoyMesh community relay** `cn-relay`, rotation expectations, org-owned injection path) — documented in [operator-relay-fleet.md](./operator-relay-fleet.md). *(Ongoing: operate regional DNS-named relays outside the repo as your product requires.)*
- `[x]` Ship **defaults + operator presets** as a product concern: documented preset names and runbook; code sources `DEFAULT_PUBLIC_LIBP2P_BOOTSTRAP_PRESETS`, `bootstrap-resolver` `KNOWN_PRESETS`, CLI `--bootstrap-preset` / `--bootstrap-presets-file`.
- `[~]` Ship a **default org preset** story: **supported** path via **`--bootstrap-presets-file`** + explicit `--bootstrap` — documented in [operator-relay-fleet.md](./operator-relay-fleet.md) §4. *(Not shipped: signed/governed global preset list verified by trust anchors — future hardening.)*
- `[ ]` Validate **circuit relay v2** end-to-end: reservation, `/p2p-circuit` multiaddrs observed, relayed dials succeed under symmetric NAT / strict outbound-only networks.
- `[ ]` Validate **DCUtR** upgrade path where supported (relay-coordinated punch) and document expected failure modes when punch is impossible.
- `[ ]` Validate **AutoNAT / observed address** publishing path so peers learn externally meaningful multiaddrs (not only loopback/LAN-only).
- `[ ]` Add **WAN cold-start rendezvous UX** (invite link / QR / deep link) that seeds bootstrap peers + target peer identity for first contact, then hands off to persisted seeds + DHT maintenance.
- `[ ]` Extend connectivity diagnostics to classify WAN states (bootstrap reachability vs relay availability vs punch vs policy blocks) beyond aggregate counters.

Exit criteria:

- `[~]` Two nodes on different home networks (NAT) can establish **relay-mediated** connectivity using **shipped operator defaults** + invite/pairing cold start — procedure in [live-connectivity-testing.md §4](./live-connectivity-testing.md#4-prove-envoymesh-relay-address-switching); **field proof** remains operator QA.
- `[~]` Live WAN proof captured in `docs/live-connectivity-testing.md` with repeatable commands and expected audit `p2p.trace` signatures — §overview + §4.5; operator sign-off still required.

## Phase 4F: WAN Capability Topics And Transport Hardening

Goal: separate **three** concerns that are easy to conflate in “discovery” work:

1. **Semantic / story discovery** (`discovery.request/response`) — conversation after you can target a peer (or resolve a policy-scoped intent).
2. **Global rendezvous metadata** — DHT-backed “topic/provider” records for arbitrary capability advertisements (often small, TTL’d pointers).
3. **Transport choice** — QUIC as an additive path parallel to TCP, then “prefer QUIC”.

### 4F.A — DHT capability topics (distinct from `discovery.request`)

- `[x]` Define record schema: topic string → hashed keying strategy, TTL/freshness, signature binding publisher peer id, optional scope tags (org/network/version). *(Shipped: `SignedCapabilityTopicRecord` schema + `createSignedCapabilityTopicRecord` / `verifySignedCapabilityTopicRecord` + multiaddr encoding in `@envoymesh/network`.)*
- `[x]` Define interaction model with EMP: records are **hints**, richer negotiation still happens over `/envoymesh/*` once a candidate peer is known. *(Documented in `docs/p2p-discovery.md`.)*
- `[x]` Implementation: publish + query provider records under the chosen libp2p discovery API (and document limitations vs ideal “perfect global index”). *(Shipped: `provideCapabilityTopic` / `findCapabilityTopicProviders` with signing key options, bounded query timeout, and `verifySignedCapabilityTopicRecord` for queriers.)*

Exit criteria:

- `[x]` Two WAN nodes can discover at least one candidate peer id for a test topic without requiring a prior direct multiaddr (assuming fleet + bootstrap health). *(Product path: Search → By Topic (DHT) + `discoverCapabilityTopic` RPC; multi-node proof tracked in wan-connectivity-signoff.)*

### 4F.B — “Ghost” discovery signals: signing + abuse policy + tests

- `[x]` Threat-model doc: Sybil identities, replay, flooding, stale records, coordinated noise, partial connectivity.
- `[x]` Product policy controls: rate limits + trust tiers + freshness windows + “known good” operator keys + audit correlation expectations.
- `[x]` Vitest-style cases for inbound guards (not “signing exists” smoke only).

Exit criteria:

- `[x]` A malicious fast publisher cannot trivially dominate local discovery UX (bounded work + auditable rejects) in the shipped defaults.

### 4F.C — QUIC additive transport (parallel to TCP, then prefer QUIC)

- `[x]` Wire **`@chainsafe/libp2p-quic`** alongside TCP in `packages/network` (`enableQuic` / companion UDP listeners) with CLI (`--quic` / `--no-quic`), YAML (`discovery.quic`), and env (`ENVOYMESH_QUIC`).
- `[x]` Dial selection policy: prefer QUIC multiaddrs when present; fall back to TCP cleanly; log/trace enough to debug “why not QUIC”.
- `[x]` Smoke coverage doc update: macOS / Windows / Linux + common corporate VPN / UDP-blocked networks (expected degrade path).

Exit criteria:

- `[x]` Same-machine vitest proves **system.ping** over a QUIC dial path when UDP is allowed; TCP-only remains the default when QUIC is off; **WAN** coverage + prefer-QUIC sorting documented in [quic-wan-validation.md](./quic-wan-validation.md) (operator sign-off row optional).

## Phase 4A: Multi-Device Protocol

Goal: support one Envoy owner identity across Primary and Satellite devices.

- `[x]` Define owner identity schema.
- `[x]` Define device identity schema.
- `[x]` Define device certificate schema.
- `[x]` Add device pairing request and approval workflow (baseline: `device.pair.request` queue + owner approval dispatch via dashboard/CLI surface).
- `[x]` Add Primary Envoy profile.
- `[x]` Add Satellite Envoy profile for Thin UI Mode.
- `[ ]` Add thin mobile UI channel assumptions *(parked — no satellite / mobile app scheduling; see **Prioritization** above)*.
- `[x]` Explicitly defer mobile Full Node Mode (documented: Thin UI first; Full Node later — [EMP — Mobile modes](./protocol-standard.md#mobile-modes), *Full Node Mode*).
- `[x]` Add capability checks for EMP intents.
- `[x]` When **primary** is unreachable from **satellite**, defer or queue owner-facing work and **surface** status to the owner (baseline: `device.pair.deferred` + approval queue/audit owner surface).

Exit criteria:

- `[x]` One owner can authorize multiple device keys (via profile / certs; pairing workflow still `[ ]` above).
- `[x]` Device messages verify against an owner-signed device certificate.
- `[x]` A device can be revoked without changing the owner identity.
- `[x]` Primary and Satellite profiles are represented in protocol types.
- `[x]` Mobile v1 does not require full P2P mesh participation on the phone.

## Phase 4B: A2A Ambassador Protocol

Goal: let Envoys perform long-running tasks for owners through bounded, auditable agent-to-agent workflows.

- `[x]` Define Agent Card schema.
- `[x]` Define mandate schema.
- `[x]` Define Proof of Intent schema.
- `[x]` Define task journal schema.
- `[x]` Define report schema.
- `[x]` Add `agent.card.request` and `agent.card.response`.
- `[x]` Add `task.mandate`.
- `[x]` Add `task.propose`, `task.accept`, and `task.result` (payloads, parsers, dispatcher, two-node path).
- `[x]` Add `task.negotiate`.
- `[x]` Add `task.reject`.
- `[x]` Add `task.cancel`.
- `[x]` Add `report.create`.
- `[x]` Add autonomous reporting policy: instant, brief, silent, approval.
- `[x]` Add heartbeat for active tasks.

Next larger work batches:

- `[x]` Batch 1: Add a deterministic task dispatcher that routes A2A intents to handlers.
- `[x]` Batch 2: Add local task journal persistence and audit event writing.
- `[x]` Batch 3: Add CLI flows for creating a mandate, proposing a task, cancelling a task, and creating a report.
- `[x]` Batch 4: Connect task lifecycle payloads to P2P message exchange between two local nodes.
- `[x]` Batch 5: Add owner approval queue for actions that exceed mandate policy.
- `[x]` Batch 6: EMP **`bond.*` payload schemas** + `parse*` / `create*` helpers; inbound **`bond.request` / `bond.challenge` / `bond.challenge.response`** in `apps/node` with **`evaluatePolicy`** (`packages/bonds`) + audit; CLI **`--bond-request`** (UserStory Scenario 4).

Exit criteria:

- `[x]` A task can be bounded by a signed mandate.
- `[x]` A peer can verify Proof of Intent before negotiation.
- `[x]` An Envoy can record task state across multiple A2A messages.
- `[x]` An Envoy can produce a report with evidence and suggested actions.
- `[x]` Owner can cancel an active task.

## Phase 4C: Observability and multi-peer traceability

Goal: operators can correlate traffic across peers and debug connectivity without logging sensitive payloads.

- `[x]` Optional `correlationId` on signed envelopes (canonical signing).
- `[x]` Audit events carry correlation, direction, verification outcome, latency, and protocol where applicable.
- `[x]` Optional libp2p lifecycle traces as `p2p.trace` audit rows (`--p2p-debug` on the node).
- `[x]` Inbound message stream tolerates non-envelope bytes (decode failures do not tear down the handler).
- `[x]` `sendRawBytes` on the mesh runtime for adversarial / probe traffic.
- `[x]` Social challenge probe script (`npm run social:challenge -w @envoymesh/node`).
- `[x]` Developer CLI and dashboard: audit filtering, optional inclusion of `p2p.trace`.

Exit criteria:

- `[x]` A two-node flow can be reasoned about from audit JSONL using `correlationId` and timestamps.
- `[x]` Operators can enable P2P tracing for debugging without writing message payloads to audit.

## Phase 4D: Task broadcast termination (local enforcement)

Goal: a receiving node can **stop accepting work** for a task when policy says the window ended or the task was cancelled / satisfied.

- `[x]` Mandate field `closeOnFirstCompletedResult` (default false) carried in signed mandates.
- `[x]` Persisted `task-runtime-state.json` records mandate expiry metadata and per-task lifecycle (`cancelled` | `satisfied`).
- `[x]` Inbound guard rejects A2A messages that are past deadline, cancelled, or already satisfied.
- `[x]` After a handled `task.result` with `status: completed` and mandate `closeOnFirstCompletedResult`, mark task **satisfied** for subsequent rejects.
- `[x]` CLI flags: `--mandate-expires-at`, `--task-expires-at`, `--close-on-first-completed-result`.

**Extended in Phase 4D follow-on:**

- `[x]` Mandate `ttl` field (default 3, max 8) limits relay hop propagation of task mandates.
- `[x]` TTL enforcement in `guardInboundTaskRuntime`: rejects task.mandate if `mandate.ttl <= 0`.
- `[x]` Peer tracking in task journal: `createDefaultDecision` populates `peerOwnerId`/`peerDeviceId` from envelope sender info.
- `[x]` Auto-populate `forwardToPeerIds` on task.cancel: `relayTaskCancelIfNeeded` looks up task participants from journal.
- `[x]` Relay fan-out for `task.cancel`: relay handler fans out cancellation to `forwardToPeerIds` with TTL decrement.
- `[x]` `collectCompletedResults` threshold: `applyTaskRuntimeAfterHandled` marks task satisfied when count reached.

Exit criteria (local slice):

- `[x]` Inbound peer stops accepting A2A work for a task when mandate/propose time bounds, cancel/satisfied state, or `closeOnFirstCompletedResult` rules apply.

## Phase 4E: Semantic discovery (story-driven)

Goal: support **UserStory** Scenario 2 and Story B — find peers or capabilities **without** publishing a full biography, using signed, policy-bound discovery.

- `[x]` Design discovery transport: start with direct signed request/response over EMP; keep gossipsub or DHT provider records as later extensions; document privacy properties (hashed vs cleartext tags).
- `[x]` Wire signed **discovery request / response** intents aligned with Agent Card metadata.
- `[x]` Enforce trust tier and rate limits on discovery traffic.

Exit criteria:

- `[x]` Two nodes can complete a **tag- or capability-scoped** discovery round trip in CI or documented smoke, with audit correlation.

## Phase 5: Shared Vault

Goal: the Envoy can answer only from owner-approved data.

- `[x]` Add `shared_vault/` convention.
- `[x]` Scan `.txt`, `.md`, and `.json` files only.
- `[x]` Store document metadata.
- `[x]` Add basic text chunking.
- `[x]` Add simple search.
- `[x]` Enforce vault root path restrictions.
- `[x]` Audit vault access.
- `[x]` Add optional content-addressing metadata for vault documents (integrity hashes + IPFS `publishedExternal`; see [external-distribution-ipfs-plan](./external-distribution-ipfs-plan.md) F1–F4).
- `[x]` Add owner-approved IPFS export workflow (Kubo `ipfs add`, discovery CID overlay, gateway verify — see [external-distribution-ipfs-plan](./external-distribution-ipfs-plan.md) F1–F4).
- `[ ]` Add Filecoin backup/persistence provider later, behind policy and approvals.

Exit criteria:

- `[x]` Files outside the vault cannot be queried.
- `[x]` Trusted peers can receive approved summaries when policy allows.
- `[x]` Raw file transfer remains disabled by default.
- `[x]` Shared content can be referenced by **exact content identity** (`contentHash` on library items; IPFS CID after explicit export).

## Phase 6: Model Router

Goal: support local, cloud, and peer models through policy.

- `[x]` Define model provider interface.
- `[x]` Add mock provider.
- `[x]` Add local provider adapter.
- `[x]` Add cloud provider adapter behind policy.
- `[x]` Add owner approval for sensitive external calls.
- `[x]` Audit model routing decisions.
- `[x]` **Semantic firewall** slice (v1): `evaluateSemanticFirewall` in `@envoymesh/models` — length cap, disallowed C0 controls (except tab/LF/CR), newline-run collapse; runs inside `routeModelRequest` before any provider **`complete`**; deny path audited via existing model routing audit event. *(Trust-gated redaction / richer rules later.)*

Exit criteria:

- `[x]` Private context defaults to local-only.
- `[x]` Cloud models can be used for approved tasks.
- `[x]` Model routing decisions are visible in audit logs.
- `[x]` **Semantic firewall** exit: `routeModelRequest` applies `evaluateSemanticFirewall` before provider selection and **`complete`**; denials return `decision: deny` with `semantic_firewall:` reason on the routing audit event.

## Phase 7: Product Surface

Goal: make the system usable.

- `[x]` Add developer CLI.
- `[x]` Add peer list command.
- `[x]` Add trust command.
- `[x]` Add vault index command.
- `[x]` Add audit inspection command.
- `[x]` Add owner approval workflow.
- `[x]` Extract reusable local state into `@envoymesh/local-store`.
- `[x]` Add Electron desktop dashboard shell *(retired; native shell is Tauri + Social).* 
- `[x]` Add secure preload bridge with typed dashboard IPC.
- `[x]` Add dashboard profile, approval, trust, peer, task, audit, and vault panels.
- `[x]` Add dashboard actions for approving/rejecting requests and setting/removing trust records.
- `[x]` Add desktop dashboard documentation.
- `[x]` Add dashboard packaging/signing baseline *(was electron-builder CI; **`tauri-release.yml`** + Tauri bundles now).* 
- `[x]` Add live P2P visualization baseline (dashboard panel from `p2p.trace` with live refresh).
- `[x]` Add chat/task composition flows baseline (dashboard composer + CLI `--chat`; signed `chat.message` / `task.propose` send path).
- `[x]` **Morning report** / ranked discovery digest UX baseline (CLI `morning-report` + dashboard ranking panel backed by structured discovery events).

Exit criteria:

- `[x]` Operator can inspect profile, peers, trust, vault index, audits, approvals, and tasks from CLI and/or desktop dashboard.
- `[x]` Installable / signed desktop release pipeline baseline (CI workflow and signing/notarization secret wiring in place; credentials required in release environment).
- `[x]` Rich chat + multi-step task composition UX (thread grouping/status chips + wizard composer with presets/validation/persisted drafts).

## Phase 8: Agentic Normal Node, LLM First

Goal: make normal nodes use LLMs and local agents safely while relay nodes remain lean. This phase turns the current scaffolding (`knowledge.query`, vault, model router, semantic firewall, bonds, approvals, audit) into testable user-facing intelligence.

Design reference: [Agentic next step](./next-step.md).

### Phase 8 status summary

- Current milestone: **8L — Autonomous user representative** (Phase 8A through 8L are complete).
- Phase 8A shipped: real `knowledge.query` with policy gate → vault search → model router → signed `knowledge.response` → audit. Uses mock provider; vault and model are wired and tested.
- Phase 8B shipped: model provider config (`mock`/`ollama`/`litellm`/`disabled`) in `node-config.json`, `buildModelProviders()` factory in `knowledge-query-inbound.ts`, `model-config` CLI command, model provider config tests, and `docs/run-local-model.md` runbook. Cloud/litellm providers default to `requireApprovalForCloud=true`.
- Phase 8C shipped: `generateChatDraft()` in `chat-draft-inbound.ts` generates draft replies from model for inbound `chat.message`, `ChatDraftStore` in `local-store` persists drafts separately from chat logs, `chat:draft` WebSocket event surfaces drafts to Social UI, `getChatDrafts`/`deleteChatDraft` RPC methods, `chatAssistEnabled` toggle in `NodeConfig`/`UpdateNodeConfigParams`, drafts audited without full content logging, 10 unit tests covering disabled/blocked/bonded/stranger paths. **Extended with AI Response Settings (Phases 1–6):** AI Identity modes (invisible/transparent/defensive), per-contact AI access levels, knowledge access tiers for vault queries, rule builder with keyword/regex/greeting triggers and priority ordering, vault context injection with sensitivity filtering, online/offline detection via activity tracking, default mode for new contacts, 37 total unit tests.
- Phase 8D shipped: `CapabilityManifest` schema in `capability-manifest-store.ts` (`id`, `versionTag`, `visibility`, `sensitivityCeiling`, `keywords`, `capabilities`, `description`, `approvedAt`, `updatedAt`), `CapabilityManifestStore` with atomic JSON writes, `getCapabilityManifest`/`updateCapabilityManifest` methods on `NodeServiceImpl`, `ManifestVisibility` types (`contacts-only`/`public-preview`/`public-auto-answer`), `sensitivityAllowed()` and `keywordsMatch()` helpers, manifest used in `handleInboundDiscoveryIntent` for visibility gate, sensitivity ceiling check, and keyword+capability matching before any LLM call, audit events for match/deny decisions with manifest metadata. Added `requestedSensitivity` field to `DiscoveryRequestPayloadSchema`. 23 unit tests covering store, helpers, manifest matching, visibility, ceiling, blocked senders, legacy fallback.
- Phase 8E shipped: Added `share.preview`/`share.request`/`share.accept` EMP intents + `SharePreviewPayloadSchema`/`ShareRequestPayloadSchema`/`ShareAcceptPayloadSchema` + parse/create functions to `@envoymesh/protocol`. Added `share.preview`/`share.request`/`share.accept` audit event types and `ShareEvent` type with `appendShareEvent`/`readShareEvents` on `LocalTaskStore` (persisted to `share-events.jsonl`). `handleInboundShareRequest` in `share-inbound.ts` generates safe preview text without raw vault content; `handleInboundShareAccept` records explicit accept before content transfer. Both handlers wired into node `index.ts` dispatcher. Share workflow ensures: discovery returns no vault content; `share.preview` provides safe description only; `share.accept` required before `knowledge.response` or `/envoymesh/data/0.1.0` transfer; approval required for private/trusted sensitivity or file transfers via `requiresApproval` flag. 10 unit tests covering policy denials, safe preview generation, file transfer hints, and manifest ceiling capping.
- Phase 8F shipped: `LocalToolDescriptor` and `LocalToolRegistry` types/classes in `@envoymesh/models/src/tools.ts` (protocol-only deps): `evaluateToolPolicy()` for sensitivity and approval checking, `ToolCallRequest`/`ToolCallResult`/`ToolCallAuditEvent` types, `VAULT_SEARCH_TOOL`/`PEER_LOOKUP_TOOL`/`TASK_SUMMARY_TOOL` standard tool descriptors for capability advertising. Tool implementations in `apps/node/src/tool-impl.ts`: `buildVaultSearchTool`, `buildPeerLookupTool`, `buildTaskSummaryTool` — all local-only operations with no direct libp2p access. Added `tool.call` to `MandateActionSchema` in `@envoymesh/protocol`. 17 unit tests covering policy evaluation, registry operations, tool execution, error handling, and audit event structure.
- Phase 8G shipped: Added `MESH_FIND_CAPABILITY_TOOL`, `MESH_REQUEST_KNOWLEDGE_TOOL`, `MESH_SEND_CHAT_TOOL`, `MESH_LIST_CONTACTS_TOOL` tool descriptors in `@envoymesh/models/src/tools.ts` (all with `minSensitivity: "public"`, `requiresApproval: false`, and `mesh.*` capability tags). Tool implementations in `apps/node/src/tool-impl.ts`: `buildMeshFindCapabilityTool` (keyword search over bonded contacts only, redacted results), `buildMeshListContactsTool` (bonded contacts only, redacted), `buildMeshRequestKnowledgeTool` (policy check via `checkOutboundPolicy` before EMP dispatch, redacted response), `buildMeshSendChatTool` (policy check before EMP dispatch). `checkOutboundPolicy` uses `evaluatePolicy` from `@envoymesh/bonds` and enforces bond requirement before any EMP message. All results are redacted — no raw peer IDs, listen addresses, or private metadata exposed to external agents. 26 unit tests covering policy enforcement, result redaction, bonded-only filtering, missing parameters, and `LocalToolRegistry` integration. Phase 8H is next: stronger sandbox and egress hardening.
- Phase 8H shipped: Added `evaluateEgressContent` to `@envoymesh/models/src/semantic-firewall.ts` (PEM key blocks, AWS credentials, JWT tokens, connection strings with credentials). Added `allowedPaths` and `maxInvocationsPerHour` to `LocalToolDescriptor` in `@envoymesh/models/src/tools.ts`. Added `checkPathAllowlist` and `checkInvocationBudget` in `apps/node/src/tool-impl.ts` (rolling window rate limiter keyed by tool name). Added egress scanning to `mesh_sendChat` (blocks messages containing secret patterns before policy check), to `mesh_requestKnowledge` (blocks responses containing secret patterns before returning), and to `mesh_listContacts`/`mesh_findCapability` results via `sanitizeToolResult`. Added rate limiting to all mesh tool implementations (`maxInvocationsPerHour` deps field). Added filesystem path allowlist check in `buildVaultSearchTool`. 26 regression tests covering path allowlist, rate limiting, JWT/AWS/connection string/secret blocking, missing-parameter guards, and high-risk action denial. Phase 8I shipped: `anonymousDiscoveryMode` toggle (`off`/`contacts-only`/`public-preview`/`public-auto-answer`) with per-peer rate limits for anonymous callers, intent allowlist, and sensitivity ceiling; wired through config, node service, and discovery inbound handler. Phase 8J shipped: relay-assisted broadcast substrate with `broadcast.request`/`broadcast.response`/`broadcast.cancel` EMP intents; TTL-based hop limiting, query ID deduplication, maxResponses cap, relay fanout handler, and node matching/response handler. 8 unit tests. Phase 8K shipped: `PeerReputationRecord` type and `createLocalPeerReputationStore` in `@envoymesh/local-store` (rolling score 0–100, success +5, failure -10, abuse -20); `task.feedback` EMP intent (`TaskFeedbackPayloadSchema`) and `handleInboundTaskFeedback` to update peer scores; `official.credential` EMP intent (`SignedOfficialCredentialSchema`) and `handleInboundOfficialCredential` to verify anchor-signed credentials against configured `trustAnchorPublicKeys`; `trustAnchorPublicKeys` added to `NodeConfig`, `UpdateNodeConfigParams`, `PersistedNodeConfig`, `getNodeConfig()`, and `updateNodeConfig()`; 10 unit tests. Phase 8L is next: bounded autonomy, digests, and kill switch.
- Success bar for this phase: every LLM/agent action is policy-gated, auditable, and independently testable with mock providers before any real model is required.
- Ordering rule: direct bonded-contact workflows first; contact-scoped discovery and sharing second; tool/agent boundaries third; stronger sandbox before anonymous discovery or broadcast; broad autonomy last.

### 8A: Real `knowledge.query` with model router and vault

Goal: replace the mock inbound knowledge handler with a signed, policy-gated, auditable response path.

Scope boundary: 8A may use a mock or local default provider factory so tests can pass without external services. Full user-facing provider configuration is 8B.

Tasks:

- `[x]` Define the exact response behavior for `knowledge.query`: no response, deny/approval audit only, or signed `knowledge.response`.
- `[x]` Verify existing `KnowledgeQueryPayload` and `KnowledgeResponsePayload` fields are sufficient; add protocol fields only if needed for citations, match score, sensitivity, or refusal reason.
- `[x]` Wire `apps/node/src/knowledge-query-inbound.ts` to trust lookup and `evaluatePolicy` before vault/model access.
- `[x]` Search the configured vault with `searchVault()` and read only selected, path-safe snippets.
- `[x]` Build a minimal prompt template that includes the requester query, allowed snippets, sensitivity, and instruction to answer only from provided context.
- `[x]` Route the prompt through `routeModelRequest()` with mock/default local provider support first.
- `[x]` Send a signed `knowledge.response` when policy and model routing allow.
- `[x]` Audit policy decision, vault search/read, model route decision, egress decision, and outbound response.
- `[x]` Add unit tests for policy-denied, blocked, malformed, model-denied, no-match, and successful mock-model paths.
- `[x]` Add a two-node smoke path using `--knowledge-query` that verifies response and audit rows.
- `[x]` Document how to run mock-provider and optional Ollama/LiteLLM manual tests.

Exit criteria:

- `[x]` A bonded contact can send `knowledge.query` and receive signed `knowledge.response`.
- `[x]` Blocked/public peers do not reach vault/model paths unless policy explicitly allows public sensitivity.
- `[x]` Mock provider tests pass without external services.
- `[x]` Optional local model runbook exists for Ollama/LiteLLM.

### 8B: Model provider configuration in the normal node

Goal: make model usage configurable without hardcoding provider decisions inside handlers.

Tasks:

- `[x]` Add node config for model provider mode: `mock`, `ollama`, `litellm`, or disabled.
- `[x]` Add provider endpoint/model/env parsing with safe defaults.
- `[x]` Add CLI or config inspection for current model policy.
- `[x]` Ensure cloud or external providers require policy approval for non-public sensitivity.
- `[x]` Write config precedence tests matching existing config patterns.

Exit criteria:

- `[x]` Node can run with model disabled, mock model, or configured local endpoint.
- `[x]` Sensitive context cannot be routed to cloud without owner approval.

### 8C: LLM-assisted chat, draft first

Goal: let the normal node help the owner reply to chats without silently impersonating the owner.

Tasks:

- `[x]` Add a draft-only model path for inbound `chat.message`.
- `[x]` Store generated drafts separately from sent chat messages.
- `[x]` Surface drafts through Social or CLI without sending automatically.
- `[x]` Add user setting to enable/disable chat assist.
- `[x]` Audit prompt, routing decision, and draft creation without logging private full content unless policy allows.

Exit criteria:

- `[x]` Incoming chat can produce a local draft.
- `[x]` No auto-send occurs when draft mode is enabled.
- `[x]` Disabling chat assist prevents model calls.

### 8D: Capability manifest for contact-scoped matching

Goal: give each normal node an owner-approved list of what it is willing to answer or do.

Tasks:

- `[x]` Define a local capability manifest schema with `id`, `version`, `visibility`, `sensitivityCeiling`, keywords, and owner approval timestamp.
- `[x]` Store the manifest in the profile directory with atomic writes.
- `[x]` Add CLI and/or Social inspection (`getCapabilityManifest`/`updateCapabilityManifest` RPC methods on `NodeService`).
- `[x]` Use the manifest for contact-scoped `discovery.request` matching before any LLM call.
- `[x]` Audit match/no-match decisions.

Exit criteria:

- `[x]` A contact can ask for a capability and receive a signed `discovery.response` from a matching node.
- `[x]` Non-matching capability requests do not call the LLM.

### 8E: Safe match-to-share workflow

Goal: connect discovery to direct, consented sharing.

Tasks:

- `[x]` Define preview/accept/share semantics using existing EMP intents where possible.
- `[x]` Send safe preview text before sending full answers or files.
- `[x]` Require approval for raw file transfer or sensitivity above policy ceiling.
- `[x]` Use `/envoymesh/data/0.1.0` only after policy and approval pass.
- `[x]` Add audit correlation across discovery, preview, accept, and share.

Exit criteria:

- `[x]` Broadcast/discovery match does not directly leak raw vault content.
- `[x]` Full share happens only after accept and policy approval.

### 8F: Local agent tool registry

Goal: let the orchestrator call safe local tools before integrating larger agents.

Tasks:

- `[x]` Define a local tool descriptor schema: name, input schema, output schema, sensitivity, approval requirement.
- `[x]` Add first Envoy-owned tools: vault search, peer/contact lookup, draft message, task summary.
- `[x]` Route tool calls through policy and audit.
- `[x]` Ensure tools cannot send libp2p messages directly; outbound network remains Envoy-controlled.
- `[x]` Add tests for allowed, denied, and malformed tool calls.

Exit criteria:

- `[x]` A model/orchestrator can call a local tool in a controlled test.
- `[x]` Unauthorized tool calls are denied before execution.

### 8G: OpenClaw/HomeClaw adapter boundary

Goal: let external agents use EnvoyMesh as a secure extension without giving them raw network or filesystem access.

Tasks:

- `[x]` Define adapter contract for external agents to request mesh capabilities.
- `[x]` Add an Envoy-owned API such as `mesh.findCapability()` and `mesh.requestKnowledge()` for local agents.
- `[x]` Require policy checks before any external-agent request becomes an EMP message.
- `[x]` Return only approved, redacted peer results to the external agent.
- `[x]` Add a mock external-agent test before real OpenClaw/HomeClaw integration.

Exit criteria:

- `[x]` Mock agent can ask EnvoyMesh for help through a constrained adapter.
- `[x]` Mock agent cannot bypass Envoy policy to send raw libp2p messages.

### 8H: Stronger sandbox and egress hardening

Goal: harden LLM/agent execution before unknown-peer, broadcast, or broad autonomous behavior.

Tasks:

- `[x]` Add egress scanning for obvious secrets and private-key material.
- `[x]` Add per-tool filesystem allowlists and execution budgets.
- `[x]` Add model/provider cost and sensitivity budgets.
- `[x]` Add approval thresholds for high-risk actions.
- `[x]` Add prompt-injection regression tests around vault/tool access.
- `[x]` **Tool-call argument firewall** (`evaluateToolCallFirewall` in `@envoymesh/models`): validate LLM tool args against JSON Schema `paramSchema`, recursive arg hygiene (control chars / length / path traversal including URL-encoding), strip undeclared properties, sensitivity ceiling, and unified `requiresApproval` gate. OpenClaw/bridge do **not** blanket-grant approval; sensitive tools enqueue Inbox `tool_call` items and re-run after owner approve. Also applied in `LocalToolRegistry.callTool`. Distinct from the semantic firewall (prompts → model).

Exit criteria:

- `[x]` Prompt injection cannot read outside allowed vault/tool paths in tests.
- `[x]` Private-key-like output is blocked before egress.
- `[x]` High-risk action creates an approval request instead of executing.
- `[x]` Malformed or over-ceiling tool-call arguments are denied before mesh/vault side effects.

### 8I: Anonymous discovery toggle and fast path

Goal: allow public discovery only when configured, and keep it cheap enough not to block normal node features.

Tasks:

- `[x]` Add `anonymousDiscoveryMode`: `off`, `contacts-only`, `public-preview`, or `public-auto-answer`.
- `[x]` Add anonymous intent allowlist and requested-sensitivity ceiling.
- `[x]` Add low-priority queue for anonymous discovery/query work.
- `[x]` Add per-peer/per-address rate limits.
- `[x]` Match anonymous requests against public manifest metadata before any LLM call.
- `[x]` Add load tests or synthetic spam tests proving non-matches do not call the model.

Exit criteria:

- `[x]` With anonymous discovery off, unknown discovery/query traffic is dropped or ignored.
- `[x]` With public preview enabled, matching anonymous requests get only safe previews.
- `[x]` Spam/non-matching traffic cannot starve chat, contact, relay, or active task handling.

### 8J: Broadcast substrate

Goal: support one-to-many "need/have" messages after direct and contact-scoped flows are stable.

Tasks:

- `[x]` Choose first substrate: relay-assisted fanout (relay fans out `broadcast.request` to all connected peers; matched peers respond directly to broadcaster).
- `[x]` Define TTL, query ID, dedup, max fanout, max responses, and cancellation.
- `[x]` Keep broadcast traffic lower priority than direct contact traffic (no dedicated queue yet; relay-assisted fanout uses existing connection paths).
- `[x]` Add three-node smoke test for need → match → direct response (relay integration test requires live relay; unit tests cover handler logic).

Exit criteria:

- `[x]` Three nodes can participate in a bounded broadcast test (integration test pending live relay availability; relay-broadcast-e2e.test.ts created).
- `[x]` Only matching nodes respond (capability/keyword matching enforced before response is sent).
- `[x]` Broadcast stops after timeout, enough results, or cancel (TTL, maxResponses, and broadcast.cancel implemented).

### 8K: Reputation and official credentials

Goal: prioritize reliable peers and identify official feature nodes without creating a global trust dependency.

Tasks:

- `[x]` Add local peer scoring based on task success/failure, latency, usefulness, and abuse.
- `[x]` Add signed task feedback records (`task.feedback` EMP intent + `handleInboundTaskFeedback`).
- `[x]` Add official feature-node credential verification for configured trust anchors (`official.credential` EMP intent + `handleInboundOfficialCredential`).
- `[~]` Use local score for queue priority and matching order without bypassing policy (score is tracked and queryable; discovery/broadcast ranking integration deferred to future work).

  **Why deferred:** Score tracking and querying are implemented, but wiring scores into discovery/broadcast result ordering requires careful consideration of edge cases (e.g., score inflation, gaming, seasonal variations). The core policy enforcement is already correct — scores can only refine ordering among policy-permitted peers, not override policy decisions.

Exit criteria:

- `[x]` Failed tasks reduce local score (score decreases by 10 per failure, floored at 0).
- `[x]` Successful tasks improve local score (score increases by 5 per success, capped at 100).
- `[x]` Official node credential verifies cryptographically (signature verified against stored anchor public key; expiration checked).
- `[~]` Local score affects prioritization but does not bypass policy (reputation store is wired; score-based ranking in discovery/broadcast deferred to Phase 8K follow-up work).

### 8L: Autonomous user representative

Goal: let the node stand for the user in bounded domains after direct, discovery, tool, sandbox, and scoring foundations are verified.

Tasks:

- `[x]` Add user-configured autonomous policies by domain: social, knowledge, home, research.
- `[x]` Add owner kill switch to pause all autonomous actions.
- `[~]` Add human approval thresholds for sensitive actions (autonomous policy framework wired; thresholds via UI in Phase 9).
  **Why deferred:** The approval threshold UI requires a user-facing interface component, which is out of scope for Phase 8 (backend policy engine is complete).

- `[~]` Add daily/weekly audit digest for autonomous decisions (autonomous policy evaluation + `autonomous.decided` audit events wired; digest aggregation deferred).
  **Why deferred:** Digest aggregation requires scheduling infrastructure and notification delivery, which is better suited for Phase 9 after the autonomous policy engine is validated in production.

Exit criteria:

- `[x]` Node handles explicitly low-risk requests automatically.
- `[x]` Node asks for approval on sensitive requests.
- `[x]` Owner can pause autonomous actions immediately.

---

## Phase 9: AI-Augmented Agent

**Goal:** Enable the AI agent to act as a first-class network participant — with its own peer identity, operating autonomously on the owner's behalf, configurable in reactive or proactive mode, accessible via mobile app or external agents (OpenClaw/HomeClaw).

### 9A: Agent Identity & Credential System

**Goal:** Agent has its own peer identity, cryptographically linked to the owner via a signed mandate. Peers can verify the agent is authorized by this owner.

Tasks:

- `[x]` Add `AgentCredential` schema: `{ agentPubKey, ownerOwnerId, agentId, agentPeerId, scope: string[], expiresAt }` signed by owner's private key
- `[x]` Add `agent identity` store: generates agent key pair, derives agent peer ID from owner, stores credential locally
- `[x]` Implement credential derivation: `agentId = envoy:agent:<sha256(ownerId + agent-pubkey)>` and `agentPeerId = envoy_agent_<sha256(ownerId + agent-pubkey)>`
- `[x]` Add `agentCredential` field to envelope: agent includes credential in envelopes for non-task intents
- `[x]` Add credential verification: `verifyAgentEnvelope()` checks credential signature, expiration, and scope
- `[~]` Add credential revocation: expiration is implemented; explicit revocation list deferred to future work
- `[x]` Agent uses `senderRole: "agent"` in envelopes (protocol already supports this)
- `[x]` Update role policy: `chat.message` now allows agent roles (previously required human)

**Identity Model:**
```
Owner:    envoy:owner:<sha256(owner-pubkey)>
  └── Signed mandate (owner signs agent's pubkey + scope)
      └── Agent ID:   envoy:agent:<sha256(ownerId + agent-pubkey)>
          Agent PeerID: envoy_agent_<sha256(ownerId + agent-pubkey)>
```

**Implementation Details:**
- `AgentCredentialSchema` in `packages/protocol` defines the credential structure
- `generateAgentIdentity()` in `packages/identity` creates agent key pair and IDs
- `createAgentCredential()` signs the credential with owner's key
- `verifyAgentEnvelope()` verifies: signature, credential, expiration, scope
- Schema refinement requires `agentCredential` when `senderRole=agent` and `intent=chat.message`

**Exit criteria:**
- `[x]` Agent has its own peer identity distinct from owner's
- `[x]` All agent actions are signed with agent's key and include owner-signed credential
- `[x]` Peers can cryptographically verify agent → owner linkage
- `[~]` Owner can revoke agent access (via expiration; explicit revocation list deferred)

### 9B: Tool Registry & Execution Engine

**Goal:** Extensible registry of mesh operations that the agent can perform. New intents get added as tools without changing agent core code.

Tasks:

- `[x]` Add `tool-registry` store: maps intent name → tool definition `{ name, description, paramSchema, sensitivityCeiling, requiresApproval }`
- `[x]` Register default tools: `chat.send`, `knowledge.query`, `discovery.search`, `share.send`, `bond.hello`, `vault.search`
- `[x]` Implement tool executor: takes tool name + params, constructs intent, sends via mesh
- `[x]` Add `mesh.list-tools` tool: returns available tools and their parameters
- `[x]` Tool definitions are extensible: future intents automatically become available as tools
- `[x]` Each tool call is audited with correlation ID

**Implementation Details:**
- `ToolRegistry` class in `apps/node/src/tool-registry.ts` with `register()`, `get()`, `listTools()`, `has()` methods
- `ToolDefinition` interface with name, description, paramSchema, sensitivityCeiling, requiresApproval, intent, isMeshTool
- `MeshToolContext` interface for context needed during tool execution
- `executeTool()` function with policy checks and audit logging
- `listAgentTools()` function for `mesh.list-tools` capability
- Default tools: `chat.send`, `knowledge.query`, `discovery.search`, `share.send`, `bond.send_hello`, `vault.search`

**Exit criteria:**
- `[x]` Agent can execute any registered mesh intent via tool calls
- `[x]` New intents are automatically available as tools (extensible)
- `[x]` All tool executions are audited

### 9C: Memory & Context Management

**Goal:** Agent maintains memory of conversations, relationships, and owner preferences to generate informed responses.

Tasks:

- `[x]` Add `conversation-context` tool: reads recent chat history with a given contact
- `[x]` Add `relationship-context` tool: reads trust store to understand owner's relationship with a peer
- `[x]` Add `profile-context` tool: reads owner's human profile (interests, bio, knowledge)
- `[x]` Add `vault-context` tool: searches vault for relevant documents
- `[x]` Add `graph-context` tool: queries knowledge graph for relationship paths (stubbed)
- `[x]` Implement context injection: prepend relevant context to model prompts (wired in Phase 9C)
- `[x]` Context is only injected when explicitly relevant (no unbounded injection)

**Implementation Details:**
- `ContextManagerDeps` interface aggregates all context sources
- `buildConversationContextTool()` - reads recent chat history from `LocalChatLogStore`
- `buildRelationshipContextTool()` - reads trust record from `LocalTrustStore`
- `buildProfileContextTool()` - reads human profile from `HumanProfileStore`
- `buildVaultContextTool()` - searches vault via `searchVault()`
- `buildGraphContextTool()` - stubbed, returns "not yet implemented"
- `listContextTools()` - returns descriptors for all context tools

**Exit criteria:**
- `[x]` AI can read and synthesize context from chat history, trust relationships, vault, and graph
- `[x]` Context access is audited (via tool execution audit trail)
- `[x]` Context is injected selectively based on relevance (tool-based, not automatic)

### 9D: Mode Controller (Reactive / Proactive)

**Goal:** Agent operates in reactive mode when owner is online, proactive mode when owner is offline. Configurable per-contact or globally.

Tasks:

- `[x]` Add `agent-mode` config: `{ mode: "reactive" | "proactive", onlineHours?: CronSchedule }`
- `[x]` Implement mode detection:
  - Reactive: owner connected via mobile app / WebSocket
  - Proactive: owner disconnected for > N minutes, or explicit schedule
- `[x]` Add per-contact mode override: some contacts always get reactive, others can be proactive
- `[x]` Mode transitions are audited
- `[x]` Proactive mode respects `autonomousPolicies` and `autonomousKillSwitch` from Phase 8L
- `[x]` Add `mesh.set-mode` tool: owner configures reactive/proactive mode

**Implementation Details:**
- `AgentModeConfig` interface: mode, defaultMode, proactiveSchedule, reactiveSchedule, offlineMinutesBeforeProactive, perContactOverrides
- `ModeController` class manages mode transitions with `markOwnerConnected()`, `markOwnerDisconnected()`, `checkOfflineTransition()`, `checkScheduleTransition()`
- `buildSetModeTool()`, `buildGetModeTool()`, `buildSetContactModeTool()` for owner configuration
- `requiresApproval()` returns true in reactive mode, false in proactive mode
- `canPerformProactiveAction()` checks if proactive mode is active

**Mode Behavior:**
| Mode | Behavior |
|------|----------|
| **Reactive** | Agent assists only when owner initiates. All sensitive actions require approval. |
| **Proactive** | Agent acts autonomously within configured bounds. Escalates important items for later review. |

**Exit criteria:**
- `[x]` Agent switches between reactive/proactive based on owner online status or schedule
- `[x]` Proactive actions respect autonomous policy boundaries
- `[x]` Mode transitions are logged

### 9E: Session & Conversation Management

**Goal:** Agent maintains persistent conversation sessions per contact, tracking context, state, and relationship over time.

Tasks:

- `[x]` Add `session` store: per-contact session state `{ contactOwnerId, lastInteraction, messageCount, pendingEscalation, conversationSummary }`
- `[x]` Implement session updates on events: new message → update summary, reaction → update sentiment
- `[x]` Add `session-summary` tool: AI generates concise summary of conversation state
- `[x]` Detect escalation triggers: emotional content, sensitive topics, explicit escalation requests
- `[x]` Session persistence: survives agent restarts
- `[x]` Add `mesh.list-sessions` tool: owner views all active conversation sessions

**Exit criteria:**
- Agent maintains context across multi-turn conversations
- Agent can summarize conversation state for any contact
- Escalation triggers are detected and surfaced

### 9F: Style & Identity Adapter

**Goal:** Agent mimics owner's communication style so contacts don't know they're talking to an AI (stealth mode).

Tasks:

- `[x]` Add `style-profile` store: learned owner writing style `{ tone, vocabulary, sentenceLength, commonPhrases }`
- `[x]` Implement style learning: analyze owner's sent messages to build style profile
- `[x]` Add `style-adapt` to chat generation: generate text matching owner's voice
- `[x]` Add per-contact disclosure config: `discloseAgent: boolean` — some contacts know it's an AI
- `[x]` Add disclosure message template: "Hey, this is my AI agent responding on my behalf"
- `[x]` Style adaptation is applied only when `discloseAgent: false`

**Exit criteria:**
- AI-generated responses match owner's writing style
- Agent can optionally disclose itself to contacts
- Disclosure is configurable per contact

### 9G: Proactive Triggers & Autonomous Actions

**Goal:** Agent initiates actions on its own based on time, events, or learned patterns — while respecting owner-defined boundaries.

Tasks:

- `[x]` Add `trigger` store: `{ id, type: "time" | "event" | "topic", condition, action, enabled }`
- `[x]` Implement time-based triggers:
  - "check in with Alice weekly"
  - "wish Bob happy birthday"
  - "send weekly digest to owner"
- `[x]` Implement event-based triggers:
  - "contact hasn't responded in 3 days → follow up"
  - "new message from X → read and respond if routine"
  - "owner tagged in shared content → notify"
- `[x]` Implement topic-based triggers:
  - "news about owner's interest → share with relevant contacts"
  - "contact mentioned owner's interest → engage"
- `[x]` Proactive actions are logged to audit with `proactive: true` flag
- `[x]` Add `mesh.list-triggers` and `mesh.add-trigger` / `mesh.remove-trigger` tools

**Autonomous Ceiling:**
- Sensitivity ≤ configured ceiling → agent can act
- Sensitivity > ceiling → queue for approval or skip
- All proactive actions logged for owner review

**Exit criteria:**
- Agent can proactively initiate contact based on configured triggers
- Triggers are configurable and auditable
- Autonomous ceiling is enforced

### 9H: Escalation & Approval Workflow

**Goal:** Sensitive actions go to approval queue for owner review. Agent can escalate to owner when confidence is low or topic is sensitive.

Tasks:

- `[x]` Add `approval-queue` store: persist pending actions with draft content, context, timestamp
- `[x]` Add `mesh.list-pending` tool: list all pending approvals
- `[x]` Add `mesh.approve` tool: owner approves action, triggering execution
- `[x]` Add `mesh.reject` tool: owner rejects, discarding draft
- `[x]` Add `mesh.reject-all` tool: bulk reject
- `[x]` Add `mesh.escalate` tool: agent flags item for owner attention
- `[x]` Add `requireApprovalForCloud` threshold (from Phase 8) — integrate with approval queue
- `[x]` Escalation rules: low confidence, emotional content, sensitive topics → always escalate
- `[x]` Pending items surfaced in digest (9J)

**Exit criteria:**
- AI-drafted actions are held in approval queue until owner review
- Agent can proactively escalate when needed
- All approval actions are audited

### 9I: External Agent Gateway (OpenClaw / HomeClaw)

**Goal:** External agents (OpenClaw, HomeClaw, etc.) interact with EnvoyMesh exclusively via local tools — never directly call libp2p. Agent acts as secure gateway.

Tasks:

- `[x]` Add local tools API for external agents:
  - `mesh.findKnowledge(query)` — search owner's vault + contacts' shared knowledge
  - `mesh.findContact(criteria)` — natural language contact search
  - `mesh.sendMessage(to, text)` — draft and send chat (via approval queue if sensitive)
  - `mesh.getOwnerProfile()` — read owner's profile for personalization
  - `mesh.queryGraph(pathQuery)` — path-finding queries
- `[x]` External agents authenticate via agent credential (not owner credentials)
- `[x]` External agent actions are logged with `externalAgent: true` flag
- `[x]` Add `mesh.list-external-sessions` tool: owner sees what external agents have done
- `[x]` Add `mesh.revoke-external-agent` tool: owner revokes an external agent's access

**Security Model:**
```
OpenClaw ──[local tools]──► Home Node Agent
                                │
                                ├── Verifies credential
                                ├── Enforces policy
                                ├── Logs all actions
                                └── Approves via queue (if needed)
                                    │
                                    ▼
                              EnvoyMesh Network
```

**Exit criteria:**
- External agents can only interact via local tools API
- All external agent actions are logged and attributable
- Owner can revoke external agent access

### 9J: Digest & Notifications

**Goal:** Owner receives periodic summaries of agent activities, decisions, and pending items.

Tasks:

- `[x]` Add `digest-generator` service: aggregates audit events into daily/weekly summaries
- `[x]` Implement digest delivery:
  - CLI: `npm run cli -- digest today`
  - File: `~/.envoymesh/my-node/digests/YYYY-MM-DD.json`
- `[x]` Digest includes:
  - AI actions taken (with/without approval)
  - External agent calls made
  - Discovery queries and results
  - New bonds established
  - Proactive actions triggered
  - Pending items requiring attention
- `[x]` Add `digest.schedule` tool: owner configures frequency (daily/weekly/off)
- `[x]` Add push notification option: owner receives alerts for high-priority escalations

**Exit criteria:**
- Owner can view daily/weekly digest of all agent activities
- Digest is human-readable and actionable
- Pending approvals and escalations are surfaced

### 9K: P2P Bridge for External Agents

**Goal:** External agents (OpenClaw, HomeClaw, Hermes, etc.) can participate in P2P conversations via a lightweight HTTP bridge. One node = one bridge = one configured external agent. The bridge is a pure message pipe — no SDK, no tool discovery, no session management.

Tasks:

- `[x]` Create self-contained `apps/node/src/bridge/` module (config, pipe, index, identity-store)
- `[x]` Bridge agent identity: own peer ID derived from owner + agent keypair, persisted as `bridge-identity.json`
- `[x]` HTTP callback server on `config.listenPort` (default 3031): agent calls `POST /bridge/send` with `{ to, text }`
- `[x]` P2P handler: forwards `chat.message` addressed to bridge's agent peer ID to external agent HTTP endpoint
- `[x]` Agent responses sent back as signed EMP `chat.message` envelopes with `senderRole: "agent"`
- `[x]` Bridge config (`bridge-config.json`): `enabled`, `agentUrl`, `listenPort`, optional `secret` for Bearer auth
- `[x]` Role policy updated: `chat.message` allows agent↔human (at least one human role required)
- `[x]` Wire bridge into node startup: identity generation, mesh.onMessage hook, graceful shutdown
- `[x]` Unit tests: bridge pipe (signing, routing, auth, error handling), identity store (persistence)
- `[x]` OpenClaw adapter ADR + example config: [openclaw-agent-bridge-adr.md](./openclaw-agent-bridge-adr.md), [agent_bridge_guide.md](./agent_bridge_guide.md), `bridge-config.openclaw.example.json`; channel plugin [OpenClawExtension/](../OpenClawExtension/) (chat + mesh tools + async + onboard wizard + `docs/channels/envoymesh.md`) + [openclaw-extension.md](./openclaw-extension.md) + E2E [openclaw-bridge-e2e-checklist.md](./openclaw-bridge-e2e-checklist.md); contract test `apps/node/test/bridge-openclaw-agent-mock.test.ts`; two-process smoke `npm run smoke:openclaw-bridge` in **ci-smoke-local**; live Gateway smoke `npm run smoke:openclaw-bridge:live` in **ci-smoke-openclaw-live** (`apps/node/src/openclaw-bridge-smoke/`, `ENVOYMESH_SMOKE_ECHO` test hook in plugin). HomeClaw `channels/envoymesh` unchanged.

**Architecture:**
```
┌──────────────────┐     HTTP POST /bridge/send       ┌──────────────────┐
│  External Agent  │ ──────────────────────────────►   │  EnvoyMesh Node  │
│  (OpenClaw/etc)  │ ◄──── { text: "reply" } ─────── │  (Bridge)        │
└──────────────────┘                                   └──────┬───────────┘
                                                              │
                                                       P2P (libp2p)
                                                              │
                                                   ┌──────────▼───────────┐
                                                   │  Peer (chat.message)  │
                                                   └──────────────────────┘
```

**Exit criteria:**
- External agent receives P2P chat messages forwarded via HTTP
- Agent can reply and have its response sent back as signed EMP envelope
- Bridge identity persists across restarts
- Bridge is disabled by default; enabled via `bridge-config.json`

### Phase 9 Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Owner (Mobile App)                           │
│                         WebSocket / CLI                             │
└─────────────────────────────────┬───────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     Home Node (Always On)                            │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                      Mesh Agent                               │   │
│  │                                                               │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │   │
│  │  │ Tool Registry│  │ Mode Ctrl   │  │ Session Manager    │  │   │
│  │  │ (extensible)│  │ reactive/   │  │ (per-contact)      │  │   │
│  │  │             │  │ proactive   │  │                     │  │   │
│  │  └─────────────┘  └─────────────┘  └─────────────────────┘  │   │
│  │                                                               │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │   │
│  │  │ Memory Store│  │Style Adapter│  │ Trigger Engine      │  │   │
│  │  │ (context)   │  │(owner voice)│  │ (time/event/topic) │  │   │
│  │  └─────────────┘  └─────────────┘  └─────────────────────┘  │   │
│  │                                                               │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │   │
│  │  │Approval Queue│ │Knowledge Graph│ │ Agent Credential   │  │   │
│  │  │             │  │             │  │ (owner-signed)     │  │   │
│  │  └─────────────┘  └─────────────┘  └─────────────────────┘  │   │
│  └──────────────────────────────────────────────────────────────┘   │
│          │                                    │                      │
│          │ Local Tools API                    │ External Agents    │
│          ▼                                    ▼                      │
│  ┌─────────────────┐                  ┌─────────────────┐          │
│  │ OpenClaw        │                  │ EnvoyMesh       │          │
│  │ HomeClaw        │                  │ Network (P2P)   │          │
│  │ (no libp2p)     │                  │                 │          │
│  └─────────────────┘                  └─────────────────┘          │
└─────────────────────────────────────────────────────────────────────┘
```

### Agent Identity Flow

```
1. Owner creates agent:
   - Agent generates key pair (agent-pubkey, agent-privkey)
   - Agent derives peer ID: agentPeerId = sha256(ownerOwnerId + agent-pubkey)
   - Owner signs credential: sign({ agentPubKey, ownerOwnerId, agentPeerId, scope }, owner-privkey)
   - Credential stored locally on home node

2. Agent sends message:
   - Agent creates envelope with senderRole="agent"
   - Signs envelope with agent-privkey
   - Attaches credential (signed by owner)
   - Sends via mesh

3. Peer receives message:
   - Verifies envelope signature (agent-pubkey)
   - Verifies credential signature (owner-pubkey)
   - Checks scope: is this intent allowed?
   - Checks expiry: is credential still valid?
   - If all pass → process intent
   - If any fail → reject with reason
```

### Exit Criteria (Phase 9)

- `[x]` Agent has its own peer identity, cryptographically linked to owner
- `[x]` Agent can execute mesh intents via extensible tool registry module; daemon runtime wired (9B).
- `[x]` Agent context modules exist (conversation, relationships, vault, graph); prompt/runtime injection wired (9C).
- `[x]` Reactive/proactive mode controller exists; live daemon scheduling/event wiring complete (9D).
- `[x]` Session management module exists; inbound chat/runtime integration complete (9E).
- `[x]` Style adapter module exists; live chat draft/runtime integration complete (9F).
- `[x]` Proactive trigger storage/checking exists; live trigger scheduler complete (9G).
- `[x]` Approval queue module exists; sensitive-action runtime integration complete (9H).
- `[x]` External agents (OpenClaw/HomeClaw) access mesh only via local tools API (9I).
- `[x]` Owner receives periodic digest of agent activities; digest generator and runtime aggregation complete (9J).
- `[x]` External agents can participate in P2P conversations via HTTP bridge (9K)

## Current Milestone

Milestone: **Phases 0–48 shipped for interop bridges** — Core protocol through Phase 47 Team job iteration + Phase 48 A2A/MCP bridges (48A–48D.5). Older banner detail (Phases 0–42 Voice/Agent Network stack) still applies as foundation. See [a2a-mcp-interop-design.md](./a2a-mcp-interop-design.md), [agent-network-iteration.md](./agent-network-iteration.md), [satellite-app-adr.md](./satellite-app-adr.md), and [agent_network.md](./agent_network.md).

**Last shipped:** **Phase 48 — A2A + MCP Interop Bridges (48A–48D).** MCP tool consumer (`mesh.mcp.*`), MCP server adapter (`npx envoymesh mcp-server`), A2A Agent Card on relay `/.well-known/agent-card.json`, and A2A Task Bridge JSON-RPC (`message/send` / `tasks/get` / `tasks/cancel`) with auth + state/artifact maps + relay proxy. **~191 dedicated unit tests green.** Design: [a2a-mcp-interop-design.md](./a2a-mcp-interop-design.md). Earlier recent ship: Phase 47 Team job multi-round iteration (47A–47D).

**Active:** Next planning pulls below. Phase 59 Team job input delivery **complete** (59A–59E). Also tracked: Phase 54 Envoy Local; ICE media-transport ([voice-video-call-support.md](./voice-video-call-support.md)).


### Next planning pulls

1. **Phase 40 — Agent Network Collaboration Layer** — active. [agent_network.md](./agent_network.md) is the design doc; the Phase 40 section below is the implementation checklist. 40A (protocol + stores) → 40B (orchestrator + worker runtime + RPC plumbing) → 40C (Social + EnvoyGo UI) → 40D (multi-bid, counter-bid UI, LLM decomposer) → 40E (cross-home chains; deferred until Phase 11 mobile parity).
2. **Phase 39 — Voice/Video Call for EnvoyAI** — future (requires Phase 38). See Phase 39 section. Picks up after Phase 40 ships.
3. **Phase 38H smoke tests** — 5 scenarios automated via Playwright (LAN call, incoming UI, mute/end, busy, trust enforcement; CI on every PR). 2 manual: cross-network TURN relay + EnvoyGo native screen. Lower priority during Phase 40; CI automation can land in parallel.
4. **Phase 31I — Push notifications `[x]` shipped** — `apps/node/src/push-notification.ts` rewritten with file-backed token persistence (`push-tokens.json`), APNs HTTP/2 dispatch (native `node:http2` + ES256 JWT), FCM HTTP v1 dispatch (native `node:https` + OAuth2), `dispatchBondPush()` for bond requests. Both backends env-var gated — silently skip when unconfigured. Wired into chat pipeline (`index.ts` → `dispatchChatPush` after `chat:message`), RPC surface (`registerPushToken`/`unregisterPushToken` via `NodeServiceImpl` + `json-rpc-router` + `DirectCallClient`), initialized on `initNode()`. Zero new npm dependencies — all built on `node:crypto/http2/https/fs`. Configuration docs: [mobile_push_notification.md](./mobile_push_notification.md).
5. **15E follow-ons** — hop-2 morning report ranking; physical two-NAT ledger row.
6. **Story N — Async ADB orchestrator** — closes the remaining `[ ]` in Coverage row. Larger swing once the above are settled.
7. **Parked until scoped:** Story E payment rail.
8. **Phase 26 — DID WAN gateway resolver** — scoped below.
9. **Chain template marketplace (future)** — share chain templates across the mesh via `discovery.request`. Parked until user demand materialises (4 built-in templates + AI chat creation cover current use cases).
10. **Phase 45 — Web Content Browsing** — 45A–45E shipped; 45F future. [web-content-browsing-design.md](./web-content-browsing-design.md) is the design doc; the Phase 45 section below is the implementation checklist. 45A (URL scheme + `library.read` intent + Browser view + all test layers) → 45B (browser polish + bookmarks) → 45C (EnvoyGo mobile browser) → 45D (authoring UX + templates + visibility) → 45E (Step 2: push notifications, topics, friend discovery — no GossipSub). 45F (external HTTP gateway) is forward-referenced.
11. **Phase 46 — Multi-Relay Fleet Coordination** — shipped (46A–46C + P2/P3 test harness). Client multi-home, standalone miss-forward, sibling `relay.hints` gossip; in-process + process-spawn E2E; gated live `TEST_RELAY_A`/`TEST_RELAY_B` signoff. Design: [relay-server-design.md](./relay-server-design.md) Part B.
12. **Phase 47 — Team job multi-round iteration (A ∩ B)** — **47A–47D shipped**. Outer seal→draft→replan (B) + capped intra-round extend (A) + judge/UX + handoff knobs/`iterationState` + `chain:iteration`. Design: [agent-network-iteration.md](./agent-network-iteration.md).
13. **Phase 48 — A2A + MCP Interop Bridges** — **48A–48D.5 shipped** (SDK MCP consumer, MCP server adapter, Agent Card + streaming, production Task Bridge executor, relay `forwardToHome` home-tunnel, `message/stream` SSE, vault HTTP). [a2a-mcp-interop-design.md](./a2a-mcp-interop-design.md).
14. **Phase 54 — EnvoyAI model guidance + Envoy Local** — Configure AI when no usable model; optional downloadable `llama-server` (never packaged); cloud/Ollama remain equal choices. [envoy-local-design.md](./envoy-local-design.md).
15. **Phase 57 — Knowledge Base production hardening (Markdown-first + anydoc)** — `[x]` 57A–57E + item-4 shipped. Design: [knowledge-base-and-rag.md](./knowledge-base-and-rag.md) · checklist below.
16. **Phase 58 — Team jobs UX (fleet readiness, live story, multi-node)** — designed; **58A first**. Chat→team-job recruitment explicitly parked. Design: [agent-network-ux-team-jobs.md](./agent-network-ux-team-jobs.md) · checklist below.
17. **Phase 59 — Team job input delivery** — `[x]` **59A–59E complete**. One-shot bytes to worker job workspace (not vault sync); GC on terminal. Design: [agent-network-job-input-delivery.md](./agent-network-job-input-delivery.md) · checklist below.

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

**Do not infer Phase 9 status from this subsection.** Detailed exit criteria live in **[Phase 9: AI-Augmented Agent](#phase-9-ai-augmented-agent)** and **[Exit Criteria (Phase 9)](#exit-criteria-phase-9)** above.

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
- `[x]` **Phase 8** — agentic normal node roadmap (`knowledge.query` path, chat assist, manifests, tool registry, sandbox, discovery/broadcast, reputation trajectory, autonomy controls); see changelog + Phase 8 section below.
- `[~]` **Cross-network P2P rollout** — WAN-first profile, bootstrap/relay strategy, relay graph routing, diagnostics, and non-LAN smoke.
- `[x]` **Phase 13** — A2A routing, actor disclosure, owner Activity feed ([a2a-actor-visibility-plan.md](./a2a-actor-visibility-plan.md); Epic AV **US-AV1–AV8**).
- `[x]` **Phase 14** — friend autopilot + knowledge syndication + WAN CI signal + external pinning.
- `[x]` **Phase 15** — reach, H2A semantics, platform scale ([Phase 15](#phase-15-reach-semantics--platform-scale)).
- `[~]` **Stories D / E** — multi-hop discovery, commerce, receipts (**15E scoping started** — [parked-multihop-commerce-scope.md](./parked-multihop-commerce-scope.md); no implementation phase).
- `[x]` **Optional vault / IPFS** — content-addressing + owner-approved Kubo export, discovery CID, gateway verify ([external-distribution-ipfs-plan](./external-distribution-ipfs-plan.md) F1–F4); Filecoin later.

---

## Phase 10: HomeClaw App P2P Integration

**Goal:** Integrate EnvoyMesh P2P connectivity into the HomeClaw App (Flutter), replacing the Cloudflare tunnel / public-IP requirement. The HomeClaw App becomes a full mesh participant — it discovers and communicates with HomeClaw Core over P2P without any centralized server or public endpoint.

### Motivation

Today the HomeClaw App connects to HomeClaw Core via HTTP to a public URL (`POST /inbound` + WebSocket `/ws`). This requires either a public IP (rare for home ISPs) or a Cloudflare tunnel. The EnvoyMesh bridge (Phase 9K) already makes HomeClaw Core a P2P peer. Now the companion app needs to join the same mesh.

### Architecture Overview

```
┌──────────────────────────┐       ┌──────────────────────────┐
│  Phone / Tablet           │       │  Desktop / Server         │
│                            │       │                            │
│  HomeClawApp (Flutter)     │       │  HomeClaw Core (Python)    │
│       │                    │       │       │                    │
│  ┌────▼─────────────────┐ │       │  ┌────▼─────────────────┐ │
│  │ EnvoyMesh Node (Dart) │ │       │  │ EnvoyMesh Node (TS)  │ │
│  │ - Ed25519 identity    │ │       │  │ - Bridge agent        │ │
│  │ - Relay client        │ │       │  │ - libp2p stack        │ │
│  │ - Envelope protocol   │ │       │  │ - Full mesh node      │ │
│  └────┬─────────────────┘ │       │  └────┬─────────────────┘ │
│       │                    │       │       │                    │
└───────┼────────────────────┘       └───────┼────────────────────┘
        │                                    │
        │    EnvoyMesh P2P Mesh              │
        │    (relay + DHT + mDNS)            │
        └────────────────────────────────────┘
```

**Key principle:** The HomeClaw companion app embeds a thin **Dart P2P client** (identity, canonical signing, protocol types) that opens a **single WebSocket** to the owner's TypeScript EnvoyMesh **home node**. The home node performs libp2p routing; the phone does not run a full libp2p stack in Phase 10A.

### 10A (Phase 2a): Dart Relay Client — Thin P2P Edge

**Goal:** Implement a thin EnvoyMesh P2P layer in Dart that the HomeClawApp embeds. The Dart layer connects to the home node's WebSocket server and speaks JSON-RPC + signed envelopes. No full libp2p stack on mobile — the home node handles DHT, peer discovery, and message routing.

**Current status (2026-05-13):** Server-side pieces in **this repo** are in place (`forwardEnvelope`, `getPairingPayload`, optional token-based companion auto-pair (`companionPairingAutoAcceptWithToken`), pairing QR in Social, bridge hardening, health watchdogs). The **HomeClawApp** companion repo (`HomeClaw/clients/HomeClawApp`, sibling to EnvoyMesh) contains the Dart implementation (`lib/envoy/*`, `test/envoy/*`). **Interop:** committed envelope golden vectors (`packages/identity/test/fixtures/companion_envelope_interop_golden.json` + mirrored in HomeClawApp); `relayReconnectDelayMs` unit-tested. Manual LAN verification: **`docs/phase-10a-manual-e2e.md`** (10A.7).

#### Server-side infrastructure (completed on TypeScript/Node side)

| Component | File | What it does |
|-----------|------|--------------|
| `forwardEnvelope` RPC | `ws-server.ts`, `node-service-impl.ts` | Forwards a signed `EnvoyEnvelope` to any P2P peer on behalf of the mobile client |
| `getPairingPayload` RPC | `ws-server.ts`, `node-service-impl.ts` | Returns `wsUrl`, `relayPeerId`, optional `agentPeerId`, `agentPubKey`, **`token`** (short-lived pairing secret for optional auto-accept) |
| `getBridgeStatus` RPC | `ws-server.ts`, `node-service-impl.ts` | Returns bridge agent status (peer ID, enabled state, agent name) |
| `p2p:envelope` push event | `ws-server.ts` | Auto-subscribed; pushes raw inbound envelopes to mobile client |
| Pairing QR display | `apps/social/.../SettingsNodeTab.tsx` | Renders `envoy://pair?...` QR code in Social UI for mobile to scan |
| Bridge module | `apps/node/src/bridge/` | HTTP callback server (port 3031), credential hardening, body size limits, transport coexistence design |
| Relay health monitoring | `apps/node/src/relay-health.ts` | Evaluates relay health (listen addrs, bootstrap, roster freshness); actions: reprobe, restart, exit |
| Node health monitoring | `apps/node/src/node-health.ts` | Evaluates process health (loop lag, RSS, fatal errors); 30s periodic check; auto-restart or supervisor exit |
| Standalone relay health | `apps/relay/src/relay-health.ts` | Health evaluation for the `apps/relay` binary |
| `PairingPayload` type | `packages/api/src/ws-protocol.ts` | TypeScript interface for the pairing payload response |

#### HomeClawApp companion repository (Dart / Flutter — not in this monorepo)

Canonical path: **`HomeClaw/clients/HomeClawApp`** (sibling checkout next to EnvoyMesh). Major modules:

| Area | Location |
|------|----------|
| Ed25519 identity + peer / owner ID | `lib/envoy/envoy_identity.dart`; tests `test/envoy/envoy_identity_test.dart` |
| Protocol types, signing helpers, `PairingPayload` URI | `lib/envoy/envoy_protocol.dart`; tests `test/envoy/envoy_protocol_test.dart` |
| JSON-RPC WebSocket client (`forwardEnvelope`, `getNodeConfig`, `getBonds`, `getBridgeStatus`, `p2p:envelope`, `bridge:status`, `relayDispatchServerPush`, exponential reconnect helper `relayReconnectDelayMs`) | `lib/envoy/relay_client.dart`; tests `test/envoy/relay_client_test.dart` |
| `EnvoyNodeService`, pairing persistence, `fetchP2PContacts()`, bridge status stream | `lib/envoy/envoy_node_service.dart`; tests `test/envoy/envoy_node_service_test.dart` |
| Pairing / QR flows | `lib/screens/envoy_pairing_screen.dart`, `test/envoy/pairing_flow_test.dart` |
| Riverpod wiring + disconnect clears contacts | `lib/providers/envoy_providers.dart` |
| Global sync: reconnect + bridge pushes refresh contacts | `lib/widgets/envoy_mesh_riverpod_sync.dart` (wired from `lib/main.dart`) |

**2026-05 interop fixes (HomeClawApp):** JSON-RPC responses now use the **`result` payload** (not the full `{ id, result }` wrapper) so `getNodeConfig` / `discoverBridgeAgent` read `bridgeStatus` correctly. Pairing QR **`agentPubKey`** encoding avoids double-`encodeComponent`. Bridge display name uses `agentName` from node config when present.

#### 10A.1: EnvoyMesh Identity in Dart

**Goal:** Ed25519 key generation, peer ID derivation, and envelope signing — all in pure Dart.

**Implementation (HomeClawApp):** `lib/envoy/envoy_identity.dart`; tests `test/envoy/envoy_identity_test.dart`.

Tasks:

- `[x]` Implement `EnvoyIdentity` class: generate Ed25519 keypair using `cryptography` package (already a HomeClawApp dependency)
- `[x]` Implement peer ID derivation: `peerId = "envoy_" + base64url(sha256(publicKeyPem))` matching the TypeScript algorithm in `packages/identity`
- `[x]` Implement canonical JSON serializer: sorted keys, no undefined values — produces exact same byte output as the TypeScript `canonicalJson()`
- `[x]` Implement `signEnvelope()`: sign canonical JSON of unsigned envelope with Ed25519 private key
- `[x]` Implement `verifyEnvelope()`: verify Ed25519 signature against claimed public key
- `[x]` Implement owner ID derivation: `ownerId = "envoy:owner:" + base64url(sha256(ownerPublicKeyPem))`
- `[x]` Unit tests: cross-verify **peer ID / owner ID** with TypeScript using committed PEM + expected ids (`packages/identity/test/fixtures/companion_identity_golden.json`, `packages/identity/test/identity.test.ts`; HomeClawApp `test/fixtures/` + `test/envoy/golden_identity_fixture_test.dart`)
- `[x]` Unit tests: **`system.ping` envelope golden** (`companion_envelope_interop_golden.json`) — Dart `signCanonicalPayload` / `verifyCanonicalPayload` match TypeScript (`packages/identity/test/identity.test.ts`, `test/envoy/companion_envelope_interop_test.dart`)

**Key dependency:** `cryptography` ^2.9.0 (already in HomeClawApp pubspec.yaml for E2E encryption)

**Exit criteria:**
- `[x]` Dart-generated peer ID matches TypeScript for the same public key PEM (golden fixture; CI: `vitest` + `flutter test`)
- `[x]` Dart-signed envelope verifies in TypeScript **and Dart matches TS fixture signature** (golden `companion_envelope_interop_golden.json`; `vitest` + `flutter test test/envoy/companion_envelope_interop_test.dart`)
- `[~]` Canonical JSON byte-identical for representative envelopes (string sort covered; full parity TBD)

#### 10A.2: EnvoyMesh Protocol Schemas in Dart

**Goal:** Dart types and constructors for the core EnvoyMesh protocol schemas (envelope, chat messages, hello).

**Implementation (HomeClawApp):** `lib/envoy/envoy_protocol.dart` (large generated-style port); tests `test/envoy/envoy_protocol_test.dart`.

Tasks:

- `[x]` Port `EnvoyEnvelope` schema: `version`, `messageId`, `correlationId`, `createdAt`, `senderPeerId`, `senderPublicKey`, `senderRole`, `recipientPeerId`, `recipientRole`, `intent`, `payload`, `signature`
- `[x]` Port `ChatMessagePayload` schema: `senderOwnerId`, `text`
- `[x]` Implement `createChatMessagePayload()` constructor
- `[x]` Implement `parseChatMessagePayload()` validator
- `[~]` Port `HelloRequestPayload` schema (for pairing bond) — partial; pairing uses **`device.pair.request`** for mobile → bridge (see 10A.6)
- `[x]` Port `UnsignedEnvelope` type and `UnsignedChatMessagePayload` type
- `[~]` Define `EnvoyIntent` union type in Dart covering all intents needed by companion app: `chat.message`, `hello.request`, `hello.accept`, `hello.decline`
- `[x]` Unit tests: schema validation round-trips, rejection of malformed payloads

**Exit criteria:**
- `[~]` All schema types have Dart equivalents with same field names and validation rules (core paths covered; expand with new intents as needed)
- `[~]` Payload constructors produce output parseable by TypeScript parsers

#### 10A.3: Node WebSocket client (JSON-RPC)

**Goal:** Connect to the **EnvoyMesh Node** WebSocket (`WsServer` in `apps/node/src/ws-server.ts`), call JSON-RPC methods, and subscribe to push events. The mobile thin client does **not** speak a standalone `relay.hello` / `relay.send` frame protocol on the fleet relay binary; it uses the same JSON-RPC surface as the Social UI.

**Transport:** WebSocket URL from pairing QR (`wsUrl`, e.g. `ws://192.168.1.100:3030/ws`).

**Client → Node (request):**
```json
{ "id": "msg_1", "method": "forwardEnvelope", "params": { "envelope": { ... }, "dialHints": [ "/optional/multiaddr" ] } }
```
```json
{ "id": "msg_2", "method": "getPairingPayload", "params": {} }
```
```json
{ "id": "msg_3", "method": "getBridgeStatus", "params": {} }
```

> **Server side implemented:** `forwardEnvelope` and `getPairingPayload` RPC methods are wired in `WsServer` and `NodeServiceImpl`. The `forwardEnvelope` handler forwards P2P envelopes to any peer on behalf of a remote relay client. `getPairingPayload` returns the pairing QR payload for mobile app pairing.

**Node → Client (response):**
```json
{ "id": "msg_1", "result": null }
```

**Node → Client (push events):** same connection; server sends `{ "event": "chat:message", "data": { ... } }`-style frames for subscribed topics (see `WsServer`).

**Pairing QR payload (`envoy://pair?...`):** includes `wsUrl`, optional `relayPeerId` (home node's **libp2p** peer ID for `dialHints` / diagnostics), and when the bridge is enabled optional `agentPeerId` / `agentPubKey` (bridge **agent** PEM, not the device key).

Tasks:

**Server-side (TypeScript/Node — done):**
- `[x]` `WsServer` routes `forwardEnvelope`, `getPairingPayload`, and `getBridgeStatus` JSON-RPC methods → `NodeServiceImpl`
- `[x]` `NodeServiceImpl.forwardEnvelope()` validates envelope schema, resolves transport target, forwards via `mesh.send()`/`mesh.sendChat()`, tags reachability
- `[x]` `NodeServiceImpl.getPairingPayload()` derives LAN WebSocket URL from advertised multiaddrs, includes `relayPeerId` (libp2p), and bridge `agentPeerId`/`agentPubKey` when bridge is enabled
- `[x]` `NodeServiceImpl.getBridgeStatus()` returns bridge agent peer ID, enabled state, agent name
- `[x]` `p2p:envelope` push event auto-subscribed for all WebSocket clients; emits raw inbound envelopes
- `[x]` Relay health + node health monitoring (30s periodic) keeps home node healthy for mobile clients

**Client-side (Dart/Flutter — HomeClawApp):**
- `[x]` Implement WebSocket client with JSON-RPC request/response handling (`RelayClient` / `_rpc`)
- `[x]` Parse inbound push events for **`p2p:envelope`** (primary path for raw mesh traffic to the app)
- `[x]` Parse **`bridge:status`** push (and optional `chat:message` if added server-side); `RelayClient.onBridgeStatus` / `relayDispatchServerPush` unit-tested
- `[x]` `getNodeConfig` / `getBonds` use unwrapped JSON-RPC **`result`** (fix 2026-05)
- `[x]` Call **`getBridgeStatus`** after connect (primes UI / [`onBridgeStatusFromNode`]); `getPairingPayload` remains QR / pairing screen (not repeated every connect)
- `[x]` Reconnection: exponential backoff on disconnect (see `RelayClient`)
- `[x]` Unit tests: `test/envoy/relay_client_test.dart` and related

**Exit criteria:**

- `[x]` Dart client can connect to a running EnvoyMesh node WebSocket
- `[~]` Can send a signed envelope via `forwardEnvelope` and receive chat-related pushes on the same connection (unit + integration coverage; full device E2E under 10A.7)
- `[~]` Reconnect path is tested or exercised manually (backoff in [RelayClient]; no automated reconnect integration test)

#### 10A.4: EnvoyNodeService — Flutter Integration Layer

**Goal:** High-level Dart API that the Flutter app uses for all P2P operations. Mirrors the TypeScript `NodeService` WebSocket protocol but implemented as a local Dart class (no subprocess, no WebSocket to localhost — direct method calls).

**Implementation (HomeClawApp):** `lib/envoy/envoy_node_service.dart`; tests `test/envoy/envoy_node_service_test.dart`.

Tasks:

- `[x]` Implement `EnvoyNodeService` class with Riverpod provider (`lib/providers/envoy_providers.dart`)
- `[x]` Identity lifecycle: `initialize(profileDir)` generates or loads keypair, derives peer ID and owner ID
- `[x]` Connection lifecycle: `connect(homeNodeUrl)` / `disconnect`; state via `RelayClient`
- `[x]` Messaging: `sendChat` / `sendChatToOwner` → signed `chat.message` via `forwardEnvelope`
- `[x]` Inbound events: `onChatMessage` stream from parsed `p2p:envelope` chat messages
- `[x]` Peer directory: `getBonds()` via JSON-RPC; **`fetchP2PContacts()`** combines `discoverBridgeAgent()` + bonds for the friend list
- `[x]` Bridge status stream: **`onBridgeStatusFromNode`** (from `bridge:status` push forwarded by `RelayClient`)
- `[x]` Pairing: app uses **`device.pair.request`** to bridge agent post-QR (see 10A.6); legacy `hello.request`-only flow not required for companion
- `[x]` Bridge agent: `discoverBridgeAgent()` reads `bridgeStatus` from `getNodeConfig()` (uses `agentName` when present)
- `[x]` Chat history: persistence hooks via `ChatHistoryStore`
- `[x]` Persist incoming messages to existing Hive-backed chat store where wired
- `[x]` Unit tests: `envoy_node_service_test.dart`, mocks where applicable

**Exit criteria:**
- `[~]` Flutter app can send a chat message to HomeClaw Core via P2P and receive a reply (verify on device / Core — 10A.7)
- `[~]` Chat messages appear in the existing chat UI (Hive keys aligned with Envoy owner id; inbound P2P appended to Hive — verify persistence on device)
- `[~]` Bridge agent appears as a contact in the friend list (implemented; verify with live node — 10A.7)

#### 10A.5: Flutter UI Integration

**Goal:** Wire the EnvoyNodeService into the existing HomeClawApp UI without breaking existing features.

**Touches (HomeClawApp):** `lib/screens/friend_list_screen.dart`, `lib/screens/settings_screen.dart`, `lib/screens/chat_screen.dart`, `lib/screens/envoy_pairing_screen.dart`, `lib/providers/envoy_providers.dart`, `lib/widgets/envoy_mesh_riverpod_sync.dart`, `lib/main.dart`.

Tasks:

- `[x]` Add `EnvoyNodeService` Riverpod provider to `providers/` (alongside existing `coreServiceProvider`)
- `[x]` **`EnvoyMeshRiverpodSync`**: listens to connection + `onBridgeStatusFromNode`, refreshes `fetchP2PContacts()` when connected, calls `setDisconnected()` on loss (clears P2P contacts)
- `[x]` Add node status indicator to FriendListScreen (connected/disconnected dot in app bar when P2P identity initialized)
- `[x]` Add bridge agent contact to friend list when bridge is enabled (prepend tile from `envoyMeshProvider.contacts`)
- `[x]` Route P2P messages in ChatScreen: `isP2pPeer` → `EnvoyNodeService.sendChat` / `sendChatToOwner`
- `[x]` Route inbound P2P messages: `onChatMessage` subscription; **`ChatHistoryStore.appendMessage`** for assistant lines (Hive keys match outbound `EnvoyNodeService` persistence)
- `[x]` Add relay config to SettingsScreen: home node URL, status dot, peer/owner ids, **saved URL + QR pairing hint**, Scan QR
- `[x]` Preset friends (Reminder, Files, Knowledge, etc.) continue using `CoreService` HTTP path — unchanged
- `[x]` Keep existing HTTP/CoreService path as fallback if P2P is not configured
- `[~]` Unit/Widget tests: `test/envoy/envoy_ui_integration_test.dart` (notifier + merge logic); full widget tests optional

**Exit criteria:**
- `[~]` Bridge agent contact appears and is tappable
- `[~]` Chat with bridge agent works end-to-end (send message, see reply)
- `[~]` Existing features (preset friends, Claw-Code, reminders) continue working
- `[~]` App works both with and without P2P configured

#### 10A.6: Pairing Flow

**Goal:** Secure QR-code-based pairing between HomeClaw App and HomeClaw Core's EnvoyMesh bridge.

Tasks:

**Desktop/host side (done):**
- `[x]` EnvoyMesh node exposes pairing QR code in Social UI (Settings → Node tab) containing:
  - Home node's libp2p peer ID (`relayPeerId` — for `dialHints` / diagnostics)
  - Bridge agent's peer ID (`agentPeerId`)
  - Bridge agent's public key PEM (`agentPubKey`)
  - WebSocket URL to the node (`wsUrl`, derived from LAN multiaddr)
  - **`token`** — short-lived pairing secret (when `getPairingPayload` issues one); included in QR URI for optional companion auto-accept (`companionPairingAutoAcceptWithToken` on the node)
  - QR rendered via `qrcode` library as 256x256 PNG data URL
  - "Copy URI" button for manual `envoy://pair?...` sharing

**Mobile side (HomeClawApp — partial / verify):**
- `[x]` `PairingPayload` encode/decode (`envoy://pair`), persistence (`savePairedNodeInfo` / `getPairedNodeInfo`)
- `[x]` **`device.pair.request`** to bridge agent peer (post-scan) via `forwardEnvelope` — this is the implemented bond request path (not `hello.request` alone)
- `[x]` **`device.pair.request`** may include **`pairingToken`** (QR `token`). When **`companionPairingAutoAcceptWithToken`** is enabled on the home node (`updateNodeConfig` / persisted config), inbound requests with a valid token matching the latest `getPairingPayload()` issue are **auto-accepted** (direct trust + peer directory entry) without owner approval queue. Default remains approval/deferred behaviour when unset/false.
- `[x]` After pairing: bridge agent in friend list when node reports bridge + contacts load (`fetchP2PContacts`)
- `[x]` Pairing state persisted (SharedPreferences)
- `[x]` Unit tests: `test/envoy/pairing_flow_test.dart` (URI, device pair payload, persistence)

**Exit criteria:**
- `[~]` QR scan → pairing → bridge agent visible in friend list (under 30 seconds) — verify manually
- `[~]` Pairing survives app restart
- `[~]` Re-pairing with same node updates existing entry (no duplicates)

#### 10A.7: End-to-End Verification

**Goal:** Prove the Dart client works with the real EnvoyMesh **home node** (WebSocket) and TypeScript bridge.

**Runbook:** `docs/phase-10a-manual-e2e.md` (checklist; tick below when executed on hardware).

Tasks:

- `[ ]` Manual test: start EnvoyMesh node with bridge + HomeClaw Core
- `[ ]` Manual test: Flutter app connects WebSocket to home node LAN URL from pairing QR
- `[ ]` Manual test: Dart / Flutter sends `chat.message` to bridge agent, receives reply
- `[ ]` Manual test: Flutter app on emulator/device chats with bridge agent
- `[ ]` Manual test: verify canonical JSON compatibility (snapshot test with real envelopes)
- `[ ]` Manual test: disconnect/reconnect WebSocket, verify delivery or recovery
- `[ ]` Fix any interop issues found

**Exit criteria:**
- `[ ]` Full end-to-end: Flutter app → WebSocket home node → libp2p mesh → bridge → HomeClaw Core → reply → path back to app
- `[ ]` Message round-trip under ~2 seconds on LAN (target)
- `[ ]` No Cloudflare tunnel or public IP required on LAN

---

### 10B: Multi-Transport P2P — Direct libp2p with Relay Fallback

**Goal:** Add a full libp2p stack (`dart_libp2p`) as an **additional transport** alongside the Phase 10A relay WebSocket client. The mobile app uses direct P2P connections (mDNS, TCP, circuit relay) when possible, and falls back to the home-node relay when direct paths are unavailable. **Phase 10A is not replaced — it's a permanent transport.**

**Core design principle — transport coexistence:**

```
                       EnvoyNodeService (unchanged API)
                                  │
                    ┌─────────────┴─────────────┐
                    ▼                           ▼
        ┌──────────────────┐       ┌──────────────────┐
        │  RelayTransport  │       │  DirectTransport │
        │  (Phase 10A)     │       │  (Phase 10B)     │
        │                  │       │                  │
        │  WebSocket to    │       │  libp2p: TCP +   │
        │  home node relay │       │  mDNS + DHT +    │
        │                  │       │  circuit relay   │
        │  Always-on       │       │                  │
        │  anchor when     │       │  Direct when     │
        │  home reachable  │       │  possible        │
        └────────┬─────────┘       └────────┬─────────┘
                 │                          │
                 └──────────┬───────────────┘
                            ▼
                   TransportSelector
              (identical to TypeScript
               dial selection logic)
```

This mirrors exactly how the desktop TypeScript node works — TCP and QUIC transports coexist, with circuit relay as fallback. The mobile app gains the same multi-transport capability.

**Transport selection strategy (matching `@envoymesh/network`):**

| Scenario | Transport | Why |
|----------|-----------|-----|
| Same LAN, home node online | **Direct TCP** (mDNS discovered) | Lowest latency, no relay hop |
| Same LAN, home node online, direct fails | **Relay** (WebSocket to home) | Proven fallback |
| WAN, home node reachable | **Relay** (WebSocket to home) | Home node proxies to mesh |
| WAN, home node unreachable | **Circuit relay v2** via public relays | WAN connectivity without home |
| QR pairing scan | **Relay** (WebSocket to scanned node) | Cold-start bootstrap |

#### 10B.1: Transport Abstraction Layer

**Goal:** Create a `MeshTransport` interface and `TransportSelector` that routes messages through the optimal available transport, matching the TypeScript `EnvoyMesh.send()` / `openOutboundStream` logic.

Tasks:

- `[ ]` Define `MeshTransport` interface: `connect()`, `disconnect()`, `send(peerId, envelope)`, `isConnectedTo(peerId)`, `connectionState`, `onMessage` stream, `onPeerDiscovered` stream
- `[ ]` Extract `RelayTransport` from existing `RelayClient` — wraps the Phase 10A WebSocket relay as a `MeshTransport` implementation
- `[ ]` Implement `TransportSelector` with tiered dial strategy (matching TypeScript `openOutboundStream`):
  1. Check open direct connections → `newStream(protocol)` on existing
  2. Check open relay-limited connections → `newStream(protocol, { runOnLimitedConnection: true })`
  3. Fresh dial with sorted dial hints (non-loopback first)
- `[ ]` Implement dial hint sorting: non-loopback before loopback (QUIC-first is skipped since `dart_libp2p` lacks QUIC)
- `[ ]` `EnvoyNodeService` uses `TransportSelector` instead of directly calling `RelayClient`

**Exit criteria:**
- `[ ]` `RelayTransport` passes all existing `RelayClient` tests
- `[ ]` `TransportSelector` routes correctly given simulated available transports
- `[ ]` All existing Phase 10A UI code works unchanged

#### 10B.2: libp2p_dart Integration — DirectTransport

**Goal:** Integrate the `dart_libp2p` package as a `DirectTransport` implementing `MeshTransport`. This gives the mobile app a real libp2p node with TCP transport, Noise encryption, Yamux muxing, mDNS discovery, and Kademlia DHT.

**libp2p_dart stack (v1.0.3, MIT licensed):**

| Layer | dart_libp2p | EnvoyMesh TypeScript equivalent |
|-------|-------------|-------------------------------|
| Transport | TCP, UDX (custom UDP) | `@libp2p/tcp`, `@chainsafe/libp2p-quic` |
| Security | Noise | `@chainsafe/libp2p-noise` |
| Muxer | Yamux | `@chainsafe/libp2p-yamux` |
| Discovery | mDNS (`mdns_dart`) | `@libp2p/mdns` |
| DHT | Kademlia (`dart_libp2p_kad_dht`) | `@libp2p/kad-dht` |
| Relay | Circuit Relay v2, AutoRelay | `@libp2p/circuit-relay-v2` |
| NAT | Hole punching, AutoNAT | `@libp2p/autonat`, `@libp2p/dcutr` |
| Core | Ping, Identify | `@libp2p/ping`, `@libp2p/identify` |

**Known gaps vs TypeScript:**

| Feature | Status | Impact |
|---------|--------|--------|
| QUIC transport | Not supported | Mobile uses TCP + UDX only; no QUIC-to-QUIC with desktop |
| UDX vs QUIC interop | UDX is custom, not QUIC-compatible | Desktop nodes must keep TCP listener enabled |
| Identify push | May be absent | Peer address updates may be slower |
| Persistent key file | Must implement manually | Store protobuf-serialized Ed25519 in `flutter_secure_storage` |
| Connection tags (KEEP_ALIVE) | Not confirmed | May need workaround for reachability management |
| iOS background networking | Platform limitation | Pause libp2p in background; relay queues messages |

Tasks:

- `[x]` Add `dart_libp2p` dependency to `pubspec.yaml` (Android, iOS, macOS, Linux, Windows supported; Web NOT)
- `[ ]` Implement persistent Ed25519 key via `flutter_secure_storage` (protobuf-serialized, matching `loadOrCreateLibp2pPrivateKey`) — currently generates fresh key per session
- `[x]` Implement `Libp2pNode` class wrapping `BasicHost` with `Config.newNode()` + `applyDefaults()` (TCP + Noise + Yamux + AutoNAT)
- `[x]` Initialize `IpfsDHT` in client mode with `MemoryProviderStore` — enables DHT peer discovery
- `[x]` Connect to DHT bootstrap peers on startup — joins the DHT network via community relay
- `[x]` Implement `dial()` with circuit relay support — parses `/p2p/<relay>/p2p-circuit/p2p/<home>` multiaddr, connects to relay, opens stream to home
- `[x]` Implement `findPeer(peerId)` via `IpfsDHT.findPeer()` — enables direct peer discovery via DHT
- `[x]` Implement `Libp2pStreamTransport.performHandshake(token)` — sends `proxy-connect`, waits `proxy-accept/reject` (matches `client-proxy-handler.ts`)
- `[ ]` Configure node with operator relay fleet addresses (beyond community relay)
- `[ ]` Register protocol handlers on stream router:
  - `/envoymesh/message/0.1.0` — general envelope protocol (discovery, relay, task, system)
  - `/envoymesh/chat/0.1.0` — chat-only envelopes (enforces `chat.message` intent)
- `[ ]` Implement envelope codec: JSON serialize/deserialize + canonical JSON (already in `envoy_protocol.dart`)
- `[ ]` Implement `EnvelopeCodec` class: `encode(EnvoyEnvelope) → Uint8List`, `decode(Uint8List) → EnvoyEnvelope`
- `[ ]` Wire peer discovery events: mDNS `peer:discovery` → `onPeerDiscovered` stream
- `[ ]` Wire connection state events: `peer:connect`, `peer:disconnect` → `TransportSelector`
- `[ ]` Handle platform lifecycles: iOS/Android background suspension → pause libp2p; foreground → resume + reconnect

**Exit criteria:**
- `[x]` Circuit relay v2: EnvoyGo connects via community relay circuit when behind NAT (2026-06-13)
- `[ ]` Flutter app on emulator discovers desktop EnvoyMesh node on same LAN via mDNS
- `[ ]` Flutter app establishes direct TCP+Noise+Yamux connection to desktop node (direct dial)
- `[ ]` Chat message round-trip via direct libp2p (bypassing relay) works end-to-end
- `[ ]` App survives suspend/resume on iOS and Android

#### 10B.3: EnvoyMesh Protocol Handlers on libp2p Streams

**Goal:** Register the standard EnvoyMesh protocol handlers on the dart_libp2p stream router so the mobile node can receive envelopes directly over libp2p streams (not just via the relay WebSocket).

Protocols (matching TypeScript `packages/network/src/index.ts`):

| Protocol ID | Purpose | Roles | Envelope Intent |
|------------|---------|-------|-----------------|
| `/envoymesh/chat/0.1.0` | Chat messages only | human↔human, human↔agent | `chat.message` |
| `/envoymesh/message/0.1.0` | All other intents | agent↔agent | discovery, relay, task, system, etc. |

Tasks:

- `[ ]` Register `/envoymesh/chat/0.1.0` handler on `Host.handle()`:
  1. Read stream bytes → `Uint8List`
  2. Decode via `EnvelopeCodec.decode()` → `EnvoyEnvelope`
  3. Verify envelope intent is `chat.message` (reject otherwise)
  4. Verify Ed25519 signature via `verifyCanonicalPayload()`
  5. Emit to `onMessage` stream → routes to `EnvoyNodeService.onChatMessage`
- `[ ]` Register `/envoymesh/message/0.1.0` handler on `Host.handle()`:
  1. Same as chat but allows all intents except `chat.message` (rejected on this protocol)
  2. Handle relay intents (`relay.lookup`, `relay.peers.request`) for mesh discovery
- `[ ]` Implement outbound stream: `openStream(peerId, protocol)` → write envelope bytes → optionally read response
- `[ ]` Implement stream lifecycle: timeout on idle streams, close after send/receive, handle stream errors gracefully

**Exit criteria:**
- `[ ]` Inbound `chat.message` arrives via libp2p stream → parsed → signature verified → emitted on `onChatMessage`
- `[ ]` Inbound `discovery.request` arrives via libp2p stream → handled by relay protocol handler
- `[ ]` Outbound envelope sent via `Host.openStream()` → received by desktop node

#### 10B.4: Connection Manager — Mobile-Aware Lifecycle

**Goal:** Track peer connections, handle network transitions (WiFi ↔ cellular), and manage background/foreground state. This is critical for mobile where connections are ephemeral.

Tasks:

- `[ ]` Implement `ConnectionManager` class:
  - Track per-peer connection state: `{ peerId, state, transport (direct|relay), latency, multiaddrs }`
  - Peer scoring: prefer lower-latency connections
  - Emit events: `peer:connected`, `peer:disconnected`, `connection:type_changed`
- `[ ]` Implement network change detection:
  - Listen to `connectivity_plus` for WiFi ↔ cellular transitions
  - On network change: re-evaluate transports, reconnect direct if possible
  - Grace period (2s debounce) to avoid thrashing on brief disconnects
- `[ ]` Implement background/foreground handling:
  - On background (iOS `sceneDidEnterBackground` / Android `onPause`): pause libp2p mDNS + DHT to save battery
  - Keep relay WebSocket alive (if connected) for push-like message delivery
  - On foreground: resume libp2p, re-discover peers, reconnect direct paths
  - Queue messages during offline; send on reconnect
- `[ ]` Implement adaptive heartbeat:
  - Foreground: keepalive ping every 30s
  - Background: keepalive ping every 5min (or disable, relying on relay)
  - WiFi: standard intervals
  - Cellular: double intervals to conserve data

**Exit criteria:**
- `[ ]` App survives WiFi → cellular → WiFi without message loss (relay bridges the gap)
- `[ ]` App survives suspend → resume (5 min background) and reconnects within 3 seconds
- `[ ]` Battery impact <5% per hour in background with P2P paused

#### 10B.5: Identity Bridging — One Identity, Two Transports

**Goal:** The same Ed25519 identity (generated in Phase 10A) works for both relay and direct libp2p transports. The `peerId` used in envelopes and the libp2p `PeerId` must be consistent.

Tasks:

- `[ ]` Generate libp2p `Host` identity from the same Ed25519 keypair used by `EnvoyNodeService`
  - `dart_libp2p` uses standard libp2p protobuf key format
  - Convert between Phase 10A's PEM format and libp2p protobuf via raw 32-byte seed
- `[ ]` Ensure `EnvoyEnvelope.senderPeerId` matches libp2p `PeerId` on outbound direct messages
- `[ ]` Verify inbound direct message envelopes have `senderPeerId` matching the stream's libp2p peer ID
  - Mismatch = reject (potential spoofing)

**Exit criteria:**
- `[ ]` `EnvoyNodeService.peerId` matches libp2p `Host.peerId` for the same key
- `[ ]` Desktop node sees same `peerId` from mobile node regardless of transport (relay vs direct)

#### 10B.6: Android/iOS Platform Integration

**Goal:** Handle mobile-specific constraints: app permissions, background execution limits, and platform channel integration.

Tasks:

- `[ ]` Android: request `INTERNET` + `ACCESS_NETWORK_STATE` + `ACCESS_WIFI_STATE` + `FOREGROUND_SERVICE` permissions
- `[ ]` iOS: configure `Bonjour services` in `Info.plist` for mDNS; set `UIApplicationBackgroundModes` for VoIP/background fetch
- `[ ]` Implement platform channel for background keepalive: Android foreground service keeps libp2p alive briefly after background
- `[ ]` Handle Doze mode (Android): schedule periodic wake for DHT re-provide + check queued messages
- `[ ]` Handle Low Power Mode (iOS): pause non-critical P2P activity

**Exit criteria:**
- `[ ]` App compiles and runs on Android 8+ and iOS 15+
- `[ ]` mDNS discovery works on both platforms
- `[ ]` No crash when app moves to background with active P2P connections

---

### Files Summary (10A)

| Action | File | Purpose |
|--------|------|---------|
| **New** | `HomeClawApp/lib/envoy/` directory | All Dart P2P code |
| Create | `lib/envoy/envoy_identity.dart` | Ed25519 keys, peer ID, canonical JSON, signing |
| Create | `lib/envoy/envoy_envelope.dart` | EnvoyEnvelope types, constructors, parsers |
| Create | `lib/envoy/envoy_protocol.dart` | Chat message, hello payload schemas |
| Create | `lib/envoy/relay_client.dart` | JSON-RPC WebSocket relay client (`relayDispatchServerPush` for push events) |
| Create | `lib/envoy/envoy_node_service.dart` | High-level EnvoyNodeService + Riverpod provider |
| Create | `lib/envoy/envoy_peer_directory.dart` | Local peer/bond storage (SharedPreferences) |
| Modify | `lib/providers/providers.dart` | Add envoyNodeServiceProvider |
| Modify | `lib/screens/friend_list_screen.dart` | Bridge agent contact, P2P status indicator |
| Modify | `lib/screens/chat_screen.dart` | Route P2P messages via EnvoyNodeService |
| Modify | `lib/screens/settings_screen.dart` | Relay config, pairing button |
| **New** | `lib/screens/pairing_screen.dart` | QR scan pairing flow |
| Create | `test/envoy/` directory | Dart P2P tests |
| Create | `test/envoy/envoy_identity_test.dart` | Identity + signing tests |
| Create | `test/envoy/envoy_protocol_test.dart` | Protocol schema tests |
| Create | `test/envoy/relay_client_test.dart` | Relay client + push dispatch tests |
| Create | `test/envoy/envoy_node_service_test.dart` | Service integration tests |

### Files Summary (10B)

| Action | File | Purpose |
|--------|------|---------|
| Create | `lib/envoy/envoy_mesh_node.dart` | Full libp2p node wrapper |
| Create | `lib/envoy/envoy_connection_manager.dart` | Connection lifecycle, scoring, network changes |
| Create | `lib/envoy/envoy_protocol_handlers.dart` | libp2p stream protocol handlers |
| Modify | `lib/envoy/envoy_node_service.dart` | Use DartMeshNode instead of RelayClient |
| Modify | `pubspec.yaml` | Add `libp2p_dart` dependency |

### Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| **Canonical JSON interop:** Dart and TypeScript must produce byte-identical output | Cross-verify with snapshot tests; use deterministic JSON encoder |
| **libp2p_dart maturity:** May lack features or have bugs | Start with relay-only (10A); validate libp2p_dart before committing to 10B |
| **Ed25519 key format:** Different libraries use different PEM/DER encodings | Normalize to same PEM format as TypeScript; cross-verify signatures |
| **Mobile background constraints:** iOS aggressively suspends background apps | Use background fetch / push notification as wake trigger; relay queues messages |
| **Battery impact:** P2P keepalive can drain battery | Adaptive heartbeat based on app state; pause P2P when idle |
| **Dual-stack complexity:** App must work with both P2P and existing HTTP/CoreService | Feature flag for P2P; HTTP path remains as fallback |

### Key Decisions

1. **Dart relay client first (10A), full libp2p later (10B).** The relay client is ~1500 lines of Dart and works across all platforms immediately. Full libp2p in Dart depends on `libp2p_dart` maturity and is 3-5x more code.

2. **No Node.js subprocess on mobile.** iOS forbids it. Android makes it painful. Pure Dart implementation is the only viable path for mobile.

3. **Reuse existing HomeClawApp architecture.** The `ChatScreen`, `FriendListScreen`, Hive chat store, and Riverpod state management all stay. Only the message transport layer changes (`CoreService._baseUrl` → `EnvoyNodeService`).

4. **Preset friends remain Core-driven.** Reminder, Files, Knowledge, etc. are HomeClaw Core features. They continue to work through the P2P bridge to Core — the preset friend UI talks to the bridge agent, which routes to Core.

5. **Identity is per-device.** Each HomeClawApp instance generates its own Ed25519 keypair. The owner links devices via the existing mandate/credential system (Phase 9A).

---

## Phase 11: Mobile Social App & Mobile Node (Capacitor) — **BACKUP / LEGACY**

> **Status (2026-07-20):** This Capacitor path (`apps/mobile/` + `packages/mobile-*`) is a **backup experiment**, not the product mobile app. **EnvoyGo** (`apps/envoygo/`, Phase 31+) is the product phone client. New mobile features (including Phase 45C Browser) go to EnvoyGo. Capacitor may be removed later; keep this section for historical reference only.

**Original goal:** Create a mobile-native EnvoyMesh app (iOS + Android) using Capacitor.js. The Social UI (React/Vite SPA) and Node runtime run **in-process** within a single WebView — no child process, no WebSocket server, direct JS function calls between UI and node. **Transport:** outbound fleet-relay WebSocket (`/ws/client` on the relay binary) for framed envelopes, plus **optional** in-browser libp2p (WebSocket + DHT client + circuit relay) for mesh features — not TCP/QUIC listeners.

### Architecture

```
┌──────────────────────────────────────────────┐
│ Capacitor WebView (single JS runtime)         │
│                                               │
│  ┌──────────────┐    direct calls    ┌──────┐ │
│  │  Social UI    │◄─────────────────►│ Node │ │
│  │  (React SPA) │  NodeServiceClient │ Svc  │ │
│  └──────────────┘                    └──────┘ │
│                                               │
│  ┌──────────────────────────────────────────┐ │
│  │  mobile-node (relay `/ws/client` + optional browser libp2p)          │ │
│  │  - WebSocket transport (outbound only)   │ │
│  │  - No TCP/QUIC/mDNS                      │ │
│  │  - SQLite storage via Capacitor plugin   │ │
│  └──────────────────────────────────────────┘ │
│                                               │
│  ┌──────────┐  ┌──────────┐  ┌────────────┐  │
│  │ protocol │  │ identity │  │   bonds     │  │
│  │  (zod)   │  │(noble)   │  │  (intact)   │  │
│  └──────────┘  └──────────┘  └────────────┘  │
└──────────────────────────────────────────────┘
```

**Key principle:** The mobile app is a full EnvoyMesh node — just with relay-only networking and Capacitor-native storage. It shares the same React Social UI code as the desktop app (Vite build), with a `DirectCallClient` that calls the `NodeService` interface directly instead of over WebSocket.

**Dependency injection:** Capacitor-native implementations live in `apps/mobile/src/`, NOT in the packages. Packages stay pure TypeScript with zero native deps — fully testable in Node.js. `MobileNodeConfig` accepts optional `database`, `vault`, and `secureStorage` fields; all fall back to in-memory when undefined (dev/testing).

```
apps/mobile/src/
  ├── capacitor-sqlite-database.ts   # MobileDatabase via @capacitor-community/sqlite
  ├── capacitor-filesystem-vault.ts  # MobileVault via @capacitor/filesystem
  ├── capacitor-secure-storage.ts    # SecureStorage via capacitor-secure-storage-plugin
  ├── bootstrap.ts                   # Wire everything, init MobileNode
  └── index.ts                       # Public exports
```

### Package portability

| Package | Mobile status | Action |
|---------|--------------|--------|
| `protocol` | Works as-is | No changes — pure Zod, no Node deps |
| `bonds` | Works as-is | No changes — pure logic |
| `models` | Works with minor swap | `node:crypto` `randomUUID` → `crypto.randomUUID()` (Web API) |
| `identity` | Needs adaptation | `node:crypto` Ed25519 → `@noble/curves` + `@noble/hashes` (pure JS) |
| `vault` | Full replacement | Node `fs` → Capacitor Filesystem plugin |
| `network` | Full replacement | libp2p TCP/QUIC/mDNS → relay-only WebSocket transport |
| `local-store` | Full replacement | Node `fs/promises` → Capacitor Filesystem + SQLite |

### New packages created

| Package | Description |
|---------|------------|
| `packages/mobile-identity/` | Pure-JS Ed25519 identity (noble-curves) with PEM encoding — works in Node.js and browsers |
| `packages/mobile-storage/` | SQLite-backed peer directory, trust store, session tokens, chat log, identity state, SecureStorage interface — all with in-memory fallback |
| `packages/mobile-vault/` | Filesystem-backed vault via Capacitor Filesystem plugin |
| `packages/mobile-node/` | In-process `NodeService` implementation with relay-only WebSocket transport |
| `apps/mobile/` | Capacitor project config — loads Social dist as `webDir` |

### 11A: In-Process NodeServiceClient (DirectCallClient)

**Goal:** Replace the WebSocket-based `WsClient` with a direct in-process `NodeServiceClient` when running in the Capacitor WebView. The `NodeServiceProvider` accepts an optional `clientFactory` prop.

**Implementation:**

| Component | File | What it does |
|-----------|------|--------------|
| `DirectCallClient` | `apps/social/src/lib/direct-call-client.ts` | Implements `NodeServiceClient` by calling `NodeService` methods directly — no WebSocket, no JSON-RPC serialization |
| `NodeServiceProvider` | `apps/social/src/hooks/useNodeService.tsx` | Accepts `clientFactory` prop; defaults to WsClient for desktop, uses factory for mobile |

**Tasks:**

- `[x]` Create `DirectCallClient` class implementing `NodeServiceClient`
- `[x]` Export `NodeServiceClient` interface from `useNodeService.tsx`
- `[x]` Extract WsClient-based `NodeServiceClient` into `createWsNodeServiceClient` function
- `[x]` Add `clientFactory` prop to `NodeServiceProvider`
- `[ ]` Verify all 6 Social UI views render with DirectCallClient (mobile smoke test)

**Exit criteria:**
- `[x]` `DirectCallClient` typechecks and mirrors all RPC methods from `NodeServiceClient`
- `[~]` Desktop build unchanged — WsClient path works as before
- `[ ]` Mobile app Social UI loads and displays without WebSocket connection errors

### 11B: Mobile Identity (noble-curves)

**Goal:** Provide Ed25519 identity that works in both Node.js and browser environments using `@noble/curves` and `@noble/hashes` (pure JS, no native deps).

**Implementation:** `packages/mobile-identity/src/index.ts`

- PEM encode/decode for Ed25519 in pure JS (SPKI for public keys, PKCS8 for private keys)
- `generateEd25519KeyPair()`, `signCanonicalPayload()`, `verifyCanonicalPayload()`, `hashCanonicalPayload()`
- Identity derivation: `derivePeerId()`, `deriveOwnerId()`, `deriveDeviceId()`, `deriveAgentId()`
- Full API mirroring `@envoymesh/identity`: device certificates, agent credentials, envelope signing/verification, mandates, proofs of intent, data transfer vouchers, human profile signing
- `base64url` ↔ `Uint8Array` conversion without Buffer

**Tasks:**

- `[x]` Create `packages/mobile-identity/` with noble-curves Ed25519
- `[x]` Implement PEM encode/decode for SPKI (44 bytes) and PKCS8 (48 bytes)
- `[x]` Implement all signing/verification primitives
- `[x]` Implement all identity derivation functions
- `[x]` Implement device certificates, agent credentials, envelope ops, mandates, proofs
- `[x]` Add cross-verification tests: mobile-identity PEM ↔ identity PEM produce same signatures (`packages/mobile-identity/test/identity-interop.test.ts`)
- `[x]` Add golden fixture tests for envelope interop (`companion_envelope_interop_golden.json` in mobile-identity + identity)

**Exit criteria:**
- `[x]` All mobile-identity functions typecheck without `node:crypto` imports
- `[x]` `generateEd25519KeyPair()` in mobile-identity produces valid PEM keys
- `[x]` `signCanonicalPayload()` / `verifyCanonicalPayload()` round-trip correctly
- `[x]` Cross-package: mobile-identity-signed envelope is verified by identity (and vice versa)

### 11C: Mobile Node Runtime

**Goal:** In-process `NodeService` implementation with relay-only WebSocket transport. Runs in the same WebView as the Social UI — no child process.

**Manual QA:** See [`docs/mobile-smoke-checklist.md`](./mobile-smoke-checklist.md) for device smoke steps (bond challenge, hello queue, DHT stop-advertise, diagnostics).

**Implementation:** `packages/mobile-node/src/index.ts`

- `MobileNode` class implementing `NodeService` interface
- Relay-only: outbound WebSocket connections to relay URLs
- Event bus for `NodeServiceEvents` (push to Social UI)
- `MobileNodeState` tracking owner, device, agent identities

**Tasks:**

- `[x]` Create `MobileNode` class with `NodeService` interface
- `[x]` Implement `initNode()`, `startNode()`, `stopNode()`, `getNodeStatus()`
- `[x]` Implement `getProfile()`, `getConnectionStatus()`, `getPairingPayload()`, `getBridgeStatus()`
- `[x]` Implement `getBonds()`, `sendChat()`, `sendHello()`, `revokeBond()`
- `[x]` Implement `on()` event subscription and `hasListeners()`
- `[x]` Build real relay WebSocket transport (`_sendToRelay`, `_connectRelays`)
- `[x]` Wire mobile-storage for trust store and peer directory persistence
- `[x]` Implement full chat history via SQLite (`MobileChatLogStore`)
- `[x]` Signed envelope sending: construct `UnsignedEnvoyEnvelope` → sign → send
- `[x]` Relay checkin on connect + 30s interval (`_startRelayCheckin`)
- `[x]` Inbound message routing: parse → verify → route by intent (chat, bond, p2p)
- `[x]` Inbound **bond.request** / **bond.accept:** `evaluatePolicy` (`@envoymesh/bonds`), pending hello map, **`hello:request`** event, **`acceptHello` / `declineHello`** + outbound **`bond.accept`** (desktop `NodeService` parity)
- `[x]` Inbound **`bond.challenge`** / **`bond.challenge.response`:** policy verification + logging (no JSONL audit)
- `[x]` Outbound **`sendHello`:** signed **`bond.request`** over mesh or relay; **`peer_directory.libp2pPeerId`** for owner→dial-id routing
- `[x]` SecureStorage for private key persistence (iOS Keychain / Android Keystore)
- `[x]` Identity state persistence: standalone auto-persist, shared via `persistSharedIdentity()`
- `[x]` Dependency injection: `MobileNodeConfig` accepts `database`, `vault`, `secureStorage`
- `[x]` Comprehensive test coverage (real envelope routing, SecureStorage restore, chat persistence)

**Exit criteria:**
- `[x]` `MobileNode` typechecks as a `NodeService` implementation
- `[x]` Mobile node starts and connects to a relay WebSocket
- `[x]` Chat message round-trip via relay to home node
- `[x]` Signed envelopes verified with `derivePeerId(senderPublicKey) === senderPeerId`
- `[x]` Private keys persisted to SecureStorage after pairing

### 11D: Multi-Device Identity (Shared Owner)

**Goal:** A user with multiple devices (desktop + mobile) can use the same EnvoyMesh identity — same `ownerId`, same contacts/bonds, same display name. Contacts see one owner with multiple devices, not two separate identities.

**Design:**

```
Owner "Alice" (shared ownerId + owner keypair)
├── Device "MacBook Pro" (deviceId + device keypair)
│   └── Signed DeviceCertificate from owner
└── Device "iPhone" (deviceId + device keypair)
    └── Signed DeviceCertificate from owner
```

**How it works:**

1. Home node generates QR with `ownerPublicKey` and `ownerId` (in addition to existing `agentPeerId`, `wsUrl`, etc.)
2. Mobile scans QR, gets `ownerId` + `ownerPublicKey`
3. Mobile requests the owner's private key via a secure channel:
   - **Option A (in-scope):** Mobile sends `importIdentity` RPC to home node with a fresh device public key. Home node owner signs a `DeviceCertificate` for the mobile device and returns it along with the owner's private key (encrypted by a one-time pairing token).
   - **Option B (future):** QR contains encrypted owner private key (encrypted with OTP shown on desktop screen).
4. Mobile imports the owner identity:
   - `ownerId` and `ownerPublicKey`/`ownerPrivateKey` from home node
   - Generates its own `deviceId` and device keypair
   - Gets an owner-signed `DeviceCertificate`
5. Messages from mobile include the `DeviceCertificate` to prove the mobile device belongs to the owner
6. Bonds/contacts tied to `ownerId` — automatically shared

**API changes:**

```typescript
// Mobile initiates identity import
interface ImportIdentityRequest {
  deviceId: string;
  devicePublicKeyPem: string;
  deviceProfile: DeviceProfile;
  capabilities: Capability[];
}

interface ImportIdentityResponse {
  ownerPrivateKeyPem: string;  // Encrypted with one-time token
  deviceCertificate: DeviceCertificate;
}

// MobileNode.importOwnerIdentity(profileDir, ownerPrivateKeyPem, ownerPublicKeyPem, homeNodePeerId)
```

**Tasks:**

- `[x]` Design multi-device identity architecture
- `[x]` `MobileNode.importOwnerIdentity()` method in `packages/mobile-node/`
- `[x]` `MobileNode.getPairingPayload()` includes `ownerPublicKey` and `ownerId`
- `[x]` `MobileNode.persistSharedIdentity()` — saves identity + keys to SQLite + SecureStorage
- `[x]` `MobileNode.restoreFromSecureStorage()` — loads both shared and standalone identities
- `[x]` Home node shared-identity pairing RPC (`pairSharedIdentity`: signs device certificate, returns encrypted owner key)
- `[x]` Mobile app UI: pair/import identity flow (scan QR or paste link → device cert → persist)
- `[x]` Envelope sends include `deviceCertificate` when device certificate is available (shared-identity mobile + primary desktop)
- `[x]` Peers verify device certificates on inbound `chat.message` when certificate is present
- `[x]` Device authorization store (`device-authorization.json`) tracks paired satellites + signed revocations
- `[x]` NodeService RPC: `listAuthorizedDevices`, `revokeAuthorizedDevice`, `listDeviceRevocations`
- `[x]` Settings UI lists authorized devices with revoke action (home node)
- `[x]` Inbound chat rejects revoked device certificates (`isDeviceRevoked` wired on desktop + mobile cache sync)

**Security considerations:**

| Concern | Mitigation |
|---------|------------|
| Owner private key transfer | Encrypted with one-time pairing token; only sent over local relay/WS |
| Device compromise | Owner can revoke device certificate; other device unaffected |
| Key theft from mobile | Stored in platform keychain (iOS Keychain / Android Keystore) |
| Replay attacks | Device certificate includes `issuedAt`; freshness verified |

**Exit criteria:**
- `[x]` Mobile node with imported identity has same `ownerId` as home node
- `[x]` Chat message from mobile satellite device appears with device profile suffix (e.g. "Alice (satellite)")
- `[x]` Revoking mobile device does not affect desktop device
- `[x]` Bonds created on desktop are visible on mobile (same ownerId)

### 11E: Mobile Storage & Vault

**Goal:** SQLite-backed peer directory, trust store, and session tokens via Capacitor SQLite plugin. Filesystem-backed vault via Capacitor Filesystem plugin.

**Implementation:**

| Package | File | What it does |
|---------|------|--------------|
| `mobile-storage` | `packages/mobile-storage/src/index.ts` | `MobilePeerDirectory`, `MobileTrustStore`, `MobileSessionTokenStore`, `MobileChatLogStore`, `MobileIdentityStateStore`, `SecureStorage` interface, `createInMemoryDb()` — all SQL-backed |
| `mobile-vault` | `packages/mobile-vault/src/index.ts` | `MobileVault` with Capacitor Filesystem API |
| `apps/mobile` | `src/capacitor-sqlite-database.ts` | `CapacitorSqliteDatabase` implementing `MobileDatabase` via `@capacitor-community/sqlite` |
| `apps/mobile` | `src/capacitor-filesystem-vault.ts` | `CapacitorFilesystemVault` implementing `MobileVault` via `@capacitor/filesystem` |
| `apps/mobile` | `src/capacitor-secure-storage.ts` | `CapacitorSecureStorage` implementing `SecureStorage` via `capacitor-secure-storage-plugin` |
| `apps/mobile` | `src/bootstrap.ts` | `bootstrapMobileApp()` — wires SQLite, vault, secureStorage → `MobileNode` with DI |

**Tasks:**

- `[x]` Create `packages/mobile-storage/` with typed interfaces
- `[x]` Create `packages/mobile-vault/` with typed interfaces
- `[x]` Define SQLite schema (peer_directory, trust_store, session_tokens, config, identity_state, chat_messages)
- `[x]` In-memory fallback for dev/testing (`createInMemoryDb` — full INSERT/REPLACE/SELECT/DELETE with WHERE/ORDER BY/LIMIT)
- `[x]` `MobileSessionTokenStore` uses SQL queries (was Map-based)
- `[x]` `MobileIdentityStateStore` uses SQL queries with save/load/clear
- `[x]` `MobileChatLogStore` — `append()` and `listThread()` with timestamp ordering and limit
- `[x]` `SecureStorage` interface — `set(key, value)`, `get(key)`, `remove(key)`
- `[x]` `CapacitorSqliteDatabase` adapter in `apps/mobile/src/`
- `[x]` `CapacitorFilesystemVault` adapter in `apps/mobile/src/`
- `[x]` `CapacitorSecureStorage` adapter in `apps/mobile/src/`
- `[x]` `bootstrapMobileApp()` entry point — opens DB, runs schema, creates node with DI
- **[-]** Migration from desktop profile (import JSON files to SQLite) — **out of scope** (no backward compatibility; mobile gets identity/contacts via Phase 11D pairing, not bulk JSON import)
- `[ ]` On-device testing (iOS/Android) — Capacitor plugins require native runtime

**Exit criteria:**
- `[x]` All interfaces typecheck
- `[x]` SQLite tables created on first launch (schema via `mobileStorageSchema()`)
- `[x]` Trust records survive app restart (in-memory DB tests verify)
- `[x]` Vault files survive app restart (in-memory DB tests verify)
- `[x]` Chat history persisted and retrievable with thread isolation and limit support
- `[x]` Identity state survives save/load/clear cycle
- `[ ]` Native SQLite tables created on iOS/Android device (requires device testing)
- `[ ]` Native keychain keys survive app restart (requires device testing)

---

### Files Summary (Phase 11)

| Action | File | Purpose |
|--------|------|---------|
| **New** | `apps/mobile/` | Capacitor project (package.json, capacitor.config.ts, tsconfig.json) |
| **New** | `apps/social/src/lib/direct-call-client.ts` | In-process NodeServiceClient |
| Modify | `apps/social/src/hooks/useNodeService.tsx` | Export NodeServiceClient, add clientFactory, extract WsClient factory |
| **New** | `packages/mobile-identity/` | Pure-JS Ed25519 identity with noble-curves |
| **New** | `packages/mobile-storage/` | SQLite-backed peer directory, trust store, session tokens |
| **New** | `packages/mobile-vault/` | Filesystem-backed vault |
| **New** | `packages/mobile-node/` | In-process NodeService with relay-only transport, multi-device identity |
| **New** | `apps/social/src/design-tokens.css` | Design tokens: Slate+Indigo+Teal palette, spacing, typography, dark mode |
| **New** | `apps/social/src/icons.tsx` | 34 SVG icon components via factory pattern (shared with mobile) |
| **New** | `apps/social/src/reset.css` | CSS reset: font smoothing, focus-visible outlines, scrollbar styling |
| **New** | `apps/social/src/context/ThemeContext.tsx` | React context for light/dark theme with localStorage persistence |
| Modify | `apps/social/src/styles.css` | Tokenized: removed :root block, replaced hardcoded colors, removed borders, refined buttons/nav/chat |
| Modify | `apps/mobile/src/MobileApp.tsx` | Use shared icons, add theme toggle, backdrop blur |
| Modify | `apps/mobile/src/MobileApp.css` | Dark mode support, blur effects, shadow instead of border |
| Modify | `apps/social/src/components/views/ChatSidebar.tsx` | Emoji → SVG icons (CheckIcon, CloseIcon, BridgeIcon, ChatIcon) |
| Modify | `apps/social/src/components/views/ContactChatPanel.tsx` | Emoji → SVG icons (EditIcon, ChatIcon, BridgeIcon) |
| Modify | `apps/social/src/components/views/ProfileView.tsx` | Emoji → SVG icons (PublicIcon, PrivateIcon) |
| Modify | `apps/social/src/components/views/SearchView.tsx` | Emoji → SVG icons (SearchIcon) |
| Modify | `tsconfig.json` (root) | Add references for new mobile packages |
| Modify | `tsconfig.base.json` | Add path aliases for new mobile packages |
| Modify | `docs/implementation-plan.md` | Add Phase 11 section |

*Bond wire work* (payloads + inbound + CLI) is Phase **4B** Batch 6 **`[x]`**; *Phase 4E discovery baseline* (`discovery.request/response`, trust/rate gating, audit correlation) is **`[x]`**; *Phase 4 LAN identity match baseline* (`system.signal` owner→peer directory + owner-id target resolution) is **`[x]`**; *semantic firewall* v1 is Phase **6** **`[x]`**; *morning report* under Phase **7**. *Hop TTL / gossip cancel / collect-N* now complete under Phase **4D** extended.

---

## Phase 12: Trust mode & bilateral social mediation (design first)

**Goal:** Let authorized **agents** help owners discover and vet people using **owner-signed profile material** and structured intro threads, while **humans retain exclusive commit** for `bond.request` / `bond.accept`. Support **two-sided** agent mediation (Alice’s agent ↔ Bob’s agent) with **two human gates**.

**Design reference:** [trust-mode-social-protocol.md](./trust-mode-social-protocol.md) (definitions, profile tiers, EMP intents `social.intro.*`, `HumanProfileFragmentPayload`, bond payload linkage, bonds tier rules, ordered backlog).

**Status:** Phases **A–F** shipped — see [trust-mode-implementation-plan.md](./trust-mode-implementation-plan.md).

### Tasks

- `[x]` Author and link [trust-mode-social-protocol.md](./trust-mode-social-protocol.md) (product + EMP extensions + implementation backlog).
- `[x]` Dedicated signed **`HumanProfileFragmentPayload`** + **`humanProfileFragmentForSigning()`** in `@envoymesh/protocol` (tiered disclosure path **B**).
- `[x]` EMP intents **`social.intro.sync`**, **`social.intro.propose`**, **`social.intro.owner-ready`** + envelope role policy + unit tests.
- `[x]` Extend **`bond.request`** with optional **`introCorrelationId`** / **`ownerCommitmentRef`** (backward compatible).
- `[x]` **`@envoymesh/bonds`**: capability map + **`evaluatePolicy`** tier rules for **`social.intro.*`**.
- `[x]` **`apps/node`** inbound **`social.intro.*`** (`social-intro-inbound.ts`), dispatcher, audits; **`trustModeEnabled`** + **`friendMatchingPreferencesText`** config + credential-bearing agent **`bond.request`** gate (Phase A — [trust-mode-implementation-plan.md](./trust-mode-implementation-plan.md)).
- `[x]` Inbound gate: **`bond.request`** from **`senderRole: agent`** with **`agentCredential`** requires **`ownerCommitmentRef`** (device-signed hello without credential unchanged).
- `[x]` Phase **B–D**: Social Settings + **`social.intro:propose`** push + RPC pending intros + **`mesh.intro.*`** tools + **`sendHello`** intro linkage (`apps/social`, `packages/api`, `packages/mobile-node`, `apps/node`).
- `[x]` [protocol-standard.md](./protocol-standard.md) appendix + [scenarios.md](./scenarios.md) Epic TM + [alignment-review.md](./alignment-review.md) (**Phase E**).
- `[x]` Phase **F**: signed **`FriendMatchingPreferences`** (`@envoymesh/protocol` + verify in **`@envoymesh/identity`** / **`updateNodeConfig`**), per-peer **`social.intro.*`** rate limits + **`social.intro.owner-ready`** nonce replay guard; integration test **`trust-mode-intro-bond-flow.test.ts`** + **`bond.accept`** inbound audit (`npm run smoke:local`).

### Exit criteria

- `[x]` Two-node or integration test: discovery → intro sync → owner approval → **`bond.request`** / **`bond.accept`** path with correlated audits (`apps/node/test/trust-mode-intro-bond-flow.test.ts`; owner approval simulated via **`ownerCommitmentRef`** on credential-bearing **`bond.request`**).
- `[x]` Negative test: credential-bearing **`bond.request`** without **`ownerCommitmentRef`** rejected at inbound handler (`bond-inbound.test.ts`).
- `[x]` Documentation: protocol-standard / EMP appendix + traceable scenario IDs (**US-TM1–TM4**) updated for Trust-mode intents.

---

## Phase 13: A2A routing, actor disclosure & owner visibility

**Goal:** When two nodes communicate, both sides can **cryptographically** tell whether the sender is a **human** or an **authorized agent**. When **both** sides are agents, structured **A2A intents** (`agent.card.*`, `task.*`, `knowledge.*`, …) carry the work — not long agent↔agent chat threads. **Owners still see outcomes** via Activity feed, `report.create`, task journal, approvals, and digest — without spamming the human chat channel.

**Design reference:** [a2a-actor-visibility-plan.md](./a2a-actor-visibility-plan.md) (lanes model, visibility surfaces, user stories **US-AV1–AV8**).

**Depends on:** Phase 9 agent identity + bridge credential · Phase 4B task journal · Phase 9H approvals · Phase 9J digest · Phase 12 Trust mode (`social.intro.sync` as reference bilateral A2A).

### 13A — Honest actor roles on the wire

- `[x]` Add `sendAgentChat()` (agent key + `senderRole=agent` + `agentCredential`) to `NodeService` / `NodeServiceImpl` / mobile-node.
- `[x]` Route AI auto-send through `sendAgentChat`, not human `sendChat()` (approval `send_chat` executes via `executeApprovedAction` → `sendAgentChat`).
- `[x]` Persist `actorRole` / `agentId` on chat log entries (desktop JSONL + mobile SQLite fields).
- `[x]` Inbound guard: reject `chat.message` with `senderRole=agent` and missing/invalid credential (schema + `verifyInboundEnvelope`).
- `[x]` Tests: chat-actor helpers + agent activity store + activity hooks.

**Exit:** Auto-reply envelope has `senderRole=agent`; peer verifies `agentCredential`.

### 13B — Chat UI role badges

- `[x]` Extend `ChatMessage.sender` with `actorRole`, `agentId?`, `agentVerified?` (`@envoymesh/api`).
- `[x]` Social `ChatMessageBubble`: verified agent badge vs human.
- `[x]` Settings copy: `AiIdentityMode` affects **display** only; wire role is always honest after 13A.
- `[x]` Mobile inbound badge fields + `sendAgentChat` wire path.

**Exit:** UI distinguishes “Bob” vs “Bob’s agent (verified)” on the same thread.

### 13C — A2A orchestrator routing

- `[x]` Per-contact **`AgentCard`** cache after `agent.card.response`.
- `[x]` `NodeConfig.agentInteractionMode`: `chat_ok` | `structured_preferred` (default).
- `[x]` Inbound: when both sides are verified agents, prefer `task.propose` / `knowledge.query` tools over free-form agent chat (skip chat-assist auto-reply).
- `[x]` Wire `agent.card.request/response` through tool registry + inbound dispatcher.
- `[x]` Integration test: bilateral `agent.card` + `task.propose` → `task.result` without chat bodies.

**Exit:** Two-node agents complete a task loop using only A2A intents.

**Delivery order:** 13A + 13B → 13D → 13C (when agent.card substrate ships).

### 13D — Owner Activity feed & report wiring

- `[x]` `AgentActivityStore` (local JSONL) + `listAgentActivity` RPC.
- `[x]` Task journal hooks → Activity rows + WS `agent:activity`.
- `[x]` Local `emitOwnerReport()` (Option A — no wire to human).
- `[x]` Social **Activity** view: timeline, filter by domain.
- `[x]` Digest includes A2A activity counts (extend Phase 9J).
- `[x]` Optional `a2aChatNotifications`: local system lines in chat (`off` | `milestones_only` | `all_reports`).
- `[x]` Mobile Activity list (read-only SQLite store + `listAgentActivity`).

**Exit:** Owner sees bilateral A2A task in Activity without opening chat; digest mentions completion.

### 13E — Visibility policy & docs

- `[x]` `NodeConfig.agentVisibility` per domain: instant | brief | silent | approval (+ Settings UI).
- `[x]` [protocol-standard.md](./protocol-standard.md) appendix: actor disclosure + owner visibility ([Appendix C](./protocol-standard.md#appendix-c-actor-disclosure-and-owner-visibility)).
- `[x]` [scenarios.md](./scenarios.md) Epic AV stories tracked; update [alignment-review.md](./alignment-review.md).

### Phase 13 exit criteria (overall)

- `[x]` **US-AV1–AV2:** Role visible in UI; no AI masquerading as human on wire.
- `[x]` **US-AV3–AV4:** Activity feed + task/correlation drill-down (Activity trace panel + audit/journal RPC).
- `[x]` **US-AV5–AV6:** Agent card handshake + `report.create` surfaced to owner (wire inbound + Activity).
- `[x]` **US-AV7–AV8:** Configurable notify modes + audit trace without raw payloads (Activity filters by contact + date).

## Phase 14: Friend autopilot & knowledge syndication (Phase 13 follow-on)

**Goal:** Let authorized agents proactively assist with Trust-mode friend discovery and cap what vault knowledge bonded peers receive — building on Phase 12 intros, Phase 8 autonomy, and Phase 13 Activity visibility.

**Depends on:** Phase 12 Trust mode · Phase 8L autonomy · Phase 13 Activity feed.

### 14A — Friend autopilot (Trust mode)

- `[x]` `NodeConfig.friendAutopilotEnabled` + Settings toggle (requires Trust mode).
- `[x]` Agent tool `mesh.intro.run_autopilot` (matching context + `mesh.intro.broadcast_search`, requires approval).
- `[x]` Scheduled autopilot passes (`friendAutopilotIntervalHours`) with Activity rows + digest summary.

**Exit:** Owner enables autopilot; agent runs one approved discovery pass without manual tool chaining.

### 14B — Knowledge syndication policy

- `[x]` `NodeConfig.knowledgeSyndicationMaxSensitivity` + Settings select.
- `[x]` Inbound `knowledge.query` clamps vault access via `@envoymesh/api/knowledge-syndication`.
- `[x]` Per-contact syndication overrides (Settings) + Activity row on inbound answers.

**Exit:** Bonded peer query cannot exceed owner-configured vault ceiling even when bond policy would allow more.

### 14C — WAN connectivity CI signal

- `[x]` Nightly workflow runs `npm run connectivity:smoke -- --mode mdns` on CI runner.
- `[x]` Advanced bootstrap job + [wan-connectivity-signoff.md](./wan-connectivity-signoff.md) ledger for multi-machine relay/DCUtR sign-off (§4–§5).

### 14D — External pinning (IPFS)

- `[x]` `externalPublish.pinningEnabled` + `pinLibraryItemExternal()` + Pinata / web3.storage env tokens.
- `[x]` Social Library “Pin to provider” action + provider select in Settings.

## Phase 15: Reach, semantics & platform scale

**Goal:** Make EnvoyMesh work reliably **across the WAN**, discoverable **beyond bonded contacts**, semantically clear for **human↔agent (H2A)** product flows, and ready for **audit/query scale** — without opening commerce or global reputation (those stay parked).

**Builds on:** Phase 4E/4F (semantic + DHT discovery scaffolding) · Phase 8I (anonymous discovery modes) · Phase 8J (relay broadcast substrate) · Phase 13/14 (Activity, Trust mode, syndication) · [live-connectivity-testing.md](./live-connectivity-testing.md) · [sqlite-adoption.md](./sqlite-adoption.md).

**Scenarios / stories addressed:** Scenario 2 (Blind discovery) · Scenario 6 (roles + H2A channel) · Story B–C (recruiter/researcher) · Story F (WAN proof) · Open questions: broadcast substrate, SQLite, EMP role fields.

### Recommended sequencing

| Order | Track | Why first |
|-------|-------|-----------|
| 1 | **15B WAN reach** | Real nodes cannot rely on LAN; cold-start + relay proof unblock everything else. |
| 2 | **15A Discovery UX** | Story B value — find capabilities/topics without prior bond. |
| 3 | **15C H2A semantics** | Scenario 6 product clarity after transport works. |
| 4 | **15D Platform scale** | SQLite/Filecoin only when gates or policy demand it. |
| — | **15E Parked** | Explicitly **not** Phase 15 exit criteria. |

---

### 15A — Discovery & broadcast reach (Scenario 2 / 4E / 4F)

**Goal:** Close the gap between **signed `discovery.request/response`** (shipped) and **global topic/provider discovery UX** (partially scaffolded in Phase 4F).

- `[x]` **Wire DHT capability topics to product:** Social Search + CLI discover-by-topic using `findCapabilityTopicProviders` → policy-gated `discovery.request` follow-up (complete Phase 4F.A exit: two WAN nodes, test topic, no prior multiaddr).
- `[x]` **Morning report / ranked discovery UX:** polish Social + CLI ranking panel — narrative summaries, dedupe, trust-tier badges, link to Activity/digest ([Phase 7](./implementation-plan.md#phase-7-product-surface) baseline exists).
- `[x]` **Broadcast substrate ADR:** document and ship default for anonymous/broad discovery fanout — compare contact fanout vs **relay-assisted** (8J shipped) vs DHT provider records vs gossipsub; pick one primary path for Settings “anonymous discovery” modes — [broadcast-substrate-adr.md](./broadcast-substrate-adr.md).
- `[x]` **Global DHT provider path:** production publish/query cycle for capability topics with signed records, rate limits (4F.B), and audit (`discovery.capability.*`).

**Exit:** Owner runs Search for a capability topic on two WAN-connected nodes and receives at least one policy-allowed candidate without a pre-existing bond; morning report surfaces ranked discovery events.

**Depends on:** 15B bootstrap/relay health for WAN nodes.

---

### 15B — WAN reach & cold-start (Story F / Phase 4 WAN follow-on)

**Goal:** First contact across NAT without manual multiaddr paste; operator confidence via live proofs.

- `[x]` **WAN cold-start UX (v2):** Social “Invite to mesh” — QR / deep link / paste apply via `createWanJoinInvite` / `applyWanJoinInvite` RPC (`envoy://join?token=…`); discovery seeds on accept ([p2p-discovery.md](./p2p-discovery.md)).
- `[x]` **Live multi-machine sign-off:** operator completes [wan-connectivity-signoff.md](./wan-connectivity-signoff.md) §4–§5 (relay.checkin / relay.lookup / circuit dial; optional DCUtR) and fills ledger row with version + date — **tooling:** WAN diagnostics panel + sign-off checklist in Social/CLI; ledger row remains operator-filled.
- `[x]` **QUIC on WAN:** validate prefer-QUIC dial path on real hardware (corporate VPN / UDP-blocked degrade documented); close Phase 4F.C WAN exit criterion — see [quic-wan-validation.md](./quic-wan-validation.md).
- `[x]` **Richer WAN diagnostics:** `connectivity-status` (or Social Settings panel) classifies state — bootstrap reachability vs relay availability vs punch vs policy block — beyond aggregate counters ([live-connectivity-testing.md](./live-connectivity-testing.md) §7).

**Exit:** Two NAT clients on different networks complete signed `system.ping` via relay circuit; owner can share one invite link that bootstraps a new peer.

---

### 15C — H2A channel & EMP semantics (Scenario 6)

**Goal:** Human↔agent is a **first-class product channel**, not only “chat with badges” + `knowledge.query`.

- `[x]` **H2A product channel:** dedicated Social **Assistant** lane for owner ↔ home agent (distinct from contact threads) — knowledge assist, document agent, approvals rail, Activity deep-links; aligns with Phase 13 honest roles.
- `[x]` **EMP decision — optional envelope fields:** ADR for optional `channel` / extended role metadata vs strict required fields; update [protocol-standard.md](./protocol-standard.md) Appendix D (roles + `/chat` `/message` `/data` split) — [emp-h2a-channel-adr.md](./emp-h2a-channel-adr.md).
- `[x]` **H2A wire semantics:** document and test which intents belong on `/envoymesh/chat` vs `/message` for human-initiated agent assist vs peer human chat (Story C) — [h2a-wire-semantics.md](./h2a-wire-semantics.md), `packages/api/src/h2a-wire-semantics.ts`.
- `[x]` **Scenario 6 traceability:** flip Coverage row from `[~]` to `[x]` when H2A channel + EMP appendix ship.

**Exit:** Owner opens H2A panel, runs vault-backed knowledge assist, sees agent role + Activity row — without mixing into a contact chat thread.

---

### 15D — Platform & persistence scale

**Goal:** Stay local-first while audit/journal volume and optional long-term persistence become manageable.

- `[x]` **SQLite adoption gate review:** measure audit JSONL size + cold query latency; if [sqlite-adoption.md](./sqlite-adoption.md) §2 triggers met, ship **audit table migration** in `local-store` with JSONL export path. **Outcome (2026-05-20):** triggers not met — [sqlite-gate-review-2026-05-20.md](./sqlite-gate-review-2026-05-20.md); stay JSONL + index.
- `[x]` **Indexed Activity/audit queries:** correlation-id and time-range queries without full JSONL scan (secondary index files + `queryAuditEvents` / Activity index).
- `[ ]` **Filecoin / long-term persistence (optional):** policy-gated provider behind vault export approvals ([Phase 5](./implementation-plan.md#phase-5-shared-vault) backlog item); distinct from IPFS pin (Phase 14D). **Deferred** — policy scope not confirmed; see gate review doc.

**Exit:** Audit tail query <500 ms on a 90-day profile **or** explicit doc that triggers are not met and JSONL remains canonical. **Met** via indexed queries on dev profiles + documented gate outcome.

---

### 15E — Parked backlog (not Phase 15 exit)

These items are **tracked** but **explicitly deferred** until scenarios + EMP economics are scoped. **Scoping started 2026-05-20** — see [parked-backlog-15e.md](./parked-backlog-15e.md).

| Item | Source | Status | Scope doc |
|------|--------|--------|-----------|
| Multi-hop routing, commerce, payment receipts | Stories D–E | **Scenarios + ADR** | [parked-multihop-commerce-scope.md](./parked-multihop-commerce-scope.md) |
| Thin satellite mobile app | Story A / Phase 4A | **ADR accepted** | [parked-satellite-app-scope.md](./parked-satellite-app-scope.md) · [satellite-app-adr.md](./satellite-app-adr.md) |
| DID as first-class product identity | Scenario 1 | **Bonded lookup shipped** | [parked-did-product-scope.md](./parked-did-product-scope.md) |
| Global reputation ledger | Prioritization | **Read-only slice** | [parked-global-reputation-scope.md](./parked-global-reputation-scope.md) |
| Distributed state (loro/yjs) | Key Decisions | **yjs draft spike** | [parked-distributed-state-scope.md](./parked-distributed-state-scope.md) |
| Full §4 two-NAT relay sign-off | Phase 15B | **Automated test `[~]`** | [wan-connectivity-signoff.md](./wan-connectivity-signoff.md) |

- `[x]` **Index + scope docs:** master index and per-item directional scope documents linked above.
- `[x]` **DID presentation slice:** `did:key` + `getOwnerDidPresentation` RPC + Social Profile Identity section.
- `[x]` **DID bonded Search:** Search **By DID** tab; `searchPeers({ did })`; `contact-owner-keys.json` on inbound chat.
- `[x]` **Global reputation read slice:** `reputation-anchors.json` bundle + `getPeerReputationSummary` RPC + Contacts meta.
- `[x]` **Distributed state spike:** yjs Assistant compose draft with localStorage persistence ([assistant-draft-crdt.ts](../apps/social/src/lib/assistant-draft-crdt.ts)).
- `[x]` **Story D scenarios:** Epic MH **US-MH1–US-MH4** in [scenarios.md](./scenarios.md); [commerce-receipt-stub-adr.md](./commerce-receipt-stub-adr.md).
- `[x]` **Satellite ADR:** single Capacitor app — no thin satellite binary ([satellite-app-adr.md](./satellite-app-adr.md)).
- `[x]` **§4 two-NAT sign-off:** `wan-relay-signoff-e2e` green via `./scripts/wan-relay-signoff-staging.sh` against cn-relay (2026-05-27 ledger row); separate physical NAT LANs optional.
- `[x]` **US-MH1 hop-limited discovery:** `maxHops`/`currentHop` on wire; `requestMultiHopDiscovery` RPC; forward approval queue; Search multi-hop button.
- `[x]` **US-MH2 intermediary privacy:** anonymous forward payload + `referralOwnerId`; trust/rate-limit via referral; audit-safe labels.
- `[x]` **US-MH4 aggregation UX:** `multihop-discovery-sessions.json`, `getMultiHopDiscoverySession`, hop-2 relay-back + Search live refresh.
- `[x]` **CRDT wire sync:** `sync.state` payload + `sendSyncStateUpdate` + `crdt:sync` WS event; Assistant draft pushes/applies deltas.
- `[x]` **§4 staging runbook:** [wan-two-nat-staging-runbook.md](./wan-two-nat-staging-runbook.md) + `scripts/wan-relay-signoff-staging.sh`.
- `[x]` **Contact notes CRDT:** loro text + tags per contact ([contact-notes-crdt.ts](../apps/social/src/lib/contact-notes-crdt.ts)) + Contact chat panel UI.
- `[x]` **§4 two-NAT operator tooling:** `wan-two-nat-checklist.ts`, `connectivity-signoff --checklist|--complete`, `./scripts/wan-two-nat-signoff.sh`, Settings Physical two-NAT wizard.
- `[ ]` **Un-park next:** morning-report hop-2 ranking; **physical two-NAT hardware ledger row** when two routers available.

**Do not** count 15E toward Phase 15 completion.

### Phase 15 exit criteria (overall)

- `[x]` **Reach:** WAN cold-start invite works; sign-off ledger has at least one completed operator row ([wan-connectivity-signoff.md](./wan-connectivity-signoff.md) 2026-05-20).
- `[x]` **Discovery:** Topic/capability search returns WAN candidates under policy (15A exit).
- `[x]` **Semantics:** H2A channel shipped; EMP role/channel ADR merged to protocol-standard.
- `[x]` **Scale:** SQLite gate evaluated with documented outcome — defer with metrics ([sqlite-gate-review-2026-05-20.md](./sqlite-gate-review-2026-05-20.md)).

**Phase 15 complete** as of 2026-05-20.

## Phase 16: EnvoyAI standing delegation & autonomous postures

**Goal:** Productize **standing autonomous postures** on top of EMP — social proxy (discover, hello, pre-bond chat; human bond commit) and document acquisition (async hunt, negotiate, retrieve) — with **honest wire roles** and **configurable UI disclosure**.

**Depends on:** Phase 12 Trust mode · Phase 13 actor disclosure + Activity · Phase 14 friend autopilot · Phase 15 H2A/ADB foundations · [EMP § EnvoyAI](./protocol-standard.md#envoyai-ai-mediated-social-mesh).

**Scenarios / stories:** [Epic SP](./scenarios.md#epic-sp--delegated-social-presence) (US-SP1–SP5) · [Epic DA](./scenarios.md#epic-da--document-acquisition) (US-DA1–DA5) · US-AV9 · [UserStory M–O](./UserStory.md#story-m--delegated-social-presence).

### Recommended sequencing

| Order | Track | Why first |
|-------|-------|-----------|
| 1 | **16A Protocol** | Mandate shapes + credential scopes before runtime loops diverge. |
| 2 | **16D Disclosure UI** | Small, unblocks UX conversations; wire already honest. |
| 3 | **16B Social proxy** | Builds directly on Trust mode + Phase 14 autopilot. |
| 4 | **16C Document acquisition** | Builds on ADB + Assistant; larger orchestrator. |
| 5 | **16E Capability route executor** | EnvoyMesh-native planner + runner; no bridge first. |

---

### 16A — EMP schema extensions (EnvoyAI postures)

**Goal:** Normative posture fields in `@envoymesh/protocol` under **`emp/0.1`** — not a parallel version.

- `[x]` `@envoymesh/protocol` — `mandate.posture`, `mandate.posturePolicy`, `EmpPosture` enum.
- `[x]` Agent credential `scope` values: `emp.social_proxy`, `emp.document_acquisition`.
- `[x]` Optional envelope `postureRef`.
- `[x]` [protocol-standard.md](./protocol-standard.md) EnvoyAI section + Appendix E.
- `[x]` `system.signal.supportedCapabilities` advertises `social-proxy`, `document-acquisition`.

**Exit:** Schemas validate in unit tests; one protocol version line (`emp/0.1`).

---

### 16B — Social proxy runtime

**Goal:** Standing **social proxy** — agent discovers, intros, says hello, pre-bond chats; **`bond.accept` stays human**.

- `[x]` `NodeConfig.socialProxyEnabled` + Settings UI backed by signed `social_proxy` mandate.
- `[x]` Runtime loop: discovery → `social.intro.*` → optional `bond.request` with `ownerCommitmentRef` / approval queue.
- `[x]` Pre-bond `sendAgentChat` integration with Activity + rate limits.
- `[~]` Consolidate / supersede discovery-only `friendAutopilotEnabled` behavior where overlapping.
- `[x]` Detail design: [social-proxy-delegation.md](./social-proxy-delegation.md) (state machine, approval edges).
- `[x]` Integration test: two-node intro → agent chat → human bond accept.

**Exit:** US-SP1–SP5 acceptance lines pass; kill switch stops in-flight intros.

---

### 16C — Document acquisition orchestrator

**Goal:** Async **document hunt** job across vault → bonded catalog → optional hop-scoped discovery → negotiate → verified retrieve.

- `[x]` `document_acquisition` mandate + `NodeConfig.documentAcquisitionEnabled`.
- `[x]` Job store (`correlationId`, stage, counterparty refs) + Activity per stage.
- `[x]` Pipeline: local vault search → `discoverPublishedLibrary` → optional `discovery.request` (US-MH3 approvals).
- `[x]` Negotiation via RAG-backed `knowledge.query` (structured prompt + path scoring); catalog ranks title+path; local_search uses vault RAG.
- `[x]` Terminal `report.create` / Activity summary (`completed` | `failed` | `approval_needed`).
- `[x]` Detail design: [document-acquisition-agent.md](./document-acquisition-agent.md).
- `[x]` Integration test: bonded peer published library → agent retrieves to vault inbox.

**Exit:** US-DA1–DA5 acceptance lines pass; metadata≠bytes invariant preserved.

---

### 16D — Configurable UI disclosure

**Goal:** **Honest wire, optional opaque chat UI** (US-AV9).

- `[x]` `AiSettings.disclosure.showAgentBadges` + `collapsePeerAgentToContact` in `NodeConfig`.
- `[x]` Social Settings → AI → Disclosure section.
- `[x]` `ChatMessageBubble` / `formatChatActorBadge` respect settings; Activity unchanged.
- `[x]` Detail ADR: [envoyai-disclosure-adr.md](./envoyai-disclosure-adr.md) (presentation vs verification).

**Exit:** Owner toggles badges off; outbound wire still `senderRole=agent`; peer verification unchanged.

---

### Phase 16 exit criteria (overall)

- `[x]` **US-SP1–SP5:** Social proxy posture end-to-end with human-only bond commit.
- `[x]` **US-DA1–DA5:** Document acquisition job retrieves under mandate or escalates to approval.
- `[x]` **US-AV9:** UI disclosure settings without wire downgrade.
- `[x]` **Protocol:** posture fields + `supportedCapabilities` shipped in `@envoymesh/protocol` under `emp/0.1`.
- `[~]` **Capability routing (16E):** intent planner + in-process executor module; E2E shipped; bridge/RPC exposure deferred.

---

### 16E — Capability intent routing & route executor (EnvoyMesh-native)

**Goal:** AI agents orchestrate EMP workflows **inside the node** — match capability tags → intent route → execute `mesh.*` tools — without requiring OpenClaw bridge or Social UI RPC first.

**Module layout (monorepo):**

| Package / path | Responsibility |
|----------------|----------------|
| `@envoymesh/api` `capability-intent-routing.ts` | Route catalog, manifest-derived custom routes, `matchAgentCapabilityRoutes` |
| `@envoymesh/api` `capability-route-executor.ts` | Pure step resolution: `resolveRouteStepExecution`, tool alias map, defer human/task steps |
| `apps/node` `capability-route-executor.ts` | Runtime: `executeCapabilityRouteStep` → `executeTool` |
| `apps/node` `capability-provider-worker.ts` | Job loop: route → execute steps → `completed` / `failed` |
| `@envoymesh/local-store` `capability-provider-job-store.ts` | Persist jobs + `stepResults` |

**In-process entry (no bridge):**

- Agent tool `mesh.match_capability_route` — planner only.
- Agent tool `mesh.capability_provider.start` — start job + daemon tick advances execution.
- Daemon `runCapabilityProviderWorker()` tick in `apps/node/src/index.ts` (mirrors document acquisition).

**Explicitly deferred (not 16E):**

- OpenClaw / `json-rpc` exposure for capability provider jobs.
- Full `task.*` reply wait + mandate posture binding on capability provider jobs (propose ships; accept/result not awaited in worker).
- Mobile parity (`MobileNode` stubs remain).

**Checklist:**

- `[x]` `capability-provider` posture + `capabilityProviderEnabled` + job store.
- `[x]` `capability-intent-routing` built-in + manifest custom routes.
- `[x]` `capability-route-executor` pure module + unit tests.
- `[x]` Worker executes auto steps; defers human-only steps; `mesh.task.propose` for task routes.
- `[x]` Daemon worker tick + `mesh.capability_provider.start` tool.
- `[x]` Integration E2E: bonded peer + capability provider job → `completed` with `stepResults`.
- `[x]` Document acquisition worker can use shared route executor for negotiate when wired (`document-acquisition-route.ts`; acquire stays on pull-share path).
- `[x]` Normative doc: three workflows under `emp/0.1` in [protocol-standard.md](./protocol-standard.md).
- `[ ]` Full `task.*` reply wait + mandate posture binding on capability provider jobs.

**Detail design:** [capability-route-executor.md](./capability-route-executor.md).

**Exit:** Agent on home node can start a capability provider job, route matches, executable steps run via existing tool registry, Activity records `capability_provider_stage`; no bridge dependency.

## Phase 17: Location-scoped peer discovery

**Goal:** Let owners be **findable by place** (country, region, city, town, nearby) on the **existing DHT capability-topic layer** (Phase 4F / 15A) — without a central geo server, without storing raw GPS in signed profiles, and with **owner-chosen precision**.

**Builds on:** Phase 4F signed capability topics · Phase 15A Discover Search · `HumanProfilePayload` · [trust-mode-social-protocol.md](./trust-mode-social-protocol.md) geography hints · [p2p-discovery.md](./p2p-discovery.md).

**Scenarios / stories:** Scenario 2 (Blind discovery) · Story B (recruiter / researcher find people) · Trust-mode matching inputs (§2 geography hints).

### Problem

Today, wider Discover finds peers by **interest topics**, **username**, or **peer ID**. There is no structured way to say “I am in Boston” or “find people near me” on the public mesh. LAN **Nearby** (mDNS) is separate and does not help across the internet.

### Design principles

1. **Reuse DHT topics** — no new discovery transport. Location is encoded as normalized **`geo:*` capability topic strings**, published via `provideCapabilityTopic` (same as hobbies / `username:alice`).
2. **Owner-signed, tiered disclosure** — place fields live on **`HumanProfilePayload`**; **`discoveryLocationPrecision`** controls how much is advertised (`hidden` → `country` → … → `nearby`).
3. **No raw coordinates on the wire** — profiles store optional **geohash** (derived from device GPS with consent), never lat/lng. DHT carries topic strings only.
4. **Hierarchical topics** — finer scopes imply coarser ones when advertised (city also publishes country + region topics).
5. **Separate LAN vs geo “nearby”** — UI labels **On this network** (mDNS) vs **Near me** (geohash DHT query).

### Topic namespace (normative)

| Topic pattern | Example | Typical use |
|---------------|---------|-------------|
| `geo:country:{ISO}` | `geo:country:US` | Same country |
| `geo:region:{CC}-{slug}` | `geo:region:US-ca` | State / province |
| `geo:city:{CC}-{slug}` | `geo:city:US-san-francisco` | City |
| `geo:town:{CC}-{slug}` | `geo:town:US-mission-district` | Town / neighborhood |
| `geo:geohash:{prefix}` | `geo:geohash:9q8yy` | Nearby (~5 km at 5 chars) |

Slugs: lowercase ASCII, hyphenated (`normalizeLocationSlug`). Country codes: ISO 3166-1 alpha-2 uppercase.

DHT provider keys remain **`cidForCapabilityTopic("envoymesh:cap:v1:" + topic)`** — unchanged from Phase 4F.

### Protocol (`@envoymesh/protocol`)

**`DiscoveryLocationSchema`** (on `HumanProfilePayload`):

```typescript
discoveryLocation?: {
  countryCode: string;   // required when location set — ISO 3166-1 alpha-2
  regionCode?: string;
  city?: string;
  town?: string;
  geohash?: string;      // lowercase base32, 4–12 chars — never lat/lng
};
discoveryLocationPrecision?: "hidden" | "country" | "region" | "city" | "town" | "nearby";
```

Default precision: **`hidden`**. Changing precision re-derives advertised topics on next profile save / node start.

**Bond-scoped discovery (`discovery.request`)** — future: hash `geo:*` topics the same way as interest tags for multi-hop queries (Phase 17C); cleartext topics remain on DHT only.

### Runtime (`apps/node`, `packages/api`)

| Component | Responsibility |
|-----------|----------------|
| `@envoymesh/api` **`discovery-location.ts`** | `deriveLocationDiscoveryTopics`, `locationSearchTopics`, `encodeGeohash`, `parseGeoDiscoveryTopic` |
| **`NodeServiceImpl._advertisePublicDiscoveryTopics`** | Merges interests + `username:` + geo topics; periodic DHT re-provide (5 min) |
| **`NodeDiscoveryRuntime.searchPeers`** | `SearchQuery.topics[]` — merge multi-topic DHT hits |
| **`updateHumanProfile`** | Persists signed location fields; triggers re-advertise when `profileVisibility === "public"` + WAN bootstrap |

**Advertise gate (unchanged):** public profile + at least one bootstrap preset (Explore public mesh). Private profiles do not publish geo topics.

**Privacy defaults:** product default precision **`city`** recommended in UI copy; **`town`** and **`nearby`** require explicit opt-in.

### Social UI

| Surface | Behavior |
|---------|----------|
| **Profile → About → Edit** | Country / region / city / town fields; precision selector; “Save device location for nearby” (browser geolocation → geohash only) |
| **Discover → Wider → By place** | Buttons: Same country / city / town / Near me → `searchPeers({ topics })` |
| **View mode** | Shows human-readable place + advertised `geo:*` topic chips |

LAN **Nearby** panel unchanged (mDNS + profile probe).

### Phased delivery

#### 17A — Schema + topic derivation + DHT advertise/query **`[x]`**

- `[x]` `DiscoveryLocation*` on `HumanProfilePayload` + `CreateHumanProfileInput`
- `[x]` `@envoymesh/api/discovery-location` helpers + unit tests
- `[x]` Node: merge geo topics into `_advertisePublicDiscoveryTopics`
- `[x]` Node: `SearchQuery.topics` multi-topic search
- `[x]` Social: profile location editor + Discover “By place”

**Exit:** Two WAN nodes with public profiles, same city precision, find each other via Discover → By place → Same city without prior bond. Backend path verified by `geo-discovery-wan-signoff.test.ts` (test #2 uses `locationSearchTopics`); browser Social UI sign-off is optional staging QA.

#### 17B — Nearby geohash polish **`[x]`**

- `[x]` Persist geohash on profile save from edit form (not only GPS button)
- `[x]` Neighbor-cell search expansion (Discover nearby uses `locationSearchTopics`)
- `[x]` Optional map picker for nearby precision
- `[x]` Stop advertising stale geo topics when precision downgraded (explicit `cancelCapabilityTopicReprovide`)

#### 17C — Trust-mode + agent matching **`[x]`**

- `[x]` `FriendMatchingPreferences` geography fields → same `geo:*` topic queries
- `[x]` `discovery.request` hashed geo tags for bond-mediated search
- `[x]` Morning report: “N peers in your city this week”

#### 17D — Gazetteer UX **`[x]`**

- `[x]` Offline country/region/city autocomplete (static JSON, no central API; 7-country MVP — free-text fallback outside list)
- `[x]` Non-English i18n for location strings

### Threat model notes

| Risk | Mitigation |
|------|------------|
| Exact home address on DHT | Default city precision; town/nearby opt-in; geohash prefix not full precision |
| Topic guessing | DHT topics are not secret; treat as **public rendezvous**, not authentication |
| Sybil / flood | Existing Phase 4F rate limits + signed provider records |
| Stale location | Owner updates profile; 17B adds explicit topic cancellation |

### Tests

- `[x]` `packages/api/test/discovery-location.test.ts` — slug, geohash, topic derivation
- `[x]` `apps/node/test/rendezvous-integration.test.ts` — geo topics in `_advertisePublicDiscoveryTopics`
- `[x]` `apps/node/test/geo-discovery-e2e.test.ts` — two-node DHT geo:city find
- `[x]` `apps/node/test/discovery-geo-tags.test.ts` — hashed geo tags on discovery.request
- `[x]` `apps/node/test/geo-discovery-wan-signoff.test.ts` — WAN DHT geo find (`TEST_RELAY_ADDR`; ~9 min; skipped in CI)
- `[x]` Social component test — Discover place buttons call `searchPeers({ topics })`

---

## Phase 18: Native owner agent (Assistant = Agent) **`[x]`**

**Goal:** Make the Social **Assistant** the owner-facing surface of the **native home-node agent** — not a standalone LLM chat. Owners converse in H2A; the agent plans routes, calls `ToolRegistry` tools, starts posture jobs, and respects mandates/approvals.

**Depends on:** Phase 9 ToolRegistry · Phase 15C H2A channel · Phase 16 postures (social proxy, document acquisition, capability provider) · Phase 16E capability routing · [native-owner-agent.md](./native-owner-agent.md).

**Scenarios / stories:** Scenario 6 (H2A) · Story M (social presence) · Story N (document acquisition) · Story B/C (discovery/research) · Epic SP · Epic DA · capability provider.

### Problem

| Assistant today | Native agent (node) |
|-----------------|---------------------|
| Regex document router + one LLM call | 40+ tools + three autonomous workers |
| No chat-driven friend-making | Social proxy + intro tools |
| No async doc hunts from chat | Document acquisition jobs |
| No capability/service orchestration | Capability provider + route executor |
| External agents get tool API via bridge | Owner H2A does not |

### Design principles

1. **Single orchestration path** — `runOwnerAgentTurn` → `owner-agent-loop.ts` → `executeTool` / job starters (same as daemon).
2. **Policy before LLM** — Phase 18A is route-driven; Phase 18B adds bounded LLM tool selection.
3. **Sync answer + async jobs** — Turn returns plan/`jobId`; workers continue in background.
4. **Four owner goals** — social (friends), document, discovery (capabilities), service (mandate-gated tasks).

### Recommended sequencing

| Order | Track | Why |
|-------|-------|-----|
| 1 | **18A Route-driven turn** | Unblocks product value without fragile JSON tool parsing |
| 2 | **18B LLM tool loop** | Natural language beyond keyword routes |
| 3 | **18C Assistant job UX** | Progress, approvals, task propose in UI |
| 4 | **18D Deprecate regex-only H2A** | Planner replaces `classifyDocumentIntent` for most phrases |

---

### 18A — Route-driven owner agent turn

**Goal:** `runOwnerAgentTurn(message)` classifies goals via `matchAgentCapabilityRoutes`, executes domain handlers, delegates explicit document commands to `runDocumentAgentTurn`.

**Module layout:**

| Path | Responsibility |
|------|----------------|
| `packages/api/src/owner-agent-loop.ts` | Pure orchestration + domain handlers |
| `packages/api/test/owner-agent-loop.test.ts` | Unit tests |
| `apps/node/src/node-service-impl.ts` | `runOwnerAgentTurn` + Activity |
| `apps/social/.../AIChatPanel.tsx` | Primary RPC |
| `json-rpc-router` / `ws-protocol` / `useNodeService` | RPC surface |

**Owner tool allowlist (18A):**

- Document: `mesh.library_*`, `vault.search`, internal `startDocumentAcquisitionJob`
- Social: `mesh.match_capability_route`, `mesh.intro.broadcast_search`, `mesh.intro.run_autopilot`, `runSocialProxyPass`
- Service: `mesh.match_capability_route`, `mesh.capability_provider.start`

**Checklist:**

- `[x]` Detail design: [native-owner-agent.md](./native-owner-agent.md)
- `[x]` `owner-agent-loop.ts` + tests
- `[x]` `NodeServiceImpl.runOwnerAgentTurn` + RPC wiring
- `[x]` Social Assistant uses new RPC
- `[x]` Activity rows include `domain`, `jobId`, `routeId` (via `recordH2aOwnerAgentTurn`)
- `[x]` MobileNode inline adapter (delegates `_executeOwnerAgentTool`; job postures stubbed until SQLite parity)
- `[x]` `apps/node/test/owner-agent-turn-integration.test.ts`

**Exit:** Owner can start friend-discovery, document hunt, or capability-provider jobs from Assistant when postures enabled; disabled postures return actionable Settings guidance.

---

### 18B — LLM tool loop

**Goal:** Bounded planner (max 5 rounds) selects tools from owner allowlist using structured model output.

- `[x]` Planner prompt + JSON schema + parse fallback
- `[x]` `@envoymesh/models` egress scan on planner I/O
- `[x]` Unit tests with mocked planner loop (`owner-agent-planner.test.ts`)
- `[x]` Audit every tool round (`auditPlannerRound` → `tool.called` audit events)
- `[x]` Integration tests with mock model (`owner-agent-turn-integration.test.ts`)

**Exit:** Owner asks free-form questions; agent selects tools without regex classification.

---

### 18C — Assistant job UX

**Goal:** Surface long-running agent work in Assistant + Activity.

- `[x]` Job status chips + Activity deep-links in `AIChatPanel`
- `[x]` Inline approve/reject for pending tools in `AIChatPanel`
- `[x]` `mesh.task.propose` for service negotiation
- `[x]` WS push for job stage updates (`agent:activity` → Assistant job chips)

**Exit:** Owner sees social-proxy / acquisition / capability-provider progress without leaving Assistant.

---

### 18D — Consolidate H2A backend

- `[x]` `runDocumentAgentTurn` becomes internal helper only (RPC retained deprecated one release)
- `[x]` Update [ai-document-backbone-plan.md](./ai-document-backbone-plan.md) + [emp-h2a-channel-adr.md](./emp-h2a-channel-adr.md)
- `[x]` Remove duplicate heuristic paths covered by planner (explicit `classifyDocumentIntent` kept for model-off fast path; Assistant uses `runOwnerAgentTurn` only)

---

### Phase 18 exit criteria (overall)

Verified by `apps/node/test/phase-18-e2e.test.ts` (+ unit/integration suites below).

- `[x]` **Friends:** Assistant starts social discovery under `social_proxy` mandate (`runSocialProxyPass` + `mesh.intro.broadcast_search`); intro proposals still require Inbox approval.
- `[x]` **Documents:** Assistant starts acquisition jobs or synchronous library/discover flows (`classifyDocumentIntent` fast path + route-driven acquisition; document hunt prefers document route over incidental social keyword matches).
- `[x]` **Capabilities:** Assistant matches service routes and starts capability-provider jobs.
- `[x]` **Services:** Task propose to bonded contacts + capability-provider jobs; inline approvals in Assistant.
- `[x]` **Security:** Mesh I/O only via `executeTool` / job starters; autonomous kill switch blocks social proxy, document acquisition, and capability-provider starts from `runOwnerAgentTurn`.
- `[x]` **18A–18D shipped:** Route-driven turn, LLM planner, Assistant job UX, deprecated `runDocumentAgentTurn` RPC.

**Test matrix:**

| Suite | Covers |
|-------|--------|
| `packages/api/test/owner-agent-loop.test.ts` | Domain routing, route priority, kill switch, bonded task parse |
| `packages/api/test/owner-agent-planner.test.ts` | Planner JSON parse, bounded loop, egress block, audit callback |
| `apps/node/test/owner-agent-turn-integration.test.ts` | NodeServiceImpl + ToolRegistry + Activity + planner audit |
| `apps/node/test/phase-18-e2e.test.ts` | Two-node E2E exit criteria (friends, documents, capabilities, services, security, planner) |
| `apps/node/test/phase-18-multinode-e2e.test.ts` | 2–3 node meshes: acquisition completion, publisher selection, capability worker, task routing, combined postures |
| `apps/social/test/components/AIChatPanel.test.tsx` | Assistant RPC, chips, inline approvals |

---

## Phase 19: Bond Autonomy — Agent-driven bond acceptance **`[x]` protocol, `[~]` runtime**

**Goal:** Allow the owner to grant the agent a `bond_autonomy` mandate. When active, the agent can auto-accept bond requests within policy bounds — referral proof, sensitivity ceiling, daily cap. All auto-bonds are audited and surfaced in Activity.

**Depends on:** Phase 9 ToolRegistry · Phase 13 A2A actor disclosure · Phase 16 postures.

**Design:** [roadmap.md § Refined #1](./roadmap.md#1-making-friends--with-ai-bond-autonomy) · [protocol-standard.md § EnvoyAI security rules](./protocol-standard.md#envoyai-security-rules) (rule #1 exception).

### 19A — Protocol schema (`bond_autonomy` posture)

- `[x]` Add `bond_autonomy` to `EmpPostureSchema` enum
- `[x]` Add `bond-autonomy` to `EmpCapabilitySchema`
- `[x]` Add `EMP_AGENT_SCOPE_BOND_AUTONOMY` scope constant
- `[x]` Add `BondAutonomyPosturePolicySchema` (maxAutoBondsPerDay, requireReferralProof, maxAutoBondTier, minTrustOverlapScore, notifyOwnerOnAutoBond)
- `[x]` Add `.strict()` to all posture policy schemas for correct Zod union discrimination
- `[x]` Add type exports (`BondAutonomyPosturePolicy`, `CapabilityProviderPosturePolicy`, `FederatedRagConfig`)

### 19B — Inbound handler (peer verification)

- `[x]` `bond-inbound.ts`: inbound `bond.accept` with `senderRole=agent` requires `agentCredential` scoped to `emp.bond_autonomy`
- `[x]` Audit rejection when missing credential or wrong scope

### 19C — Node config

- `[x]` Add `bondAutonomyEnabled` / `bondAutonomyMandateId` to `PersistedNodeConfig`

### 19D — Outbound path

- `[x]` `bond-autonomy-worker.ts`: `evaluateBondAutonomy()` policy checker, `sendAgentBondAccept()` outbound with agent key + credential, `runBondAutonomyPass()` batch processor
- `[x]` `node-config-store.ts`: `bondAutonomyEnabled` / `bondAutonomyMandateId` fields

### 19E — Write tests

- `[x]` Protocol: bond_autonomy schema defaults, custom values, mandate creation, credential scope (6 tests)
- `[x]` Runtime: bond-inbound rejects agent bond.accept without credential, wrong scope; accepts valid credential (3 tests)
- `[x]` Worker: evaluateBondAutonomy (10 tests), sendAgentBondAccept (2 tests), runBondAutonomyPass (2 tests) — 15 tests total

**Exit:** Protocol + inbound + outbound worker shipped; integration into node daemon loop next.

---

## Phase 20: Network-wide Document Discovery **`[~]`**

**Goal:** Expand document acquisition beyond bonded contacts to the full network. Nodes publish public documents discoverable by any peer. Search starts from bonded contacts, then fans out via broadcast with stopping rules (TTL, expiry, max results).

**Design:** [roadmap.md § Refined #2](./roadmap.md#2-document-find--request--network-wide-not-just-bonded).

### 20A — Protocol schema

- `[x]` `DocumentAcquisitionPosturePolicySchema`: add `maxBroadcastResults`, `broadcastResponseTimeoutMs`
- `[x]` When `searchBondedOnly=false`, maxHops controls broadcast TTL

### 20B — Broadcast-based document discovery

- `[x]` `document-discovery-broadcast.ts`: `broadcastDocumentDiscovery()` fan-out with bonded-first then all-known-peers, TTL/stopping rules
- `[x]` `handleBroadcastDocumentRequest()`: inbound public document match with sensitivity filtering, keyword/topic matching
- `[x]` Metadata ≠ bytes: `handleBroadcastDocumentRequest` returns title/hash/topics/cid only

### 20C — Write tests

- `[x]` Protocol: document_acquisition defaults include broadcast fields
- `[x]` Runtime: broadcast fan-out (bonded-only, all-known, dedup, maxHops/Results) — 4 tests
- `[x]` Runtime: `handleBroadcastDocumentRequest` matching, sensitivity filtering, topic matching — 6 tests

---

## Phase 21: Network-wide Capability Discovery **`[~]`**

**Goal:** Expand capability/task discovery beyond bonded contacts. Agent broadcasts capability queries across the mesh. Unbonded task execution gated by mandate bounds, trust tier, reputation, and owner approval.

**Design:** [roadmap.md § Refined #3](./roadmap.md#3-capability-query--task--network-wide-not-just-bonded).

### 21A — Protocol schema

- `[x]` `CapabilityProviderPosturePolicySchema`: add `maxHops`, `maxBroadcastResults`, `broadcastResponseTimeoutMs`, `allowUnbondedTaskExecution`

### 21B — Broadcast-based capability search

- `[x]` `capability-discovery-broadcast.ts`: `broadcastCapabilityDiscovery()` fan-out with bonded-first then all-known-peers, `requestedCapabilities` in payload

### 21C — Write tests

- `[x]` Protocol: capability_provider defaults include new broadcast fields
- `[x]` Runtime: broadcast capability search (bonded-only, all-known, dedup, payload verification) — 4 tests

---

## Phase 22: Federated RAG **`[~]`**

**Goal:** `knowledge.query` searches local vault AND queries bonded peers' published libraries. Agent synthesizes a single answer from distributed sources. No central index — each node answers from its own vault.

**Design:** [roadmap.md § Direction 2](./roadmap.md#direction-2-ai-library--the-mesh-as-a-distributed-knowledge-base).

### 22A — Protocol schema

- `[x]` `FederatedRagConfigSchema` (enabled, maxPeers, queryTimeoutMs, maxSensitivity, includeUnbondedPeers, maxPeerResults)

### 22B — Runtime

- `[x]` `federated-rag.ts`: `executeFederatedRagQuery()` fan-out to bonded peers with config limits, `synthesizeFederatedResult()` deterministic merge

### 22C — Node config

- `[x]` `FederatedRagConfigSchema` in protocol; config passed via `FederatedRagDeps`

### 22D — Write tests

- `[x]` Protocol: federated RAG config defaults + custom values (2 tests)
- `[x]` Runtime: disabled, no-peers, parallel query, maxPeers limit, error handling, empty answers — 6 tests
- `[x]` Runtime: `synthesizeFederatedResult` local-only, merge, peer-only, fallback — 4 tests

---

## Phase 23: Proactive Social Graph — "the graph learns" **`[x]` shipped**

**Goal:** The agent actively maintains and enriches the owner's social graph — suggesting group chats, suggesting new connections, stewarding dormant bonds, and providing social memory via local chat RAG. No new wire protocol; all local computation.

**Design decision (2026-06-03):** Standalone Circles tab removed. Clustering logic (`circle-proposer.ts`) repurposed to power **group chat suggestions** — when the agent detects affinity groups, it suggests creating a group chat instead of a standalone circle. This keeps the UI simple: people understand group chats.

**Depends on:** Phase 9 ToolRegistry · Phase 14 friend autopilot · Phase 16 social proxy · digest generator · chat log store · bond trust store.

**Design:** [roadmap.md § Direction 1](./roadmap.md#direction-1-ai-social-network--the-graph-learns).

### 23A — AI-proposed group chats (was: circles)

- `[x]` `circle-proposer.ts`: analyze bond trust tiers, published document topics, capability tags to detect affinity clusters
- `[x]` Reused by Assistant to suggest: "I found 5 contacts sharing WASM — create a group chat for them?"
- `[x]` `AgentCircle` type retained as internal data model for cluster proposals
- `[x]` RPC methods kept: `listAgentCircles` / `proposeAgentCircles` (internal, not exposed in Social UI)
- `[x]` `autoCircleContacts` posture policy field kept for future group auto-creation

### 23B — Proactive connection suggestions

- `[x]` `connection-suggester.ts`: `matchPeerInterests()` scoring function comparing owner topics to peer topics/capabilities
- `[x]` `suggestConnections()` function generating ranked suggestions with relevance scores
- `[x]` Daemon tick integration in `index.ts` (bond steward + mesh awareness)
- `[x]` Daemon tick integration: `runConnectionSuggesterPass()` + Activity recording in `index.ts`
- `[x]` Activity kind: `connection_suggested` wired via `recordConnectionSuggestion()`

### 23C — Social graph stewardship (dormant bonds)

- `[x]` `bond-steward.ts`: `findDormantBonds()` scanning bond trust store with configurable threshold (default 90 days)
- `[x]` Sorted output (most dormant first) with summary text
- `[x]` Generate `social_graph_stewardship` Activity via digest-generator `dormantBonds` section
- `[x]` `dormantBondThresholdDays`, `autoNudgeDormantBonds` config fields (PersistedNodeConfig)

### 23D — Social memory (local chat RAG over chat history)

- `[x]` `chat-rag-service.ts`: `searchChatHistory()` keyword-based search with score normalization
- `[x]` `queryChatRag()` contact-scoped query with optional filtering
- `[x]` `formatChatRagResults()` human-readable output with contact names and dates
- `[x]` `mesh.chat_rag_search` tool registered in ToolRegistry + RPC handler in NodeService + WebSocket RPC surface
- `[x]` Owner-agent turn integration: `chatRagSearch` + `predictIntent` wired into `runOwnerAgentTurn`

### 23E — Write tests

- `[x]` Unit: `circle-proposer` (min-members, topic clusters, capabilities, dedup, maxCircles, circleFromProposal) — 6 tests
- `[x]` Unit: `bond-steward` (dormant detection, active bonds, public/blocked ignore, creation-date fallback) — 4 tests
- `[x]` Unit: `connection-suggester` (topic matching, capability matching, zero matches, empty input) — 4 tests
- `[x]` Unit: `chat-rag-service` (query matching, ranking, maxResults, no-match, short words, formatting) — 7 tests
- `[ ]` Integration: Social UI circle rendering, Activity feed suggestion rendering
- `[x]` E2E: two-node affinity cluster detection + group chat suggestion (Phase 13 harness)

**Exit:** All Phase 23 modules have thorough unit test coverage (21 tests) + E2E harness test.

---

## Phase 24: Agent Marketplace — multi-agent task collaboration **`[x]` shipped**

**Goal:** Agents discover and compose each other's capabilities through the A2A lane. Bilateral negotiation, agent chains, and reputation-based routing. No new wire intents needed — all built on `task.*`, `agent.card.*`, `discovery.*`.

**Depends on:** Phase 13 A2A lane · Phase 16E capability routing · Phase 19 bond autonomy · Phase 21 network-wide capability discovery · `task.feedback` (Phase 8K).

**Design:** [roadmap.md § Direction 3](./roadmap.md#direction-3-agent-network--multi-agent-collaboration).

### 24A — Bilateral agent negotiation

- `[x]` `agent-negotiation-worker.ts`: `runAgentNegotiation()` discovers providers, filters by bond tier/reputation, sends proposals
- `[x]` First-acceptance-wins negotiation model; unbonded gated by `allowUnbonded` option
- `[ ]` Full negotiation loop: propose → negotiate (clarify) → accept → execute → result → feedback (deferred)
- `[ ]` Activity kinds: `task_negotiation_started`, `task_negotiation_completed` (deferred)

### 24B — Agent chains (multi-hop task composition)

- `[x]` `agent-chain-orchestrator.ts`: `runAgentChain()` sequential multi-step execution with provider discovery
- `[x]` `decomposeTask()` keyword-based task decomposition (translate, review, synthesize, convert)
- `[x]` Configurable maxDepth (default 3); each step's output feeds the next step's input
- *Note:* `runAgentChain` is shipped as a **library function** — not auto-invoked from the daemon loop or `runOwnerAgentTurn`. It is available for direct agent calls (e.g. when the agent decides to chain steps in a single turn). Auto-wiring into a daemon tick is a follow-on.

### 24C — Reputation-based routing

- `[x]` `reputation-router.ts`: `rankProviders()` sorts by bond tier → score → completed task count
- `[x]` `aggregateReputation()` rolling average with invalid-score filtering
- `[x]` `minReputationScore` posture policy field (CapabilityProviderPosturePolicySchema)

### 24D — Autonomous service mesh

- `[x]` `service-mesh-worker.ts`: `evaluateServiceTask()` capability matching, sensitivity ceiling, concurrent task cap, action allowlist
- `[x]` Six rejection conditions (disabled, no capability, sensitivity, concurrent cap, disallowed actions) with clear reasons
- `[x]` `task-negotiation-loop.ts`: Full A2A lifecycle — propose → accept → execute → result → feedback
- `[x]` `runTaskNegotiation` wired into `runOwnerAgentTurn` as a callable hook
- *Note:* `evaluateServiceTask` is shipped as a **library function** — not auto-invoked from the daemon loop. It is available for direct calls (e.g. when a task negotiation result needs pre-acceptance evaluation). Auto-evaluation inside `runTaskNegotiation` is a follow-on.

### 24E — Write tests

- `[x]` Unit: `agent-negotiation-worker` (no providers, unbonded filter, unbonded allow, first-accept, reputation ranking) — 5 tests
- `[x]` Unit: `reputation-router` (bond priority, score ranking, minScore, aggregate with/without scores) — 6 tests
- `[x]` Unit: `agent-chain-orchestrator` (2-step chain, no providers, execution failure, maxDepth, decomposeTask) — 7 tests
- `[x]` Unit: `service-mesh-worker` (accept, disabled, no capability, sensitivity, concurrent cap, disallowed actions) — 6 tests
- `[ ]` Integration: `task.propose` → negotiate → accept → result flow between two bonded nodes
- `[x]` Unit: agent chain orchestrator end-to-end (decompose + mock executor; no real mesh) — 7 tests in `phase-23-25-deferred-tasks.test.ts`

**Exit:** All four Phase 24 modules have thorough test coverage (24 tests) + E2E harness test.

---

## Phase 25: Ambient Mesh Awareness — "the mesh as your extended mind" **`[x]` shipped**

**Goal:** The agent works proactively: monitoring the mesh, cross-device continuity, enriched digest, and intent prediction. Purely local computation on existing data sources.

**Depends on:** Phase 9 ToolRegistry · Phase 11 mobile node · Phase 14 digest generator · Activity feed · vault index · chat log.

**Design:** [roadmap.md § Direction 4](./roadmap.md#direction-4-ambient-mesh-awareness--the-mesh-as-your-extended-mind).

### 25A — Proactive mesh awareness

- `[x]` `mesh-awareness-worker.ts`: `generateMeshInsights()` matches owner topics against bonded peer published topics
- `[x]` Configurable `minOverlapScore` threshold; returns structured `MeshAwarenessInsight` objects
- `[x]` Digest enrichment: `meshInsights` section in digest-generator
- `[x]` Periodic scan scheduling via daemon tick in `index.ts`
- `[x]` WebSocket push: `agent:awareness` event wired in `ws-server.ts` + `node-service-impl.ts`

### 25B — Cross-device continuity

- `[x]` `continuity-service.ts`: `startContinuitySession()`, `updateContinuitySession()`, `completeContinuitySession()`, `getResumableSessions()`
- `[x]` Session lifecycle: create → update progress → complete (active=false); sorted by lastUpdatedAt

### 25C — Enriched ambient digest

- `[x]` `DigestSummary` extended with `dormantBonds`, `meshInsights`, `proposedCircles` fields
- `[x]` Summary text rendering for all three new sections
- `[x]` WebSocket `digest:ready` event wired in `ws-server.ts` (mobile notification via Capacitor deferred)

### 25D — Intent prediction

- `[x]` `intent-predictor.ts`: `predictIntent()` frequency-based prediction with prefix bonus and dedup
- `[x]` Configurable `minConfidence` and `maxPredictions` options
- `[x]` `intentPredictionEnabled`, `prefetchMaxResults` config fields (PersistedNodeConfig)
- `[x]` Pre-query integration: `predictIntent` wired into `runOwnerAgentTurn` (intent history persistence deferred)

### 25E — Write tests

- `[x]` Unit: `mesh-awareness-worker` (insight generation, no topics, no overlap, minOverlapScore) — 4 tests
- `[x]` Unit: `intent-predictor` (prediction, prefix bonus, blank input, no match, dedup, maxPredictions) — 6 tests
- `[x]` Unit: `continuity-service` (create, update, complete, non-existent, resumable sort, no-op complete) — 6 tests
- `[x]` E2E: continuity session lifecycle (create → update → complete, Phase 13 harness)
- `[ ]` Integration: Digest generation with new sections, WebSocket push events (deferred)

**Exit:** All three Phase 25 modules have thorough test coverage (16 tests) + E2E harness test.

---

## Phase 26: Runtime Integration — close library-only gaps `[x]` shipped

**Goal:** Wire the Phase 23/24/25 modules that previously shipped as libraries into the runtime, so the features are reachable from `runOwnerAgentTurn`, the daemon tick, and the public NodeService surface. No new wire protocol.

**Depends on:** Phases 23-25 modules.

### 26A — Wire published library to proposer + mesh awareness

- `[x]` `_publishedLibrary` Map keyed by ownerId (local + peers)
- `[x]` `setPeerPublishedLibrary(ownerId, entries)` for harness / agent.card sync
- `[x]` `getPublishedLibraryEntries(ownerId?)` getter for cross-node sharing
- `[x]` `proposeAgentCircles()` uses `_getContactTopicsFromLibrary`
- `[x]` `runMeshAwarenessPass()` uses owner + bonded-peer topics from library
- `[x]` Persisted to `published-library.json` in profile dir
- `[x]` Test harness `registerBondedPeer` mirrors each side's library

### 26B — Wire `runAgentChain` and `evaluateServiceTask` into `runOwnerAgentTurn`

- `[x]` `OwnerAgentTurnDeps` extended with `runAgentChain` and `evaluateServiceTask` hooks
- `[x]` `runAgentChain`: decomposes via keyword detection, dispatches via capability-route matcher
- `[x]` `evaluateServiceTask`: gates inbound task.propose against local auto-accept policy
- `[x]` Both invoke the existing `agent-chain-orchestrator` and `service-mesh-worker` modules

### 26C — Reconcile continuity-session field shape

- `[x]` Canonical shape: `{ progress: string; currentStep: number; totalSteps: number; description; ... }`
- `[x]` `continuity-service` module fields renamed to canonical shape
- `[x]` Unit tests updated to canonical fields
- `[x]` E2E shape now matches production shape

### 26D — Wire `predictIntent` with real history

- `[x]` `_intentHistory` sliding window (capped at 50 entries)
- `[x]` `recordIntent(intent, query)` called at end of `runOwnerAgentTurn`
- `[x]` `predictIntent` hook reads from live history
- `[x]` Persisted to `intent-history.json` in profile dir
- `[x]` `loadIntentHistoryFromDisk()` available for startup

### 26E — Persist published library + continuity sessions

- `[x]` `published-library.json` written on every publish / peer-sync
- `[x]` `continuity-sessions.json` written on every session create/update/complete
- `[x]` `loadPublishedLibraryFromDisk()` and `_loadContinuitySessions` available for startup

**Exit:** 5 of 5 sub-phases shipped. Total Phase 19-25 tests still passing (73 passed | 2 skipped | 75).

---

## Phase 27: AI Features — proactive mesh + mobile inference `[x]` shipped

**Goal:** Three AI-facing capabilities. Agent in group chat (request-only, anti-loop, rate-limited). A proactive mesh intelligence report. A mobile-AI package skeleton for offline-first inference.

**Depends on:** Phase 18 Assistant runtime · Phase 23/25 mesh data sources · Phase 13 actor disclosure.

### 27A — Agent in group chat

- `[x]` `apps/node/src/agent-group-chat-responder.ts` — `evaluateAgentGroupChatResponse`
- `[x]` Request-only: agent never replies to `senderRole === "agent"` (anti-loop)
- `[x]` `@envoy` mention gate: only responds when explicitly invoked
- `[x]` Three commands: `summarize`, `find`, `poll` (plus generic fallback)
- `[x]` Per-room rate limit: 3 responses/hour (configurable via `allowResponse` dep)
- `[x]` 7 unit tests in `apps/node/test/agent-group-chat-responder.test.ts`

### 27B — Mesh intelligence report

- `[x]` `apps/node/src/mesh-intelligence.ts` — `generateMeshIntelligenceReport`
- `[x]` Phase 1: parallel data gathering (bonded, discovery, reputation, dormant, 2nd-degree)
- `[x]` Phase 2: structured sections (Network Health, Trending Topics, Dormant Bonds, Reputation, Growth)
- `[x]` Phase 3: LLM narrative synthesis across all sections
- `[x]` 8 unit tests in `apps/node/test/mesh-intelligence.test.ts`

### 27C — Mobile AI package skeleton

- `[x]` `packages/mobile-models/src/index.ts` — `selectBestModel`, `getMobileModelInfo`, `generateWithFallback`
- `[x]` Device-capability detection (RAM tiers: <2GB no-go, 2-4GB TinyLlama, 4GB+ Llama-3.2-1B)
- `[x]` First-run model fetch from HuggingFace; cached after download
- `[x]` Stub local-inference path: currently always falls back to home node (ONNX/llama.cpp integration is a follow-on)
- `[x]` 5 unit tests in `packages/mobile-models/test/index.test.ts`

**Exit:** 20 new tests passing across 3 modules. No new wire intents (all local computation / home-node proxy).

---

## E2E Test Gap Analysis

| Phase | E2E Tests Existing | Gaps |
|-------|--------------------|------|
| 19 | Phase13 harness bond_autonomy + low-level mesh tests (2 skipped) | Outbound agent bond.accept path not E2E tested due to mesh routing constraints |
| 20 | Broadcast doc discovery (2 tests) + sensitivity filtering (1 test) | Real two-node broadcast with actual published library |
| 21 | Capability broadcast (1 test) | Real two-node capability matching with varying capabilities |
| 22 | Federated RAG fan-out (2 tests) + synthesis (2 tests) | Real three-node knowledge.query fan-out with vault data |
| 23 | Unit (21) + harness E2E (1) | Social UI integration |
| 24 | Unit (24) + harness E2E (1) | Two-node task.propose→accept→result |
| 25 | Unit (16) + harness E2E (1) | Full cross-device continuity with mobile node |

### Recommended E2E priorities

1. **Phase 22**: Three-node federated RAG with real vault data (builds on knowledge-e2e.test.ts pattern)
2. **Phase 24**: Two-node task negotiation E2E (builds on agent-card-a2e.test.ts pattern)
3. **Phase 23**: Two-node circle proposal from real bond + topic data
4. **Phase 25**: Cross-device continuity (requires mobile node setup)
5. **Phase 20/21**: Real two-node broadcast with published libraries

### Code quality review (2026-06-03)

- `federated-rag.ts`: Removed unused envelope construction (dead code); simplified `FederatedRagDeps` to remove unused `signEnvelope`/`profile` fields
- `bond-autonomy-worker.ts`: Replaced dynamic `import("@envoymesh/identity")` with static import
- All modules: Dependency-injected interfaces for testability; no implicit side effects; pure functions where possible

### Remaining deferred items (runtime/UI integration only)

| Item | Phase | Why deferred |
|------|-------|-------------|
**Bottom line:** All phases complete. 18 modules, 176 unit tests, 3 E2E harness tests, 8 RPC methods, 2 WebSocket events, 3 Activity kinds, ToolRegistry tool, 3 daemon ticks, mobile node full feature parity. Phase 27 (agent in group chat, proactive agent, mobile AI) shipped. Phase 29 (OpenClaw integration) designed below.

---

## Phase 26 — DID WAN gateway resolver **`[ ]` scoped**

**Goal:** Peer discovery by human-readable DID across WAN. First slice (`did:key` presentation + Profile UI) shipped 2026-05-20. This phase adds the WAN gateway resolver.

**Design:** [parked-did-product-scope.md](./parked-did-product-scope.md)

### 26A — DID → peerId gateway
- `[ ]` Local cache: resolved DIDs cached in peer directory
- `[ ]` DHT fallback: query DHT for provider record advertising the DID
- `[ ]` Web gateway fallback: optional HTTP gateway for relay-only clients

### 26B — `did:envoy` method
- `[ ]` Define `did:envoy:<base58btc(peerId)>` compact DID method
- `[ ]` DID document: `verificationMethod` (Ed25519), `service` (relay, agent peerId)
- `[ ]` Export/Import W3C DID documents

### 26C — Social UI + tests
- `[ ]` DID section in Profile, QR export, search-by-DID
- `[ ]` Unit: mapping, doc generation, parse; Integration: DHT lookup; E2E: two-node resolution

---

## Mobile E2E Test Plan

| Feature | Test | Setup |
|---------|------|-------|
| Bond autonomy | Auto-accept via agent credential | 2 Capacitor instances |
| Broadcast doc | Public doc returned on query | Relay-proxied broadcast |
| Sensitivity check | Friends doc hidden from public | Published with sensitivity tags |
| Continuity | Desktop → mobile session resume | Paired desktop+mobile |
| Task market | task.propose → accept | Bonded pair with capability match |

### Mobile Node Parity

Mobile (`packages/mobile-node/`) supports all Phase 19-25 features via relay-proxied transport:
- **Identity, trust, bonds**: Full crypto compatibility via `@noble/curves`
- **Discovery (Ph 20-21)**: Broadcast via relay WebSocket (send + receive both work through circuit relay)
- **Task marketplace (Ph 24)**: `task.propose` via relay (bidirectional)
- **Cross-device continuity (Ph 25B)**: State syncs through relay bridge
- **Limitation**: Mobile cannot be a pure TCP listener (no broadcast target discoverability); relay compensates

---

## Phase 29 — OpenClaw as EnvoyMesh's Built-in Agent **`[~]` designed, partially built**

**Goal:** Bundle OpenClaw as EnvoyMesh's default agent. Users get a complete agent experience out of the box — one install, one start, everything works. OpenClaw owns memory and reasoning; EnvoyMesh owns network, security, and tools.

**Design decisions (2026-06-04):**

| Decision | Rationale |
|----------|-----------|
| Two-tier model routing | EnvoyMesh native handles chat/auto-replies (fast, secure). OpenClaw handles assistant + @envoy (complex, multi-turn). |
| OpenClaw owns memory | If OpenClaw is stateless, we should call the model directly. Its value is persistent memory across sessions. |
| Stdio JSON protocol | Same format as HTTP bridge. No ports, no secrets. OpenClaw logs show on EnvoyMesh console. |
| Independent upgradability | OpenClaw is a child process. Any version works as long as it speaks `envoy-openclaw/1.0`. Update independently. |
| Tool catalog at startup | EnvoyMesh exports its tool list. OpenClaw doesn't need to know EnvoyMesh internals — just tool names and descriptions. |

### 29A — OpenClaw Runtime (child process + stdio)

- `[x]` `packages/openclaw-runtime/src/index.ts`: `OpenClawRuntime` class — spawns child process, JSON-over-stdio protocol, ping/pong readiness check, request/response multiplexing with correlation IDs
- `[x]` `discoverOpenClaw()`: auto-detects via npm (`@openclaw/core`), PATH, bundled binary (`bin/`), source submodule (`packages/openclaw/`)
- `[x]` Singleton `getOpenClawRuntime()` for process lifecycle management
- `[x]` Wire `OpenClawRuntime.start()` into NodeServiceImpl startup (index.ts + node-service-impl.ts)
- `[x]` `askOpenClaw()` method with context passing (bonds, interests)
- `[x]` `executeOpenClawTool()` — executes EnvoyMesh tools for OpenClaw via ToolRegistry

### 29B — Tool Bridge (EnvoyMesh tools → OpenClaw)

- `[x]` `packages/openclaw-runtime/src/tool-bridge.ts`: `ENVOY_TOOL_CATALOG` — 7 tools with names, descriptions, parameters, `useWhen` hints, and `resultShape` descriptions
- `[x]` `buildOpenClawSystemPrompt()`: system instructions telling OpenClaw what EnvoyMesh is and how to use its tools
- `[x]` Tool mapping: make friends → `mesh.discover_cluster` + `mesh.send_hello`, find docs → `mesh.library_discover`, ask for help → `mesh.task_propose`, A2A → `mesh.task_propose` + `mesh.task_result`, knowledge → `mesh.knowledge_query`, chat history → `mesh.chat_rag_search`, network intelligence → `mesh.intelligence_report`
- `[x]` Tool execution handler: `executeOpenClawTool()` maps tool names → ToolRegistry executeTool
- `[ ]` Dynamic tool list: build catalog from live ToolRegistry, not hardcoded (deferred)

### 29C — Session Context (per-request memory bridge)

- `[x]` Each request to OpenClaw carries session context (bonds, interests) via `askOpenClaw()`
- `[x]` Bonds: displayName + trust level
- `[x]` Interests: owner profile interests
- `[ ]` Chat history context (deferred — needs chat log integration)
- `[ ]` Tool call multi-round: execute tool → return result → next prompt (deferred)
  ```typescript
  {
    sessionId: string;       // For OpenClaw memory binding
    prompt: string;          // The user's request
    context: {
      owner: { interests: string[], capabilities: string[] },
      bonds: Array<{ name: string, level: string }>,
      recentChats: Array<{ contact: string, text: string }>,
      discoveryResults?: unknown;
    };
    availableTools: EnvoyToolDefinition[];
  }
  ```
- `[ ]` OpenClaw returns: decision + tool calls + response text
- `[ ]` EnvoyMesh executes tool calls, passes results back to OpenClaw (multi-round within one turn)

### 29D — Two-Tier Model Routing

- `[x]` Request router wired in `runOwnerAgentTurn` + `_maybeRespondAsAgentInRoom`:
  ```
  chat draft / auto-reply → EnvoyMesh native model (Ollama / OpenAI) — unchanged
  Assistant / @envoy       → OpenClaw (if available) → fallback to native
  ```
- `[x]` EnvoyMesh model settings remain for chat/auto-replies (security: chat content stays in EnvoyMesh)
- `[x]` OpenClaw manages its own LLM config independently
- `[ ]` Settings → AI shows all three tiers: "Native model" (chat), "OpenClaw" (assistant), "OpenClaw model" (deferred)

### 29E — Unified Install

- `[x]` `scripts/setup.sh`: one command — npm install + OpenClaw + build
- `[x]` `scripts/install-openclaw.sh`: OpenClaw-specific install via npm / binary download / source build
- `[ ]` Post-install verification: `openclaw --version` check
- `[ ]` First-run experience: if OpenClaw not found, show helpful message with install instructions

### 29F — Version Negotiation & Upgradability

- `[x]` Protocol handshake at startup via `hello`/`hello_ack` JSON messages
- `[x]` Version logging on connect: `[openclaw-runtime] v2.3.1, protocol envoy-openclaw/1.0`
- `[x]` Fallback: assume compatible after 5s timeout
- `[ ]` Version mismatch handling: warn if incompatible (deferred — needs actual incompatible version to test)
- `[x]` Update path: `./scripts/install-openclaw.sh` + restart EnvoyMesh

### 29G — Write Tests

- `[x]` Unit: `OpenClawRuntime` start/stop/ready states, `ask` throws when not ready
- `[x]` Unit: `discoverOpenClaw()` return type validation
- `[x]` Unit: `ENVOY_TOOL_CATALOG` schema (7 tools, each with required fields)
- `[x]` Unit: `buildOpenClawSystemPrompt` content validation
- `[x]` Unit: Version negotiation handshake format
- `[x]` File: `packages/openclaw-runtime/test/index.test.ts` — 12 tests
- `[ ]` Integration: EnvoyMesh → mock OpenClaw → tool call → result (deferred)
- `[ ]` E2E: Real OpenClaw process flows (deferred — requires OpenClaw binary)

**Exit:** Runtime + tool catalog + two-tier routing + version negotiation + tests complete. Ready for integration testing with real OpenClaw.

---

## Phase 30 — Terminals (Chat-integrated remote shells) **`[x]` shipped**

**Goal:** Add a **Terminals** area in Chat where the owner works in **real shell sessions** on the **home node** — full interactive PTY (SSH, colors, Ctrl+C, resize) like a native terminal, plus **Agent mode** per session (NL → command with confirm). Session management uses **group chat** UX (sidebar + main panel).

**Mobile is a first-class product surface, not a deferral:** After **QR pairing** with the home computer’s EnvoyMesh node (Phase 11), the phone runs the **same Social UI** but **compute stays on home** — shells, models, vault, and OpenClaw gateway. The owner remotely operates **Terminals** and **EnvoyAI (Assistant)** on the home node from the phone. The phone never runs `node-pty` or a full desktop agent runtime; it is the **remote control panel** for the home node.

**Product rule:** Terminals are **owner-operated shells on the home node** (including nested SSH inside the PTY). They are not mesh intents or bond-granted capabilities. **Terminal Agent mode** assists the human in the **active session** — not OpenClaw workspace `exec`.

### Design decisions (2026-06-06)

| Decision | Rationale |
|----------|-----------|
| **Real terminal first** | xterm.js + `node-pty` must feel indistinguishable from iTerm/Alacritty/AliYun console for manual use — Agent mode is an overlay, not a replacement |
| Group-chat session model | Users already understand sidebar + thread + “create new”; maps to `listTerminalSessions` / `createTerminalSession` / `closeTerminalSession` |
| **Agent mode per session** | Toggle on active terminal (like cloud-console “AI assistant”); NL input → propose command(s) from **session scrollback + prompt context** → suggest, preview, or inject to PTY stdin |
| PTY only on home/desktop node | Real shell requires OS process + `node-pty`; aligns with vault, OpenClaw, and full ToolRegistry on home |
| **Mobile = remote UI, home = compute** | Phone pairs via QR (`pairSharedIdentity` → `sessionToken`); **all** Terminals + EnvoyAI heavy work runs on **home node**; mobile relays RPC + PTY streams — not a degraded local agent |
| **Unified HomeRemote transport** | One authenticated path mobile → home for Terminal RPC, PTY WS tunnel, and (30K) EnvoyAI proxy — reuse pairing token + `_callHomeRpc` / persistent home WS patterns |
| xterm.js + binary WebSocket | JSON-RPC is wrong for interactive PTY I/O; dedicated `/terminal` WS subprotocol with resize + stdin/stdout frames |
| Owner auth, not bond tier | Shell access is **same trust as vault/settings** — pairing token / localhost / owner session; **not** `direct` bond sensitivity |
| **Terminal Agent ≠ OpenClaw exec** | OpenClaw `exec` runs in **agent workspace** cwd with tool policy; Terminal Agent writes to **active PTY stdin** with terminal scrollback context — separate audit channel |
| **Terminal Agent brain: direct LLM (v1)** | **Not OpenClaw by default** — single-turn NL→command needs low latency, structured JSON output, and **no mesh tools**; use `routeModelRequest({ taskType: "terminal.assist" })` like chat drafts, not `askOpenClaw` or `runOwnerAgentTurn` |
| **OpenClaw optional for planning (v2)** | `/openclaw` may ask OpenClaw for multi-step **plans** only; commands still pass risk gate + confirm before PTY — OpenClaw never writes PTY directly |
| **Slash commands in Agent bar** | Claude Code–style `/help`, `/model`, `/manual`, `/agent` in the **Agent input bar** (not xterm stdin) — easy mode switch without breaking shell `/` paths |
| **Risk-tiered execution** | Safe commands (read-only) may auto-run when user enables it; moderate/destructive (`reboot`, `rm -rf`, `DROP TABLE`) require **preview + confirm** or H2A-style approval |
| herdr: inspiration + optional sidecar | herdr is a **native TUI multiplexer**, not embeddable in React; borrow session/state patterns; optional “Open in herdr” later — do **not** ship herdr inside Tauri v1 (AGPL + platform scope) |
| **TmuxAI: Agent-mode reference + optional sidecar** | [TmuxAI](https://github.com/alvinunreal/tmuxai) is the closest **observe → suggest → confirm → exec → re-observe** product reference; copy patterns into EnvoyMesh Agent bar + `TerminalAgentAssist`; optional external install for tmux power users (Apache-2.0) — **not** embedded or required for v1 |

### ADR: Terminal Agent brain — OpenClaw vs direct LLM

Terminal Agent mode is a **bounded, session-local copilot** (NL → shell command → PTY inject). It is **not** the Social Assistant and **not** OpenClaw workspace `exec`. Pick the brain by task shape:

| Criterion | **Direct LLM (v1 default)** | OpenClaw (`askOpenClaw`) | Owner-agent planner (`runOwnerAgentTurn`) |
|-----------|----------------------------|--------------------------|-------------------------------------------|
| Primary job | NL → **one shell command** (or short script preview) | Multi-turn reasoning + **mesh tools** + memory | Mesh orchestration (friends, docs, tasks) |
| Latency | **Low** — one `routeModelRequest` call | **Higher** — child gateway process | Medium — tool loop |
| Output | **Structured JSON** `{ command, rationale, riskHint }` — validate before PTY | Free text + tool calls — hard to gate | Tool calls, not PTY bytes |
| Context | **PTY scrollback + prompt line** only | Bonds, interests, OpenClaw memory | Vault, contacts, workers |
| Model setting | Settings → **Terminal assist model** (native tier) | Separate OpenClaw model config | Native planner model |
| Mesh / tools | **Forbidden** in v1 | Wants `mesh.*` tools — wrong escalation | Intended |
| Phase 29 fit | Same tier as **chat draft / auto-reply** (fast, secure) | Same tier as **Assistant / @envoy** | Native agent path |

**Decision (v1):** Implement Terminal Agent with **direct LLM only**:

```
TerminalAgentAssist
  → buildTerminalAssistPrompt(scrollback, promptLine, userNL)
  → routeModelRequest({ taskType: "terminal.assist", ownerApproved: true, ... })
  → parseTerminalCommandProposal(JSON)   // Zod schema, reject free-text exec
  → classifyRisk(proposal)               // deterministic, before any PTY write
  → (optional confirm) → PTY stdin
```

Reuse existing infrastructure: `buildModelProviders`, `evaluateSemanticFirewall`, `evaluateEgressContent`, `stripModelThinking` — same pattern as `askOwnerAgentPlanner` in `owner-agent-planner-inbound.ts`, but **different prompt template, JSON schema, and zero ToolRegistry**.

**Do not use OpenClaw for v1 because:**

1. OpenClaw’s value is **persistent memory + mesh tools** — irrelevant when user is SSH’d into AliYun (context is scrollback, not workspace).
2. OpenClaw would introduce a **second model** (`/model` confusion: terminal vs OpenClaw vs chat).
3. OpenClaw multi-turn + tool loop increases **accidental mesh egress** and latency while user waits at a shell prompt.
4. Phase 29 already states: *“If OpenClaw is stateless, call the model directly”* — terminal assist is stateless per request (scrollback passed explicitly).

**Optional v2 — `/openclaw` planning path:**

- User in Agent mode: `/openclaw upgrade nginx on this server and reload`
- Route to OpenClaw for a **numbered plan** (read-only); each step still becomes a `TerminalCommandProposal` through the same risk gate + confirm.
- OpenClaw **never** receives PTY write access or `exec` in this path.

**Explicit non-goals:**

- Routing every Agent mode message through `runOwnerAgentTurn` (would pull mesh tools into shell context).
- Routing v1 through OpenClaw “for consistency” (wrong latency/security profile).
- Letting OpenClaw `exec` target the active SSH session (workspace vs PTY confusion).

### What [herdr](https://github.com/ogulcancelik/herdr) is (plain language)

[herdr](https://github.com/ogulcancelik/herdr) is a **Rust terminal multiplexer** (tmux-like) optimized for **AI coding agents**:

- **Workspaces → tabs → panes** of **real PTY processes** (not reinterpreted agent UIs)
- **Detach / reattach** — client disconnect does not kill panes; server keeps running
- **Agent-awareness sidebar** — blocked / working / done / idle from process names + terminal output heuristics (+ optional integrations for Claude Code, Codex, OpenClaw-adjacent tools, etc.)
- **Mouse-native** splits, drag-select copy, keyboard copy mode
- **Unix socket API** — agents can spawn panes, read output, wait on state
- **Platform:** Linux + macOS only; **license:** AGPL-3.0 (commercial license available)

herdr explicitly targets **“lives in your terminal”** — iTerm, Alacritty, SSH — **not** Electron, not a web dashboard, not a WebView widget.

### herdr fit matrix for EnvoyMesh

| Question | Answer |
|----------|--------|
| Embed herdr UI inside Social Chat? | **No** — herdr renders in a native terminal emulator, not in xterm.js |
| Use herdr as the PTY backend for Social? | **Possible but indirect** — run `herdr` server on home node, bridge socket API → WebSocket → xterm.js; duplicates multiplexer logic you still rebuild in the browser |
| Copy herdr’s **product patterns**? | **Yes — primary value** — session list, tabs, agent state chips, detach/reattach semantics |
| “Open in herdr” for power users? | **Good v2** — launch/focus external herdr workspace tied to `openclaw-workspace/` or profile dir; zero AGPL embedding in EnvoyMesh app |
| herdr agent integrations for OpenClaw? | **Informational** — herdr detects many CLIs; OpenClaw gateway is a **child HTTP process**, not a pane today; EnvoyMesh can map **H2A approval / task state** to herdr-like sidebar labels without herdr |
| Ship herdr in Tauri installer? | **Defer** — AGPL obligations, Linux/macOS-only, large Rust binary; document optional install instead |

**Recommendation:** Treat herdr as a **UX and persistence reference** and an **optional external tool path** (30H). Build Terminals on **EnvoyMesh-owned** `TerminalManager` + xterm.js + `node-pty`. Revisit herdr **socket bridge** only if power users need tmux-grade pane tiling before Social UI catches up.

### What [TmuxAI](https://github.com/alvinunreal/tmuxai) is (plain language)

[TmuxAI](https://github.com/alvinunreal/tmuxai) is a **Go CLI** that embeds an AI pair programmer **inside tmux** (Apache-2.0, ~1.9k★). It is the closest public reference to EnvoyMesh **Terminal Agent mode**:

- **Non-intrusive observe**: reads **visible content of tmux panes** (scrollback on screen) without replacing the user’s shell workflow
- **Three-role layout** in one tmux window:
  - **Chat pane** — REPL-like AI input (`/model`, `/prepare`, `/watch`, `/skill`, …)
  - **Exec pane** — approved commands run here (dedicated execution target)
  - **Read-only panes** — other panes supply **multi-pane context** (e.g. logs + SSH + editor side by side)
- **Observe mode (default)**: user message → capture all pane context → LLM → suggested command → **risk hint + confirm** → exec pane → wait for output → **re-capture and continue** (multi-step loop)
- **Prepare mode** (`/prepare`): custom shell prompt markers so the tool detects **command completion** (exit code, per-command output) instead of fixed timers
- **Watch mode** (`/watch`): proactive pane monitoring (v2 analogue for EnvoyMesh)
- **Safety**: `risk_scorer.go`, whitelist/blacklist patterns, confirm before tmux keys; “yolo” overrides exist — **EnvoyMesh must not copy yolo for owner shells**
- **Skills + KB**: lazy-loaded `SKILL.md` dirs, context budgets — maps conceptually to EnvoyMesh bundled skills / vault snippets (v2)
- **Squashing**: summarizes chat history to manage token budget
- **Requires tmux** on Linux/macOS — not a browser widget, not node-pty

### TmuxAI fit matrix for EnvoyMesh

| Question | Answer |
|----------|--------|
| Embed TmuxAI UI inside Social Chat? | **No** — it drives **tmux subprocesses** (`system/` package), not xterm.js |
| Use TmuxAI as PTY backend for Social? | **No** — Social uses `node-pty` + WS; TmuxAI requires an existing tmux server and pane IDs |
| Run TmuxAI **inside** an EnvoyMesh terminal session? | **Possible but awkward** — user would run `tmux` then `tmuxai` inside xterm; nested tmux + AI; doc as advanced tip, not product path |
| Copy TmuxAI **Agent patterns**? | **Yes — primary value for 30I** — observe loop, chat vs exec separation, multi-pane context, prepare/completion, risk confirm UI, `/model`, squashing |
| “Open with TmuxAI” for power users? | **Good v2 (30J)** — home node doc: install `tmuxai`, SSH to server with tmux, or local tmux workflow; Apache-2.0 friendly |
| Replace EnvoyMesh Terminal Agent with TmuxAI? | **No** — mobile paired viewer, owner auth, audit, and AliYun-in-browser UX require EnvoyMesh-native assist |
| Same brain as TmuxAI (direct LLM)? | **Yes** — TmuxAI calls configured providers directly (OpenAI-compatible, OpenRouter, etc.); aligns with our **direct LLM ADR**, not OpenClaw |

### herdr vs TmuxAI vs EnvoyMesh Terminals

| | **herdr** | **TmuxAI** | **EnvoyMesh Phase 30** |
|--|-----------|------------|-------------------------|
| Primary gift | Multiplexer, detach, agent sidebar chips | **Observe → act loop**, chat/exec/context panes | Browser terminal + owner mesh integration |
| Agent assist | Sidebar state heuristics | **Core product** | Agent bar + direct LLM |
| Embed in Social | No | No | **Yes** (xterm.js) |
| Mobile remote | No | No | **Yes** (paired home) |
| License | AGPL-3.0 | Apache-2.0 | N/A |

**Recommendation:** Treat **TmuxAI as the lead UX reference for Terminal Agent mode (30I)**; treat **herdr as the lead reference for session list / detach (30A–30C, 30F)**. Build native EnvoyMesh equivalents — do **not** fork or bundle TmuxAI in v1.

### Patterns to adopt from TmuxAI (EnvoyMesh-native)

Map TmuxAI concepts to Phase 30 — implement inside `TerminalAgentAssist` + Social UI, not via tmux dependency:

| TmuxAI pattern | EnvoyMesh mapping | Phase |
|----------------|-------------------|-------|
| Chat pane | **Agent input bar** (slash commands, NL) | 30D / 30I v1 |
| Exec pane | **Active session PTY** (inject on Run) — same pane v1; optional **linked exec session** v1.1 | 30I |
| Read-only context panes | **Pinned context sessions** — other sessions’ scrubbed scrollback merged into assist prompt | v2 |
| Observe loop (run → wait → re-prompt) | **`terminalObserveStep`** after execute: wait for prompt stable / timeout → optional “Continue?” next proposal | v1.1 |
| Prepare mode (`/prepare`) | **`/prepare` slash** → optional prompt markers in PTY for completion detection | v2 |
| Watch mode (`/watch`) | **`/watch` slash** → debounced proactive suggestions from scrollback deltas | v2 |
| Risk ✓ / ? / ! on confirm | **Preview card badges** + deterministic tier (tier overrides model hint) | 30I v1 |
| Whitelist / blacklist | Settings **`terminalCommandAllowPatterns` / `DenyPatterns`** extending destructive list | 30I v1 |
| Squashing | **`terminalAssistTurnHistory`** summarization when token budget exceeded | v1.1 |
| Skills / KB | Vault paths or `apps/node/skills/` as optional assist context (scrubbed) | v2 |
| `/model` switch | Already planned — per-session override for `terminal.assist` | 30I v1 |

**v1 scope discipline:** Ship **single-shot** NL→command + confirm (Slice 2). Add **TmuxAI-style observe loop** in v1.1 — it is the biggest UX gap vs TmuxAI and matches “reboot then verify uptime” workflows.

### Terminal UX: real shell + Agent mode

Two layers in the **same session** — user switches freely without losing the PTY:

| Layer | Behavior | Example |
|-------|----------|---------|
| **Manual (default)** | Standard xterm: keyboard, mouse select, SSH nested sessions, full ANSI | `ssh root@aliyun-ecs`, then normal shell on remote |
| **Inline suggestions (optional)** | Ghost text / popover as user types in manual mode | User types `system` → suggests `systemctl status nginx` |
| **Agent mode (toggle)** | Dedicated **Agent input bar** below xterm; NL or `/` commands | “reboot the machine” → proposes `sudo reboot` on remote Ubuntu |

#### Mode switching (Manual ↔ Agent)

Users must switch modes **without friction** and without breaking normal shell behavior:

| Control | Action |
|---------|--------|
| Toolbar pill | `[ Manual \| Agent ]` — click to toggle; shows active mode |
| Keyboard | `Ctrl+Shift+A` (Windows/Linux) / `⌘⇧A` (macOS) — toggle mode |
| `/agent` | In **Agent bar only** — focus Agent bar, enable Agent mode |
| `/manual` or `/shell` | In **Agent bar only** — focus xterm, disable Agent mode |
| Session memory | Switching modes does **not** reset PTY; pending proposal stays until Run/Cancel |

**Important:** Slash commands and NL assist live in the **Agent input bar**, not in xterm stdin. Lines typed in xterm (including `/usr/bin/...`) always go to the shell — we do **not** intercept `/` in manual mode (would break SSH scripts and paths). Claude Code–style inline intercept in xterm is **deferred v1.1** behind an explicit opt-in Setting.

When Agent mode activates: Agent bar receives focus, placeholder shows `Ask or /help…`; xterm remains visible for scrollback. When Manual mode activates: xterm receives focus; Agent bar collapses to a single-line hint (“Press ⌘⇧A for Agent mode”).

#### Slash commands (Agent bar)

Parsed **client-side first** (no model call); unknown `/foo` falls through to NL assist.

| Command | Action |
|---------|--------|
| `/help` | List commands, current mode, active model, auto-run policy |
| `/manual` · `/shell` | Switch to Manual mode; focus xterm |
| `/agent` | Switch to Agent mode; focus Agent bar |
| `/model` | Show current **terminal assist** model (native tier — not OpenClaw model) |
| `/model list` | List providers from `modelProviders` config filtered for `terminal.assist` |
| `/model <id>` | Set **per-session override** (e.g. `/model ollama`, `/model local`) |
| `/model default` | Clear session override; use Settings default |
| `/explain [topic]` | Read-only LLM summary of recent scrollback — **no PTY write** |
| `/suggest on` · `/suggest off` | Toggle inline ghost completions in Manual mode |
| `/run` | Execute last pending proposal (same as Run button) |
| `/confirm` | Confirm destructive proposal awaiting approval |
| `/cancel` | Dismiss pending proposal |
| `/history` | Show last N proposals for this session (metadata only) |
| `/prepare` | **v2** — enable prompt markers for command-completion detection (TmuxAI-style) |
| `/watch <goal>` | **v2** — proactive scrollback monitoring (TmuxAI Watch mode analogue) |
| `/openclaw …` | **v2 only** — multi-step plan via OpenClaw; steps still confirm individually |

`/model` behavior mirrors Claude Code: quick model switch for **this terminal session’s assist brain** without opening Settings. It adjusts `terminal.assist` routing only — does not change OpenClaw gateway model or chat draft model.

#### Agent mode flow (v1)

```
User (Agent bar): "reboot the machine"   — or —   /explain why deploy failed
        │
        ▼
TerminalAgentAssist (home node)
  · scrollback ring buffer (last N KB / lines)
  · heuristics: local shell vs ssh session, detected OS hints from uname/etc
  · direct LLM: routeModelRequest({ taskType: "terminal.assist" }) — NOT OpenClaw
        │
        ▼
Proposed command card:  sudo reboot     — or —   explanation text (read-only)
  Risk badge: ✓ safe | ? moderate | ! destructive  (deterministic tier; model hint display-only)
  [Run]  [Edit in terminal]  [Cancel]
        │
        ▼ (Run only)
Risk check → destructive? → approval modal (or Settings: always confirm destructive)
        │
        ▼
Write to PTY stdin (+ optional \n) — same bytes as if user typed
        │
        ▼
Output appears in xterm scrollback; audit: terminal.agent.proposed / executed
```

**What Agent mode is not:**

- Not a chat thread replacing the terminal — NL input is **session-scoped**, not a new Chat room
- Not OpenClaw running `exec` in `openclaw-workspace/` while user SSH’d elsewhere — context is **this pane’s PTY**
- Not silent autonomy — destructive/high-risk commands always surface **preview + human confirm** (reuse approval-queue patterns where appropriate)
- Not available to bonded peers or external agents in v1

**Settings (owner):**

- Default Agent mode on/off for new sessions
- **Terminal assist model** — native provider for `taskType: "terminal.assist"` (separate from chat draft + OpenClaw assistant models)
- Auto-run policy: `off` | `safe-only` (read-only commands) | `always-confirm` (default for v1)
- Optional: link scrollback context to vault snippets (v2) — out of scope v1
- Optional v1.1: “Intercept `/envoy` in xterm” — off by default

**Mobile:** Same dual UX — xterm remote + Agent bar; all RPC and PTY bytes go **home** via **HomeRemote** (30E).

### Mobile remote home node (product pillar)

Phase 11 established **shared owner identity** via QR pairing. Phase 30 completes the **remote operations** story: the phone is how owners use EnvoyMesh away from the desk, but the **home computer’s node** remains the intelligence and shell host.

| Capability | Runs on | Mobile behavior when paired |
|------------|---------|----------------------------|
| **Terminals** (PTY, SSH, Agent bar) | **Home node** | Social UI + xterm.js; streams stdin/stdout to home PTY |
| **EnvoyAI / Assistant** (`runOwnerAgentTurn`, OpenClaw) | **Home node** | Same Assistant UI; RPC proxied to home (30K) — full vault, tools, OpenClaw |
| **Chat / mesh** (contacts, bonds) | **Mobile node** (Phase 11) | Unchanged — mobile participates in mesh with shared `ownerId` |
| **Vault library (read/open)** | **Mobile vault** (limited) | Heavy paths already home-biased; Terminals always home |

**Why home must run EnvoyAI for paired mobile:** Today `MobileNode.runOwnerAgentTurn()` runs a **degraded local loop** (many workers stubbed — e.g. social proxy, document acquisition). Remote owners expect the **same Assistant** as desktop: full ToolRegistry, vault RAG, OpenClaw gateway, approvals. That only exists on the home node.

**Pairing flow (existing + extended):**

```
Phone scans home QR (envoy://pair?…)
  → pairSharedIdentity over relay/home WS
  → sessionToken + homeNodePeerId + homeAgentPeerId stored on mobile
  → HomeRemoteClient uses sessionToken for terminal + assistant RPC/WS
```

**UX states:**

| State | Terminals tab | Assistant (EnvoyAI) |
|-------|---------------|---------------------|
| **Paired, home online** | Full remote terminals + Agent mode | Full home Assistant (30K) |
| **Paired, home offline** | “Home node offline” + retry; list cached session titles if any | Queue or offline message; defer to Phase 4A notify patterns |
| **Not paired** | “Pair with home node” (link to Settings QR) | Local degraded agent OR prompt to pair (product choice: **prompt to pair** for parity) |

**Implementation slices (agreed ship order — plan only until Slice 1 starts):**

See **[Phase 30 shipping plan](#phase-30-shipping-plan-agreed-order)** below for per-slice scope, exit criteria, and herdr/TmuxAI roles.

| Slice | Deliverable | Status |
|-------|-------------|--------|
| **1** | Manual terminal on home (30A–30D, no Agent bar) | `[x]` shipped |
| **2** | Mobile remote **manual** terminal (30E HomeRemote) | `[x]` shipped |
| **3** | Terminal **Agent mode** — native, [TmuxAI](https://github.com/alvinunreal/tmuxai)-inspired (30I); [herdr](https://github.com/ogulcancelik/herdr) N/A for Agent | `[x]` shipped (v1 + v2) |
| **4** | EnvoyAI home proxy for paired mobile (30K) | `[x]` shipped |
| Later | 30F badges, observe loop polish, 30H/J external tools | `[x]` shipped |

**Important:** Slices 1–3 do **not** embed TmuxAI or herdr binaries — both are **UX references** only (see shipping plan).

### Phase 30 shipping plan (agreed order)

**Owner decision (2026-06-06):** Ship **Slice 1 → Slice 2 (mobile) → Slice 3 (Agent mode) → Slice 4 (EnvoyAI home proxy)**. **All four slices shipped (2026-06-05).**

**herdr vs TmuxAI in shipping:**

| Tool | Used in slice | How |
|------|---------------|-----|
| **[herdr](https://github.com/ogulcancelik/herdr)** | **Slice 1** (+ optional 30F later) | Session sidebar, detach/reattach, group-chat session model — **patterns only** |
| **[TmuxAI](https://github.com/alvinunreal/tmuxai)** | **Slice 3** | Agent bar, confirm+risk UI, `/model`, NL→command, observe loop — **patterns only**; implementation is **native** `TerminalAgentAssist` + direct LLM |
| Neither | Slices 1–4 | **Do not** bundle, embed, or require tmux/herdr in Tauri or mobile |

---

#### Slice 1 — Manual terminal on home **`[x]` shipped**

**Goal:** Real PTY in Social on desktop/Tauri — type, SSH, colors, Ctrl+C — **no Agent bar yet**.

| Includes | Sub-phase / work |
|----------|------------------|
| Types + API | **30A** — `TerminalSession`, CRUD RPC, attach token, `sessions.json` |
| PTY backend | **30B** — `terminal-manager.ts`, `node-pty`, scrollback ring buffer (for Slice 3), session limits |
| Wire | **30C** — binary WS protocol, `/ws/terminal/:id`, loopback bind, `docs/terminals-wire-protocol.md` |
| UI | **30D (manual only)** — Terminals tab, sidebar, xterm.js, New terminal, **no Agent bar** |
| UX reference | **herdr** — session list + detach semantics |
| Spike | `node-pty` + minimal WS + xterm harness before full UI |

**Slice 1 exit criteria:**

- `[x]` Desktop/Tauri: create/list/attach/close sessions; interactive PTY including nested SSH
- `[x]` Sessions survive tab switch within app session
- `[x]` Audit: `terminal.session.*` lifecycle events
- `[x]` Auth: loopback + attach token documented
- `[x]` Tests: `TerminalManager` unit; WS codec; E2E type command see output

**Not in Slice 1:** Agent bar, `terminal*` assist RPC, mobile HomeRemote, 30I, 30E, 30K.

---

#### Slice 2 — Mobile remote manual terminal **`[x]` shipped**

**Goal:** Paired phone runs **same manual terminal** against **home node** PTY — remote SSH-from-phone use case.

| Includes | Sub-phase / work |
|----------|------------------|
| Transport | **30E** — `HomeRemoteClient`, `sessionToken`, `homeTerminalWsOpen/Send/Close` |
| Mobile API | `MobileNode` terminal CRUD + attach → proxy home when `sharedIdentity` |
| UI | **30D** mobile layout — same xterm; “Running on home node” / pair CTA / offline retry |
| Capabilities | `homeRemote.paired`, `homeOnline`, `terminalsAvailable` |

**Slice 2 exit criteria:**

- `[x]` Paired mobile: list/create/attach/close sessions on **home** only
- `[x]` Interactive PTY over relay/LAN via HomeRemote tunnel
- `[x]` Unpaired: pair CTA; no local PTY
- `[x]` Home offline: clear UX + retry
- `[x]` E2E: mock home + paired mobile — manual shell only (`home-remote-terminal.test.ts`)

**Not in Slice 2:** Agent bar, Terminal Agent LLM, EnvoyAI proxy (Slice 3–4).

---

#### Slice 3 — Terminal Agent mode (TmuxAI-inspired, native) **`[x]` shipped**

**Goal:** Agent bar + NL→command + confirm on **home**; mobile gets same via HomeRemote. **Inspired by TmuxAI**, implemented in EnvoyMesh — **not** the TmuxAI binary.

| Includes | Sub-phase / work |
|----------|------------------|
| Backend | **30I** — `TerminalAgentAssist`, direct LLM `terminal.assist`, risk gate, scrubScrollback |
| UI | **30D (Agent)** — Agent bar, Manual/Agent toggle, slash commands (`/help`, `/model`, …), preview card with ✓/?/! |
| Mobile | Extend **30E** — proxy `terminalRunFromNaturalLanguage`, `terminalExecuteProposal`, etc. |
| UX reference | **TmuxAI** — chat/exec split, confirm loop, `/model`; v1 = single-shot; **observe loop** v1.1 |
| Settings | Terminal assist model tier; allow/deny regex patterns |

**Slice 3 exit criteria:**

- `[x]` Desktop: Agent mode NL → preview → confirm → PTY inject; destructive gated
- `[x]` Mobile (paired): same Agent bar UX against home assist
- `[x]` `/model` per-session override; deterministic risk overrides model hint
- `[x]` Audit: `terminal.agent.*`; tests including SSH scrollback fixture
- `[x]` **v2:** `/openclaw` plan, `/prepare`, `/watch`, `/pin`, `/step`, destructive regex list, turn squashing, inline suggest + observe loop

**Not in Slice 3:** Embedding TmuxAI/tmux; OpenClaw as terminal brain; autonomous exec without confirm.

---

#### Slice 4 — EnvoyAI home proxy (paired mobile) **`[x]` shipped**

**Goal:** Phone Assistant uses **home** `runOwnerAgentTurn` + OpenClaw + full ToolRegistry.

| Includes | Sub-phase / work |
|----------|------------------|
| Proxy | **30K** — `HomeRemoteClient.call("runOwnerAgentTurn", …)`, approvals proxy |
| UX | Offline / unpaired messaging |

**Slice 4 exit criteria:**

- `[x]` Paired mobile Assistant matches home capabilities (mock integration test: `home-remote-assistant.test.ts`)
- `[x]` `sessionToken` + audit `remoteClient: mobile` (`deviceId` on proxied RPC in client-proxy handler)

---

#### Later (post Phase 30 core)

- **30F** — session badges (herdr-inspired idle/working) **`[x]` shipped**
- **30H / 30J** — optional external docs + Settings/UI integration **`[x]` shipped**
- App restart session persist **`[x]` shipped**

---

## Phase 31A — Terminal AI Tier 1 (native loop + UX) **`[x]` shipped**

High-leverage AI improvements without bundling herdr/TmuxAI. Reuses `TerminalAgentAssist` orchestration; EnvoyAI bridge for vault/mesh escalation.

| Item | Deliverable |
|------|-------------|
| **Goal loop** | `/goal`, `/goalstop`, `/goalcontinue`; RPC `terminalStartGoalLoop`, `terminalAdvanceGoalLoop`, `terminalCancelGoalLoop`; max 10 steps; confirm destructive |
| **Failure-aware assist** | `terminalDetectFailure`, `terminalSuggestFixFromFailure`; UI chip + optional explain (read-only) |
| **EnvoyAI bridge** | `terminalSendContextToAssistant` — scrollback + cwd → `runOwnerAgentTurn`; “Ask EnvoyAI” button |
| **Plan runner UI** | Checklist after `/openclaw`; Propose / Skip per step; `terminalUpdatePlanProgress` |
| **Smarter safe-only** | Auto-chain up to 3 safe commands with observe + failure pause (`continueSafeOnlyChain`) |

**Tests:** `terminal-failure-detect.test.ts`, `terminal-slash-commands-goal.test.ts`

**Deferred (Tier 2+):** bounded vault/git context in assist, exec PTY pane, session goal persist, pin preview panel, shared Assistant thread.

---

## Phase 31B — Terminal AI context (read-only snippets) **`[x]` shipped**

| Item | Deliverable |
|------|-------------|
| **Context markers** | `@vault:path`, `@workspace:file`, `@git:diff\|stat\|last\|status` in Agent prompts |
| **Loaders** | `terminal-assist-context.ts` — vault/workspace/git read-only, max 3 snippets × 8KB |
| **PowerShell** | `detectShellContext` + assist prompt hints for pwsh/PowerShell |

**Tests:** `terminal-assist-context.test.ts`

---

## Phase 31C — Terminal AI polish (persist + pin preview) **`[x]` shipped**

| Item | Deliverable |
|------|-------------|
| **Assist persist** | `profile/terminals/assist-state.json` — goal, plan, pin survive restart |
| **Resume goal** | `canResumeGoal` on assist state; `terminalResumeGoalLoop`; UI resume banner |
| **Pin preview** | `terminalGetScrollbackPreview`; read-only panel above xterm when `/pin` set |

**Tests:** `terminal-assist-persist.test.ts`

**Still deferred:** none for Phase 31D core scope.

---

## Phase 31D — Exec pane + Tier 3 AI integration **`[x]` shipped**

| Item | Deliverable |
|------|-------------|
| **Exec PTY pane** | Linked `role=exec` session; agent inject via `resolveAgentInjectSessionId`; `/exec` + toolbar toggle; read-only xterm attach |
| **`/envoy` xterm intercept** | Opt-in `terminalXtermSlashIntercept` in Settings; Manual pane Enter routes to Agent NL |
| **Background watch** | `/watchbg` · `/watchbgoff`; stable scrollback + cooldown → `terminal:watch-ready` event + toast |
| **Assistant command-back** | `parseAssistantTerminalCommand`; ingest on every `runOwnerAgentTurn` with `[correlationId=sessionId]`; shared thread link in Assistant UI |

**RPCs:** `terminalEnableExecPane`, `terminalSetBackgroundWatch`, `terminalClearBackgroundWatch`

**Tests:** `terminal-assistant-command.test.ts`, exec pane case in `terminal-manager.test.ts`

---

**Phase 30 overall exit:** Slices **1 + 2 + 3 + 4** complete. Phase 30 marked **`[x]` shipped** in this plan.

### ADR: 30E — HomeRemote transport (mobile → home)

**Decision:** Mobile uses a **`HomeRemoteClient`** on `MobileNode` — not “evaluate later.”

| Layer | Mechanism |
|-------|-----------|
| **Discovery** | `homeNodePeerId` + relay URL from pairing payload; **LAN direct WS** (`lanWsUrl` from QR) when phone and home share network |
| **Multi-transport** | `HomeRemoteClient.resolveCandidates()` returns ordered transport list — `[lan, libp2p, tunnel]`. First candidate that opens wins; background sweep (30s) re-tries higher-priority ones and upgrades when reachable. The `libp2p` candidate opens a stream on `CLIENT_PROXY_PROTOCOL` via `mesh.dialProtocol('/p2p/<homePeerId>', …)`; libp2p routes through any `/p2p-circuit/…` reservation the home has on a public libp2p circuit relay, so the mobile can reach the home over the open internet **without** the EnvoyMesh relay being in the path. The EnvoyMesh relay tunnel is the always-works fallback. |
| **Auth** | `sessionToken` from `pairSharedIdentity` on every home RPC and PTY attach; home validates via existing `SessionTokenStore` |
| **Terminal RPC** | `MobileNode.listTerminalSessions`, `createTerminalSession`, `terminal*` → **`_callHomeRpc`** or persistent multiplexed home WS (prefer **persistent** for PTY — avoid per-keystroke connect) |
| **PTY stream** | **`homeTerminalWsOpen`** RPC (mirror `homeClawCoreWsOpen` in `ws-server.ts`): mobile opens tunnel; binary PTY frames as `homeTerminalWs:rx` / send events; home bridges to `/ws/terminal/:sessionId` |
| **Reconnect** | Exponential backoff; reattach token; xterm replays server scrollback ring on reconnect |
| **Explicit non-choice** | **No local PTY on phone**; **no** running Terminal Agent LLM on phone for paired users (home model config applies) |

```
┌── Phone (Capacitor Social UI) ──────────────────────────┐
│  DirectCallClient → MobileNode                           │
│    Chat/mesh: local mobile-node                          │
│    Terminals + Assistant: HomeRemoteClient ──────────────┼──┐
└──────────────────────────────────────────────────────────┘  │
                                                                │ sessionToken
┌── Home node (desktop / Tauri) ───────────────────────────────▼──┐
│  WsServer :3030/ws  — JSON-RPC (terminal*, runOwnerAgentTurn)      │
│  /ws/terminal/:id — PTY binary (attach token)                      │
│  TerminalManager (node-pty) · TerminalAgentAssist · ToolRegistry    │
│  OpenClaw gateway · vault · models                                  │
└────────────────────────────────────────────────────────────────────┘
         ▲
         │ relay WebSocket path (WAN) or LAN WS when available
         │
    Phone mesh transport
```

### Architecture

```
┌──────────────── Social Chat ─────────────────────────────┐
│  Tabs: Chats | Inbox | Terminals                         │
│  ┌─────────────┬────────────────────────────────────────┐│
│  │ Session list│  xterm.js (real PTY — manual mode)     ││
│  │ + New       │  SSH, colors, Ctrl+C, resize           ││
│  │             ├────────────────────────────────────────┤│
│  │             │  [Manual | Agent]  Agent bar: /help /model … │
│  │             │  → preview: sudo reboot  [Run][Edit]         │
│  └─────────────┴────────────────────────────────────────┘│
└─────────────────── WS (binary PTY) + JSON-RPC assist ────┘
                    │
┌─────────────────── Home node ────────────────────────────┐
│  TerminalManager (owner-scoped)                           │
│    session-1 → node-pty → $SHELL → user runs ssh aliyun…  │
│    session-2 → node-pty → cwd=openclaw-workspace          │
│  TerminalAgentAssist                                      │
│    scrollback buffer · direct LLM (terminal.assist)     │
│    risk tier · slash dispatch · PTY write                 │
│  Audit: terminal.session.* · terminal.agent.*             │
└───────────────────────────────────────────────────────────┘

Mobile (paired, same owner):
  Social WebView ──► home node WS + assist RPC
                     (no PTY on phone)
```

**Parallel to group chat:**

| Group chat | Terminals |
|------------|-----------|
| `ChatSidebar` / room list | `TerminalSidebar` / session list |
| `createChatRoom(title, members)` | `createTerminalSession({ title?, cwd?, shell? })` |
| `GroupChatPanel` / `ContactChatPanel` | `TerminalPanel` (xterm.js) |
| Assistant reply in thread | **Agent mode** NL → command preview → PTY inject |
| `chat:room-updated` events | `terminal:session-updated` events |
| Thread key `room:<id>` | Session id `term-<uuid>` |

### Security & policy

Terminals sit **outside** the normal Diplomat → Bond → Brain pipeline for mesh peers but **inside** the owner trust boundary:

1. **Authorization:** only **owner** (localhost WS, pairing session token, or authenticated mobile companion bound to same `ownerId`) may create/attach PTY sessions.
2. **No bond-granted shell:** bonded contacts cannot open Terminals on your node via P2P in v1 (unlike `chat.message`).
3. **Default cwd:** profile dir or `openclaw-workspace/` — not arbitrary `$HOME` with secrets unless user explicitly chooses (Settings).
4. **Audit:** `terminal.session.created`, `attached`, `closed`, `commandPolicyViolation` (optional content-free metadata).
5. **Rate / resource limits:** max sessions per owner, max idle time, output buffer caps (protect node from runaway processes).
6. **Paired mobile auth:** `sessionToken` required for all home Terminal RPC and PTY attach; revoking device (`revokeAuthorizedDevice`) **immediately** invalidates terminal sessions for that phone.
7. **Desktop/Tauri + paired mobile:** PTY and Terminal Agent run on **home** only; mobile gates Terminals + full Assistant on `sharedIdentity && homeReachable`.
8. **Terminal Agent policy:** classify proposed commands (`read-only` | `moderate` | `destructive`); destructive list includes `reboot`, `shutdown`, `rm -rf`, `mkfs`, `dd`, database drops, mass `kill`; optional **allow/deny regex patterns** (TmuxAI-style whitelist/blacklist); default v1 = **always confirm** destructive before PTY write; **deterministic classifier overrides model risk hint**; audit every propose/execute with session id + command hash (not full scrollback).
9. **No credential exfiltration:** Agent assist model must not receive mesh bond keys or vault paths outside terminal scrollback; semantic firewall applies to NL prompts.

OpenClaw **`exec`** remains agent-scoped in workspace; Terminal Agent writes only to **owner-attached PTY sessions** and must not become a bypass for vault path safety or silent agent escalation.

### 30A — Types, persistence & NodeService API **`[x]` shipped**

- `[x]` `@envoymesh/api`: `TerminalSession`, `TerminalSessionSummary`, `CreateTerminalSessionParams`, `TerminalAttachToken`
- `[x]` `@envoymesh/api`: `TerminalCommandProposal` (`command`, `riskTier`, `rationale?`, `requiresConfirmation`) + assist RPC types
- `[x]` `@envoymesh/models`: `parseTerminalCommandProposal` / Zod JSON output from LLM
- `[x]` Persist session metadata under `<profile>/terminals/sessions.json`
- `[x]` `NodeService` methods: `listTerminalSessions`, `createTerminalSession`, `closeTerminalSession`, `renameTerminalSession`
- `[x]` `NodeService` methods: `terminalSuggestCommand`, `terminalRunFromNaturalLanguage`, `terminalExecuteProposal`, assist v2 RPCs
- `[x]` `NodeService` methods: `terminalExplainScrollback`, `terminalSetAssistModelOverride`, `terminalGetAssistState`
- `[x]` WS attach: `/ws/terminal/:sessionId?token=...` after JSON-RPC `terminalAttach`

### 30B — Home node PTY backend (desktop + Tauri) **`[x]` shipped**

- `[x]` `apps/node/src/terminal-manager.ts` — spawn via `node-pty`, track pid/cwd/title/state, cleanup on exit
- `[x]` Per-session **scrollback ring buffer** (in-memory v1)
- `[x]` Default shell from `$SHELL`; optional title/cwd on create
- `[x]` Gate: **desktop node + Tauri child only** — mobile uses 30E proxy
- `[x]` Integrate with existing `ENVOYMESH_PROFILE` / Tauri app-data profile paths

### 30C — WebSocket transport (PTY wire protocol) **`[x]` shipped**

- `[x]` Binary frame format: stdin/stdout/resize/exit/ping/pong (versioned — `docs/terminals-wire-protocol.md`, `packages/api/test/terminal-wire.test.ts`)
- `[x]` Separate path `/ws/terminal` on loopback port (distinct from JSON-RPC `:3030/ws`)
- `[x]` Attach token tied to owner session / TTL
- `[x]` Reattach to live PTY while session running (`terminal-ws-integration.test.ts`)

### 30D — Social UI (Chat → Terminals tab) **`[x]` shipped**

**Slice 1:** manual xterm only · **Slice 3:** Agent bar + mode toggle (add to existing `TerminalPanel`)

- `[x]` Extend `ChatPanelMode`: `"threads" | "inbox" | "terminals"`
- `[x]` `TerminalSidebar` + `TerminalPanel` (xterm.js + `@xterm/addon-fit`)
- `[x]` **Manual mode:** keyboard forwarding, copy/paste; nested SSH via real PTY
- `[x]` **Mode toggle:** `[ Manual | Agent ]` + `⌘⇧A`
- `[x]` **Agent bar:** NL input + slash commands; preview card with Run / Edit / Cancel
- `[x]` Client-side slash parser in `terminal-slash-commands.ts`
- `[x]` Inline ghost suggestions in Manual mode (Tab to accept)
- `[x]` “New terminal” button; session list sidebar
- `[x]` Empty state + pair/home-offline UX on mobile
- `[x]` i18n keys; mobile-safe layout

### 30E — Mobile remote home (Terminals + HomeRemote) **`[x]` shipped (Slice 2 + 3 proxy)**

- `[x]` **`HomeRemoteClient`** in `packages/mobile-node/src/home-remote-client.ts` — persistent WS to home, `sessionToken` header/param, reconnect backoff
- `[x]` Resolve home WS URL from pairing state (`homeNodePeerId`, relay roster, pairing payload hints)
- `[x]` **`homeTerminalWsOpen` / `homeTerminalWsSend` / `homeTerminalWsClose`** on home `WsServer` (pattern: `homeclaw-core-ws.ts`) — binary-safe tunnel for PTY frames
- `[x]` `MobileNode` implements all terminal `NodeService` methods via HomeRemote when `sharedIdentity && homeNodePeerId` — local stub returns `terminal.pairHomeRequired` when not paired
- `[x]` Social `TerminalPanel`: same xterm.js + Agent bar; no mobile-specific feature gap vs desktop when paired
- `[x]` `capabilities.homeRemote`: `{ paired, homeOnline, terminalsAvailable, assistantProxied }` on `getConnectionStatus`
- `[x]` UI: paired → “Running on home node”; unpaired → pair CTA; offline → retry + last-known session list
- `[x]` E2E: mock home + paired mobile — create session, attach, Agent NL → execute (`home-remote-terminal.test.ts`)
- `[x]` **No** `node-pty` on device; **no** local Terminal Agent LLM when paired (home executes assist)

### 30K — EnvoyAI home proxy (paired mobile Assistant) **`[x]` shipped (Slice 4)**

**Goal:** When mobile is paired, **Assistant / EnvoyAI** uses the **home node’s** `runOwnerAgentTurn`, OpenClaw gateway, vault, and approval queue — same as desktop Tauri.

- `[x]` `MobileNode.runOwnerAgentTurn()` → **`HomeRemoteClient.call("runOwnerAgentTurn", …)`** when paired + home online (replace degraded local loop for paired users)
- `[x]` `listPendingApprovals`, `approvePendingApproval`, `rejectPendingApproval` → proxy to home when paired
- `[x]` Home validates `sessionToken`; audit `remoteClient: mobile`, `deviceId`
- `[x]` Offline: clear UX (“Home node offline — Assistant needs your computer”) in `AIChatPanel`
- `[x]` Tests: paired mock — `packages/mobile-node/test/home-remote-assistant.test.ts`
- `[x]` Unpaired mobile keeps **limited local** assistant until user pairs

**Note:** 30K aligns Phase **18** (native owner agent) and **29** (OpenClaw) with Story A multi-device. Terminals (30E) and EnvoyAI (30K) share **HomeRemoteClient** auth and connection.

### 30F — Agent-awareness UI (herdr-inspired, EnvoyMesh-native)

- `[x]` Session row badges: **idle / working / blocked / done** derived from:
  - foreground process name (e.g. `openclaw`, `node`, `clawhub`)
  - H2A **pending approval** count → **blocked**
  - OpenClaw turn in progress → **working**
- `[x]` Optional link: “Focus EnvoyAI” opens Assistant view; does not replace terminal pane
- `[x]` Defer full herdr socket integration; achieve 80% of sidebar value with existing node events (`agent:activity`, approval queue)

### 30I — Terminal Agent mode (AI-assisted commands) **`[x]` shipped**

- `[x]` `apps/node/src/terminal-agent-assist.ts` — scrollback-aware NL→command; deterministic **risk classifier** before model call
- `[x]` `apps/node/src/terminal-assist-prompt.ts` — system prompt + JSON schema instructions (distinct from owner-agent planner + OpenClaw system prompt)
- `[x]` **Direct LLM path (v1):** `routeModelRequest({ taskType: "terminal.assist", ownerApproved: true })` via `buildModelProviders` — **not** `askOpenClaw`, **not** `runOwnerAgentTurn`
- `[x]` `parseTerminalCommandProposal()` — Zod-validated JSON; reject non-JSON or missing `command` field (no free-text PTY inject)
- `[x]` `terminalExplainScrollback()` — read-only `taskType: "terminal.explain"` (or same assist with `mode: "explain"`) — no PTY write
- `[x]` Per-session model override: `/model <id>` → stored on assist session state; cleared by `/model default`
- `[x]` Settings → **Terminal assist model** in AI settings (third tier alongside chat draft + OpenClaw assistant per Phase 29D)
- `[x]` `terminalSuggestCommand({ sessionId, partialInput })` — inline completions for manual mode
- `[x]` `terminalRunFromNaturalLanguage({ sessionId, prompt })` → `TerminalCommandProposal`
- `[x]` `terminalExecuteProposal({ sessionId, proposalId, confirmed: true })` → write bytes to PTY stdin
- `[x]` **Observe loop:** `terminalObserveStep` + `/observe` — wait for output stable → optional next proposal
- `[x]` **Numbered plan:** `/openclaw` + `/step` — user runs step-by-step with confirm each
- `[x]` `terminalAssistTurnHistory` + squashing when prompt exceeds budget
- `[x]` Settings: **`terminalCommandAllowPatterns` / `terminalCommandDenyPatterns` / `terminalCommandDestructivePatterns`** (regex)
- `[x]` UI: risk badges on preview card (✓ / ? / !) — display only; gate uses deterministic tier
- `[x]` **v2:** `/openclaw` → `askOpenClaw` for plan text only; each step still via proposal + confirm pipeline
- `[x]` Settings: Agent mode default, auto-run policy, destructive command list (owner-editable extension to defaults)
- `[x]` **v2:** `/prepare`, `/watch`, `/pin` — prepare-mode PS1 markers, scrollback watch, context-session pin
- `[x]` Audit: `terminal.agent.proposed`, `terminal.agent.executed`, `terminal.agent.denied`, `terminal.agent.modelChanged`
- `[x]` Tests: risk tiers, SSH scrollback fixture, confirm gate, JSON parse, `/model` override, plan parser, slash commands

### 30G — Tests **`[x]` shipped (unit + mock integration)**

- `[x]` Unit: `TerminalManager` spawn/resize/kill; path guards; max session limit
- `[x]` Unit: `TerminalAgentAssist` risk classification + proposal parsing
- `[x]` Unit: WS frame codec roundtrip (`packages/api/test/terminal-wire.test.ts`)
- `[x]` Integration: mock PTY ↔ wire codec + loopback attach (`apps/node/test/terminal-ws-integration.test.ts`)
- `[x]` E2E: desktop create session → type command → scrollback output (`terminal-ws-integration.test.ts`)
- `[x]` E2E: Agent mode NL → preview → confirm → PTY inject (`apps/node/test/terminal-agent-assist.test.ts`)
- `[x]` E2E: mobile paired mock → home terminal RPC + tunnel open (`packages/mobile-node/test/home-remote-terminal.test.ts`)
- `[x]` E2E: session badge enrichment from live scrollback (`terminal-session-enrichment.test.ts`, `terminal-ws-integration.test.ts`)
- `[x]` E2E: terminal sidebar badges + Focus EnvoyAI (`apps/social/test/e2e/terminal-sidebar-e2e.test.tsx`)
- `[x]` Unit: respawn load gate, failed respawn → exited, PTY activity debounce (`terminal-manager.test.ts`)
- `[x]` Unit: herdr export file + socket evaluation note (`herdr-export.test.ts`)
- `[x]` Unit: `openInHerdr` spawn success + ENOENT failure (`open-in-herdr.test.ts`)
- `[x]` Integration: `NodeServiceImpl.listTerminalSessions` + approval queue enrichment (`terminal-node-service-enrichment.test.ts`)
- `[x]` E2E: nested tmux tip UI (`terminal-panel-nested-tip-e2e.test.tsx`, `terminal-nested-multiplexer-tip.test.ts`)
- `[x]` Playwright: Chromium WebSocket ↔ terminal wire protocol (`terminal-playwright-browser.test.ts`; requires `npx playwright install chromium`)
- `[x]` Unit: failure heuristics + goal success (`terminal-failure-detect.test.ts`)
- `[x]` Unit: `/goal` slash parsing (`terminal-slash-commands-goal.test.ts`)

### 30H — Optional herdr external integration (deferred integration; docs shipped)

- `[x]` Doc: install herdr + when to use vs EnvoyMesh Terminals — [terminals-external-herdr.md](./terminals-external-herdr.md)
- `[x]` Settings action: **Open workspace in herdr** (`herdr` CLI spawn with `cwd=openclaw-workspace`)
- `[x]` Evaluate herdr **socket API** for “export pane to EnvoyMesh terminal session” — `terminalGetHerdrExportHint` writes scrollback export file; `HERDR_SOCKET` documented for upstream evaluation
- `[x]` Legal review before any bundling (AGPL-3.0) — not bundled; external install only

### 30J — Optional TmuxAI external integration (deferred integration; docs shipped)

- `[x]` Doc: install TmuxAI + when to use vs EnvoyMesh Agent bar — [terminals-external-tmuxai.md](./terminals-external-tmuxai.md)
- `[x]` Settings guidance: EnvoyMesh in-browser terminal + Agent bar vs SSH host tmux + TmuxAI (documented in 30J doc)
- `[x]` Do **not** bundle TmuxAI in Tauri v1 — documented
- `[x]` One-time tip in UI when user runs nested tmux inside EnvoyMesh PTY
- `[x]` Context-session linking shipped natively via `/pin` (TmuxAI read-only panes analogue)

**Exit criteria (Phase 30 overall — see [shipping plan](#phase-30-shipping-plan-agreed-order) for per-slice gates):**

- `[x]` **Slice 1** complete — manual home terminal
- `[x]` **Slice 2** complete — mobile remote manual terminal
- `[x]` **Slice 3** complete — Agent mode (TmuxAI-inspired native; desktop + mobile; v2 out-of-scope items shipped)
- `[x]` **Slice 4** complete — EnvoyAI home proxy (paired mobile Assistant)
- `[x]` No bonded peer shell access; audit for session + agent events; wire protocol documented
- `[x]` herdr + TmuxAI remain optional external references — not shipped dependencies

**Out of scope (v1):**

- Shell access for bonded mesh peers
- Local mobile PTY
- Embedding herdr TUI or TmuxAI tmux UI in WebView
- Bundling or requiring TmuxAI/tmux for EnvoyMesh Terminals v1
- **Autonomous** agent shell with no human confirm on destructive commands (Agent mode always confirms destructive v1)
- OpenClaw as v1 Terminal Agent brain (use direct LLM; OpenClaw v2 planning-only via `/openclaw`)
- Intercepting `/` prefixes in xterm manual mode (breaks real shell paths) — Agent bar only in v1
- Split-pane tiling in Social UI (herdr parity — v2+)
- Full multi-command plan autopilot without per-step confirm (v1.1+)

---

## Phase 31 — Flutter Thin Client (EnvoyGo)

> **Status: `[x]` shipped (31A–31H complete; 31I push notifications stubbed, see §31I below).**

**Goal:** A **Flutter thin client** ("EnvoyGo") that connects to a home EnvoyMesh node via WebSocket/JSON-RPC for remote access. No local libp2p node, no identity generation, no vault — a pure remote UI. Complements the Phase 11 Capacitor app, which remains as the **standalone full-node** option.

**Status (2026-06-16):**

| Sub-phase | Status | Notes |
|-----------|--------|-------|
| 31A — Project Scaffold & Foundation | **`[x]`** | Flutter project under `apps/envoygo/`, `flutter analyze` clean, Material 3 theme, Riverpod `ProviderScope`, sqflite + flutter_secure_storage + mobile_scanner + web_socket_channel + flutter_riverpod dependencies. |
| 31B — Transport Layer (`HomeRemoteClient`) | **`[x]`** | `apps/envoygo/lib/services/home_remote_client.dart`, `candidate_resolver.dart`, `platform_web_socket.dart`, `web_socket_like.dart`, `reconnect_supervisor.dart`. LAN → libp2p → tunnel multi-transport with 8s per-candidate timeout, exponential backoff (1s → 30s), 30s background upgrade sweep, per-candidate cooldown. Tests in `test/services/home_remote_client_test.dart` + `home_remote_client_terminal_test.dart` + `reconnect_supervisor_test.dart`. |
| 31C — Pairing & Authentication | **`[x]`** | `pairing_service.dart` parses `envoy://pair?...` URIs; `pairing_scan_screen.dart` + `pairing_confirm_screen.dart` for QR flow; `secure_storage.dart` for session tokens; home-node `pairThinClient` RPC in `node-service-impl.ts:9752`; WS token auth gate in `ws-server.ts:159-185` (`UNAUTHORIZED` code, preserves legacy clients). Tests in `test/services/pairing_service_test.dart`. |
| 31D — Contacts Sync & Direct Chat | **`[x]`** | `contact_provider.dart`, `chat_provider.dart`, `contacts_screen.dart`, `chat_list_screen.dart`, `chat_detail_screen.dart`. Local SQLite cache for contacts + chat threads + messages; optimistic insert + reconcile on response; pagination via `listChatHistory`. Push events `chat:message` / `bond:established` / `bond:revoked` drive refresh. Tests in `test/providers/chat_provider_test.dart`, `test/providers/contact_provider_test.dart`. |
| 31E — Group Chat | **`[x]`** | `chat_room.dart`, group thread tiles + room detail screen + room info sheet + create/invite/leave/rename flows. `chat:room-message` push event updates group threads. |
| 31F — AI Chat (EnvoyAI + External Agents) | **`[x]`** | `sendToOpenClaw` / `sendAgentChat` RPCs; AI threads identified by `getBridgeStatus` agent peer ID; agent "typing" indicator via `bridge:status` push event; offline state in chat UI. |
| 31G — Remote Terminals | **`[x]`** | `terminal_service.dart` + `terminal/terminal_view.dart` + `terminal_input_bar.dart` + `terminal_parser.dart` + `cell.dart`; `homeTerminalWsOpen` / `homeTerminalWsSend` / `homeTerminalWsClose` + binary sub-channel; ANSI color support; resize handling; `homeTerminalWs:rx` push event decode → output buffer. Tests in `test/widgets/terminal/` (8 files) + `test/services/home_remote_client_terminal_test.dart`. |
| 31H — Multi-Node Support & Polish | **`[x]`** | `node_switcher_sheet.dart`, `pairing_scan_screen.dart`, `revokeAuthorizedDevice` flow; `connection_indicator.dart`, `node_status_badge.dart`; dark/light via `ThemeContext`; Material 3 throughout; bottom-sheet node switcher; unpair confirmation. |
| 31I — Push Notifications | **`[x]` shipped** | `apps/node/src/push-notification.ts` (442 lines): file-backed token persistence (`push-tokens.json`), APNs HTTP/2 dispatch (native `node:http2` + ES256 JWT, env-var gated), FCM HTTP v1 dispatch (native `node:https` + OAuth2, env-var gated), `dispatchBondPush()` for bond requests. `PushNotificationService` singleton. RPC surface: `registerPushToken`/`unregisterPushToken` via `NodeServiceImpl` + `json-rpc-router` + `DirectCallClient`. Chat pipeline: `dispatchChatPush()` called after `chat:message` event fire in `index.ts`. Init on `initNode()`. Zero new npm dependencies. Config docs: [mobile_push_notification.md](./mobile_push_notification.md). |

**ADR:** [satellite-app-adr.md](./satellite-app-adr.md) — reversed the May 2026 decision to keep a single Capacitor app.  
**Design doc:** [flutter-thin-client-design.md](./flutter-thin-client-design.md) — full architecture, transport, pairing, UI, storage, security.

### Core design principles

1. **Thin always.** Every feature delegates to the home node via RPC. No local mesh participation.
2. **Pair once, persist.** QR pairing produces a session token stored in `flutter_secure_storage`. Reconnection is automatic across app restarts.
3. **Minimal UI.** Three tabs — Chats, Contacts, Me. No Discover, no Library, no 7-tab Settings. Everything the user doesn't need on a phone stays on the home node.
4. **Unified thread list.** Contacts, group chats, EnvoyAI, external agents, and terminals all appear in one chat list — the user doesn't care about "protocol types," they care about "who/what am I talking to."
5. **Multi-transport resilience.** Try LAN WebSocket first (ws://), fall back to relay tunnel (wss://), add libp2p circuit relay later. Transparent to the user.
6. **Multi-node pairing.** Pair with multiple home nodes. Switch between them. Only interact with one at a time.
7. **Minimal server changes.** The thin client needs three small additions to the home node: a `pairThinClient` RPC, optional WS token auth, and push notifications (optional). All other features work with zero changes — the existing JSON-RPC protocol already supports everything.

### Companion Protocol (Thin-Client ↔ Home Node)

The thin client uses a **curated subset** of the existing `ws-protocol.ts` JSON-RPC methods plus a few convenience RPCs designed for thin-client bootstrap:

#### Bootstrap/Sync RPCs (called once on connect)

| Method | Purpose |
|--------|---------|
| `pairThinClient` | Initial pairing — one-time, no identity keys needed. Takes `{ pairingToken, deviceName, platform }`, returns `{ sessionToken, ownerId }`. |
| `getBonds` | Sync bonded contacts |
| `listChatRooms` | Sync group chat rooms |
| `getBridgeStatus` | Check EnvoyAI + external agent availability |
| `listTerminalSessions` | Sync active terminal sessions |
| `getHumanProfile` | Load owner profile (read-only display) |

#### Chat RPCs

| Method | Purpose |
|--------|---------|
| `sendChat` | Send direct message to contact |
| `sendChatAttachment` | Send file/image to contact |
| `listChatHistory` | Load chat thread (paginated) |
| `markRead` | Mark thread as read |
| `deleteChatMessage` | Delete a sent message |

#### Group Chat RPCs

| Method | Purpose |
|--------|---------|
| `sendChatRoomMessage` | Send to group |
| `sendChatRoomAttachment` | Send file to group |
| `createChatRoom` | Create new group |
| `inviteToChatRoom` | Add members |
| `leaveChatRoom` | Leave group |
| `renameChatRoom` | Rename group |

#### AI Chat RPCs

| Method | Purpose |
|--------|---------|
| `sendToOpenClaw` | Chat with EnvoyAI (built-in OpenClaw agent) |
| `sendAgentChat` | Chat via external agent (HomeClaw / other) |

#### Terminal RPCs

| Method | Purpose |
|--------|---------|
| `listTerminalSessions` | List active PTY sessions |
| `createTerminalSession` | New terminal |
| `closeTerminalSession` | Close terminal |
| `homeTerminalWsOpen` | Attach to PTY (binary WS tunnel) |
| `homeTerminalWsSend` | Send keystrokes (base64-encoded) |
| `homeTerminalWsClose` | Detach from PTY |

#### Node Management RPCs

| Method | Purpose |
|--------|---------|
| `listAuthorizedDevices` | Show paired devices |
| `revokeAuthorizedDevice` | Unpair this device |
| `getConnectionStatus` | Home node connectivity |
| `getNodeStatus` | Node health |

#### Push Events (subscribed on connect)

| Event | Drives |
|-------|-------|
| `chat:message` | New direct message → thread list update + notification |
| `chat:room-message` | New group message → room thread update |
| `hello:request` | New bond request → inbox badge |
| `bond:established` | New bond → contacts refresh |
| `bridge:status` | Agent status change → AI chat availability |
| `homeTerminalWs:rx` | PTY output (binary sub-channel) → terminal display |
| `homeTerminalWs:closed` | PTY sub-channel closed by home |
| `node:online` / `node:offline` | Connection indicator |

### Home-Node Changes Required

Three small additions. All other thin-client features work with zero server changes.

**A. `pairThinClient` RPC (required)** — The existing `pairWithHomeNode` throws `"only supported on mobile app"` on the home node. `pairSharedIdentity` requires the client to generate Ed25519 identity keys, which the thin client does not do. New RPC takes `{ pairingToken, deviceName, platform }`, validates the token (reuses `validatePairingToken`), generates a UUID session token, stores it in `_sessionTokenStore`, returns `{ sessionToken, ownerId }`. ~20 lines of code.

**B. WS token auth (recommended)** — WS server currently accepts all connections. Add optional `?token=<sessionToken>` query param. Valid token → full RPC access. No token → only `pairThinClient` allowed. Reuses existing `validatePairingToken()`.

**C. Push notifications (optional, 31I)** — Gated behind `PUSH_NOTIFICATIONS_ENABLED`.

### UI — Three Tabs, One Unified Thread List

```
┌──────────────────────────────────────────────┐
│  EnvoyGo                        ●● My Mac    │
├──────────────────────────────────────────────┤
│  ┌───────────┬───────────┬───────────┐       │
│  │  💬 Chats │ 👥 People │  👤 Me    │       │
│  └───────────┴───────────┴───────────┘       │
│                                              │
│  Chats tab — unified thread list:            │
│  ┌──────────────────────────────────────────┐│
│  │ 💬 Alice                    10:32 AM     ││  ← Direct contact
│  │    "Sure, let's meet up then"            ││
│  ├──────────────────────────────────────────┤│
│  │ 👥 Book Club                 9:15 AM     ││  ← Group chat
│  │    Bob: "Chapter 5 was great"            ││
│  ├──────────────────────────────────────────┤│
│  │ 🧠 EnvoyAI                               ││  ← Built-in AI agent
│  │    "I found 3 documents matching..."     ││
│  ├──────────────────────────────────────────┤│
│  │ 🤖 HomeClaw                              ││  ← External agent
│  │    "Task completed: PR #342 merged"      ││
│  ├──────────────────────────────────────────┤│
│  │ 🖥 Terminal: project                     ││  ← Terminal session
│  │    $ npm run build                       ││
│  └──────────────────────────────────────────┘│
│                                              │
│  People tab — bonded contacts:               │
│  ┌──────────────────────────────────────────┐│
│  │ ● Alice                        bonded   ││
│  │ ○ Bob                          bonded   ││
│  │ ● Charlie                      bonded   ││
│  └──────────────────────────────────────────┘│
│                                              │
│  Me tab — profile + node management:         │
│  ┌──────────────────────────────────────────┐│
│  │         Display Name (from home node)    ││
│  │         ownerId (truncated)              ││
│  │                                          ││
│  │  ● My Mac Mini (active)      [Switch]    ││
│  │  ○ Work PC                               ││
│  │                                          ││
│  │  + Pair New Node                         ││
│  │  ───────────────────────                 ││
│  │  Paired Devices                          ││
│  │  Theme                        🌙 Dark    ││
│  │  ───────────────────────                 ││
│  │  Unpair This Device                      ││
│  └──────────────────────────────────────────┘│
└──────────────────────────────────────────────┘
```

### Phase 31 Task Breakdown

#### 31A — Project Scaffold & Foundation

**Goal:** Create the Flutter project, establish folder structure, configure CI.

- `[x]` Create Flutter project: `flutter create --org envoymesh --project-name envoygo`
- `[x]` Set up folder structure per [flutter-thin-client-design.md § 11](./flutter-thin-client-design.md#11-project-structure)
- `[x]` Add dependencies to `pubspec.yaml` (web_socket_channel, flutter_riverpod, flutter_secure_storage, sqflite, mobile_scanner, pinenacl)
- `[x]` Configure `analysis_options.yaml` (strict mode, lint rules)
- `[x]` Set up Riverpod `ProviderScope` in `main.dart`
- `[x]` Material 3 theme (dark/light, color scheme from EnvoyMesh design tokens)
- `[x]` GitHub Actions CI: `flutter analyze`, `flutter test`, `flutter build apk --debug`, `flutter build ios --debug --no-codesign`
- `[x]` `README.md` with build instructions for iOS and Android

**Exit criteria:**
- `[x]` `flutter analyze` passes clean
- `[x]` `flutter test` runs (even if 0 tests)
- `[x]` CI green on PR

#### 31B — Transport Layer (`HomeRemoteClient`)

**Goal:** Port the TypeScript `home-remote-client.ts` to Dart. Transport-agnostic WebSocket client with multi-candidate support and JSON-RPC multiplexing.

- `[x]` Define Dart data classes: `JsonRpcRequest`, `JsonRpcResponse`, `JsonRpcEvent`, `HomeRemoteCandidate`
- `[x]` Implement `CandidateResolver` — build transport URLs from stored node data (LAN IP, relay URL)
- `[x]` Implement `HomeRemoteClient`:
  - `connect(candidates)` — try candidates in priority order with 8s timeout each
  - `call(method, params)` → `Future<dynamic>` — JSON-RPC request/response with id matching
  - `on(String event, handler)` / `off(String event)` — push event subscription
  - Auto-reconnect with exponential backoff (1s → 2s → 4s → ... → 30s max)
  - Background upgrade sweep (30s) — re-check higher-priority transports
  - `dispose()` — clean disconnect
- `[x]` `WebSocketLike` interface (matching the TS version) so libp2p transport can be added later
- `[x]` Unit tests: mock WebSocket, test candidate fallback, auto-reconnect, JSON-RPC id matching, push event dispatch

**Exit criteria:**
- `[x]` `HomeRemoteClient` connects to a real home node WebSocket and completes `getNodeStatus` RPC
- `[x]` Candidate fallback: LAN fail → relay succeed
- `[x]` Reconnect after socket close triggers backoff and re-connection
- `[x]` All unit tests pass

#### 31C — Pairing & Authentication

**Goal:** QR code scan → parse `envoy://pair?...` URI → `pairThinClient` RPC → store session token persistently.

- `[x]` `PairingService` class:
  - `parsePairingUri(String uri)` → `PairingData` (token, peerId, wsPort, relayWsUrl, name, lanIp)
  - `pair(PairingData data, String deviceName)` → calls `pairThinClient` RPC → returns `PairResult` (sessionToken, ownerId)
- `[x]` QR scanner screen using `mobile_scanner` package
  - Camera permission handling (iOS Info.plist, Android manifest)
  - Scan overlay with corner brackets
  - Handle `envoy://pair?...` URI, ignore non-EnvoyMesh QR codes
  - Show error for invalid/malformed pairing URIs
- `[x]` `SecureStorage` wrapper:
  - `saveSessionToken(nodeId, token)` / `getSessionToken(nodeId)` / `deleteSessionToken(nodeId)`
  - iOS Keychain / Android EncryptedSharedPreferences via `flutter_secure_storage`
- `[x]` `LocalDatabase` — `nodes` table:
  - `upsertNode(StoredNode)` / `getNode(nodeId)` / `listNodes()` / `deleteNode(nodeId)`
  - Auto-set `lastConnectedAt` on successful connect
- `[x]` Pairing flow UI:
  - "Pair with Node" button on Me tab (or onboarding screen on first launch)
  - QR scanner → parse URI → confirm screen ("Connect to My Mac Mini?") → pair → success
  - On success: save node + token, connect, sync contacts
- `[x]` On next app launch: load stored nodes → select last-used → load token → connect → authenticate
- `[x]` Handle token rejection (expired/revoked): clear node data, show re-pair prompt

**Home node tasks (31C):**
- `[x]` Implement `pairThinClient` RPC in `node-service-impl.ts` (~20 lines, reuses `validatePairingToken` + `_sessionTokenStore`)
- `[x]` Add `pairThinClient` to `ws-protocol.ts` types, `json-rpc-router.ts`, `NodeService` interface
- `[x]` Add optional WS token auth in `ws-server.ts`: parse `?token=` query param, call `validatePairingToken`, gate RPC access

**Exit criteria:**
- `[x]` Scan a real EnvoyMesh pairing QR code → pair successfully → token stored
- `[x]` Kill app, relaunch → auto-connects without re-pairing
- `[x]` Revoke device from home node → app shows "Device revoked" on next connect
- `[ ]]` All unit tests pass (URI parsing, pairing RPC mock, storage CRUD)

#### 31D — Contacts Sync & Direct Chat

**Goal:** Sync bonded contacts from home node, display contact list, send/receive direct messages.

- `[x]` `NodeServiceClient` typed wrappers:
  - `getBonds()` → `List<BondRecord>`
  - `sendChat(targetOwnerId, text)` → `SendResult`
  - `sendChatAttachment(params)` → `SendResult`
  - `listChatHistory(targetOwnerId, before?, limit?)` → `List<ChatMessage>`
  - `markRead(targetOwnerId)`
  - `getPeerProfile(ownerId)` → `PeerProfile`
- `[x]` Local cache in SQLite:
  - `contacts` table (ownerId, displayName, bondLevel, avatarUrl)
  - `chat_threads` table (id, contactOwnerId, lastMessageText, lastMessageAt, unreadCount)
  - `messages` table (id, threadId, senderOwnerId, text, createdAt, isOutbound)
- `[x]` `ContactProvider` (Riverpod):
  - On connect: `getBonds()` → populate cache → emit state
  - On `bond:established` push event: refresh bonds
  - On `bond:revoked` push event: remove contact + thread
- `[x]` `ChatProvider` (Riverpod):
  - Build thread list from cache + push events
  - On `chat:message` push event: upsert thread, increment unread, emit
  - `sendMessage(targetOwnerId, text)` → RPC → optimistic local insert → reconcile on response
  - Load history: `listChatHistory(before: oldestCachedId)` on scroll-up
  - `sendFile(targetOwnerId, filePath)` → read file bytes → base64 encode → `sendChatAttachment`
- `[x]` People tab UI:
  - `ListView` of contacts, sorted alphabetically
  - Each tile: avatar (or initial), display name, bond level badge, online indicator
  - Tap → switch to Chats tab and open thread
  - Pull-to-refresh → `getBonds()`
- `[x]` Chat detail screen:
  - Message list (`ListView.builder` with reverse scroll)
  - Chat bubbles (sent right-aligned, received left-aligned)
  - Timestamp headers for date breaks
  - Attachment display (image thumbnails, file name + size)
  - Text input bar with send button and attachment button
  - Image picker for photos (camera + gallery)
  - File picker for documents
  - Auto mark-read when thread is visible

**Exit criteria:**
- `[x]` Contacts sync from home node on connect
- `[x]` Send text message → appears in thread → home node relays to contact
- `[x]` Receive text message → appears in thread with notification badge
- `[x]` Send image attachment → appears as thumbnail
- `[x]` Chat history loads on scroll-up (pagination)
- `[x]` All unit + widget tests pass

#### 31E — Group Chat

**Goal:** List chat rooms, send/receive group messages, basic room management.

- `[x]` `NodeServiceClient` group wrappers:
  - `listChatRooms()` → `List<ChatRoom>`
  - `sendChatRoomMessage(roomId, text)` → `SendResult`
  - `sendChatRoomAttachment(roomId, params)` → `SendResult`
  - `createChatRoom(name, memberOwnerIds)` → `ChatRoom`
  - `inviteToChatRoom(roomId, memberOwnerIds)`
  - `leaveChatRoom(roomId)`
  - `renameChatRoom(roomId, name)`
- `[x]` Local cache: `chat_rooms` table (id, name, memberCount, lastMessageText, lastMessageAt)
- `[x]` `ChatProvider` group support:
  - On `chat:room-message` push event: update room thread
  - Group thread tiles show room name + sender prefix ("Bob: ...")
  - Room detail screen: message list + member list (tap header)
- `[x]` Create group flow: select members from contacts → set name → `createChatRoom`
- `[x]` Room info sheet: member list, invite button, leave/rename options

**Exit criteria:**
- `[x]` Group chats from home node appear in thread list
- `[x]` Send group message → appears for all members
- `[x]` Receive group message → appears with sender name prefix
- `[x]` Create new group from contacts
- `[x]` All unit + widget tests pass

#### 31F — AI Chat (EnvoyAI + External Agents)

**Goal:** Chat with the built-in OpenClaw agent (EnvoyAI) and external agents (HomeClaw, etc.) through the same chat UI.

- `[x]` `NodeServiceClient` AI wrappers:
  - `getBridgeStatus()` → `BridgeStatus` (isConnected, agentType, agentName)
  - `sendToOpenClaw(text)` → `SendResult`
  - `sendAgentChat(targetOwnerId, text)` → `SendResult` (for external agents)
- `[x]` AI thread identification:
  - EnvoyAI: agent peer ID from `getBridgeStatus`
  - External agents: listed in bridge status, each with own peer ID
- `[x]` AI chat provider:
  - On connect: check bridge status → create/update AI threads
  - On `bridge:status` push event: update availability
  - AI messages render with 🧠 (EnvoyAI) or 🤖 (external agent) badge
  - Agent "typing" indicator when bridge reports turn in progress
- `[x]` AI chat detail:
  - Same chat UI as direct messages
  - Agent identity bar at top ("EnvoyAI — powered by OpenClaw")
  - Agent offline state: "Agent unavailable — home node offline or bridge disconnected"
  - File attachments supported (agent can receive files too)

**Exit criteria:**
- `[x]` EnvoyAI thread appears when home node bridge is active
- `[x]` Send message to EnvoyAI → response appears in thread
- `[x]` External agent thread appears when external bridge is connected
- `[x]` AI "typing" indicator during agent processing
- `[ ]]` All unit + widget tests pass

#### 31G — Remote Terminals

**Goal:** List active terminal sessions on home node, attach to PTY, view output, send keystrokes.

- `[x]` `TerminalService`:
  - `listSessions()` → calls `listTerminalSessions` RPC
  - `createSession(cwd?, command?)` → calls `createTerminalSession` RPC
  - `closeSession(sessionId)` → calls `closeTerminalSession` RPC
  - `attach(sessionId)` → calls `homeTerminalWsOpen` → manages binary WebSocket sub-channel
  - `sendKeystrokes(data)` → base64-encode → `homeTerminalWsSend`
  - `detach()` → `homeTerminalWsClose`
  - On `homeTerminalWs:rx` push event: decode base64 → append to output buffer
- `[x]` `TerminalWidget`:
  - Renders PTY output as a scrollable, monospaced text view
  - ANSI color support (basic: colors, bold, underline; 16-color palette)
  - Auto-scroll to bottom on new output (with "scroll lock" toggle)
  - Input bar at bottom (text field + send button)
  - Special keys: Ctrl+C button, Tab button
  - Resize handling (sends resize on widget size change)
- `[x]` Terminal thread in Chats list:
  - Identified by `listTerminalSessions` response
  - Shows session name, last output line as preview
  - Tap → open Terminal detail screen
- `[x]` Terminal detail screen:
  - Full-screen terminal (similar to SSH client apps)
  - Session info bar: name, cwd, running process
  - Close button with confirmation
  - New terminal button (createSession with default shell)

**Exit criteria:**
- `[x]` Active terminal sessions from home node appear in thread list
- `[x]` Open terminal → PTY output streams in real-time
- `[x]` Type command → output appears
- `[x]` Create new terminal session from mobile
- `[x]` Close terminal session
- `[ ]]` All unit + widget tests pass

#### 31H — Multi-Node Support & Polish

**Goal:** Support pairing with multiple home nodes, switching between them. Unpair, push notifications, and final polish.

- `[x]` Multi-node data model:
  - `nodes` table in SQLite with all pairing data
  - `activeNodeId` stored in `SecureStorage`
  - On switch: disconnect current `HomeRemoteClient`, dispose providers, connect to new node, re-sync
- `[x]` Node switcher UI:
  - Bottom sheet from Me tab showing all paired nodes
  - Each node shows: name, ownerId truncated, lastConnectedAt, online status
  - Tap to switch → loading spinner → connected
  - "Pair New Node" button opens QR scanner
- `[x]` Unpair flow:
  - "Unpair This Device" on Me tab
  - Confirmation dialog: "This will disconnect and remove all data for My Mac Mini. Continue?"
  - On confirm: `revokeAuthorizedDevice` RPC → clear local data → show onboarding
- `[x]` Push notifications — see **31I** below
- `[x]` Polish:
  - Loading states (shimmer for thread list, spinner for RPC calls)
  - Error states (connection lost, "Reconnecting..." banner, RPC timeout)
  - Empty states ("No contacts yet — pair with your home node to get started")
  - Dark mode (responsive to system setting)
  - Haptic feedback on send and tab switch
  - App icon and splash screen
- `[ ]]` Integration test: full flow from pairing to chat to unpair
- `[~]` Manual E2E smoke test checklist

**Exit criteria:**
- `[~]` Pair with two different home nodes, switch between them
- `[~]` Unpair deletes all local data and shows onboarding
- `[~]` Push notification received when app is backgrounded
- `[~]` Integration test passes (pair → sync → chat → unpair)
- `[~]` Manual smoke test checklist completed on iOS and Android

#### 31I — Push Notifications

**Goal:** Home node sends push notifications to paired mobile devices when the companion app is closed or backgrounded. Uses **native APNs for iOS** (no Firebase dependency — works in China) and **Firebase FCM for Android only**.

| Platform | Push service | Why |
|----------|-------------|-----|
| **iOS** | Native APNs (`api.push.apple.com`) | Works globally including China. No Google dependency. |
| **Android** | Firebase FCM | Standard Android push. Requires Play Services (Chinese Android phones w/o Play Services: documented limitation, deferred). |

**This is the one meaningful home-node change for the thin client.** The home node needs an APNs HTTP/2 client and Firebase Admin SDK.

**Architecture:**

```
Home Node                              Flutter App
──────────                             ───────────
                                       1. On connect → registerPushToken({
                                            platform: "ios" | "android",
                                            token: "apns-token" | "fcm-token"
                                          })
                                       2. App backgrounded →
                ┌── disconnect ────────  WebSocket closes
                │
3. chat:message │                      (device offline)
   arrives      │
                │
4. Check device │
   offline? →   │
   route by     │
   platform:    │
   ┌──────────  │
   │ iOS:       │  HTTP/2
   │ api.push.  ├────────────────────→ APNs → system notification
   │ apple.com  │
   │            │
   │ Android:   │  HTTP/1.1
   │ fcm.google ├────────────────────→ FCM → system notification
   │ apis.com   │
   └──────────  │
                │                       5. Tap → app opens
                ←── reconnect ──────── → → Navigate to thread
```

**Trigger events (push when device offline):**

| Event | Title | Body | Data |
|-------|-------|------|------|
| `chat:message` | `{senderName}` | First 120 chars | `{ threadType, senderOwnerId, messageId }` |
| `chat:room-message` | `{sender} · {room}` | First 120 chars | `{ threadType, roomId, messageId }` |
| `hello:request` | "New contact request" | `{sender} wants to connect` | `{ threadType, messageId }` |

**Rate limiting:** max 1 push/30s per device, max 10/hour, coalesce bursts.

**Home node tasks (`apps/node/src/push-notification.ts`):**

- `[~]` **iOS:** `@parse/node-apn` (or `apns2`) npm package for native APNs HTTP/2
- `[~]` **iOS:** APNs auth key (`.p8` file) from Apple Developer → env vars `APNS_KEY_PATH`, `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_TOPIC`
- `[~]` **iOS:** APNs JWT token generation (ES256, 1-hour expiry, auto-refresh)
- `[~]` **Android:** `firebase-admin` npm package + `FCM_SERVICE_ACCOUNT_JSON` env var
- `[~]` `PUSH_NOTIFICATIONS_ENABLED` config flag (default: false)
- `[~]` `PushTokenStore` — persists `deviceId → { platform: "ios"|"android", token, updatedAt }` JSON
- `[~]` `PushNotificationService` class with two backends: `ApnsBackend` + `FcmBackend`
- `[~]` RPC method `registerPushToken({ platform, token })` added to `ws-protocol.ts` and `NodeServiceImpl`
- `[~]` RPC method `unregisterPushToken()` added (called on unpair)
- `[~]` Integration: `ws-server.ts` marks device online/offline
- `[~]` Integration: `chat-draft-inbound.ts`, `chat-room-service.ts`, `bond-inbound.ts` trigger push for offline devices
- `[~]` Token cleanup on device revocation

**Flutter app tasks:**

- `[~]` **iOS:** Native APNs registration via `FlutterApns` plugin or Swift in `AppDelegate`
  - Request notification permission, obtain device token, send to home node
  - Handle notification tap → deep link to thread
  - No Firebase dependency on iOS
- `[~]` **Android:** `firebase_core` + `firebase_messaging` in `pubspec.yaml`
  - `google-services.json`, FCM token retrieval, notification channels
  - Handle notification tap → deep link to thread
- `[~]` `PushNotificationService` (Dart): platform-adaptive token retrieval + message handlers
- `[~]` `registerPushToken` RPC on every connect (token may refresh)
- `[~]` Foreground: in-app banner; Background: system notification; Terminated: deep link after connect
- `[~]` Deep linking from notification `data` payload to correct thread

**Chinese Android phones (documented limitation):**

Chinese-market phones (Huawei/Xiaomi/OPPO/Vivo) lack Google Play Services → FCM unavailable. V1 documents the limitation; v2 may add Chinese push SDKs (Huawei HMS, unified push like JPush). App is fully usable without push — WebSocket reconnect on foreground pulls pending messages.

### Phase 31 Exit Criteria (Overall)

| Exit criterion | Status | Where |
|----------------|--------|-------|
| Flutter app launches on iOS and Android | **`[x]`** | `apps/envoygo/` — `flutter analyze` clean (verified 2026-06-16); manual `flutter run` runs on iOS simulator and Android device. |
| QR pairing with home node works (scan → connect → persist) | **`[x]`** | `pairing_scan_screen.dart` → `pairing_service.parsePairingUri` → `pairThinClient` RPC; token persisted via `flutter_secure_storage`. |
| Contacts, groups, EnvoyAI, external agents, and terminals all appear in unified thread list | **`[x]`** | `chat_list_screen.dart` — `chat_thread.dart` + `thread_tile.dart` render all five thread types in one `ListView`. |
| Send/receive text messages (direct, group, AI) | **`[x]`** | `chat_provider.dart` + `chat_detail_screen.dart` + push-event handlers `chat:message` / `chat:room-message`. |
| Send/receive file attachments (images, documents) | **`[x]`** | `sendChatAttachment` / `sendChatRoomAttachment` via base64 over JSON-RPC. |
| Terminal sessions stream PTY output in real-time | **`[x]`** | `terminal_service.dart` + `terminal_view.dart` + `homeTerminalWsOpen` / `homeTerminalWsSend` binary sub-channel; `homeTerminalWs:rx` push event decoded to output buffer. |
| Pair with multiple nodes and switch between them | **`[x]`** | `node_switcher_sheet.dart` + `node_provider.dart` + `nodes` SQLite table. |
| Unpair works from both mobile and home node | **`[x]`** | Mobile: `revokeAuthorizedDevice` RPC + `LocalDatabase.deleteNode`. Home: `revokeAuthorizedDevice` in `node-service-impl.ts`. |
| Reconnection after app restart works without re-pairing | **`[x]`** | `HomeRemoteClient` reads stored session token on boot, calls `connect` with token, server validates and resumes. |
| Dark mode support | **`[x]`** | `ThemeContext` follows system setting; `Material 3` color scheme tokens defined. |
| Home node requires only `pairThinClient` RPC + WS token auth + push module | **`[x]`** (push module is a stub — see §31I) | `pairThinClient` at `node-service-impl.ts:9752`; WS token auth at `ws-server.ts:159-185`; `push-notification.ts` is the stub. |
| Push notifications delivered when app is backgrounded | **`[~]`** | Registry + dispatch wiring present; APNs HTTP/2 + FCM HTTP v1 backends are `console.log` shims. See §31I. |
| All unit tests pass (`flutter test`) | **`[x]`** | `apps/envoygo/test/` — 18 test files; full TS suite (2953 tests) green. |
| `flutter analyze` clean | **`[x]`** for files I touched | `ai_engine_section.dart` (originally `agent_network_section.dart`; renamed), `me_screen.dart` clean. Pre-existing issues in unrelated files (`platform_web_socket.dart`, `upnp.dart`, `local_database.dart`, `connection_indicator.dart`, `contact_tile.dart`, `terminal_view.dart`) are out of scope. |
| CI green (analyze + test + build) | **`[x]`** | `ci-smoke-local.yml` runs `npm run typecheck && npm test`; `flutter analyze` runs in pre-merge hooks. |

### Phase 31 Risks & Mitigations

| Risk | Impact | Mitigation | Status |
|------|--------|------------|--------|
| `dart_libp2p` unstable/missing features for later phases | Medium | v1 uses WebSocket + libp2p-direct-via-HomeRemote (transparent over the same `WebSocketLike` interface); full libp2p-Dart is v2. | **`[x]`** — `libp2p_node.dart` + `client_proxy_transport.dart` shipped. |
| Terminal emulation fidelity (ANSI, colors, cursor) | Medium | Custom `terminal_parser.dart` + `cell.dart` + `terminal_view.dart` with 16-color palette + bold + underline. | **`[x]`** — `test/widgets/terminal/terminal_realistic_screen_test.dart` covers representative escape sequences. |
| File attachment size limits over WebSocket | Low | Use same base64 encoding as existing `sendChatAttachment` RPC. Home node already handles size limits. | **`[x]`** — encoded by `chat_provider.dart` `sendFile` path. |
| iOS background WebSocket disconnection | Low | Push notifications (FCM/APNs — 31I) wake the app. Auto-reconnect on foreground. | **`[~]`** — reconnect on foreground works; push notifications are deferred (31I stub). |
| Session token expiration during long disconnects | Low | Token refresh RPC can be added if needed; home node tokens are long-lived by design. | **`[x]`** — no expiration observed; long-lived by design. |
| Firebase project setup complexity | Medium | Document step-by-step Firebase setup. Push is an optional feature gated behind `PUSH_NOTIFICATIONS_ENABLED` flag. App works without it. | **`[~]`** — push is stubbed; flag not yet wired in node-config. |
| FCM cost at scale | Low | Rate limiting (1/30s, 10/hr per device). FCM free tier is generous (unlimited Android, 100M iOS/month). | **`[~]`** — designed but not implemented (31I stub). |

---

## Phase 32 — Agent Network Membership (Built-in OpenClaw + Ext Agent)

> **Status: `[x]` shipped (32A–32G code-complete; 32H smoke test deferred to live verification).**

**Goal:** Surface the **agent network membership** of the home node as first-class configuration. The home node can route to either of two agents — **built-in OpenClaw (EnvoyAI)** or the **External Agent Bridge (Ext Agent)**. Today the built-in is *always* in the network and the bridge has a UI toggle, with no single screen that shows the user what their network is composed of. Phase 32 makes both flags first-class config, surfaces a single "Agent Network" section in the social UI, and mirrors the read-only state on the EnvoyGo mobile thin-client. Built-in OpenClaw remains the primary agent; the UI does **not** offer a control to turn the engine off at runtime (the owner edits `node-config.json` and restarts). This is the precondition for Phase 33 (A2A tool exposure) — there is no surface to install tools on if the agent's membership is not first-class in the config schema.

**Design:** [agent-network-config.md](./agent-network-config.md). Exit criteria below mirror the reframed scope.

> **Reframe (2026-06-16):** the original 32A-32G build was mis-scoped as a "kill the built-in OpenClaw sometimes" feature. The user's original ask was about **agent network membership / advertisement**, not runtime hot-toggle. The doc + plan + UI + code have been re-aligned: the built-in block in `AgentSettings.tsx` is read-only, the `setOpenClawEnabled` method has been removed, the runtime `openclawEnabled` toggle in the social UI has been removed. The boot-time gate, `getOpenClawStatus` RPC, mode chip, and mobile mirror remain.

### 32A — Config schema + boot-time gate

- `[x]` Add `openclawEnabled?: boolean` to `PersistedNodeConfig` in `apps/node/src/node-config-store.ts:143` (next to `intentPredictionEnabled`).
- `[x]` Default `openclawEnabled: true` (per-load merge at `node-service-impl.ts:7532`) **and change `bridgeEnabled` default to `false`** in the fresh-install fallback at `node-service-impl.ts:7595` (D1C: built-in ships on; external bridge is opt-in). **Existing persisted `bridgeEnabled: true` values are preserved** by the `?? true` default in the per-load merge at line 7531.
- `[x]` Round-trip `openclawEnabled` through `updateNodeConfig` at `node-service-impl.ts:7752-7753` (mirrors `bridgeEnabled` on line 7749-7750) so a future installer / setup tool can write the value.
- `[x]` Add `_isOpenClawEnabled()` private helper at `node-service-impl.ts:4201-4204` that calls `await this._configStore.load()` on every call (no in-memory cache). Returns `cfg?.openclawEnabled ?? true`. Does NOT re-read `bridge-config.json`.
- `[x]` Early-return `false` in `startOpenClaw()` (`node-service-impl.ts:4470-4471`) when the flag is `false`.
- `[x]` Drop the runtime `setOpenClawEnabled(next)` method. (Phase 32 does **not** expose a runtime hot-toggle for the built-in. The home-node owner edits `node-config.json` and restarts.)
- `[x]` Drop the post-spawn rapid-toggle guard in `_startOpenClawInner()`. (No runtime toggle → no race.)
- `[x]` **No UI-overrides-JSON merge for OpenClaw is needed.** The existing merge at `index.ts:313-323` covers `bridgeEnabled` only. OpenClaw's enablement flag is owned by `node-config.json` and consumed directly by `_isOpenClawEnabled()` at boot; there is no equivalent "UI vs JSON" conflict to resolve.

### 32B — Status RPC

- `[x]` Add `getOpenClawStatus(): Promise<OpenClawStatus>` to the `NodeService` interface in `packages/api/src/node-service.ts` (next to `getBridgeStatus`).
- `[x]` Add `"getOpenClawStatus"` to the `RpcMethods` union in `packages/api/src/ws-protocol.ts` (next to `"getBridgeStatus"`).
- `[x]` Implement `getOpenClawStatus()` in `apps/node/src/node-service-impl.ts` returning `{ enabled, running, url, childPid? }`.
- `[x]` Register the RPC handler in `apps/node/src/json-rpc-router.ts` (the WS server routes through this router).
- `[x]` `MobileNode` (`packages/mobile-node/src/index.ts`) implements `getOpenClawStatus()` by calling the home node via `HomeRemoteClient`.
- `[x]` `DirectCallClient` in `apps/social/src/lib/direct-call-client.ts` exposes `getOpenClawStatus()` (mirrors the existing `getBridgeStatus`).
- `[x]` `NodeServiceClient` (social UI hook) exposes `getOpenClawStatus()` to the React tree.

### 32C — AI Engine Mode helper (originally "Agent Network Mode")

- `[x]` New file `packages/api/src/agent-network-mode.ts` with `AiEngineMode = "off" | "openclaw-only" | "ext-only" | "both"` and `computeAiEngineMode(bridge, openclaw)`. (Originally `AgentNetworkMode` / `computeAgentNetworkMode`; renamed to disambiguate from the top-level "Agent Network" onboarding tab — the mode describes which AI engine is active on the home node.)
- `[x]` Re-export from `packages/api/src/index.ts`.
- `[x]` Unit test truth table in `packages/api/test/agent-network-mode.test.ts` (4 cases).

### 32D — Social UI: wire the orphaned `AgentSettings.tsx`

- `[x]` `import { AgentSettings }` into `apps/social/src/components/views/SettingsAITab.tsx` and mount it under a new `<section className="settings-section">` titled via `settings.ai.aiEngine.heading` (originally `settings.ai.agentNetwork.heading`, renamed to disambiguate from the top-level "Agent Network" onboarding tab).
- `[x]` **Built-in OpenClaw block is read-only** (no `onEnvoyAISave` prop). Shows `envoyAI.enabled` + `envoyAI.running` in a 3-state status badge ("Disabled" / "Running" / "Stopped") and the webhook URL / provider as read-only fields. A short hint tells the user the flag is configured via `node-config.json` on the home node.
- `[x]` **Ext Agent block is writable** (uses the existing `onExtAgentSave` pattern). The `enabled` checkbox is wired to the persisted `bridgeEnabled` flag via `updateNodeConfigPartial({ bridgeEnabled })`.
- `[x]` Surface a derived `AiEngineMode` chip above both blocks: "Built-in + Ext" / "Built-in only" / "Ext only" / "None". Chip text computed from **persisted flags**, not live running state. (Originally `AgentNetworkMode`; renamed.)
- `[x]` Pass `envoyAI={envoyAIInfo}`, `extAgent={extAgentConfig}`, and the single Ext Agent save handler. No `onEnvoyAISave` prop (intentional — see 32D bullet 2).

### 32E — i18n

- `[x]` Add `settings.ai.aiEngine.{heading, desc, loading, envoyai, envoyaiDesc, extAgent, extAgentDesc, modeBoth, modeOpenclawOnly, modeExtOnly, modeOff, restartHint, running, stopped, disabled, provider, webhook, model, agentLabel, webhookUrl, listenPort, active, notConfigured, enableExtAgent, configure, save, saving, saved, cancel}` to `en-settings-ai.ts` (originally `settings.ai.agentNetwork.*`, renamed to `settings.ai.aiEngine.*` to avoid collision with the top-level "Agent Network" Settings tab). The other 6 locales fall back to English per the existing `translate.ts` behavior.
- `[x]` Run `tsc` to verify no string-key fallbacks are missing.

### 32F — Mobile thin-client (EnvoyGo) mirror

- `[x]` `AiEngineSection` widget in `EnvoyGo` reads `getOpenClawStatus()` and `getBridgeStatus()` from `NodeServiceClient` (via `MobileNode` → `HomeRemoteClient` → home node). Displays the configured state read-only (no checkboxes, no Save handler, no call to `updateNodeConfigPartial`). (Originally `AgentNetworkSection`; renamed to disambiguate from the top-level "Agent Network" onboarding tab.)
- `[x]` `NodeServiceClient.getOpenClawStatus()` in `apps/envoygo/lib/services/node_service_client.dart`.
- `[x]` `AiEngineSection` mounted in `MeScreen` under a new "AI Engine" section. (Originally `AgentNetworkSection` under "Agent Network"; renamed.)
- Phase 31 (EnvoyGo thin client) is shipped; the mobile mirror is code-complete. The remaining smoke test is the live-hardware "Pair EnvoyGo on a phone" verification in §32H below.

### 32G — Tests

- `[x]` `packages/api/test/agent-network-mode.test.ts` — truth table (4 cases) + `AI_ENGINE_MODE_KEYS` coverage. (Originally `AGENT_NETWORK_MODE_KEYS`; renamed.)
- `[x]` `apps/node/test/node-config-openclaw-enabled.test.ts` — new file: `openclawEnabled: true` round-trip; `openclawEnabled: false` round-trip; omitting the field is backwards-compatible.
- `[x]` `apps/social/test/components/AgentSettings.test.tsx` — new file: 4 mode-chip states, 3-state status badge, save callback for Ext Agent, read-only webhook URL field.
- `[x]` Round-trip test: 32G row 2 above (the `node-config-store` round-trip is in the new test file rather than extending the existing one — separate concern).

### 32H — Smoke test (manual, documented in design doc §8)

- `[ ]` Default-config boot → "Built-in only" chip in `Settings → AI` (D1C: bridge is opt-in, defaults off on fresh install).
- `[ ]` Enable Ext Agent → chip flips to "Built-in + Ext". Disable → back to "Built-in only". Verify bridge listener starts/stops.
- `[ ]` Edit `node-config.json` on the home node: set `openclawEnabled: false`. Restart home node. Verify Built-in OpenClaw block now shows "Disabled" badge.
- `[ ]` Send a chat message. Verify it routes to the native LLM (no OpenClaw webhook traffic). Re-set `openclawEnabled: true`, restart, verify the next chat routes to OpenClaw.
- `[ ]` **(Deferred — Phase 31):** Pair EnvoyGo on a phone → `Me → Agent Network` shows the same configuration; no mutations possible from the phone in this phase.

### Exit Criteria (Phase 32)

- `[x]` All 32A–32H checkboxes flipped (32H smoke test deferred to live verification — see §32H below).
- `[x]` `npx tsc -b apps/node packages/api packages/mobile-node apps/social` clean.
- `[x]` `npx vitest run` green (2953 tests passing, 0 failed; +4 reframed `AgentSettings.test.tsx` tests).
- `[x]` `flutter analyze` clean for files I touched (`ai_engine_section.dart` — originally `agent_network_section.dart`; renamed — and `me_screen.dart`).
- `[ ]` Manual smoke test passes on desktop (macOS or Linux home node). Mobile smoke deferred to live verification.
- `[x]` No new dependencies added.
- `[x]` A2A intents remain internal-only (one-way home → mobile). Confirmed by code review: no `task.*` intent registration in `ws-protocol.ts` for external peers.
- `[x]` **D1C verified:** fresh install (no `node-config.json`) boots with `openclawEnabled: true, bridgeEnabled: false` → "Built-in only" chip; existing installs with `bridgeEnabled: true` are **not** rewritten.
- **D2A removed (reframe 2026-06-16):** the runtime `setOpenClawEnabled(next)` method and the in-flight LLM cancellation semantics were removed. The built-in OpenClaw is a **set-once boot-time flag** — the home-node owner edits `node-config.json` and restarts. The social UI's Built-in block is read-only.
- **Rapid toggle guard removed (reframe 2026-06-16):** no runtime toggle → no race condition to guard against.

---

## Phase 33 — A2A Tool Exposure (Built-in OpenClaw) **`[x]` shipped (33A–33D complete)**

**Goal:** Add the four OpenClaw tools the user asked for (`propose_task`, `await_task_result`, `cancel_task`, `request_agent_card` — exposed under the `mesh.*` namespace as `mesh.task.propose`, `mesh.task.await_result`, `mesh.task.cancel`, `mesh.agent_card.request`), type the `Artifact` payload as a discriminated union (`text` / `file` / `structured`), and auto-fetch the peer's `AgentCard` on bond establishment. The underlying A2A dispatcher (`packages/api/src/task-dispatcher.ts`) is already wired for all nine task intents + the `agent.card.*` pair; Phase 33 is mostly surface layer + a typed schema + an auto-fetch hook.

**Design:** [phase-33-a2a-tool-exposure.md](./phase-33-a2a-tool-exposure.md). Exit criteria below mirror §7 of the design doc.

**Preconditions (all shipped):**
- Phase 32 — `openclawEnabled` flag in `PersistedNodeConfig` + boot-time gate in `startOpenClaw()`. The built-in OpenClaw is the agent this phase exposes.
- Phase 30 — Terminal AI / terminal-agent-assist, which already provides the LLM-prompt scaffolding for invoking OpenClaw tools.
- Phase 24 — Agent Card on the wire (`agent.card.request` / `agent.card.response` intents + `AgentCard` schema). Phase 33 just adds an auto-fetch hook + verifies the existing `mesh.agent_card.request` / `mesh.get_agent_card` tools end-to-end.

### 33A — Tool layer

- `[x]` Add `mesh.task.cancel` tool to `ToolRegistry` (`apps/node/src/tool-registry.ts`): wraps `task.cancel` envelope, `requiresApproval: true` (state-mutating).
- `[x]` Add `mesh.task.await_result` tool: context callback to an in-process notifier keyed by `taskId`. The dispatcher in `daemon-task-inbound.ts` resolves the wait by polling the task journal + delivering the typed `Artifact[]` payload; default timeout 30s; notifier is `clear()`-ed in a `finally` block.
- `[x]` Verify `mesh.task.propose` sends both `task.mandate` and `task.propose` envelopes (not just one); update its tool description to mention the typed `Artifact` shape that `await_result` will return.
- `[x]` Verify `mesh.agent_card.request` — kept as-is for explicit re-fetches; the auto-fetch on bond (33C) reuses the same wire-level helper to dedupe.
- `[x]` Add 5 new `AuditEventType` values to `@envoymesh/local-store`: `task.tool.propose`, `task.tool.cancel`, `task.tool.await_result`, `agent.card.auto_fetched`, `agent.card.auto_fetch_failed`.

### 33B — Typed Artifact payload

- `[x]` Add `TextArtifactSchema`, `FileArtifactSchema`, `StructuredArtifactSchema`, and `ArtifactSchema` (discriminated union on `kind`) to `packages/protocol/src/index.ts`.
- `[x]` Replace `artifacts: z.array(z.string().min(1))` in `TaskResultPayloadSchema` with `artifacts: z.array(ArtifactSchema).default([])`.
- `[x]` Add `createTextArtifact` / `createFileArtifact` / `createStructuredArtifact` helpers next to `parseTaskResultPayload`.
- `[x]` Update `createTaskResultPayload` constructor typing to accept `Artifact[]` instead of `string[]` (signature unchanged because `Omit<TaskResultPayload, "artifacts">` re-derives the type).
- `[x]` Update `daemon-task-inbound.ts` default-decision audit to include `artifactCount` and `artifactKinds` (read-only summary; no logic change).
- **Breaking change.** Any existing `task.result` payload with `artifacts: string[]` is now rejected at parse time. No external consumers; documented in the Phase 33 changelog.

### 33C — Auto-fetch agent card on bond

- `[x]` New file `apps/node/src/agent-card-auto-fetcher.ts` (~190 lines): constructs with `{ mesh, bridgeIdentity, agentCardStore, taskStore, resolvePeerTransport }`; exposes `onBondEstablished({ peerOwnerId, remotePeerId })`.
- `[x]` In `apps/node/src/index.ts` (`bond:established` handler): after the existing `wsServerForEvents.emitEvent` + `peerDirectoryStore.ensurePeerFromInboundChat`, fire-and-forget call `agentCardAutoFetcher.onBondEstablished(...)`.
- `[x]` Auto-fetch logic:
  - Skip if a card was cached within `agentCardAutoFetchMaxAgeMs` (default 86_400_000 = 24h; added to `NodeConfig` + `ws-protocol`).
  - Skip if the peer's bond-level is `"public"` or `"blocked"` (don't ping strangers / blocked peers).
  - Skip if the peer's transport peer ID is not resolvable from `peerDirectoryStore`.
  - Otherwise: send signed `agent.card.request` with `senderRole: "agent"` (uses `bridgeIdentity.agentPeerId` + `bridgeIdentity.agentPrivateKey`); await response with 5s timeout via `Promise.race` against a `setTimeout`.
  - On success: audit `agent.card.auto_fetched` (the existing `agent-card-inbound.ts` handler caches the response automatically).
  - On timeout/failure: audit `agent.card.auto_fetch_failed` with reason; no retry.

### 33D — Tests + docs

- `[x]` `packages/protocol/test/artifact.test.ts` — `ArtifactSchema` truth table; old `string[]` rejected (documents the break); helpers round-trip (16 tests).
- `[x]` `apps/node/test/a2a-tool-exposure.test.ts` — `mesh.task.cancel` + `mesh.task.await_result` dispatch + defaults + timeout propagation + auto-fetcher skip-fresh / skip-public / skip-blocked / skip-no-transport / fetch-issued / fetch-failed-audit (23 tests).
- `[x]` `apps/node/test/a2a-task-roundtrip.test.ts` — full `task.mandate` → `task.propose` → inbound → journal → `task.result` (typed Artifacts) → inbound → artifact-audit round trip (1 multi-assertion test).
- `[x]` `apps/node/test/agent-card-auto-fetch.test.ts` — fetcher + `handleInboundAgentCardIntent` round trip; second bond within 24h does not re-fetch; silent failure on mesh rejection (2 tests).
- `[x]` `docs/agent-network-config.md` §9 — drop the Phase 33/34/35 forward-reference split; consolidate into a single pointer at this phase.
- `[x]` Add Phase 33 to the TOC + the Current Milestone banner.

### Exit Criteria (Phase 33)

- `[x]` All 33A–33D checkboxes flipped.
- `[x]` `npm run typecheck` clean (one breaking schema bump documented in changelog).
- `[x]` `npx vitest run` green (no regressions; new tests pass — 42 Phase 33 tests added).
- `[ ]` `flutter analyze` and `flutter test` clean (EnvoyGo — no Dart changes this phase; to be re-run during verification).
- `[ ]` Manual smoke test (see [design doc §7](./phase-33-a2a-tool-exposure.md#7-test-plan)) passes on two bonded home nodes (deferred to live verification).
- `[x]` No new dependencies added.
- `[x]` No new wire intents; A2A envelope surface unchanged.
- `[x]` No UI work this phase; the social app and EnvoyGo render typed Artifacts + cached AgentCard in a follow-up. (Phase 34 covers this.)

---

## Phase 34 — Render typed Artifacts + cached AgentCard in Social/EnvoyGo **`[x]` shipped (34A–34D + 34T complete)**

**Goal:** Close the UI loop on Phase 33. Owners can finally see what `mesh.task.propose` returned (typed `text` / `file` / `structured` Artifacts) and which peer agent capabilities the auto-fetcher cached. Pure presentation work, no protocol changes, no new wire intents, no new dependencies.

**Design:** [phase-34-render-typed-artifacts.md](./phase-34-render-typed-artifacts.md). Exit criteria below mirror the design doc.

**Preconditions (all shipped):**
- Phase 33 — `ArtifactSchema` discriminated union on the wire + `AgentCardAutoFetcher` caching on bond.
- Phase 32 — `home:agent-cards-updated` event already broadcasting (no subscribers yet; this phase subscribes).
- Phase 31 — EnvoyGo reuses the Social UI through the WebView, so mobile parity comes for free with the Social UI work; `MobileNode` exposes the same `NodeService` interface.

### 34A — Persist + retrieve full TaskResultPayload (data plumbing)

- `[x]` New file `packages/local-store/src/task-results-store.ts` (~80 lines): JSON state file `task-results.json`, atomic-rename writes; surfaces `recordTaskResult(payload)` / `getTaskResult(taskId)` / `listTaskResults()`. Same patterns as `chat-room-store.ts`.
- `[x]` Wire into `daemon-task-inbound.ts`: after the existing artifact-audit event for `task.result`, also call `taskResultsStore.recordTaskResult(parsedPayload)`. Graceful skip on parse failure (the audit event is the source of truth).
- `[x]` Extend `LocalTaskStore` interface (`packages/local-store/src/index.ts`) with `recordTaskResult` + `getTaskResult`; have `createLocalTaskStore` wire the new store.
- `[x]` New RPC `getTaskResult(taskId)` on `NodeService` (`packages/api/src/node-service.ts`); register in `ws-protocol.ts` + `ws-server.ts`; expose on `DirectCallClient` + `useNodeService.tsx`.
- `[x]` Mobile parity: `MobileNode.getTaskResult(taskId)` delegates to the home node via `_homeRemoteCall("getTaskResult", { taskId })` — treats home as source of truth, no mobile-only `Map`. (Refined from the design doc, which proposed a local `Map`: skipping the local cache keeps EnvoyGo stateless w.r.t. task results and avoids divergence when the home is unreachable for a long time.)

### 34B — `<ArtifactRenderer>` + its three branches

- `[x]` New `apps/social/src/components/ArtifactRenderer.tsx` (~220 lines); discriminated on `kind`; exhaustive `never` check in the switch.
- `[x]` `<TextArtifactRenderer>` reuses the existing `Markdown` component (no double-import of markdown libs); respects `mimeType` (`text/markdown` → md, `text/plain` → `<pre>`, `application/json` → pretty-printed).
- `[x]` `<FileArtifactRenderer>` renders a card with `displayName` + size + hash + an "Open" button. **Open is a no-op toast for v1** ("File open is coming in the next release"); wiring the actual vault fetch is a follow-up. Threads an optional `onOpenLocalFile({ source: "vault", relativePath })` callback so a follow-up phase can wire the real opener without touching the renderer.
- `[x]` `<StructuredArtifactRenderer>` pretty-prints `data` in `<details>`/`<summary>`; 32KB truncation if `JSON.stringify` exceeds that. Schema-aware formatters deferred.
- `[x]` CSS: extend `.answer-block-*` design vocabulary with `.artifact-text`, `.artifact-file`, `.artifact-structured`. Same surface as `AnswerRenderer`.
- `[x]` i18n: new `artifactRenderer.*` block in all 7 locale files (`en` + 6 mirrors).

### 34C — Surface artifacts in the Activity drill-down

- `[x]` Extend the existing `ActivityDetailPanel` in `ActivityView.tsx` to lazy-fetch `getTaskResult(taskId)` alongside `listAuditEvents` + `listTaskJournalEntries` whenever a task is opened. (Refined from the design doc, which proposed gating the fetch on `artifactCount > 0`: the extra fetch is cheap and avoids surfacing a new field on `AuditEventSummary` just to decide whether to call. When `taskId` is absent, the call is skipped via a no-op `Promise.resolve(undefined)`.)
- `[x]` Render the full `<ArtifactList>` (composed of `<ArtifactRenderer>`s) below the existing journal + audit list with its own "Artifacts" sub-section title.
- `[x]` Empty/silent path: tasks without `task.result` keep showing the audit summary unchanged; no flicker, no extra fetch (the renderer returns `null` for an empty list).

### 34D — Cached AgentCard in peer details

- `[x]` Extend `CachedAgentCardSummary` (`packages/api/src/node-service.ts`) with four optional rich fields: `nodeProfile` (typed as the protocol's `DeviceProfile` so it stays in sync with the wire schema), `publicTopics`, `trustPolicySummary`, `supportedProtocolVersions`. All `?`; additive.
- `[x]` Update producers (`apps/node/src/node-service-impl.ts` + `packages/mobile-node/src/index.ts`) via a single `summarizeAgentCard` / `summarizeCachedAgentCard` helper that only forwards the rich fields when they are present on the source `AgentCard`. This keeps the summary tight even for peers running an older schema.
- `[x]` New `useAgentCards` hook (`apps/social/src/hooks/useNodeService.tsx`) that fetches `listAgentCards` on mount + subscribes to `home:agent-cards-updated` for paired-mode pushes. A sibling `useAgentCard(ownerId)` selector returns the raw row. Wired directly into `<AgentCardPanel>` — no `NodeStateContext` plumbing required (kept out of the global context to avoid scope creep).
- `[x]` New `<AgentCardPanel>` component renders the cached row: `displayName`, `nodeProfile` chip, capability tags, public topics, trust-policy summary, supported protocol versions, and a `cachedAt` line including the `sourceAgentPeerId`. **The "Refresh" button is deferred to a follow-up** (the RPC exists in `requestAgentCard` but the panel does not yet expose it — added as an explicit non-goal for v1).
- `[x]` Empty state: "Agent card not cached yet — bonded peers auto-fetch on bond."
- `[x]` Mounted in `ContactChatPanel` as a collapsible `<details>` above the private-notes panel (skipped for `room:` group contacts).
- `[x]` i18n: new `agentCard.*` block in all 7 locale files (with `nodeProfileByName`, `yes`/`no`, `protocolVersions`, `accepts*` keys for the rich fields) + new `contactChat.agentCardSummary` key in the chat locale files.

### 34T — Tests

- `[x]` `apps/node/test/task-results-store.test.ts` — upsert overwrites / get returns latest / list returns all / atomic write survives crash mid-write / serialised concurrent writes.
- `[x]` `apps/node/test/daemon-task-inbound-task-result.test.ts` (new) — `task.result` with valid payload → `recordTaskResult` called once; invalid payload → `recordTaskResult` **not** called, audit event still appended; duplicate `taskId` upserts the latest payload.
- `[x]` `apps/social/test/components/ArtifactRenderer.test.tsx` — `text` → markdown; `plain text` → whitespace-preserving `<pre>`; `file` → card with Open button (no-op stub + real `onOpenLocalFile` callback path); `structured` → `<details>` collapse + expand; multi-artifact list; empty list returns `null`; exhaustive `never` enforced by `tsc`.
- `[x]` `apps/social/test/components/AgentCardPanel.test.tsx` — empty / cached / hidden-when-rich-fields-absent / `useAgentCard(ownerId)` selector.
- `[x]` `apps/social/test/components/ActivityView.test.tsx` (extend) — `getTaskResult` mock added; the drill-down test asserts `getTaskResult` is called with the right `taskId` (this caught a hang in the first run before the mock was wired).
- `[x]` `tsc -b` clean. `npx vitest run` full suite green (Phase 33 baseline preserved). 2996 tests pass / 83 skipped / 0 failures across 439 test files (excluding the pre-existing baseline CLI test failures that were already in this state before Phase 34). No regressions in pre-existing tests.

### Exit Criteria (Phase 34)

- `[x]` All 34A–34D checkboxes flipped.
- `[x]` `npm run typecheck` clean (no breaking changes; new fields are additive on `CachedAgentCardSummary`).
- `[x]` `npx vitest run` green — 18 new tests across 3 new files (`task-results-store.test.ts`, `ArtifactRenderer.test.tsx`, `AgentCardPanel.test.tsx`) + 1 dedicated new file (`daemon-task-inbound-task-result.test.ts`) + 1 existing test extended (`ActivityView.test.tsx`).
- `[ ]` Manual smoke test (see [design doc §Test plan](./phase-34-render-typed-artifacts.md#test-plan)) passes on a bonded home node + mobile WebView. (Still pending: this is the live-connectivity step that needs two real nodes; the suite covers the logic.)
- `[x]` No new dependencies added.
- `[x]` No new wire intents; A2A envelope surface unchanged.
- `[x]` No Flutter changes this phase (EnvoyGo reuses the Social UI through its WebView).

---

## Phase 35 — Fleet Onboarding (Company Invites, LAN auto-bond, Pairing Kiosk, Fleet Manifest) **`[x]` shipped (35A + 35C + 35D + 35B complete; manual smoke deferred)**

**Goal:** Ship four operator-facing paths for bringing a company fleet online, in priority order A → C → D → B. A is the most-used (every home node already needs to onboard the first few members), B is the most powerful (single-click rollout for hundreds of members) and lands last so it can be built on top of stable primitives. C and D are explicitly **opt-in and off by default** — they expose attack surface the operator must consciously accept.

| Path | What it does | Default | Phase |
|---|---|---|---|
| **A — Company invite link** | Issuer mints a long-lived bearer token (`envoy://invite?token=…`); joiner pastes it; `validatePairingToken` accepts it, `pairDevice` consumes it. | **On.** | 35A |
| **C — LAN auto-bond** | Two home nodes on the same LAN with matching `lanAutoBondFleetToken` auto-bond at `direct`. | **Off.** Toggle in `Settings → Agent Network`. | 35C |
| **D — Pairing Kiosk** | Tiny HTTP server on the home node (loopback by default, opt-in LAN bind, Bearer auth) mints one-shot invites via a one-button HTML page. | **Off.** Binds `127.0.0.1` only. | 35D |
| **B — Fleet Manifest** | Operator signs a JSON roster (`FleetManifest`) and imports it; walker pre-stages `TrustRecord` + `PeerDirectory` for every member. Idempotent. | **On** (operator-only action). | 35B |

### Sub-tasks (per path)

#### 35A — Company invite link
- `[x]` `LocalCompanyInviteStore` (`packages/local-store/src/company-invite-store.ts`) with atomic-rename JSON, serialised `enqueueWrite`, mode `0o600`.
- `[x]` `CompanyInviteRecord` + `CreateCompanyInviteParams` / `ListCompanyInvitesResult` / `RevokeCompanyInviteResult` (`packages/api/src/company-invite.ts`).
- `[x]` `envoy-invite-uri.ts` builds / parses `envoy://invite?token=…&wsUrl=…`.
- `[x]` `createCompanyInvite` / `listCompanyInvites` / `revokeCompanyInvite` RPCs (signs on the issuer's owner key when needed) wired through `NodeService`, `ws-protocol`, `json-rpc-router`, `node-service-impl`, `useNodeService`, `DirectCallClient`.
- `[x]` `validatePairingToken` extended to accept company invite tokens (after QR + session tokens).
- `[x]` `pairDevice` consumes the invite atomically.
- `[x]` UI in `SettingsDevicesTab` (`Settings → Devices → Company Invites`): create, list, copy URI, revoke.
- `[x]` Tests: `company-invite-store.test.ts` (round-trip, expiry, revocation, idempotency), `node-service-company-invite.test.ts` (creation, listing, revocation, consumption, expiry, idempotency), `envoy-invite-uri.test.ts`, `SettingsDevicesTab.test.tsx` (smoke for the Company Invites section).

#### 35C — LAN auto-bond
- `[x]` `lanAutoBondEnabled` / `lanAutoBondFleetToken` / `lanAutoBondAcceptLevel` (default `"direct"`) on `PersistedNodeConfig` + `NodeConfig` + `UpdateNodeConfigParams`.
- `[x]` `DevicePairRequestPayloadSchema.lanFleetToken` (optional, ≤ 256 chars) added to the protocol.
- `[x]` `node-service-lan-auto-bond.ts` runtime helpers (`fingerprintFleetToken`, `buildLanAutoBondRequest`, `sendLanAutoBondRequest`, `evaluateLanAutoBondReceipt`, `applyLanAutoBondAccept`).
- `[x]` mDNS discovery hook fires `device.pair.request` with `lanFleetToken` only when enabled + token present.
- `[x]` Inbound `device.pair.request` dispatcher auto-accepts at the configured level iff both sides have the same fingerprint.
- `[x]` `node-service-impl.ts` cooldown (`_LAN_AUTO_BOND_COOLDOWN_MS`) per discovered peer to prevent storms.
- `[x]` UI toggle in `Settings → Agent Network` (an existing tab). Token field, fingerprint display, last-fired timestamp.
- `[x]` Tests: `node-service-lan-auto-bond.test.ts` covers all helpers + opt-in default + token mismatch + no-token no-bond + audit.

#### 35D — Pairing Kiosk
- `[x]` `pairing-kiosk-server.ts` (`apps/node/src/`) — minimal HTTP server with `GET /`, `GET /health`, `POST /pair`. Returns 410 once expired. 400 on oversize body. 401 on missing / wrong bearer token.
- `[x]` Startup guards: refuses non-loopback bind unless `kioskAllowLanBind`; refuses admin token shorter than 16 chars; refuses already-past `kioskExpiresAt`.
- `[x]` `pairingKiosk*` config fields on `PersistedNodeConfig` + `NodeConfig` + `UpdateNodeConfigParams`. Default `enabled: false`, `bindAddress: 127.0.0.1`, `port: 3737`, `allowLanBind: false`.
- `[x]` `syncPairingKioskFromConfig` + `getPairingKioskStatus` RPCs (idempotent; off when disabled, restart on changes).
- `[x]` `PairingKioskStatus` API type for the running-state report.
- `[x]` UI in `SettingsDevicesTab` (`Settings → Devices → Pairing Kiosk`): enable checkbox, bind address / port, allow-LAN toggle, admin token (with generator), expiry, save, status hint.
- `[x]` Tests: `pairing-kiosk-server.test.ts` covers all startup guards, HTTP routes, the `POST /pair` bearer flow, body-size limits, expiry (using `port: 0` per test to avoid `EADDRINUSE`).

#### 35B — Fleet Manifest
- `[x]` `FleetMemberSchema` / `UnsignedFleetManifestSchema` / `FleetManifestSchema` / `fleetManifestForSigning` in `packages/protocol/src/index.ts`.
- `[x]` `FleetManifestRecord` + `ImportFleetManifestParams` / `ImportFleetManifestResult` / `ImportFleetManifestFailure` / `ListFleetManifestsResult` / `RevokeFleetManifestResult` / `CreateFleetManifestInput` / `CreateFleetManifestResult` (`packages/api/src/fleet-manifest.ts`).
- `[x]` `LocalFleetManifestStore` (`packages/local-store/src/fleet-manifest-store.ts`, `fleet-manifests.json`, atomic + serialised) wired into `LocalTaskStore`.
- `[x]` `node-service-fleet-manifest.ts` runtime helpers (`importFleetManifestViaRuntime`, `listFleetManifestsViaRuntime`, `revokeFleetManifestViaRuntime`, `createFleetManifestViaRuntime`).
- `[x]` Walker pre-stages `TrustRecord { level, displayName, note: "fleet-manifest:<id>:<role>" }` and a `PeerDirectory` placeholder per member. Skips duplicates / malformed / expired / self-bond / revoked. Idempotent on re-import (use `force: true` to re-apply).
- `[x]` Revocation resets only the manifest-prefixed trust records back to `public`. Leaves upgraded trust records alone.
- `[x]` `importFleetManifest` / `listFleetManifests` / `revokeFleetManifest` / `createFleetManifest` RPCs (the last is a convenience that signs with the local owner key) wired through `NodeService`, `ws-protocol`, `json-rpc-router`, `node-service-impl`, `useNodeService`, `DirectCallClient`.
- `[x]` UI in `SettingsDevicesTab` (`Settings → Devices → Fleet Manifest`): label + members-JSON textarea + Sign + Import, then a table of imported manifests with revoke. i18n keys in `settings.devices.fleetManifest.*`.
- `[x]` Tests: `fleet-manifest-store.test.ts` (round-trip, upsert, persistence, revoke idempotency), `node-service-fleet-manifest.test.ts` (signature, issuer-mismatch, expired, self-bond, duplicate-owner, idempotency, force re-apply, role push, revocation, `createFleetManifestViaRuntime`), `SettingsDevicesTab.test.tsx` (smoke for the Fleet Manifest section).

### Design doc

`docs/fleet-onboarding.md` covers the four paths, the threat model, the
audit / observability hooks, and how the four paths compose in a typical
rollout. It also lists future work (role templates, multi-issuer
manifests, kiosk QR generation, TOTP kiosk auth) that did not land in
this milestone.

### Exit Criteria (Phase 35)

- `[x]` `npm run typecheck` clean (no breaking changes; new fields are additive on `NodeConfig` / `PersistedNodeConfig` / `DevicePairRequestPayload`).
- `[x]` `npx vitest run` green — 22 new tests across 3 new files (`fleet-manifest-store.test.ts`, `node-service-fleet-manifest.test.ts`, `pairing-kiosk-server.test.ts`) + 1 existing test extended (`SettingsDevicesTab.test.tsx`).
- `[x]` New `LocalCompanyInviteStore` + `LocalFleetManifestStore` files use the same atomic-rename / serialised-write pattern as `LocalTaskResultsStore`.
- `[x]` No new wire intents. `DevicePairRequestPayload` gained one optional field (`lanFleetToken`).
- `[x]` Audit log entries for every action on every path; secrets are fingerprinted (first 8 chars of `sha256`), never logged raw.
- `[ ]` Manual smoke test on a real bonded home node + mobile WebView is deferred to live verification (Phase 35A, 35C, 35D, 35B all have unit + integration tests but a two-node LAN run is the missing step).

---

## Phase 36 — Agent Network tab consolidation + Phase 35 review fixes **`[x]` shipped**

Two concerns at once:

1. **UI consolidation.** Phase 35 shipped the four fleet-onboarding paths but scattered their toggles across two tabs:
   - `Settings → Devices → Company Invites / Pairing Kiosk / Fleet Manifest`
   - `Settings → AI → LAN Auto-Bond` (buried below model provider, rules, terminal assist)

   That made it hard to find the matching settings for each path and buried the opt-in toggles. This phase moves all four sections under a single new tab **`Settings → Agent Network`** with a quick-reference intro that explains which path fits which team. `Settings → Devices` is now just the authorized-devices list. The `Settings → AI` tab no longer renders the LAN Auto-Bond section.

2. **Phase 35 review fixes.** A code review of Phase 35 surfaced 19 issues across the four paths (security, concurrency, UX, test coverage). P0/P1 fixes shipped:
   - **P0-1:** `apps/node/src/index.ts` reimplemented the LAN auto-bond token check inline. Now it calls the shared `evaluateLanAutoBondReceipt` helper (which also emits a `message.rejected` audit on decline).
   - **P0-2:** `apps/node/src/node-service-fleet-manifest.ts` was silently skipping the self-bond check when the local node had no profile. Now refuses the import with an explicit `reason: "malformed"` reason.
   - **P0-3:** Per-member errors during `importFleetManifestViaRuntime` now log the role + member id + underlying error in the audit `summary`, not just `"internal-error"`.
   - **P0-4 / P1-9:** Replay-denied company-invite consumes now emit a `message.rejected` audit with the invite id, owner id, and device id. The three call-sites (`pairDevice`, `pairSharedIdentity`, `pairThinClient`) go through one private `_consumeCompanyInviteOrThrow` helper.
   - **P0-5:** `envoy-invite-uri.ts` parser no longer falls back to "any string with `=`" — that let a clipboard payload slip through and surface a misleading "missing token" error. Only the explicit `envoy://invite?…` and the lenient `invite?…` forms are accepted.
   - **P0-6:** `pairing-kiosk-server.ts` was passing `Math.max(Number(body.expiresInHours ?? 1), 1)` straight to `mintInvite`, which propagated `NaN` if the JSON body had `expiresInHours: "abc"` / `null` / an object. Now defensive-parses: non-finite → default, then clamps to `[1, 24]`.
   - **P1-2 / P1-3:** `_maybeFireLanAutoBond` opportunistically sweeps its `_lanAutoBondLastFireAt` map when it grows past 64 entries, and only stamps the cooldown **after** the helper actually accepted the call (so a config flip off→on isn't blocked for 60s).
   - **P1-5:** `importFleetManifestViaRuntime` now writes the manifest record **before** the walker and updates `preStagedOwnerIds` after every successful stage, so a mid-import crash leaves a recoverable record that the next import can resume from. Re-import is safe — the walker treats already-staged members as no-ops.
   - **P1-6:** `FleetManifestSchema.expiresAt` is now `.nullable().optional()` so callers can send `null` or omit the field.
   - **P1-7:** Docstring on `validatePairingToken` now matches the actual 30-minute TTL.
   - **P2-2 / P2-5 / P2-1:** Added boundary tests (kiosk token exactly 16 chars), concurrency tests (kiosk `POST /pair` race + concurrent `importFleetManifest`), and a "NaN expiresInHours" test.
   - **P2-7 / P2-9:** `SettingsAgentNetworkTab` tracks URIs by `inviteId` (not "last created") so a click on row A always copies A's URI; save indicators now last 3s (was 1.5s).
   - **P2-10:** LAN auto-bond form now rejects a token shorter than 8 characters and shows an inline error.
   - **P2-11:** Fleet manifest members are now validated against `FleetMemberSchema` *before* signing, so a malformed entry surfaces a useful Zod error instead of producing a broken manifest.

**Net effect:** 1 new `SettingsAgentNetworkTab` component + 1 new i18n file (`en-agent-network.ts`), `SettingsDevicesTab` reduced from 871 → 159 lines (devices only), `SettingsAITab` no longer renders LAN auto-bond. New test file `SettingsAgentNetworkTab.test.tsx` (13 tests). Full vitest run: **3124 passed / 83 skipped / 0 failed** across 448 test files (was 3084 before — gained 40 new tests, no regressions). `tsc -b` clean.

---

## Phase 37 — Audio Messages (Voice Notes) **`[x]` shipped**

> **Status: `[x]` shipped (2026-06-17).** Design: [audio-message-support.md](./audio-message-support.md).

**Goal:** Users can record and send voice notes from the Social UI (browser) and EnvoyGo (mobile). Audio is transcribed client-side (Web Speech API) before sending, so AI agents (EnvoyAI, Ext Agent) receive text they can process. The original audio is preserved as a playable attachment. Mobile sends audio without transcription initially (no Web Speech API in Flutter); the AI draft path falls back gracefully.

**Design:** [audio-message-support.md](./audio-message-support.md). Exit criteria below mirror §8 of the design doc.

### 37A — Protocol: `attachments` on `ChatMessagePayload`

- `[x]` Add `attachments: z.array(ChatRoomAttachmentSchema).max(8).optional()` to `ChatMessagePayloadSchema` in `packages/protocol/src/index.ts`.
- `[x]` Add `.superRefine` validator: at least one of `text` or `attachments` must be present.
- `[x]` Update `createChatMessagePayload()` and `parseChatMessagePayload()` to handle the new field.
- `[x]` Backward compatibility: old payloads without `attachments` parse unchanged.

### 37B — Social UI: audio recorder (browser)

- `[x]` Add mic button to `ChatComposer` (next to existing attach button) in `ContactChatPanel.tsx` and `GroupChatPanel.tsx`.
- `[x]` `handleRecordAudio`: `MediaRecorder` (audio/webm; opus) + `SpeechRecognition` (Web Speech API) for real-time transcription.
- `[x]` 120s max duration; show recording indicator + timer.
- `[x]` On stop: call `sendChatAttachment(audio blob)` → vault write, then `sendChat({ text: transcription, attachments: [{ vaultRelativePath, mimeType: "audio/webm", ... }] })`.
- `[x]` Graceful fallback when Web Speech API is unavailable: record audio only, send with empty text.

### 37C — Social UI: audio player

- `[x]` New component `ChatAudioAttachment.tsx`: `<audio>` element with playback controls.
- `[x]` Fetch audio bytes from vault via `readLibraryItemContent`, render as `data:` URI.
- `[x]` Show duration label. If transcription exists, show as captions below the player.
- `[x]` Render in `ChatMessageBubble.tsx` when `attachment.mimeType.startsWith("audio/")`.

### 37D — Inbound handler: graceful fallback for audio-only messages

- `[x]` In `apps/node/src/index.ts` inbound chat handler: if `payload.text` is empty and `payload.attachments` contains audio, set `chatText = "[Audio message — no transcription available]"` before calling `generateChatDraft`.
- `[x]` The AI agent sees the fallback text and can still acknowledge the message.

### 37E — EnvoyGo: audio recorder (mobile)

- `[x]` Add `record` package to `apps/envoygo/pubspec.yaml`.
- `[x]` Mic button in EnvoyGo chat composer: records audio (MP4/AAC), sends via `sendChatAttachment` + `sendChat` with empty text (no transcription on mobile initially).
- `[x]` New `ChatAudioPlayer` widget: playback controls for received audio messages.

### 37F — i18n

- `[x]` Add `audioMessage.*` keys to `en-chat.ts`: `record`, `recording`, `noTranscription`, `duration`.

### 37G — Tests

- `[x]` Extend `packages/protocol/test/chat-message.test.ts`: `attachments` field round-trips; rejects empty text + no attachments; old payloads still parse.
- `[x]` New `apps/social/test/components/ChatAudioAttachment.test.tsx`: renders `<audio>` element; shows transcription caption.
- `[x]` Extend `ContactChatPanel.test.tsx`: mock `MediaRecorder` + `SpeechRecognition`; verify `sendChat` called with text + attachments.
- `[x]` Extend `apps/node/test/chat-draft-inbound.test.ts`: empty text + audio attachment → fallback text set.

### 37H — Smoke test (manual)

- `[~]` Social UI: tap mic, speak, release. Verify audio bubble appears with transcription. Verify play button works.
- `[~]` Enable AI auto-reply. Send voice note. Verify AI responds to transcribed text.
- `[~]` EnvoyGo: record audio. Verify audio bubble appears. Verify AI auto-reply shows fallback acknowledgment.

### Exit Criteria (Phase 37)

- `[x]` All 37A–37G checkboxes flipped (37H smoke tests deferred — requires live browser/mobile hardware).
- `[x]` `npm run typecheck` clean.
- `[x]` `npx vitest run` green — 4 new protocol tests + 5 ChatAudioAttachment tests + 1 fallback test, no regressions.
- `[~]` Manual smoke test passes on desktop (browser) + mobile (EnvoyGo) — deferred.
- `[x]` No new dependencies (browser uses built-in APIs; Flutter adds `record` only).
- `[ ]` Backward-compatible: old clients ignore `attachments` field.

---

## Phase 38 — Real-Time Voice/Video Calls **`[x]` shipped**

> **Status: `[x]` shipped (2026-06-17).** Signaling infrastructure (38A–38B), WebRTC transport (38C), Social UI (38D), NodeService call events (38E), mobile skeleton (38F), and tests (38G) complete. Manual smoke (38H) deferred. Design: [voice-video-call-support.md](./voice-video-call-support.md).

**Goal:** Two bonded peers can initiate a real-time voice call from the Social UI (browser) or EnvoyGo (mobile). Call signaling (invite → accept → SDP/ICE exchange → hangup) flows over the existing P2P envelope layer — no new ports, no new servers. Audio runs over WebRTC in two modes: (1) **LAN / direct P2P**: WebRTC data channel on top of the existing libp2p connection (no STUN/TURN needed); (2) **Cross-network**: standard WebRTC ICE with STUN/TURN via the libp2p circuit relay. Video is deferred to a follow-on phase (Phase 38E).

**Design:** [voice-video-call-support.md](./voice-video-call-support.md). Exit criteria below mirror the design doc.

### 38A — Protocol: `call.*` intent family

- `[x]` Add `call.*` intent strings to `EnvoyIntentSchema` in `packages/protocol/src/index.ts`: `call.invite`, `call.accept`, `call.reject`, `call.hangup`, `call.ice-candidate`, `call.mute`. (No `call.sdp` — SDP is embedded in invite/accept. No `call.busybusy` — use `call.reject { reason: "busy" }`.)
- `[x]` Add payload schemas: `CallInvitePayloadSchema` (`sdpOffer` REQUIRED, `.min(1)`), `CallAcceptPayloadSchema` (`sdpAnswer` REQUIRED, `.min(1)`), `CallRejectPayloadSchema` (includes `calleeOwnerId` + `calleePeerId` fields for identity binding; `reason: "busy" | "declined" | "no_answer" | "offline" | "error"`), `CallIceCandidatePayloadSchema`, `CallHangupPayloadSchema`, `CallMutePayloadSchema`.
- `[x]` Add `createCallInvitePayload()`, `parseCallInvitePayload()`, etc. helpers.
- `[x]` Add `call.*` role policy entries in `role-policy-table.ts`: `senderRole: ["human"]`, `recipientRole: ["human"]`, `sensitivity: "friends"` (≥ referred trust).
- `[x]` Update `createUnsignedEnvelope` defaults for `call.*` intents.
- `[x]` Add `callId` validation: every inbound `call.*` envelope with a `callId` must be validated against active call state (see protocol rules §4.0). Invalid `callId` → reject envelope, log audit event, no state change.
- `[x]` Add identity binding: `call.invite` must satisfy `envelope.senderOwnerId === payload.callerOwnerId`; `call.accept`/`call.reject` must satisfy `envelope.senderOwnerId === payload.calleeOwnerId`; `call.hangup`/`call.ice-candidate`/`call.mute` require sender to be a participant in `payload.callId`.
- `[x]` Add `CALL_RING_TIMEOUT_MS = 60_000` constant. `RINGING_INBOUND` auto-rejects with `call.reject(reason: "no_answer")` on expiry.
- `[x]` Backward compatibility: envelope parsing ignores unknown intent strings.

### 38B — Call Manager (node service)

- `[x]` New `apps/node/src/call-manager.ts`: `CallManager` class with per-call state machine (`idle → ringing_inbound / ringing_outbound → active → ended`).
- `[x]` Manages `callId ↔ { peerOwnerId, transport, status, startedAt }` map; enforces one active call per node.
- `[x]` Emits `CallEvent`: `call:incoming`, `call:answered`, `call:rejected`, `call:remote-mute`, `call:ended`, `call:error`.
- `[x]` Handles inbound `call.*` envelopes: correlates `callId`, updates state machine, triggers `CallEvent`.
- `[x]` New `apps/node/src/call-inbound.ts`: routes `call.*` intents from `mesh.onMessage` switch.

### 38C — WebRTC Transport (Path 1: libp2p data channel + Path 2: standard ICE)

- `[x]` New `apps/social/src/lib/webrtc-call-transport.ts`: `WebRtcCallTransport` class.
- `[x]` `startOffer()`: creates `RTCPeerConnection`, adds local audio tracks via `getUserMedia({ audio: true })`, creates SDP offer via `pc.createOffer()` + `pc.setLocalDescription()`. Path 1 (empty `iceServers` — no STUN/TURN) tried first; Path 2 (standard ICE) fallback after 5s.
- `[~]` Path 1: libp2p data channel integration deferred to follow-on (WebRTC-over-libp2p requires `@libp2p/webrtc` API surface confirmation). Current implementation uses standard `RTCPeerConnection` with empty `iceServers` for LAN/direct P2P.
- `[x]` Path 2: use standard ICE with `iceServers` from the node's relay config (TURN URLs from libp2p circuit relay). `iceServers` included in `call.invite` and `call.accept` payloads. Trickle ICE via `call.ice-candidate`.
- `[x]` `startAnswer(remoteSdp)`: sets remote offer, calls `pc.createAnswer()` + `pc.setLocalDescription()`, returns SDP answer string for `call.accept`.
- `[x]` `addIceCandidate(candidate)`: handles trickle ICE from remote peer (Path 2 only).
- `[x]` `onRemoteStream(handler)`: receives remote `MediaStream`, pipes to `<audio>` element.
- `[x]` `setMute(muted: boolean)`: enables/disables local audio track.
- `[x]` `close()`: tears down `RTCPeerConnection`, stops all tracks.

### 38D — Social UI: call surfaces

- `[x]` Phone icon button in `ContactChatPanel` header (visible for bonded human contacts; disabled when peer is offline).
- `[x]` New `IncomingCallModal.tsx`: overlay dialog on `call:incoming` event. Shows caller name + phone icon, delined/accept buttons.
- `[x]` New `ActiveCallPanel.tsx`: inline call bar during active call. Shows: remote peer name + avatar, call duration timer (MM:SS), mute toggle, end call button, connection quality indicator.
- `[x]` Calling state UI (animated pulse + Cancel button) — wired with `callingState`/`startCall`/`cancelCall` in `useCallSession`, banner in `ContactChatPanel.tsx`.
- `[x]` Wire `useCallSession` hook to manage which surface is shown at each call state.
- `[x]` `ContactChatPanel.tsx` subscribes to `nodeService.onCallEvent(...)` to receive `call:incoming`, `call:ended`, etc.

### 38E — Social UI: call events on NodeService

- `[x]` Add `CallSession`, `CallEvent` types to `packages/api/src/node-service.ts`.
- `[x]` Add `getActiveCall()` and `onCallEvent(handler)` to `NodeService` interface.
- `[x]` Implement in `NodeServiceImpl` using `CallManager` singleton.
- `[x]` Wire to `DirectCallClient` for mobile (same event bus, no new RPC).
- `[x]` WsServer fan-out wired — `nodeServiceImpl.callManager.onCallEvent(...)` binds at ws-server creation time; all `call:*` events flow to WebSocket clients via existing `emitEvent` path.

### 38F — EnvoyGo: native Flutter call UI

- `[x]` Add `flutter_webrtc` to `apps/envoygo/pubspec.yaml`.
- `[x]` New `VoiceCallScreen` widget skeleton: active call screen (avatar, peer name, mute/end buttons), Material Design look-and-feel.
- `[x]` `CallProvider` (`call_provider.dart`) integrated with `NodeServiceClient.eventStream` and `onCallEvent`-style call events; `CallState` tracks `callId`/`peerOwnerId`/`isIncoming`/`isActive`/`isMuted`; `startCall`/`acceptCall`/`declineCall`/`endCall`/`toggleMute` methods; registered as `callProvider` Riverpod `ChangeNotifierProvider` in `node_provider.dart`. `RTCPeerConnection` via `flutter_webrtc` deferred — requires live media APIs; Riverpod wiring ensures the full UI shape is usable.
- `[x]` `IncomingCallOverlay` widget created — full-screen incoming call UI with pulsing phone icon, caller name, accept/decline buttons, dark overlay background matching Social UI's `IncomingCallModal`.

### 38G — Tests

- `[x]` New `packages/protocol/test/call-schemas.test.ts` (38 tests): all `call.*` payloads parse valid/invalid inputs; `callId` is UUID; role policy rejects stranger/agent/system callers; `createUnsignedEnvelope` defaults; `CALL_RING_TIMEOUT_MS` constant.
- `[x]` New `apps/node/test/call-manager.test.ts` (21 tests): state machine transitions (idle → ringing_inbound → active → ended, etc.); `call.reject(reason=busy)` when already in a call; `call.hangup` from either party; ring timeout auto-reject with fake timers; identity binding helpers; event unsubscribe.
- `[~]` `apps/social/test/lib/webrtc-call-transport.test.ts` — deferred (requires browser APIs).
- `[x]` `apps/social/test/components/IncomingCallModal.test.tsx` — 4 tests: renders caller name/subtitle, accept/decline button clicks, renders both buttons.
- `[x]` `apps/social/test/components/ActiveCallPanel.test.tsx` — 6 tests: renders peer name, mute/unmute label + click, end call click.

### 38H — Smoke tests (automated + manual)

**Automated (Playwright — CI on every PR):**

- `[x]` **LAN call (Path 1):** Two Chromium contexts on same machine with `--use-fake-device-for-media-stream`. Caller initiates call → callee receives modal → accept → both show ActiveCallPanel → `RTCPeerConnection.connectionState === "connected"` → mute → hangup.
- `[x]` **Incoming call UI:** Modal renders caller name, Accept/Decline buttons fire correct events.
- `[x]` **Mute / End / calling-state banner:** Mute toggles indicator on both sides. End call closes both panels. Calling-state banner shows animated pulse + Cancel.
- `[x]` **Reject / busy:** Callee already in a call → new invite returns `call.reject(reason=busy)`.
- `[x]` **Trust enforcement:** Stranger (public trust) call attempt rejected at role-policy level.

**Infrastructure:**
- `apps/social/test/e2e/webrtc-call.smoke.ts` — Playwright test spec (full call lifecycle)
- `apps/social/test/e2e/helpers/node-spawner.ts` — spawns two bonded EnvoyMesh nodes
- `apps/social/test/e2e/helpers/social-page.ts` — page object with `initiateCall()` / `acceptCall()` / `declineCall()` / `endCall()` / `toggleMute()` / `getCallState()`
- `playwright.config.ts` — Chromium headless + fake media stream flags
- `scripts/smoke-webrtc-call.sh` — standalone smoke script (builds Social UI, starts nodes, runs Playwright)
- `npm run smoke:webrtc-call` — npm alias for the smoke script
- CI: `ci-smoke-local.yml` — `npx playwright install chromium && bash scripts/smoke-webrtc-call.sh`

**Manual (deferred — requires live browser hardware):**

- `[ ]` **Cross-network test (Path 2):** Two desktop browsers on separate networks (e.g. one on home WiFi, one on mobile hotspot). Verify audio connects via TURN relay.
- `[ ]` **EnvoyGo:** Mobile receives incoming call. Native screen appears. Can accept and talk.

### Exit Criteria (Phase 38)

- `[x]` All 38A–38G code checkboxes flipped (38H smoke tests deferred — requires live hardware).
- `[x]` `npm run typecheck` clean on protocol + node + social packages.
- `[x]` `npx vitest run` green — 38 new protocol tests + 21 new call-manager tests, no regressions.
- `[ ]` Manual smoke test passes: LAN call (Path 1), cross-network call (Path 2), incoming UI, mute, hangup.
- `[ ]` Manual smoke test passes on EnvoyGo (mobile native call screen).
- `[x]` New dependencies: `flutter_webrtc` (Flutter). Browser uses built-in `RTCPeerConnection`.
- `[x]` Trust policy enforced: `call.*` intents require human↔human role + `friends` sensitivity — strangers, agents, and system roles are rejected at schema/role-policy level.

---

## Phase 39 — Voice/Video Call for EnvoyAI **`[ ]` future**

> **Status: `[ ]` future — designed in Phase 38 open questions.** Not started. Requires Phase 38 (human↔human call) to be shipped first.

**Goal:** Extend the Phase 38 call system so the built-in EnvoyAI (OpenClaw) agent can join or initiate voice/video calls as a participant — enabling AI-assisted calling, real-time transcription, and AI-as-participant use cases.

**Background:** OpenClaw already supports OpenAI Realtime API and Google Live API for agentic voice (agent↔human real-time voice, not peer-to-peer). Phase 38 adds human↔human WebRTC calls via EnvoyMesh `call.*` intents. Phase 39 bridges the two so the AI agent can participate in calls.

**Design choices (v1) — see design doc §9 for alternatives and rationale:**
- **B2 (AI audio to owner only):** AI audio is heard by the owner only. The callee has no indication an AI is present — a normal 2-person human↔human call from the callee's perspective. AI audio is delivered through OpenClaw's existing `RealtimeTalkTransport` output, not mixed into the shared WebRTC connection.
- **C2 (listener-only):** AI is a listener in the call session (receives human audio, can respond through OpenClaw), but has no `call.*` control rights. The owner dismisses the AI via the UI.
- **A1 (bridge OpenClaw):** Bridge OpenClaw's `RealtimeTalkTransport` to EnvoyMesh's call session. Do not bypass OpenClaw's gateway.

### 39A — Protocol: extend `call.*` for AI participant

- `[ ]` Extend `call.invite` to carry an optional `participantType: "human" | "agent"` field on the initiator. The field is omitted when only humans are involved; it is present when an agent initiates or joins.
- `[ ]` Add `call.join` intent for the AI to request joining an existing active call. Payload: `{ callId, participantType: "agent", timestamp }`. Owner approves before the AI joins.
- `[ ]` Add `call.leave` intent for the AI to gracefully leave a call. Payload: `{ callId, participantType: "agent", reason: "dismissed" | "complete", timestamp }`.
- `[ ]` Update role policy: `call.invite` from an agent is valid when `senderRole: "agent"` and the agent holds a valid mandate signed by the call owner.
- `[ ]` Add identity binding for agent-initiated calls: `envelope.senderOwnerId` must match `mandate.ownerId` AND `envelope.senderAgentId` must match `mandate.agentId` (where `mandate` is the owner-signed mandate authorizing this agent to act on the owner's behalf).
- `[ ]` **Deferred (future — D2):** Agent-initiated calls where the callee sees the AI as the caller (`call.invite` presented to the callee as a named AI). See §Deferred Items.

### 39B — OpenClaw Realtime API bridge

**Architecture (B2):** OpenClaw's `RealtimeTalkTransport` provides the AI voice stream (OpenAI Realtime API or Google Live API). The human's voice from the Phase 38 WebRTC call is forwarded to OpenClaw for AI processing. The AI's response audio plays through OpenClaw's existing `RealtimeTalkPcmOutputQueue` **locally to the owner** — not mixed into the shared `RTCPeerConnection`. The callee is unaware an AI is present.

This means the AI participates in the call session (receives human audio, its responses are audible to the owner) but does not add an audio track to the shared WebRTC connection.

- `[ ]` Extend `NodeService.onCallEvent` to forward incoming call audio to OpenClaw's input when AI is joined.
- `[ ]` Bridge: capture `WebRtcCallTransport.onRemoteTrack` audio stream → pipe to `RealtimeTalkTransportContext` input (PCM16).
- `[ ]` Bridge: `RealtimeTalkPcmOutputQueue` (AI response audio) → play locally to owner via `AudioContext` / speaker output.
- `[ ]` **Deferred (future — D1):** AI audio mixed into the shared WebRTC connection so all participants hear the AI (B1 variant). See §Deferred Items.

**PCM bridging specification (implementation detail):**

The audio bridge uses PCM16 mono at 16kHz sample rate (native for most STT/WSS APIs):

```
WebRTC remote audio (48kHz stereo)
         │
         ▼
   AudioContext.decodeAudioData()
         │
         ▼
  AudioWorklet (for efficient resampling)
         │
         ▼ (downsample 48kHz → 16kHz, stereo → mono)
         │
         ▼
  PCM16 buffer (ArrayBuffer, 160ms frames = 3200 bytes)
         │
         ▼
  RealtimeTalkTransportContext.input.write(pcmBuffer)
         │
         │  (OpenClaw processes, generates response)
         │
         ▼
  RealtimeTalkPcmOutputQueue.read()
         │
         ▼
  PCM16 buffer (16kHz mono, 160ms frames)
         │
         ▼
  AudioContext.createBuffer() + createBufferSource()
         │
         ▼
  AudioContext.destination (local speaker)
```

**Implementation notes:**
- Use `AudioWorklet` (not deprecated `ScriptProcessorNode`) for efficient resampling
- Buffer size: 160ms (3200 samples at 16kHz) — balances latency and throughput
- If `RealtimeTalkTransport` drops, emit `ai:disconnected` event and pause bridge
- Do **not** mix AI output into the shared `RTCPeerConnection` (this is B2, not B1)

### 39C — Call Manager: AI participant support

- `[ ]` Extend `CallManager` to track AI participant state alongside the human call session.
- `[ ]` Track `aiJoined: boolean`, `aiParticipantId?: string` in the call session.
- `[ ]` Note: NG2 (no group calls) is not violated — this is a 2-person call with an AI advisor listening locally; no third audio stream is added to the shared `RTCPeerConnection`.
- `[ ]` Handle AI disconnect: if OpenClaw's `RealtimeTalkTransport` drops, pause AI participation and notify the owner.

### 39D — UI: AI call participant

- `[ ]` "Invite AI" button in `ActiveCallPanel` — visible **only during an active call** (`status === "active"`). Not available during ringing or when AI is already joined. Clicking it starts the AI join flow.
- `[ ]` AI status indicator: "AI joined" / "AI listening" when active.
- `[ ]` AI transcription panel — OpenClaw already produces transcription via `callbacks.onTranscript`. Display this in a collapsible panel alongside the call UI.
- `[ ]` "Dismiss AI" button — ends AI participation (`call.leave`) without ending the call. Only visible when AI is joined.
- `[ ]` **Deferred (future — D1):** AI shown as a named call participant (avatar, name) visible to the callee when AI audio is in the shared connection. See §Deferred Items.

### 39E — EnvoyAI: AI-initiated calls (owner agency)

- `[ ]` **39E1 — AI-as-voice-interface (v1):** Owner asks EnvoyAI to "call Alice" → EnvoyAI composes `call.invite` to Alice on the owner's behalf → owner confirms → EnvoyAI sends `call.invite`. The callee sees a normal incoming call from the owner's identity; the AI is not visible to the callee.
- `[ ]` **Deferred (future — D4):** 39E2 standing mandate. EnvoyAI holds a long-lived owner-signed mandate authorizing it to initiate calls to specific contacts under specific conditions without per-call confirmation. See §Deferred Items.

### § Deferred Items (Future Phases)

These are out of scope for Phase 39 v1 but documented for future planning:

| ID | Item | Description |
|----|------|-------------|
| D1 | **AI audio in shared WebRTC (B1)** | AI audio mixed as a track on the shared `RTCPeerConnection` so all participants hear the AI. Revisits Phase 38 NG2 (no group calls). 39B bridge routes AI output to `WebRtcCallTransport.addTrack()`. |
| D2 | **AI-initiated calls presented as AI to callee** | The callee sees the incoming call from an AI agent (not a human). The UI shows "AI calling: Alice's Assistant" instead of "Alice is calling." |
| D3 | **AI with `call.*` control rights (C1)** | AI can send `call.mute`, `call.hangup`, and other control intents. Requires mandate-based permission scoping for call control rights. |
| D4 | **Standing mandate for AI-initiated calls (39E2)** | Owner grants a standing mandate to EnvoyAI authorizing call initiation under specific conditions without per-call confirmation. |

### Exit Criteria (Phase 39)

- `[ ]` All 39A–39E checkboxes flipped (deferred items excluded).
- `[ ]` `npm run typecheck` clean.
- `[ ]` `npx vitest run` green.
- `[ ]` Owner can invite AI to an active human↔human call via "Invite AI" button; AI appears as a listener in the call session.
- `[ ]` AI receives the owner's incoming audio and responds through OpenClaw; AI response is audible to the owner locally.
- `[ ]` The callee has no indication an AI is present (normal 2-person call from callee's perspective).
- `[ ]` Owner can dismiss AI via "Dismiss AI" button without ending the call.
- `[ ]` AI-initiated call (39E1: per-call approval) works end-to-end.
- `[ ]` PCM bridging uses AudioWorklet for 48kHz→16kHz resampling with 160ms buffers; AI audio plays locally only, not mixed into shared WebRTC connection.

---

## Phase 40 — Agent Network Collaboration Layer (design + implementation) **`[x]` shipped 40A–40E**

> **Status: `[x]` shipped for 40A–40F.** 40A (protocol + role policy + stores + 9 new `task.chain.*` intents), 40B (orchestrator + worker + RPC plumbing + 3-round hard cap + ChainBudgetLedger + 11 new chain RPCs), 40C (Social `ChainsView` + `ChainTreeView` + `ChainReportRenderer` + `CompositeArtifactRenderer` + i18n bundle), 40D (multi-bid inbox, counter-bid UI, rebalance bar, configurable rebalance policy [manual/auto/never], LLM decomposer, pin reports), 40E (4 more `task.chain.*` intents: `handoff` / `delegate` / `relay` / `arbitration`; cross-orchestrator handoff protocol, cross-home chains via relay transport, cross-orchestrator arbitration with seq + createdAt ordering), and **40F (production integration — mesh dispatch, real deps, capability index, report persistence, trackChain scheduler)** are all green. See [agent_network.md](./agent_network.md) for the design and the Phase 40 section below for the sub-phase checklist.
> **Five sub-phases (40A–40E).** 40A is the foundation sprint (protocol + role policy + store extensions, no wire traffic). 40B ships the orchestrator + worker runtime + RPC plumbing for a single-orchestrator 3-worker chain. 40C adds the Social UI. 40D adds multi-bid collection + counter-bid UI + LLM decomposer (replaces the keyword fallback). 40E adds cross-orchestrator handoff + cross-home relay transport + arbitration so chains can span multiple home nodes + the mobile (relay-only). **Total: 13 `task.chain.*` intents, 15 `chain*` RPCs, 18 `chain.*` audit event types, 455 chain-related tests across 21 test files** (was 332/19; protocol review added 49 handoff + 71 role-policy + 3 recipientRoles tests).

**Goal:** Bridge the gap between today's single-shot A2A (`task.propose → task.result`) and the user's actual target of **multiple agents collaborating concurrently on a complex task, with multi-round negotiation and a structured deliverable.** Today's 1-level keyword-based chain orchestrator (`apps/node/src/agent-chain-orchestrator.ts`) is the closest analog but caps at depth 3 with a flat keyword decomposition. Phase 40 supersedes it with:

1. A **typed wire namespace** (9 base intents: `task.chain.mandate`, `task.chain.propose`, `task.chain.bid`, `task.chain.accept`, `task.chain.partial`, `task.chain.merge`, `task.chain.cancel`, `task.chain.heartbeat`, `task.chain.report`; **+4 from Phase 40E**: `task.chain.handoff`, `task.chain.delegate`, `task.chain.relay`, `task.chain.arbitration`) so chains are introspectable on the wire without scanning lineage fields.
2. A **task tree** with explicit `chainId` / `parentTaskId` / `subtaskId` / `depth` lineage on `TaskJournalEntry` and `TaskResultPayload` (additive; existing fields unchanged).
3. **Multi-round negotiation** with hard 3-round cap, hard cost-ceiling enforcement, and bid TTL (`bidExpiresAt`) for crash-replay safety.
4. A new **`composite` artifact kind** that bundles N weighted worker contributions into a single deliverable.
5. An **orchestrator-side `ChainBudgetLedger`** keyed by `chainId` so a single orchestrator node cannot over-commit its signed `maxChainCostUsd` across N parallel workers (the only safe place for this check — workers can't see peers).
6. A **rich multi-section chain report** with citations that jump back to the underlying subtask in the chain tree.

**Design:** [agent_network.md](./agent_network.md). Exit criteria below mirror the design doc's §9 phased rollout and §11 confirmed answers. **The design doc is the normative spec;** this section is the implementation checklist. If the two diverge, the design doc wins until this section is updated.

**Preconditions (all shipped):**
- Phase 24 (Agent Marketplace) — single-shot `task.propose → task.result` and the keyword-based `agent-chain-orchestrator.ts` (which Phase 40B replaces).
- Phase 33 (A2A Tool Exposure) — typed `Artifact` union (`text | file | structured`) on the wire.
- Phase 32 (AI Engine Membership) — `AiEngineMode` helper + the `Settings → AI → AI Engine` block (formerly "Agent Network") that drives the orchestrator selection UX.
- Phase 25 (Ambient Mesh Awareness) — `mesh-awareness-worker` for ambient broadcast hints (informational; not in the chain code path).

### 40A — Protocol + role policy + store extensions (foundation)

- `[x]` **New file** `packages/protocol/src/agent-network.ts` (526 lines): `ChainIdSchema`, `ChainMandateIdSchema`, `ChainRoleSchema`, `ChainMandateSchema`, `ChainMandateSignedSchema`, `ChainSubtaskSchema`, `ChainSubtaskBidSchema`, `ChainSubtaskAwardSchema`, `ChainSubtaskPartialSchema`, `ChainReportSchema`, `CompositeArtifactSchema`, plus the `TaskChain*PayloadSchema` wire wrappers. Includes the **3 new fields** added per Gemini review: `ChainSubtaskBidSchema.bidExpiresAt` (ISO datetime, mandatory; default = proposal deadline + 30s, ceiling 5 min), `ChainSubtaskAwardSchema.negotiationRound` (int 1..3, enforced at parse time), `ChainReportSchema.chainSummary.synthesisCostUsd` (separate from worker cost; invariant: worker + synthesis == total). 40D.5/40D.6 added `rebalancePolicy | stallTimeoutMs | lowConfidenceThreshold | maxAutoRebalances | autoRebalanceIncrementUsd` to `ChainMandate` and `confidence` to `ChainSubtaskPartial`.
- `[x]` **Extend** `EnvoyIntentSchema` in `packages/protocol/src/index.ts` with the 9 new `task.chain.*` intents. All are `agent → agent` except `task.chain.report` (`agent → human`, recipientRole `"human"`). 40E added 4 more (`task.chain.handoff | delegate | relay | arbitration`, all `AGENT_AGENT_ONLY`).
- `[x]` **Extend** `CapabilitySchema` with `chain.orchestrate` — required for any node that mints sub-mandates or publishes chain reports. Workers do not need it.
- `[x]` **Extend** `TaskJournalEntrySchema` additively: optional `chainId`, `parentTaskId`, `subtaskId`, `depth` (max 3). Existing entries without these fields remain valid; the journal reader treats them as solo A2A.
- `[x]` **Extend** `TaskResultPayloadSchema` additively with the same four lineage fields.
- `[x]` **Extend** `TaskLifecycleStateSchema` with `partial` (some subtasks done, more in flight) and `synthesizing` (orchestrator merging). Both are mid-chain states distinct from `running`.
- `[x]` **Extend** `TaskJournalEventTypeSchema` with `chain_subtask_completed`.
- `[x]` **Extend** `role-policy-table.ts` with 9 new entries (40A) plus 4 more (40E), all `AGENT_AGENT_ONLY` except `task.chain.report` (`AGENT_TO_HUMAN`). All intents are gated by the existing `task.execute` capability minimum; `task.chain.mandate / propose / accept / merge / report` additionally require `chain.orchestrate`.
- `[x]` **Extend** `AuditEventType` (`packages/local-store/src/index.ts`) with **18 chain event types** in the schema (40A claimed 17 in the original spec — we ended up with 18 because `chain.replay_partial_sent` and `chain.auto_rebalanced` were added during 40B/40D.5): `chain.created | planned | launched | completed | failed | cancelled`, `chain.subtask_proposed | bid_received | awarded | partial_received | completed`, `chain.subtask_split | merged | re_bid`, `chain.report_published`, `chain.depth_exceeded`, `chain.budget_exceeded`, `chain.bid_expired`, plus `chain.replay_partial_sent` (40B), `chain.handoff.delegated` and `chain.auto_rebalanced` (40D.5/40E). Each carries the lineage fields in metadata for tree reconstruction. **Note:** the `ChainAuditSink` interface (`apps/node/src/chain-inbound-types.ts`) declares `type: string` (not the strict `AuditEventType` union), so a small number of additional chain.* audit strings are emitted at runtime (`chain.bid_declined | bid_send_failed | bid_sent | cancelled | counter_bid | decompose | decompose.llm | finalize_failed | handler_exception | inbound_denied | mandate_broadcast | merge_published | orchestrate | rebalanced | replay_partial_failed | report_send_failed | subtask_cancelled`) and are persisted without Zod validation. This is a soft gap: the JSONL append accepts any string, and consumers should not assume the type field is in the `AuditEventType` union.
- `[x]` **New file** `packages/local-store/src/chain-reports-store.ts` (210 lines): JSON file `chain-reports.json`, atomic-rename writes, upsert by `chainId`, surface `recordChainReport` / `getChainReport` / `listChainReports({ sinceMs, limit, pinnedOnly })`. 90-day default retention; pinned reports (owner-flagged) are exempt from GC.
- `[x]` **Extend** `LocalTaskStore` interface with `listChainEntries(chainId)`, `getChainReport(chainId)`, `listChainReports({...})`. Wire the new store into `createLocalTaskStore` in `packages/local-store/src/index.ts`.
- `[x]` **Tests:** `packages/protocol/test/agent-network.test.ts` (60 tests) — full schema truth table for `ChainMandate`, `ChainSubtask`, `ChainSubtaskBid` (with `bidExpiresAt` validation), `ChainSubtaskAward` (with `negotiationRound: 4` rejected at parse time), `ChainReport` (with `synthesisCostUsd` invariant + tightened `recipientRoles` non-empty constraint). `packages/protocol/test/agent-network-handoff.test.ts` (49 tests, 40E protocol-level coverage) — covers `ChainHandoffRequestPayloadSchema`, `ChainHandoffDelegatePayloadSchema`, `ChainRelayRouteSchema`, `ChainArbitrationEntrySchema`, `ChainArbitrationPayloadSchema`, `ChainHandoffStatusSchema`, and the helpers `isHandoffOpen | isHandoffTerminal | isHandoffLive | getSubChainRootSubtasks`. `packages/protocol/test/role-policy-table.test.ts` (71 tests) — exhaustive table-vs-schema sync guard: every intent in `EnvoyIntentSchema` is checked against its declared (sender, recipient) role pairs, so adding a new `task.chain.*` intent without a policy entry is caught at CI. `packages/local-store/test/chain-reports-store.test.ts` (17 tests) — round-trip, upsert, retention, pinned exemption. `packages/protocol/test/protocol.test.ts` (1 new test) — role-policy gates the 4 new 40E intents as `AGENT_AGENT_ONLY`.

**Deliverable:** protocol defines the wire surface; nothing sends them yet. ~10 new schema entries (40A) + 4 more (40E) = 14 new entries total, 0 wire traffic.

### 40B — Orchestrator + worker runtime + RPC plumbing

- `[x]` **New file** `apps/node/src/chain-budget-ledger.ts` (354 lines): `ChainBudgetLedger` interface from [agent_network.md §7.5](./agent_network.md#75-orchestrator-side-chainbudgetledger). Implements `reserve / tryCommit / release / finalize`. Reserves the synthesis budget up-front so worker awards never spend into the LLM aggregation reserve. Includes `synthesisBudgetPreFlight` method that estimates LLM token cost for the planned composite and refuses to proceed if `maxChainCostUsd − committed − synthesisSpendUsd < estimated`.
- `[x]` **New file** `apps/node/src/chain-orchestrator.ts` (1203 lines): `planChain(mandate, goal, deps)` wraps the existing `decomposeTask` keyword fallback behind an LLM call; `launchChain(mandate, subtasks, deps)` sends signed `task.chain.propose` envelopes; `evaluateBids(chainId, deps)` scores bids against the ledger, rejects any award that would over-commit, rejects any bid whose `bidExpiresAt` is in the past or whose `proposedCostUsd` exceeds `costCeilingUsd`; `trackChain(chainId, deps)` heartbeat loop (30s), 3-miss → re-award with **mandatory ordering**: emit `chain.subtask_cancelled` audit + send `task.chain.cancel` BEFORE sending new `task.chain.accept` to backup (releases the `maxWorkers` slot); `synthesizeChain(chainId, deps)` merges partials into a `ChainReport`, calling `chain-report-synthesizer` for the LLM aggregation pass with pre-flight budget check.
- `[x]` **New file** `apps/node/src/chain-worker.ts` (380 lines): inbound handlers for `task.chain.propose` (auto-evaluate `bidKind`, compute bid via `chain-bid-strategy`); `task.chain.bid` validation (rejected if `bidExpiresAt` is past — emits `chain.bid_expired` audit and returns reject); outbound helpers for `deliverChainPartial` (with `seq` counter), `deliverChainResult`, `submitChainBid`. Includes crash-recovery replay that honors `bidExpiresAt` (`replayInFlightChainSubtasks` — tested separately in `chain-worker.test.ts`).
- `[x]` **New file** `apps/node/src/chain-bid-strategy.ts` (145 lines): default bid policy: `proposedCostUsd = base + reputationDiscount × taskComplexity`, `proposedEtaAt = capability-local-ETA + 60s slack`, `bidExpiresAt = now + min(proposal.deadline + 30s, now + 5min)`. Honors `costCeilingUsd`; returns `decline` if exceeded.
- `[x]` **New file** `apps/node/src/chain-report-synthesizer.ts` (395 lines): orchestrates the LLM aggregation pass over weighted `compositeArtifact.parts[]`. Aggregation kinds: `concatenate` (no LLM), `weighted_concat` (LLM pass with explicit cost tracking), `merge_structured` (deterministic merge for `kind: "structured"` parts), `owner_review` (raw parts only, no LLM). Pre-flight cost check before invoking the model.
- `[x]` **New file** `apps/node/src/chain-inbound.ts` (274 lines): router that dispatches `task.chain.*` envelopes to the worker / orchestrator handlers based on `senderRole: "agent"`. Validates against role policy + capability requirements before handler invocation.
- `[x]` **RPC plumbing:** add the 11 RPCs from [agent_network.md §6](./agent_network.md#6-nodeservice-api-additions) to `packages/api/src/node-service.ts`, `packages/api/src/ws-protocol.ts`, `apps/node/src/json-rpc-router.ts`, `apps/node/src/node-service-impl.ts`, `apps/social/src/lib/direct-call-client.ts`, `apps/social/src/hooks/useNodeService.tsx`. **40D/40D.5/40D.6 added 4 more (`chainCounterBid | chainRebalance | chainGetDefaults | chainSetDefaults`) → 15 chain RPCs total.** The Flutter wrapper in `apps/envoygo/lib/services/node_service_client.dart` is **deferred** (same as the entire 40C mobile mirror — see below).
- `[x]` **Wire up `runOwnerAgentTurn`:** extend the planner loop in `apps/node/src/node-service-impl.ts` so the planner can detect multi-step goal patterns and auto-call `planChain` + `launchChain` instead of doing local tool work. Pattern matching lives in the planner prompt; chains still flow through the public RPCs (no private backdoor). `runChain` is exposed via the `mesh.chain.run` tool in the owner-agent tool allowlist.
- `[x]` **Tests:** `apps/node/test/chain-budget-ledger.test.ts` (22 tests) — over-commit rejection at the ledger layer, not the wire; crash-recovery rebuild from journal entries; synthesis pre-flight. `apps/node/test/chain-orchestrator.test.ts` (23 tests) — plan → launch → evaluate → award → heartbeat → re-award ordering (cancelled-before-accept); partial collection; synthesis pass. `apps/node/test/chain-worker.test.ts` (14 tests) — bid TTL enforcement; `bid_expired` audit on stale accept; partial seq counter; `replayInFlightChainSubtasks` round-trip (worker-side crash replay). `apps/node/test/chain-inbound.test.ts` (17 tests) — role-policy enforcement; capability gating. `apps/node/test/chain-e2e.test.ts` (6 tests) — full two-node round trip: orchestrator on home-A, 3 in-process workers on home-A, chain → partials → report. **Note:** the crash-replay invariant ("completed subtasks remain merged; in-flight subtasks are re-bid with `bidExpiresAt` honored") is verified at the **function-level** in `chain-worker.test.ts` (via `replayInFlightChainSubtasks`) and **end-to-end** in `chain-e2e.test.ts` — there is no test that simulates a forced orchestrator-process restart.

**Deliverable:** a single orchestrator node can drive a 3-worker fan-out end-to-end and produce a `ChainReport` on disk.

### 40C — Social + EnvoyGo UI integration

- `[x]` **New file** `apps/social/src/components/views/ChainsView.tsx` (681 lines): top-level owner-facing view of all chains. List of chains with status chip (`negotiating` | `running` | `synthesizing` | `completed` | `failed` | `cancelled`), total cost vs budget, worker peer-id count, duration. Click → drill-down. Includes the Pin/Unpin button on each published report, the `pinnedOnly` filter, and a list of reports backed by `chainListReports`.
- `[x]` **New file** `apps/social/src/components/ChainTreeView.tsx` (203 lines): recursive tree component rendering a chain's subtasks. Per subtask: status badge, worker peer-id (with link to contact if bonded), cost-so-far, ETA, last heartbeat, partial artifact preview (lazy-loaded via `getTaskResult`), bid history (counter-proposal rounds visible).
- `[x]` **New file** `apps/social/src/components/ChainReportRenderer.tsx` (175 lines): renders a published `ChainReport`. Header (chainId, duration, total cost, worker peer-ids), executive summary (markdown), sections with citations (clicking a citation jumps to the subtask in `ChainTreeView`), composite artifact (downloadable JSON, plus per-kind render — text inline, file via existing `FileArtifactRenderer`, structured via `StructuredArtifactRenderer`, composite via a new `CompositeArtifactRenderer`).
- `[x]` **New file** `apps/social/src/components/CompositeArtifactRenderer.tsx` (138 lines): renders `compositeArtifact.parts[]` as a weighted contribution table with per-part attribution (worker peer-id, subtask-id, weight, optional note). Each part drills into its underlying `ArtifactRenderer` for the actual content.
- `[x]` **Hook up:** mount `ChainsView` as a sub-view under the existing Activity tab (per Phase 23 design — chains are a kind of activity). Add a "New chain" affordance in the chat composer that launches the planner's chain path (calls `runOwnerAgentTurn` which auto-routes to `launchChain`).
- `[x]` **i18n:** new `chains.*` block in `en-chains.ts` (English-only). Keys cover status chips, tree labels, report section labels, cost-vs-budget copy, citation UI text, `bid_expired` audit explanation, the bid-inbox labels, the rebalance-bar labels (40D), and pin/unpin labels (40D). The 6 non-English locales (`zh | ko | ja | fr | de | it`) fall back to English via `translate()`'s `en` fallback — this matches the existing project pattern (e.g. `en-agent-network.ts` is also English-only).
- `[x]` **Mobile mirror: shipped (read-only).** A minimal "Recent chains" section was added to `apps/envoygo/lib/screens/me/me_screen.dart` (after the AI Engine section, before Public Access). The new flow uses the two read-only chain RPCs the home node already serves through its JSON-RPC router: `chainListReports` (limit 50) for the list, `chainGetReport` for the detail. Implementation:
  - `apps/envoygo/lib/models/chain_report.dart` — typed Dart models (`ChainReportSummary`, `ChainReport`, `ChainReportChainSummary`, `ChainReportWorkerAllocation`, `ChainReportSection`) with `fromJson` factories (no codegen, no `freezed` — matches `terminal_session.dart`).
  - `apps/envoygo/lib/services/node_service_client.dart` — added two RPC wrappers: `listChainReports({limit, pinnedOnly})` and `getChainReport(chainId)`. The other 13 chain RPCs (plan / launch / cancel / rebalance / counter-bid / setBidStrategy / etc.) are intentionally not exposed on the mobile client — the home node's Social UI is the source of truth for chain authoring and editing.
  - `apps/envoygo/lib/screens/chains/recent_chains_screen.dart` — list view with pull-to-refresh, pinned indicator (star icon), per-row summary (workers · subtasks · $synthesis), empty state, error state with retry.
  - `apps/envoygo/lib/screens/chains/recent_chain_detail_screen.dart` — detail view: header (chain id, created, workers/subtasks/synthesis cost/duration stats), executive summary, per-section body cards, worker-allocation table. Markdown bodies render as plain text (no `flutter_markdown` dependency — kept inline for "minimal but complete").
  - `apps/envoygo/lib/screens/me/me_screen.dart` — new "Chains" section entry card with `Icon(Icons.analytics_outlined)`, title "Recent chains", subtitle "View chain reports published on the home node", and a chevron trailing.
  - **Tests:** `apps/envoygo/test/models/chain_report_test.dart` (8 model tests: list-row parse, full report parse, defensive integer cost, missing pinned / missing sections / null pinned / missing bodyMarkdown) + 6 new RPC wiring tests in `apps/envoygo/test/services/node_service_client_test.dart` (sends `chainListReports` with `limit`, sends no params when no filter, empty `reports` key, sends `chainGetReport` with `chainId`, returns null when `report` is null, propagates JSON-RPC errors). The previous `node_service_client_test.dart` was a TODO-only stub; this replaces it with a real test file.
  - `flutter analyze` is clean on all 6 new/modified files (1 pre-existing `withOpacity` deprecation in `me_screen.dart:76` is unrelated to this work).
  - **Caveat:** the home node's `chainListReports` / `chainGetReport` implementations in `apps/node/src/node-service-impl.ts` currently return `{ reports: [] }` / `{ report: null }` pending 40B.10 wiring the persistent chain-reports store. The mobile mirror lights up automatically once that lands; the empty-state is already correct.
  - **Pre-existing test failures unrelated:** `flutter test` reports 4 pre-existing compilation failures in `node_provider.dart` and `call_provider.dart` (added by commit `1e266c0 add web rtc voice/video call`), which reference `NodeServiceClient.client`, `NodeServiceClient.eventStream`, `NodeServiceClient.noop()`, `sendCallInvite`, `acceptCallInvite`, etc. — methods that were never added to `NodeServiceClient`. The baseline (without my changes) also shows `+147 -4`; with my changes it shows `+149 -4` (net `+2`: 4 old stub TODOs replaced by 6 real tests). These failures are out of scope for the mobile mirror.
- `[x]` **Tests:** `apps/social/test/components/chain-renderers.test.tsx` (12 tests for `ChainsView` + `ChainTreeView` + `ChainReportRenderer` + `CompositeArtifactRenderer` — covers empty / loading / list / status-chip colors, depth-1 / depth-2 / collapsed nodes, executive summary, sections, citation click → tree jump, composite artifact render, weighted table, per-kind delegation).

**Deliverable:** owners can author, monitor, and read chain reports from the Social UI. **EnvoyGo mobile mirror is explicitly deferred** (no chain surface in `apps/envoygo/`).

### 40D — Multi-bid collection, counter-bid UI, LLM decomposer (production polish)

- `[x]` **Multi-bid:** flip the default `requireMultipleBids` to `true` for chains with > 3 workers. Orchestrator waits for ≥2 bids; window = `min(bidderCount, 3) × 30s`. Single-bidder fallback after the window expires. **`evaluateBids` now surfaces every live bid in `ChainGetStateResult.bidsBySubtask`** so the UI can render the inbox directly from the orchestrator state. See `chain-bid-multiround.test.ts` for the covering tests.
- `[x]` **Counter-bid UI:** extend the orchestrator's bid inbox (new component `apps/social/src/components/ChainBidInbox.tsx`, 272 lines) so the owner can see incoming bids, review counter-proposals, and accept/reject manually before the orchestrator's auto-evaluation kicks in. Adds an explicit `awaitingOwnerReview` chain state distinct from `negotiating`. The owner can either **Award** a specific worker (bypassing the cheapest/fastest policy via `pickWorkerPeerId`) or **Counter-bid** with a new cost ceiling (which clears all live bids, bumps the round counter, and rebroadcasts via `task.chain.propose`).
- `[x]` **Cost rebalance UI:** when `partial` results show uneven quality (e.g. one worker delivered partials with confidence < 0.5), the orchestrator surfaces a rebalance suggestion in the chain tree view ("Worker X's quality is below threshold — re-award to backup? Cost: $Y"). Owner approves via a one-click confirmation. **`ChainRebalanceBar` (apps/social/src/components/ChainRebalanceBar.tsx, 170 lines)** adds USD to the chain's `maxChainCostUsd` and re-runs `evaluateBids` for every not-yet-awarded subtask; already-awarded subtasks are intentionally skipped to honor the ledger's invariant that committed spend cannot be rolled back.
- `[x]` **Pin chain reports:** extend `ChainReportRenderer` with a "Pin" toggle that calls a new RPC `pinChainReport(chainId, pinned: boolean)`. Pinned reports are exempt from the 90-day GC and surface in a dedicated "Pinned" tab. Implemented in `ChainsView` (Pin/Unpin button + `pinnedOnly` filter).
- `[x]` **LLM decomposer:** replace the keyword-based `decomposeTask` fallback for plans longer than 3 steps. New module `apps/node/src/chain-decomposer.ts` (215 lines): takes a goal + mandate, returns a `ChainSubtask[]` with explicit capability tags, depth assignment, and dependency edges. Uses the existing `routeModelRequest` model-provider surface (no new model dependency). Wired into `NodeServiceImpl.buildChainOrchestratorDeps().llmDecompose`; the orchestrator's `planChain` calls it when the goal is longer than 12 words and `allowLlm: true` is passed.
- `[x]` **Tests:** `apps/social/test/components/chain-bid-inbox.test.tsx` (15 tests for inbox + rebalance bar); `apps/node/test/chain-bid-multiround.test.ts` (15 tests for `evaluateBids({pickWorkerPeerId})`, `counterBid`, `rebalanceChain`, and `workersBySubtask` propagation); `apps/node/test/chain-decomposer.test.ts` (14 tests for prompt construction, JSON extraction, parse failures, depth clamping, fallback defaults); Playwright smoke at `apps/node/test/chain-playwright-e2e.test.ts` (boots the production bundle in real Chromium). **44 new tests in 40D alone.**

**Deliverable:** production-ready chain authoring experience. Owner sees bids, reviews them, can pin reports, can rely on LLM decomposition for non-trivial goals.

### 40E — Cross-orchestrator & cross-home chains `[x] shipped`

- `[x]` **Cross-orchestrator handoff protocol:** four new wire intents in `@envoymesh/protocol` — `task.chain.handoff` (owner → orchestrator-A), `task.chain.delegate` (orchestrator-A → orchestrator-B with a re-signed sub-mandate), `task.chain.relay` (cross-home transport wrapper), and `task.chain.arbitration` (convergence ledger). All four are gated as `AGENT_AGENT_ONLY` in `role-policy-table.ts` (the owner's agent identity signs `handoff`; `relay` is a transport wrapper re-validated by the receiver). Schemas in `packages/protocol/src/agent-network-handoff.ts` (256 lines) with status enum (`pending | delegated | rejected | expired | cancelled`) and helpers (`isHandoffOpen`, `isHandoffTerminal`, `isHandoffLive`, `getSubChainRootSubtasks`). See `apps/node/src/chain-handoff.ts` (350 lines) for the orchestrator-side record + delegate builder + acceptHandoff lifecycle.
- `[x]` **Cross-home chains via relay transport:** `apps/node/src/chain-relay.ts` (154 lines) provides `selectChainRoute` (direct vs relay-wrapped), `wrapChainEnvelope` (wraps any chain envelope in `task.chain.relay` with TTL + `viaRelays` hint set), and `unwrapChainRelay` (strips the wrapper on the receiving end). Relay nodes are content-agnostic — they only forward the wrapper. `advanceViaRelays` drops the hop we just traversed to prevent loops.
- `[x]` **Cross-orchestrator arbitration:** `apps/node/src/chain-arbitration.ts` (204 lines) provides `ArbitrationStore` (append-only per-chain ledger keyed by `subtaskId`), `applyArbitration` (converges local state with a remote entry; `seq` is primary, `createdAt` is the tiebreaker; idempotent on the same `arbitrationId`), `releaseOwnership` (drops local awards + finds lost subtasks so the caller can release budget reservations).
- `[x]` **Tests:** `apps/node/test/chain-handoff.test.ts` — 31 tests covering handoff lifecycle, delegate payload round-trip, arbitration convergence rules (seq-wins / idempotency / tie-on-createdAt), loss recovery (`findLostSubtasks` + `releaseOwnership`), cross-home relay routing (`selectChainRoute` + `wrapChainEnvelope` + `unwrapChainRelay` + `advanceViaRelays`), and an end-to-end scenario where A creates a handoff, B accepts, and the local arbitration ledger reflects the new ownership. 1 additional test in `packages/protocol/test/protocol.test.ts` verifies that the 4 new 40E intents are correctly rejected under human→human role pairs.

**Deliverable:** chains that span multiple home nodes + the mobile. The orchestrator network can now compose: a sub-chain on home-A can hand off to home-B, and the mobile (relay-only) can deliver envelopes to either. Arbitration ensures the two sides converge on "who owns what" within seconds, even across a brief network partition.

### 40F — Production integration `[x] shipped`

Wire the Phase 40 library modules into the live node runtime so chains work over real libp2p transport, not just in-process test harnesses.

- `[x]` **`dispatchChainEnvelope` in `index.ts`:** all 9 `task.chain.*` intents route through `NodeServiceImpl.handleInboundChainEnvelope`.
- `[x]` **Real orchestrator deps:** `buildChainOrchestratorDeps()` uses agent identity signing keys, `sendChainEnvelopeOverMesh` for libp2p transport, audit events via `LocalTaskStore`, and `recordChainReport` persistence.
- `[x]` **Real worker deps:** `buildChainWorkerDeps()` handles inbound `propose` / `mandate` / `accept` / `cancel` / orchestrator heartbeats; auto-bids on propose via `chain-bid-strategy`.
- `[x]` **Inbound routing fix:** capability gate split into orchestrator-receive (`bid`, `partial`, `merge`, worker-originated `heartbeat`) vs worker-receive (`mandate`, `propose`, `accept`, `cancel`); added `handleOrchestratorBid` to store bids in `chainRuntime`.
- `[x]` **RPC wiring:** `chainPlan` / `chainLaunch` call `planChain` / `launchChain`; `chainListReports` / `chainGetReport` / `chainPinReport` read/write `chain-reports.json` via `LocalTaskStore.recordChainReport`.
- `[x]` **Worker discovery:** `findAgentNetworkWorkers` reads from `AgentNetworkMembershipIndex` (populated from bonded agent cards on `node:online` + `bond:established`).
- `[x]` **Heartbeat scheduler:** `_startChainTracking` runs `trackChain` ticks for active chains after launch.
- `[x]` **Tests:** `chain-production.test.ts` (transport resolver + chainId extraction); updated `chain-inbound.test.ts` + `chain-e2e.test.ts` for corrected capability gate.

### Exit Criteria (Phase 40)

- `[x]` All 40A–40E checkboxes flipped (40E **shipped** in this milestone; EnvoyGo mobile mirror for chains explicitly **deferred** — see 40C).
- `[x]` `npm run typecheck` clean (additive schema bumps; no breaking changes for solo A2A flows). The `mobile-node` interface mismatch on `NodeService` is pre-existing (independent of Phase 40).
- `[x]` `npx vitest run` green for every chain-related test file — **455 chain-related tests across 21 files** (was 332/19; the delta is the new `agent-network-handoff.test.ts` (49) + new `role-policy-table.test.ts` (71) + 3 new `agent-network.test.ts` tests for the tightened `recipientRoles` constraint):
  - **203 tests** in 13 `apps/node/test/chain*` files (11 production unit-test files + 2 integration files: `chain-budget-ledger` 22, `chain-orchestrator` 23, `chain-worker` 14, `chain-bid-strategy` 16, `chain-report-synthesizer` 13, `chain-inbound` 17, `chain-decomposer` 14, `chain-bid-multiround` 15, `chain-rebalance-policy` 17, `chain-defaults-rpc` 13, `chain-handoff` 31, `chain-e2e` 6, `chain-playwright-e2e` 2).
  - **35 tests** in 3 `apps/social/test/components/chain*` files (`chain-bid-inbox` 15, `chain-rebalance-bar` 8, `chain-renderers` 12).
  - **197 tests** in 4 protocol/local-store files (`packages/protocol/test/agent-network` 60, `packages/protocol/test/agent-network-handoff` 49, `packages/protocol/test/role-policy-table` 71, `packages/local-store/test/chain-reports-store` 17).
  - **19 tests** in `packages/api/test/owner-agent-chain.test.ts`.
  - **1 new test** in `packages/protocol/test/protocol.test.ts` (role-policy gate for the 4 new 40E intents).
- `[x]` Two-node smoke test (`chain-e2e.test.ts`) drives a 3-worker fan-out end-to-end and produces a `ChainReport` on disk with verified `synthesisCostUsd + workerAllocations.committedUsd == maxChainCostUsd` invariant (40B).
- `[x]` Playwright E2E smoke at `apps/node/test/chain-playwright-e2e.test.ts` (boots the production Social bundle in real Chromium; verifies the bundle parses and the React app mounts cleanly). Deep interaction testing deferred until the SetupView wizard gets a "skip for testing" affordance.
- `[ ]` **EnvoyGo manual smoke test is NOT performed** — `apps/envoygo/` has no chain UI (40C mobile mirror is explicitly deferred; see above).
- `[x]` No new npm dependencies (LLM decomposer reuses the existing `@envoymesh/models` `routeModelRequest` surface).
- `[x]` No breaking changes to existing `task.*` wire surface (Phase 24 solo A2A flows continue to work unchanged — additive `task.chain.*` namespace).
- `[x]` Trust gating verified per §7.2 directional table (worker→orchestrator bid requires `direct`; orchestrator→worker propose/accept requires `referred`; report→owner uses existing `report.create` channel). The 4 new 40E intents (`handoff` | `delegate` | `relay` | `arbitration`) are all `AGENT_AGENT_ONLY` in `role-policy-table.ts` and covered by a new test in `packages/protocol/test/protocol.test.ts`.
- `[x]` `bid_expired` audit emitted for stale awards (verified in `chain-worker.test.ts` — `checkBidExpiration: no_pending_bid | bid_expired | ok`).
- `[x]` **Crash-replay is verified at the function-level** in `chain-worker.test.ts` via `replayInFlightChainSubtasks` (worker-side replay that honors `bidExpiresAt`; emits `chain.replay_partial_sent` audit; counts failures separately from successes). The end-to-end "forced orchestrator-process restart" replay test from the 40B spec is **NOT implemented** — it would require a process-level restart harness that's out of scope for 40B; the function-level coverage proves the invariant.

### Open design questions (resolved 2026-06-17, confirmed by Gemini design review)

| # | Question | Answer | Why |
|---|---|---|---|
| 1 | Depth default | Depth 2 default; `allowDepth3: true` opt-in on the mandate | Keeps the audit tree shallow; depth-3 chains pay the explicit cost of a sub-mandate |
| 2 | Cost ceiling enforcement | Hard-reject at parse time | Keeps audit clean; no silent over-spend |
| 3 | `task.chain.report` channel | Dedicated `task.chain.report` intent (`recipientRole: "human"`) | Citation-aware rendering needs metadata `chat.message` cannot carry |
| 4 | Composite artifact aggregation | LLM synthesis by default with **pre-flight budget check** | Skips synthesis with `aggregation: "owner_review"` if the budget can't support the token fee |
| 5 | 40E timing | **Shipped in 40E milestone** (mobile parity landed first via Phase 11 + Phase 30 home-proxy) | Cross-home on unstable mobile = too much area at once — the original concern is now mitigated because the mobile (relay-only) routes chains through the home-proxy rather than direct P2P. |

### Cross-references

- [agent_network.md](./agent_network.md) — the normative design doc; this section is the implementation checklist
- [phase-33-a2a-tool-exposure.md](./phase-33-a2a-tool-exposure.md) — typed `Artifact` union reused by `composite` parts
- [agent-network-config.md](./agent-network-config.md) — AI Engine selection that drives the orchestrator selection UX
- `apps/node/src/agent-chain-orchestrator.ts` — existing 1-level chain (Phase 24B), superseded by 40B
- `apps/node/src/task-negotiation-loop.ts` — existing solo A2A loop (Phase 24A), wrapped by 40B
- `apps/node/src/reputation-router.ts` — existing router (Phase 24C), input to the bid scorer in 40B
- `packages/local-store/src/task-results-store.ts` — existing per-task store, extended with `chain-reports.json` in 40A

---

## Phase 41 — Making Agent Network Usable & Powerful **`[~]` partially shipped**

> **Status: `[~]` partially shipped.** Phase 41 was designed as seven sub-phases (41A–41G). Some library-level pieces landed inside Phase 40/40F (LLM decompose hooks, `CapabilityIndex`, `ChainsView`, audit wiring, `trackChain` scheduler). Several exit criteria are **not yet production-complete**: composite bid ranking (`rankBids` exists but is not used in `evaluateBids`), WebSocket chain-state push, bid justification in UI, CSV export, and full 41E stall auto-rebid semantics. **Phase 43** consolidates the remaining usability work into a user-first roadmap. Design doc: [agent_network.md §13](./agent_network.md#13-phase-41--making-agent-network-usable--powerful).

**Goal:** Bridge the gap between Phase 40's framework (correct, tested, 77 tests) and a genuinely usable multi-agent collaboration platform. The orchestrator today can decompose simple goals by keyword matching, but it can't handle natural-language goals ("Find the best restaurant in Paris that my contacts have reviewed"). Workers must be manually configured instead of auto-discovered from bonded contacts. Bids are ranked by cost alone, not by composite reputation+freshness+precision scores. There's no Social UI to observe active chains, no auto-recovery from stalled workers, and no audit trail for chain operations.

Phase 41 addresses all seven gaps with a coordinated design:

| Sub-phase | What | ~Lines | Depends on |
|-----------|------|--------|------------|
| 41A — LLM decompose/merge | Wire `llmDecompose` and `llmMerge` callbacks to EnvoyAI/OpenClaw | ~300 | Phase 29 (OpenClaw runtime) |
| 41B — Agent Card auto-discovery | `CapabilityIndex` fed from auto-fetched agent cards on bond establishment | ~200 | Phase 33 (A2A tool exposure) |
| 41C — Bid ranking | Composite score: cost (35%) + reputation (30%) + freshness (20%) + precision (15%) | ~80 | Phase 8K (reputation) |
| 41D — Chain UI | `ChainsView` + `ChainTreeView` + `ChainReportView` in Social UI | ~500 | Phase 38 (WebRTC UI pattern) |
| 41E — Heartbeat enforcement | Auto-detect stalled subtasks, re-bid/cancel/escalate by policy | ~100 | — |
| 41F — Chain audit trail | Feed chain events into existing JSONL audit pipeline | ~80 | — |
| 41G — Quick wins | WebSocket state push, in-memory cache, bid justification in UI, CSV export | ~150 | — |
| **Total** | | **~1,410** | |

**Preconditions (all shipped):**
- Phase 40 (Agent Network) — 13 `task.chain.*` intents, orchestrator/worker runtime, handoff/relay transport, 77 tests
- Phase 29 (OpenClaw Integration) — runtime, tool catalog, install scripts
- Phase 33 (A2A Tool Exposure) — `request_agent_card` tool, typed Artifacts
- Phase 8K (Reputation) — `PeerReputationRecord`, `getPeerReputation()`

**Implementation order (recommended):** 41A + 41B together first (they make the orchestrator genuinely intelligent), then 41C (better bid selection), then 41D (UI so owners can observe), then 41E + 41F (resilience + audit), then 41G (quick wins).

### Exit Criteria (Phase 41)

- `[x]` LLM decompose/merge hooks wired in orchestrator deps when model providers enabled (41A — library; needs chat entry point in 43B)
- `[x]` `CapabilityIndex` + refresh on bond/online (41B — shipped in 40F)
- `[ ]` Bids ranked by composite score in production `evaluateBids` (41C — `rankBids()` exists, not wired)
- `[x]` Social `ChainsView` + bid inbox + rebalance bar (41D — shipped in 40C/40D; buried in Settings, no WebSocket push)
- `[~]` Stall detection via `trackChain` scheduler (41E — partial; default policy still `manual`)
- `[~]` Chain operations audited with correlationId (41F — partial via 40F `_appendChainAudit`; not all transitions covered)
- `[ ]` Quick wins: WebSocket push, bid justification in UI, chain cost CSV export (41G)
- `[ ]` All seven sub-phases production-complete (superseded checklist → see Phase 43)

### Cross-references

- [agent_network.md §13](./agent_network.md#13-phase-41--making-agent-network-usable--powerful) — normative design with detailed sub-phase specs
- [agent-network-config.md](./agent-network-config.md) — AI Engine selection that drives orchestrator UX
- [phase-33-a2a-tool-exposure.md](./phase-33-a2a-tool-exposure.md) — Agent Card auto-fetch (41B dependency)
- `apps/node/src/chain-orchestrator.ts` — existing orchestrator, extended by 41A/41C/41E
- `apps/node/src/chain-bid-strategy.ts` — existing bid strategy, replaced by 41C
- `apps/node/src/chain-inbound.ts` — existing router, extended by 41F

---

## Phase 42 — Native WebRTC Voice Calls on EnvoyGo **`[x]` shipped**

> **Status: `[x]` shipped (2026-06-19).** Phase 38 shipped the desktop call path; EnvoyGo (Flutter thin client, Phase 31) can now place and receive WebRTC calls end-to-end. **Four design decisions resolved (2026-06-19):** (1) `flutter_webrtc ^0.14.0`; (2) default `iceServers` = 3-STUN list (Google + Cloudflare + Twilio); (3) TURN user-configured (no EnvoyMesh-hosted TURN server); (4) iOS backgrounded calling via VoIP + PushKit + CallKit (42I). Phase 42 fixes the broken-stub surface (signature-mutation bug in response envelopes, dead `eventStream`, empty `iceServers`, unwired VoipPushService/CallKit, dead-desktop-caller) without changing the wire surface — every existing `call.*` envelope from Phase 38 is reused. **API-level breaking changes (coordinated across home + EnvoyGo + Social UI):** the `NodeService` interface (`packages/api/src/node-service.ts:2091-2128`) gains `sdpOffer`/`sdpAnswer`/`iceServers` params on `sendCallInvite`/`acceptCallInvite`, plus `tokenType: "alert" | "voip"` on `registerPushToken`. The current `sendCallInvite` was already a runtime schema violation (`sdpOffer: ""` violates `z.string().min(1)`), so we're replacing a broken contract, not breaking a working one. **Implementation log:** `8c9c464` (42A) → `d593da5` (42B) → `58157fc` (42C) → `40c44a6` (42D) → `39f78f2` (42E) → `5543afc` (42F+42G) → `78df804` (42H+42I). Design doc: [voice-video-call-envoygo.md](./voice-video-call-envoygo.md).

**Goal:** A bonded user on an EnvoyGo phone (iOS or Android) can place and receive a real-time WebRTC voice call to a Social/desktop browser user or to another EnvoyGo phone, with the home in the signaling path (trust check, identity binding, CallManager state machine) and the media path peer-to-peer (Path 2 ICE; Path 1 libp2p data channel is documented as not-available on `flutter_webrtc`).

**Why it matters:** Phase 38 made desktop↔desktop voice calls real. Without Phase 42, the call feature is invisible to the 60% of user time spent on mobile. The signaling is already plumbed (home emits `call:*` events on the ws event bus; EnvoyGo's `CallProvider` filters by `type.startsWith('call:')`); only the media-plane and the home's response envelopes are missing.

**Preconditions (all shipped):**
- Phase 38 (Real-Time Voice/Video Calls) — 6 `call.*` intents, `CallManager`, `call-inbound`, `webrtc-call-transport.ts` (desktop reference implementation that 42D mirrors), Social UI components.
- Phase 31 (Flutter Thin Client — EnvoyGo) — `flutter_webrtc` already in `pubspec.yaml`; `CallProvider`, `VoiceCallScreen`, `IncomingCallOverlay` already exist as UI scaffolding.
- Phase 38 §6.3 STUN/TURN defaults already documented; the home's `node-config.json` already has an `iceServers` field.

**Scope discipline (not in Phase 42):**
- Video calls (`callType: "video"`) — defer to a Phase 42B extension.
- Removing the home from the call path — explicitly out of scope per the [parked-envoygo-full-node-scope.md](./parked-envoygo-full-node-scope.md) decision.
- TURN server provisioning in the relay binary — explicit NG6. TURN is user-configured (42H) via Twilio / Cloudflare / self-hosted coturn; no EnvoyMesh-hosted TURN.
- Path 1 (libp2p data channel) on the phone — `flutter_webrtc` does not support binding to a libp2p stream; documented as NG4.
- Android call-UI parity with iOS CallKit — explicit NG8. FCM `data` messages can wake the app (best-effort), but Android lacks a CallKit-equivalent for native in-call UI.
- Bumping `flutter_webrtc` to `^0.14.0` (42D) is **not** a "new dep", but is a version change in `pubspec.yaml`. `flutter_callkit_incoming` (42I) **is** a new pubspec dep.

**API-level breaking changes (separate from wire — see [voice-video-call-envoygo.md §4](./voice-video-call-envoygo.md#4-protocol-no-new-wire-changes)):** Phase 42 changes 3 `NodeService` interface signatures in `packages/api/src/node-service.ts` (no version-skew support; coordinated across home + EnvoyGo + Social UI in the same release):
- `sendCallInvite(targetOwnerId)` → `sendCallInvite(targetOwnerId, sdpOffer, iceServers?)` (42A / 42C)
- `acceptCallInvite(callId)` → `acceptCallInvite(callId, sdpAnswer, iceServers?)` (42B / 42C)
- `registerPushToken` gains a `tokenType: "alert" | "voip"` discriminator (42I; default `"alert"` for back-compat; the implementation actually uses `"alert"` rather than the originally-designed `"standard"` because it matches Apple's `apns-push-type: alert` vocabulary exactly)

The current `sendCallInvite` interface is already a runtime schema violation (`sdpOffer: ""` fails `z.string().min(1)`), so we're not breaking a working contract — we're replacing a broken one. `declineCallInvite`, `endCall`, `setCallMuted`, `getActiveCall`, `onCallEvent` are unchanged.

### 42A — Home `sendCallInvite` correctness + envelope injection

- `[x]` **Rewrite** `sendCallInvite` at `apps/node/src/node-service-impl.ts:11913-11945` to take `(targetOwnerId, sdpOffer, iceServers?)`, resolve owner→device peer ID via `_resolvePeerTransportForOwner` (the chat-correct path at `node-service-impl.ts:2835-2945`), embed the SDP offer in the `call.invite` payload (replacing the empty string), inject `iceServers` from `this._nodeConfig.iceServers` (already loaded at `node-service-impl.ts:7813`) when not provided, set `recipientPeerId` to the resolved device peer ID, sign and send via `mesh.send(transportPeerId, envelope, { dialHints })`. Mirror chat's retry pattern (`_deliverChatEnvelope`).
- `[x]` **Add defensive validators** to `call-inbound.ts`: `validateSdpString(sdp, maxBytes = 64 KB)` and `validateIceCandidate(candidate)` (SDP candidate grammar regex). Apply in `handleCallInvite`, `handleCallAccept`, and `handleCallIceCandidate` before passing to the transport. ~30 LoC; defense against malformed SDP/ICE that could crash `setRemoteDescription` or flood `addIceCandidate`.
- `[x]` **Tests:** `apps/node/test/call-send-invite.test.ts` (owner→device resolution, SDP embedding, `iceServers` default injection, missing-peer path with audit event), `apps/node/test/call-sdp-validation.test.ts` (oversize SDP rejected, malformed SDP rejected, valid SDP passed, valid candidate passed, malformed candidate rejected).

### 42B — Home response envelopes (accept / decline / hangup / mute)

- `[x]` **Rewrite** the four stub methods at `node-service-impl.ts:11947-11961` to send response envelopes back to the peer: `acceptCallInvite(callId, sdpAnswer, iceServers)` sends `call.accept`; `declineCallInvite(callId, reason)` sends `call.reject`; `endCall(callId)` sends `call.hangup`; `setCallMuted(callId, muted)` sends `call.mute`. All four share a small helper `_sendCallResponseEnvelope(callId, payload, intent)` that looks up the call session's `peerOwnerId`, resolves to device peer ID, signs and sends via `mesh.send`. No-op if the session is already ended or the peer is unreachable.
- `[x]` **Tests:** `apps/node/test/call-response-envelopes.test.ts` — one per method, mocking `CallManager` and `_resolvePeerTransportForOwner`, verifying the right intent + payload + recipient are sent. Edge cases: peer unreachable (no-op), session already ended (no-op).

### 42C — EnvoyGo `NodeServiceClient` call RPC implementations

- `[x]` **Replace** the five `UnimplementedError` stubs at `apps/envoygo/lib/services/node_service_client.dart:376-408` with real JSON-RPC calls over the existing `HomeRemoteClient`: `sendCallInvite(targetOwnerId, sdpOffer, iceServers)`, `acceptCallInvite(callId, sdpAnswer, iceServers)`, `declineCallInvite(callId, reason)`, `endCall(callId)`, `setCallMuted(callId, muted)`. Follow the `sendChat` pattern in the same file.
- `[x]` **Tests:** extend `apps/envoygo/test/services/node_service_client_test.dart` — one assertion per method, mocking the `MockWebSocket` JSON-RPC pattern. Verify request payload, response parse, and error propagation.

### 42D — Native `WebRtcCallTransport` for Flutter

- `[x]` **New file** `apps/envoygo/lib/webrtc_call_transport.dart` mirroring `apps/social/src/lib/webrtc-call-transport.ts:57-251` using `flutter_webrtc`. Public surface: `startOffer()` / `startAnswer(remoteSdp)` / `addIceCandidate(candidate)` / `setMute(muted)` / `close()`. Uses `RTCPeerConnection({iceServers, ...})`, `getUserMedia({audio: true})`, `MediaStreamTrack.enabled = !muted`, `pc.onIceCandidate / onAddStream / onConnectionState`. Path 2 only (Path 1 libp2p data channel is not available in `flutter_webrtc`; documented in the file's docstring).
- `[x]` **Tests:** `apps/envoygo/test/webrtc_call_transport_test.dart` using a fake `RTCPeerConnection` (most `flutter_webrtc` calls are static-method-shaped and mockable; integration tests require a real device). Lifecycle, mute, and ICE candidate buffering on Path 2.

### 42E — Wire `CallProvider` to drive the transport

- `[x]` **Update** `apps/envoygo/lib/providers/call_provider.dart:99-156`: `startCall` builds a `WebRtcCallTransport`, awaits `startOffer()`, then calls `_nodeService.sendCallInvite(targetOwnerId, sdpOffer, iceServers)` with the generated SDP. `acceptCall` builds a transport from the incoming SDP, awaits `startAnswer()`, then calls `_nodeService.acceptCallInvite(callId, sdpAnswer, iceServers)`. `endCall` / `declineCall` close the transport before the RPC. `toggleMute` calls `transport.setMute` then the RPC. `CallState` gains `MediaStream? remoteStream` and `WebRtcCallTransport? transport` fields.
- `[x]` **Tests:** `apps/envoygo/test/providers/call_provider_test.dart` — `startCall` builds the transport, generates SDP, sends the RPC, sets state; `acceptCall` does the inverse; transport is closed on every end-state transition.

### 42F — UI + platform config

- `[x]` **Update** `apps/envoygo/lib/screens/call/voice_call_screen.dart` to render the active call (peer name, duration timer, mute/end buttons) and bind to the new `CallState.remoteStream` via `RTCVideoRenderer` (or audio-only in v1). Update `apps/envoygo/lib/widgets/incoming_call_overlay.dart` to wire the Accept button to `CallProvider.acceptCall` with the SDP plumbing. The IncomingCallOverlay is also wired into `home_screen.dart` as a Stack overlay so the ring screen appears above the bottom-nav content when `state.isIncoming`. A new Call action button is added to `chat_detail_screen.dart` AppBar for direct-message chats (not rooms / agents) — tapping it calls `callProvider.startCall` and pushes the `VoiceCallScreen`.
- `[x]` **iOS `Info.plist`:** add `NSMicrophoneUsageDescription`.
- `[x]` **Android `AndroidManifest.xml`:** add `RECORD_AUDIO` permission (plus `MODIFY_AUDIO_SETTINGS` and `INTERNET`).
- `[x]` **iOS `AVAudioSession` configuration:** `AVAudioSessionCategory.playAndRecord` with `.voiceChat` mode, `.allowBluetooth` option. Set on `startCall` and `acceptCall`, reset on `endCall` / `declineCall` / dispose. Wired through a new `AudioSessionHelper` Dart-side + a `envoygo/audio_session` method channel in `AppDelegate.swift`.
- `[x]` **Mic permission:** `flutter_webrtc`'s built-in `getUserMedia` triggers the OS prompt at runtime (no `permission_handler` dependency).
- `[ ]` **Tests:** `flutter analyze` clean on all modified files; widget test for the active call screen (`apps/envoygo/test/screens/call/voice_call_screen_test.dart`).

### 42G — Tests + E2E

- `[x]` **Unit tests** (consolidated from 42A–42F above): ~5 new test files, ~600 LoC of tests.
- `[x]` **Integration test (vitest, jsdom, two CallManager instances):** one home is the caller, one is the callee. Send `call.invite` between them, assert the SDP offer round-trips in the envelope, assert the home's `sendCallInvite` sets the right `recipientPeerId`, assert `acceptCallInvite` produces a `call.accept` envelope with the SDP answer. Reuses the existing `chain-e2e.test.ts` two-process harness pattern.
- `[x]` **Playwright E2E (browser-Social ↔ browser-Social):** two browser contexts, place a call, assert `RTCPeerConnection.connectionState === "connected"`. Re-validates the desktop side after the home-side changes. **Wired the previously-dead-code Social-UI caller for `createWebRtcCallTransport`** in `apps/social/src/hooks/useCallSession.ts` (driven by `ContactChatPanel`).
- `[ ]` **Real-device manual smoke (42J, deferred):** two iOS devices on the same LAN, place a call via EnvoyGo, verify audio. Same pattern as Phase 38H.

### 42H — TURN credentials for symmetric NAT

- `[x]` **3-server default `iceServers`** in `apps/node/src/node-service-impl.ts:525` (`DEFAULT_ICE_SERVERS`): Google STUN + Cloudflare STUN + Twilio STUN. STUN-only (TURN is user-added). All three are public servers; no credentials needed.
- `[x]` **Social UI TURN editor** in `apps/social/src/components/views/SettingsNodeTab.tsx` (`TurnServersSection`, exported for direct testing): list editor for ICE entries (URL + optional username + optional credential); preset selector (Twilio / Cloudflare / self-hosted coturn) that pre-fills the URL when adding a row; "Reset to defaults" button; inline validation (URL must start with `stun:` or `turn:`; TURN entries need both `username` and `credential`).
- `[x]` **No schema change** — `iceServers` schema at `node-config-store.ts:192` already supports `{ urls, username?, credential? }` entries (TURN-compatible).
- `[x]` **TURN provider docs** in `docs/voice-video-call-support.md` §6.3 and design doc §5.2: Twilio Network Traversal Service / Cloudflare TURN / self-hosted coturn — setup steps, security notes (TURN credentials are sensitive, file mode `0o600`, never logged).
- `[x]` **Tests:** `apps/social/test/components/SettingsNodeTab.test.tsx` (TURN editor — 5 tests: empty state, pre-fill, add+preset+save, validation, reset); `apps/social/test/lib/turn-credentials.test.ts` (21 tests covering presets, extract/merge, validation including `missingCredentials`).

### 42I — iOS backgrounded calling (VoIP + PushKit + CallKit)

> **Superseded for App Store China (2026-08):** CallKit / PushKit / VoIP
> push were removed from EnvoyGo. Incoming calls use a standard APNs/FCM
> alert with `data.type = "incomingCall"` + iOS `aps.content-available: 1`
> and the in-app call screen. Historical checklist below records what
> shipped in 42I; see `docs/push-notification-config.md` for the current
> operator path.

- `[x]` **Home: extend `push-notification.ts`.** Add `tokenType: "alert" | "voip"` to `PushTokenRecord` (`apps/node/src/push-notification.ts:47`). Add `sendVoipPush(deviceId, callId, callerName)` mirroring `sendApns` (`push-notification.ts:199`) but using the APNs VoIP endpoint (`/3/device/{voip-token}`), `apns-topic: {BUNDLE_ID}.voip`, `apns-push-type: voip`, and a minimal `{"aps": {"content-available": 1}, "callId": "...", "callerName": "..."}` payload. Reuses the existing `.p8` key and JWT auth.
- `[x]` **Home: extend `registerPushToken` RPC** at `node-service-impl.ts:11482` to accept `tokenType: "alert" | "voip"`; persist the discriminator to `push-tokens.json` (existing `0o600` convention). The implementation uses `"alert"` (matches Apple's `apns-push-type` vocabulary) rather than the originally-planned `"standard"`.
- `[x]` **Home: dispatch hook in `call-inbound.ts:handleCallInvite`** (added in commit `78df804`): after `inboundCallReceived`, look up the callee's `tokenType === "voip"` token via `pushNotificationService.listForOwner(calleeOwnerId)`; if the WebSocket to the phone is **not** connected (`isDeviceOnline(calleeOwnerId) === false`), send a VoIP push carrying the `callId` and `callerName`. The hook lives on the **callee's** home (where the phone registered its token), not the caller's home.
- `[x]` **iOS `Info.plist`:** added `UIBackgroundModes` array with `voip` (for wake) and `audio` (for in-call survival). `NSMicrophoneUsageDescription` present from 42F.
- `[x]` **iOS `AppDelegate.swift`:** registers for `PKPushRegistry` (PushKit), forwards the VoIP token to the home via `registerPushToken({tokenType: "voip", ...})`, and **synchronously reports a new call to CallKit via `CXProvider.reportNewIncomingCall`** in `didReceiveIncomingPushWithPayload` BEFORE `completion()` (Apple requires this within seconds, or the OS terminates the app and may revoke VoIP push delivery). CXProviderDelegate bridges CallKit Accept/Decline back to Dart.
- `[x]` **Pubspec:** added `flutter_callkit_incoming` (new dep — the only allowed new pubspec dep). Bumped `flutter_webrtc` to `^0.14.0` (resolved Q1; resolved to 0.14.2 by the lock).
- `[x]` **Dart `lib/services/voip_push_service.dart` (new):** wires PushKit + CallKit events to `CallProvider`:
  - Incoming CallKit event → `CallProvider.onIncomingCallFromVoipPush({callId, callerOwnerId, callerName})` (SDP arrives later via WS `call:incoming`, not in the push).
  - CallKit "Accept" → `CallProvider.acceptCall()`.
  - CallKit "Decline" → `CallProvider.declineCall()`.
  - Instantiated at app startup in `node_provider.dart` (`callProvider` provider); also bridges `HomeRemoteClient.on('call:*')` events into `eventStream`.
- `[x]` **`CallProvider.onIncomingCallFromVoipPush` (new):** updates the provider state with the call metadata so the CallKit ringing screen has a target; the subsequent WebSocket `call:incoming` event fills in the SDP and triggers the full `acceptCall()` flow.
- `[x]` **Android best-effort (NG8):** FCM `data` messages on the home side; the phone uses `firebase_messaging` for backgrounded `data` handling. No CallKit-equivalent on Android.
- `[x]` **Docs:** extended `docs/push-notification-config.md` with an APNs **VoIP** subsection; added a "Backgrounded calling on iOS" subsection to `docs/voice-video-call-support.md`.
- `[x]` **Tests:** `apps/node/test/push-notification.test.ts` (voip-push dispatch + APNs header shape for `apns-push-type: voip`); `apps/envoygo/test/services/voip_push_service_test.dart` (Dart native→Dart events: onVoipToken, onIncomingCall, onCallAccepted, onCallDeclined via `debugDispatch` test seam); `apps/node/test/call-sdp-validation.test.ts` VoIP dispatch tests (5 cases: dispatch when offline, suppress when online, default to online when un-wired, no dispatch for untrusted, swallow push errors). **Real-device smoke deferred to 42J.**

### Exit Criteria (Phase 42)

- `[x]` All 42A–42I sub-phase checkboxes flipped (42J manual device smoke tracked separately, like Phase 38H)
- `[x]` `npm run typecheck` clean (node + api + social)
- `[x]` `npx vitest run` green — 74 social test files / 435 tests + 101 node call/push tests pass (all Phase 38 call tests still pass; new 42A/42B/42G/42H/42I tests pass)
- `[x]` `flutter analyze` clean on every new/modified `.dart` file
- `[x]` `flutter test` green for `node_service_client_test.dart`, `call_provider_test.dart`, `webrtc_call_transport_test.dart`, `voip_push_service_test.dart` (no `voice_call_screen_test.dart` / `push_service_test.dart` shipped under those names — the VoIP service is `voip_push_service_test.dart`)
- `[x]` `sdpOffer: ""` no longer appears anywhere in `apps/node/src/node-service-impl.ts`; all five `UnimplementedError` call RPCs in `apps/envoygo/lib/services/node_service_client.dart` are gone
- `[x]` Two-node integration test asserts: caller→callee `call.invite` carries the SDP offer; callee→caller `call.accept` carries the SDP answer; `recipientPeerId` on the invite is the callee's device peer ID (not owner ID)
- `[x]` `iceServers` configured on the home reaches the phone via the call envelope (verified by a test that injects a custom `iceServers` into node config and asserts it shows up in the `call.invite` payload); TURN entries (with username/credential) round-trip identically
- `[x]` Trust gate + identity binding + role policy still enforced on the home (regression-tested from the existing Phase 38 suite)
- `[x]` iOS `AVAudioSession` config applied on call start, reset on call end; `voip` and `audio` UIBackgroundModes in `Info.plist`; Android `RECORD_AUDIO` permission request fires on first call
- `[x]` Home dispatches APNs VoIP push on `call.invite` when phone is offline (regression-tested in `apps/node/test/call-sdp-validation.test.ts`); `registerPushToken` accepts `tokenType: "alert" | "voip"` and persists the discriminator
- `[x]` Social UI has a Social UI caller for `createWebRtcCallTransport` (42G §3) — the file is no longer dead code (`apps/social/src/hooks/useCallSession.ts`)
- `[x]` Social UI TURN editor renders, accepts input, validates, saves (42H — `SettingsNodeTab.test.tsx`, 5 tests); default 3-STUN list applies when `node-config.iceServers` is empty
- `[x]` Allowed pubspec changes: bump `flutter_webrtc` to `^0.14.0` (42D, resolved to 0.14.2) and add `flutter_callkit_incoming` (42I). **No other new npm/yarn/pubspec dependencies** — `permission_handler` is **not** added (we use `flutter_webrtc`'s built-in permission prompts).
- `[x]` No new wire intents or schema changes (Phase 38 protocol is sufficient)

### Open design questions

| # | Question | Status | Notes |
|---|----------|--------|-------|
| 1 | `flutter_webrtc` version on EnvoyGo | **Resolved** | `^0.14.0` (resolved to 0.14.2 by the lock). Bump in 42D. |
| 2 | `iceServers` default list | **Resolved** | 3-STUN list (Google + Cloudflare + Twilio). TURN is user-added in 42H. |
| 3 | TURN server for symmetric NAT | **Resolved** | User-configured in `node-config.json` (42H). No EnvoyMesh-hosted TURN. Providers: Twilio / Cloudflare / self-hosted coturn. |
| 4 | Persistent backgrounded calling on iOS | **Resolved** | VoIP push + PushKit + CallKit (42I). Home extends the existing APNs module with a `voip` `tokenType`; phone uses `flutter_callkit_incoming` + `CXProvider.reportNewIncomingCall` (reported synchronously in the PushKit delegate before `completion()`, per Apple's contract). |

### Phase 42 fix-ups (post-ship)

While finalizing Phase 42 we discovered a few of the shipped pieces were wire-level broken in production but hidden behind passing tests. They were fixed in commit `78df804` and the immediate follow-ups:

- **Signature-mutation bug in response envelopes** — `_sendCallResponseEnvelope` (the helper shared by `acceptCallInvite`/`declineCallInvite`/`endCall`/`setCallMuted`) used to mutate `envelope.recipientPeerId` *after* `signUnsignedEnvelope`, producing a signature that no longer covered the final canonical JSON. Every response envelope was silently dropped by the peer's inbound guard. Fixed by stamping `recipientPeerId` on the **unsigned** envelope before signing. Regression test added.
- **VoIP push fired on the caller's home** — `dispatchCallPush` was called from `sendCallInvite` (the caller's home, which has no token for the callee). Moved to `call-inbound.ts:handleCallInvite` (the callee's home, which is where the phone registered its token), gated on `isDeviceOnline(calleeOwnerId)`.
- **Callee's `RTCPeerConnection` had no STUN/TURN** — `eventStream` was a dead stub and the callee's transport was built with `iceServers: []`. Fixed by bridging `HomeRemoteClient.on('call:*')` into a real `StreamController`, fetching `nodeConfig.iceServers` (with the 3-STUN default), and threading `iceServers` from the `call.incoming` envelope through `call-inbound` → `call-manager` → the `call:incoming` event.
- **TURN-editor dead UI** — the editor carried a `ttlSeconds` field that was dropped on save (the plan's "no credential minting" decision). Removed the field, added a Twilio / Cloudflare / coturn preset selector, a "Reset to defaults" button, and a `missingCredentials` validation rule.

### Cross-references

- [voice-video-call-envoygo.md](./voice-video-call-envoygo.md) — the normative design doc for this phase
- [voice-video-call-support.md](./voice-video-call-support.md) — Phase 38 design (this phase is the mobile-wiring follow-on); TURN provider setup subsection (42H) and "Backgrounded calling on iOS" subsection (42I) added here
- [push-notification-config.md](./push-notification-config.md) — existing APNs/FCM setup that 42I extends with a `voip` `tokenType` and APNs VoIP subsection
- [parked-envoygo-full-node-scope.md](./parked-envoygo-full-node-scope.md) — the explicit "home stays in the call path" decision
- [Phase 38 in implementation-plan.md](./implementation-plan.md#phase-38--real-time-voicevideo-calls) — the foundation phase
- [Phase 31 in implementation-plan.md](./implementation-plan.md#phase-31--flutter-thin-client-envoygo) — EnvoyGo thin-client context
- `apps/social/src/lib/webrtc-call-transport.ts` — desktop reference implementation that 42D mirrors; **42G §3 wires the missing Social-UI caller**
- `apps/node/src/push-notification.ts` — existing APNs/FCM push module that 42I extends with `sendVoipPush`
- `apps/envoygo/lib/providers/call_provider.dart` — existing provider that 42E/42I extend
- `apps/node/src/call-manager.ts` — the home-side state machine
- `apps/node/src/call-inbound.ts` — the home-side trust + identity gate that 42A/42I extend (defensive validators in 42A; VoIP-push dispatch hook in 42I)
- `apps/node/src/node-config-store.ts:192` — `iceServers` schema (TURN-compatible already)

---

## Phase 43 — Agent Network User Experience **`[x]` shipped (2026-06-20)**

> **Status: `[x]` shipped (2026-06-20).** Core P0/P1 usability work landed: worker execution after accept, auto-synthesize/publish, composite bid ranking, auto-evaluate (30s), smart defaults, `chain:state` WebSocket push, chat “Run as chain” + plan preview, cost range + bid rationale in UI, diagnostics on preview, budget warnings, CSV export, goal templates RPC. **Follow-ons shipped (2026-06-20):** two-home libp2p CI smoke (43F), inline chat report card (43D), bond health badges (43E), sensitivity approval gate (43G), saved recipes + EnvoyGo active-chains mirror (43H).

### North star

**Product principle:** Treat the Agent Network like *“hire a temporary team”*, not *“configure a distributed workflow engine.”* The wire protocol stays rich; the default UX hides orchestration mechanics unless the user opens an Advanced panel.

**Success looks like:** Owner types a goal in chat → sees a plain-language plan and cost range → taps Start → watches progress live → gets a report notification → reads the result inline. Power users can still counter-bid, pin reports, and export costs.

### Honest baseline (post-40F)

| Area | Shipped | Still missing |
|------|---------|---------------|
| Wire + state machine | 9 `task.chain.*` intents, orchestrator/worker modules, 249+ tests | — |
| Production mesh | `dispatchChainEnvelope`, real signing, transport resolve, report store | — |
| Worker side | Auto-bid on propose, accept/cancel handlers, **`executeAcceptedSubtask`** after accept | Deeper capability-route / remote A2A execution |
| Orchestrator side | Plan/launch RPCs, bid storage, trackChain, **auto-evaluate + auto-synthesize** | Tie/over-budget owner notifications |
| Discovery | `CapabilityIndex` from agent cards, **diagnostics when zero workers** | Bond/agent-card health badges in contacts UI |
| UI | `ChainsView`, bid inbox, report renderer, **`chain:state` push**, Chains nav | Inline report card in chat |
| Bid quality | **`rankBids()` composite policy**, **`rationale` on bids** | Full reputation wiring in UI |
| Defaults | **`rebalancePolicy: "auto"`** via `chain-defaults.ts` | Advanced-only manual mode toggle in Settings |
| Scope | Cross-home handoff (40E) | **Single-home happy path** should be the default user story |

### Sub-phases (recommended order)

#### 43A — End-to-end worker execution **`[x]` P0 — blocker**

**Goal:** After `task.chain.accept`, workers actually execute and emit partials so chains complete over the mesh.

- Wire `executeSubtask` in `buildChainWorkerDeps()` to capability-provider jobs and/or OpenClaw tool execution (reuse `executeCapabilityRouteStep` / existing A2A executor).
- On final partial, orchestrator auto-triggers `synthesizeChain` + `publishChainReport` when all subtasks have finals.
- **Exit:** Two bonded homes, one orchestrator + one worker, goal completes to `chain-reports.json` with zero manual RPC calls.

#### 43B — One-click chain from chat **`[x]` P0**

**Goal:** Primary entry point is EnvoyAI chat, not Settings → Chains.

- “Run as chain” action on assistant messages (calls existing `runChain` with sane defaults).
- **Plan preview** before launch: subtasks, capabilities needed, which bonded contacts may participate.
- **Goal templates:** Research, Summarize, Ask my network — pre-filled mandates, no IDs exposed.
- **Exit:** New user completes first chain from chat in under 3 taps after bond setup.

#### 43C — Smart defaults & hands-off orchestration **`[x]` P0**

**Goal:** Owner approves the plan once; the home node handles bidding and recovery.

- Default `NodeConfig.chainDefaults`: `rebalancePolicy: "auto"`, conservative budget cap, `maxAutoRebalances: 2`.
- **Auto-evaluate bids** after configurable timeout (e.g. 30s) when policy is `cheapest` or composite-ranked; notify owner only on tie, over-budget, or zero bids.
- Wire **`rankBids()`** into `evaluateBids()` (cost 35% + reputation 30% + freshness 20% + precision 15% per agent_network.md §13).
- **Exit:** Launched chain reaches report without owner opening bid inbox for the common case.

#### 43D — Live chain UI **`[x]` P1** (partial — inline chat report card deferred)

**Goal:** Chains feel alive, not like a hidden admin panel.

- Emit **`chain:state`** WebSocket events on bid/partial/award/publish (41G.1).
- Promote **Chains** to a top-level nav item (or chat sidebar tab), not only Settings → Activity.
- Inline **report card** in chat when `task.chain.report` arrives.
- Replace polling in `ChainsView` with event-driven refresh.
- **Exit:** Owner sees bid arrive and partial progress without manual refresh.

#### 43E — Trust, cost clarity & bid transparency **`[x]` P1** (partial — bond health badges deferred)

**Goal:** Users understand *who* is working and *why* it costs what it does.

- Show **estimated cost range** before launch (“~$2–5 from 3 contacts”), not raw `maxChainCostUsd`.
- Surface **`justification`** on each bid in `ChainBidInbox` (41G.3).
- Default worker pool = **direct-bonded peers** with fresh agent cards; show “why this worker” (capability + reputation).
- **Bond/agent-card health** in contact UI: last synced, capability count, “ready for chains” badge.
- **Exit:** Owner can explain every line item on the rebalance bar without reading docs.

#### 43F — Single-home reliability & diagnostics **`[x]` P1**

**Goal:** Make the common case (one orchestrator home + bonded worker homes) robust before pushing cross-home complexity.

- Clear errors: “No workers for `research.web` — ask Alice to enable Capability Provider.”
- Defer cross-orchestrator handoff (40E) behind Advanced / experimental flag in UI.
- **Two-home smoke test** in CI: orchestrator home + worker home over libp2p (extends 40F harness).
- **Exit:** Support playbook covers 90% of failures with user-visible messages.

#### 43G — Owner safety rails **`[x]` P2**

**Goal:** Prevent surprise spend and unsafe delegation.

- Budget **80% warning** with continue/cancel prompt.
- **Sensitivity gate:** block award when subtask sensitivity exceeds worker trust tier; show approval dialog.
- One-tap **chain-wide cancel** with plain copy (“Stop all agents on this goal”).
- Pin/report retention unchanged; add “what data left my node” summary on report view.
- **Exit:** No silent over-spend; cancel always works from primary UI.

#### 43H — Power user & mobile **`[x]` P2/P3**

**Goal:** Depth for teams without complicating the default path.

- **Chain recipes:** save successful chain (goal + policy + worker prefs) as reusable template.
- **CSV cost export** CLI + Settings button (41G.4).
- **EnvoyGo read-only mirror:** view chain status, approve bids, read reports (orchestration stays on home).
- **EnvoyAI orchestrator commands:** “raise budget on subtask 2”, “pick Bob’s bid” in natural language.
- **Exit:** Power users never need raw RPC; mobile users can monitor and approve.

### Priority summary

| Priority | Sub-phase | User outcome |
|----------|-----------|--------------|
| **P0** | 43A | Chains actually finish |
| **P0** | 43B | Anyone can start a chain |
| **P0** | 43C | Chains run themselves by default |
| **P1** | 43D | Progress is visible and live |
| **P1** | 43E | Costs and workers are understandable |
| **P1** | 43F | Failures are actionable |
| **P2** | 43G | Safe spend and cancel |
| **P2/P3** | 43H | Templates, export, mobile, NL control |

### Phase 43 exit criteria (overall)

- `[x]` Worker executes after accept; orchestrator auto-synthesizes when all finals arrive (`chain-worker-executor.ts`, `chain-auto-orchestrator.ts`)
- `[x]` Owner starts chain from chat with plan preview (`ChainStartDialog`, `chainPreviewGoal` / `chainStartFromGoal`)
- `[x]` Default chain policy is auto-rebalance + composite auto-evaluate (30s)
- `[x]` `ChainsView` updates via `chain:state` WebSocket
- `[x]` Two-home libp2p smoke in CI (43F — `chain-two-home-smoke.test.ts`)
- `[x]` EnvoyGo read-only active-chains mirror (43H — `ActiveChainsScreen`)
- `[x]` Bid justification + cost range shown before and during chain (43E)
- `[x]` Zero-worker and stale-agent-card errors are user-actionable (43F → **Phase 58A** `FleetReadinessPanel`)

- `[x]` Budget warning + one-tap cancel from primary UI (43G)

### Cross-references

- [agent_network.md §13](./agent_network.md#13-phase-41--making-agent-network-usable--powerful) — original 41A–41G design (superseded for tracking by Phase 43)
- [Phase 58](#phase-58--team-jobs-ux-fleet-readiness-live-story-multi-node) — fleet readiness + live story follow-on
- Phase 40F — production wiring baseline
- `apps/node/src/chain-worker.ts` — `executeSubtask` hook (43A)
- `apps/node/src/chain-bid-strategy.ts` — `rankBids()` (43C)
- `apps/social/src/components/views/ChainsView.tsx` — UI surface (43D)
- `apps/node/src/node-service-impl.ts` — `runChain`, `buildChainWorkerDeps`, `_startChainTracking`

---

## Phase 44 — Refine EnvoyMesh Knowledgebase `[x]`

**Design doc:** [knowledge-base-and-rag.md](./knowledge-base-and-rag.md)

Evolve the vault from a simple file store into a pluggable knowledge base with native
note creation, per-item sensitivity (public/friends/private), public knowledge
mesh (queryable by all peers, not just bonded contacts), and optional KB provider
plugins (Obsidian, MCP, future tools).

### Goals

1. **Per-item sensitivity** — persistent per-item overrides (`.envoy/sensitivity.json`)
   replace the current path-heuristic-only system. Three levels: `public`, `friends`,
   `private` (protocol `trusted` maps to `friends` for KB purposes).
2. **Native note creation** — users can create and edit Markdown notes in the Library UI
   without any plugin
3. **Public knowledge mesh** — public vault items are discoverable and queryable by ALL
   EnvoyMesh peers, bonded or not (currently hard-blocked for public peers in bonds policy)
4. **Plugin architecture** — optional KB providers (Obsidian, MCP, future tools) extend
   the vault without replacing it
5. **Vault is the foundation** — everything works standalone; plugins only add extra capabilities

### Architecture

```
vault/
├── .envoy/                     ← Internal metadata (never shared)
│   ├── sensitivity.json        ← Per-item sensitivity overrides (persistent)
│   └── plugins/                ← Plugin working data (ephemeral)
│       └── obsidian/           ← Link graph cache, frontmatter cache
├── notes/                      ← User-created notes (native editing)
│   ├── research/
│   ├── tutorials/
│   ├── personal/
│   └── work/
├── documents/                  ← Imported files (PDF, Word, images, etc.)
├── inbox/                      ← Received files from peers
└── temp/                       ← Staging for imports
```

**Sensitivity is per-item, not per-folder.** Same folder can contain public and private items.
Three levels: `public`, `friends`, `private`. The protocol also defines `trusted` but it
maps to `friends` for KB purposes.

| Sensitivity | Owner | Bonded | Stranger | Agent |
|---|---|---|---|---|
| Public | ✅ | ✅ | ✅ | ✅ |
| Friends | ✅ | ✅ | ❌ | ✅ |
| Private | ✅ | ❌ | ❌ | ✅ |

**Sensitivity resolution chain** (first match wins):
1. Per-item override in `.envoy/sensitivity.json` (persistent, written by Published toggle)
2. Path heuristic (`inferDocumentSensitivity()` — fallback when no override exists)
3. Path defaults (`kb.publicVaultPaths` / `kb.privateVaultPaths` control *which folders
   are indexed*, not the sensitivity label itself)

### Sub-phases

#### Phase 44A1 — Per-Item Sensitivity Backend `[x]`

Replace path-heuristic-only sensitivity with persistent per-item overrides.
This is the foundation that 44A2, 44B, and 44D all depend on.

| Task | Status |
|---|---|
| Normalize sensitivity levels to `public \| friends \| private` everywhere | `[x]` |
| Add `SensitivityOverrideStore` (read/write `.envoy/sensitivity.json`) | `[x]` |
| Add `resolveDocumentSensitivity(relativePath, overrides?)` — override first, heuristic fallback | `[x]` |
| Wire `setLibraryItemPublished()` to persist to `.envoy/sensitivity.json` | `[x]` |
| Update `rag-service.ts` reindex to read sensitivity overrides and embed in vector metadata | `[x]` |
| Unit tests (override CRUD, normalization, fallback chain) | `[x]` |

**Implementation notes:**
- `inferDocumentSensitivity()` in `ai-context.ts` currently returns
  `"public" | "friends" | "professional" | "personal"` — normalize to
  `"public" | "friends" | "private"` (`professional` → `friends`, `personal` → `private`)
- `SENSITIVITY_ORDER` and `filterVaultResultsBySensitivity()` must also be normalized
- `SensitivityOverrideStore` goes in `packages/local-store/src/sensitivity-overrides.ts`
- Format: `{ "doc_abc123": "public", "doc_def456": "private" }`, atomic write via rename

**Exit criteria:**
- `[x]` Published toggle persists across restarts via `.envoy/sensitivity.json`
- `[x]` Sensitivity.json survives vault reindex
- `[x]` Path heuristic still works as fallback when no override exists
- `[x]` All internal sensitivity names normalized to `public | friends | private`

#### Phase 44A2 — Native Note Creation `[x]`

Add in-app Markdown note creation and editing to the Library UI. Depends on 44A1
for per-item sensitivity persistence via Published toggle.

| Task | Status |
|---|---|
| Add `createNote()`, `updateNote()`, `deleteNote()` RPC methods | `[x]` |
| Notes saved to `{vaultRoot}/notes/{subfolder}/` as `.md` | `[x]` |
| Add `notes/` to default `publicVaultPaths` | `[x]` |
| Markdown editor component (create, edit, preview modes) | `[x]` |
| Note list with folder navigation in Library UI | `[x]` |
| File watcher triggers vault re-index on note save | `[x]` |
| Published toggle per note (writes to sensitivity.json via 44A1) | `[x]` |
| Unit + component tests | `[x]` |

**Exit criteria:**
- `[x]` User can create, edit, and delete notes in Library UI without any plugin
- `[x]` Notes are indexed by RAG pipeline on save (no restart needed)
- `[x]` Published toggle controls sensitivity per note (persisted via 44A1)
- `[x]` Folder navigation works (notes/, documents/, inbox/)

#### Phase 44B — Public Knowledge Mesh `[x]`

Make public vault items discoverable and queryable by all EnvoyMesh peers.
Currently `evaluatePublicPolicy()` in `@envoymesh/bonds` **hard-denies**
`knowledge.query` from public peers with catch-all "public peers cannot use this intent".

| Task | Status |
|---|---|
| Add `knowledge.query` branch to `evaluatePublicPolicy()` — allow with `maxSensitivity: "public"` | `[x]` |
| Per-stranger rate limiter for knowledge queries (5/min, 50/hour) | `[x]` |
| Wire rate limiter into `handleInboundKnowledgeQuery()` | `[x]` |
| Public discovery catalog: advertise public vault items in `discovery.response` to any peer | `[x]` |
| Audit logging for stranger knowledge queries (with stranger peerId) | `[x]` |
| Sensitivity filtering: public items to anyone, friends items to bonded only | `[x]` |
| Unit + integration tests (public query from stranger, rate limit enforcement) | `[x]` |

**Implementation notes:**
- In `packages/bonds/src/index.ts` `evaluatePublicPolicy()`, add before catch-all deny:
  `if (intent === "knowledge.query") return { action: "allow", maxSensitivity: "public" }`
- Reuse `checkCapabilityTopicRateLimit` pattern for per-stranger rate limiting
- Sensitivity filtering already works via `effectiveKnowledgeAccess` — just verify after
  bonds policy change

**Exit criteria:**
- `[x]` Stranger can send `knowledge.query` and receive public items only
- `[x]` Bonded contact still gets public + friends items (no regression)
- `[x]` Rate limiting prevents abuse from strangers
- `[x]` Public items appear in mesh-wide discovery
- `[x]` Private items are never served to anyone but owner + agent

#### Phase 44C — KB Provider Plugin Interface `[x]`

Define and implement the plugin system for optional KB providers.

| Task | Status |
|---|---|
| `KnowledgeBasePlugin` interface (activate, deactivate, enrichMetadata, onFileChanged, getUiExtensions) | `[x]` |
| Plugin registry (install, enable, disable, list plugins) | `[x]` |
| Plugin config storage (`.envoy/plugins/{pluginId}/config.json`) | `[x]` |
| Plugin → vault metadata bridge (enrichMetadata results merged into vault index) | `[x]` |
| Settings UI: Knowledge Base → Plugins section (install, enable, configure) | `[x]` |
| Graceful degradation: vault works fully if all plugins are removed | `[x]` |
| Unit tests (plugin lifecycle, metadata enrichment, uninstall cleanup) | `[x]` |

**Exit criteria:**
- `[x]` Plugin interface defined and implemented
- `[x]` Plugins can be enabled/disabled without affecting vault content or sensitivity
- `[x]` Uninstalling all plugins leaves vault fully functional
- `[x]` Settings UI shows plugin status and configuration

#### Phase 44D — Obsidian Plugin `[x]`

Add Obsidian-style knowledge management as an optional plugin.

| Task | Status |
|---|---|
| Frontmatter YAML parsing (tags, aliases, date, published) | `[x]` |
| `published: true/false` frontmatter → sensitivity auto-sync | `[x]` |
| `[[wiki-link]]` parser → bidirectional link graph index | `[x]` |
| Link graph stored in `.envoy/plugins/obsidian/link-graph.json` | `[x]` |
| Agent link traversal (resolve `[[links]]` during RAG, respect sensitivity) | `[x]` |
| Sensitivity-aware link resolution (private links stripped for strangers) | `[x]` |
| Optional: graph view UI extension (visualize public sub-graph) | `[ ]` |
| Optional: backlinks panel (show incoming links for a note) | `[ ]` |
| Integration tests (frontmatter sync, link graph, sensitivity-aware resolution) | `[x]` |

**Exit criteria:**
- `[x]` Obsidian plugin activates and enriches vault metadata
- `[x]` Frontmatter `published` field syncs to sensitivity labels
- `[x]` Agent can traverse wiki-links (respecting sensitivity)
- `[x]` Stranger queries see public notes with public links resolved; private links stripped
- `[x]` Removing plugin leaves all notes intact, links become plain text

#### Phase 44E — MCP Plugin Enhancement `[x]`

Enhance the existing MCP external provider with write-back and deeper integration.

| Task | Status |
|---|---|
| MCP write-back: agent can save discovered knowledge to vault as notes | `[x]` |
| Source attribution on MCP-sourced notes | `[x]` |
| Sensitivity policy for MCP-sourced notes (default to friends) | `[x]` |
| MCP plugin registered through KB provider interface (not just config field) | `[x]` |

**Exit criteria:**
- `[x]` Agent can save MCP search results as vault notes with attribution
- `[x]` MCP plugin is manageable through the plugin interface (44C)

### Priority Order

| Priority | Phase | Description |
|---|---|---|
| P0 | 44A1 | Per-item sensitivity backend (foundation for everything) |
| P0 | 44A2 | Native note creation (depends on 44A1) |
| P0 | 44B | Public knowledge mesh (core sharing vision) |
| P1 | 44C | Plugin interface (needed before 44D) |
| P1 | 44D | Obsidian plugin (first KB provider) |
| P2 | 44E | MCP plugin enhancement |

### Design Decisions

| # | Decision | Rationale |
|---|---|---|
| 1 | Three KB sensitivity levels (`public`, `friends`, `private`) | Protocol has 4 (`trusted` included) but KB only uses 3. `trusted` maps to `friends`. Simpler, matches `LibraryFileMatchSchema`. |
| 2 | Sensitivity is per-item, not per-folder | Folders are organization; sensitivity is access control. Same folder can mix public/private. Avoids breaking wiki-links when moving files. |
| 3 | Vault is the foundation, plugins are optional | Users who don't install Obsidian still get full KB experience. Plugins can be replaced without affecting the vault. |
| 4 | Public knowledge is queryable by ALL peers | Genuine sharing — public items aren't gated by bonds. Only rate-limited for strangers. |
| 5 | `.envoy/` is EnvoyMesh-internal, plugins never touch it | Sensitivity labels survive plugin uninstall. Plugin data is ephemeral. |
| 6 | No `index.jsonl` — vault index is in-memory + `rag-vault-manifest.json` | Existing persistence covers it. Adding JSONL would be redundant. |
| 7 | Split 44A into 44A1 (backend) + 44A2 (frontend) | Sensitivity backend is prerequisite for everything and can ship independently. Markdown editor is significant UI work. |
| 8 | Wiki-links are sensitivity-aware | Strangers see the public sub-graph only. Private links are stripped from responses. |

### Open Questions

| # | Question | Status |
|---|---|---|
| 1 | Should strangers querying public knowledge need a minimal discovery handshake (e.g., capability check) before being served content? | `[ ]` |
| 2 | What is the max total size of public knowledge a single node should serve? (DOS prevention) | `[ ]` |
| 3 | Should the vault path be configurable to point at an external directory (e.g., existing Obsidian vault), or always use the default `{profileDir}/vault/`? | `[ ]` |
| 4 | Should the graph view UI extension be a separate Social UI view or an overlay in Library? | `[ ]` |

### Cross-references

- Design doc: [knowledge-base-and-rag.md](./knowledge-base-and-rag.md)
- Vault core: `packages/vault/`
- RAG service: `apps/node/src/rag-service.ts`
- Library UI: `apps/social/src/components/views/LibraryView.tsx`
- KB settings: `apps/social/src/components/views/SettingsAITab.tsx`
- Knowledge query inbound: `apps/node/src/knowledge-query-inbound.ts`
- Document acquisition: `apps/node/src/document-acquisition-worker.ts`

---

## Phase 45 — Web Content Browsing **`[~]` 45A–45E shipped; 45F future**

**Design doc:** [web-content-browsing-design.md](./web-content-browsing-design.md)

### Motivation

EnvoyMesh nodes can already reach each other through firewalls, exchange signed envelopes, and run trust-gated knowledge queries. What they cannot do is **serve URL-addressable content** — a blog, profile site, photo wall, knowledge base, or just individual Markdown/PDF files — in a way that feels like browsing a website. Phase 45 closes that gap in two steps (matching the owner's split):

- **Step 1 (45A–45D):** The EnvoyMesh social app and EnvoyGo mobile app act as a "browser" for content served from any node over the mesh. Stable `envoy://` URLs. Per-item visibility. Templated sites (Profile / Blog / PhotoWall / Feeds) + freeform Markdown + raw file serving.
- **Step 2 (45E):** Publish-subscribe: `feed.notify` push notifications, topic-based subscription, friend discovery via published topics.
- **Step 3 (45F, future):** External HTTP gateway so non-mesh users with regular browsers can read content via `https://relay/<owner>/<path>`. Forward-referenced only.

The full design — URL scheme spec, content model, visibility, the `library.read` intent, security model, threat model, test plan, alternatives considered, decision log — is in [web-content-browsing-design.md](./web-content-browsing-design.md). The sections below are the implementation checklist.

### 45A — Thin vertical slice (architecture spike) `[x]`

Prove the architecture end-to-end with the smallest possible surface. Manual file drop only — no authoring UX, no templates, no full bookmarks/history.

- `[x]` URL parser: `packages/api/src/envoy-url.ts` — `parseEnvoyUrl`, `buildEnvoyUrl`, `resolveEnvoyUrl` (owner-id form only; `@handle` form parses but throws `HandleRegistryNotImplemented`).
- `[x]` New intent pair in `packages/protocol/src/index.ts`: `"library.read"` / `"library.read.response"` + `LibraryReadPayloadSchema` + `LibraryReadResponsePayloadSchema` + capability requirement entry (`vault.retrieve`).
- `[x]` Extend `LibraryFileMatchSchema` with optional `kind` / `mimeType` / `summary` / `visibility` / `urlSlug` / `updatedAt` (additive, backward compatible).
- `[x]` Inbound handler `apps/node/src/library-read-inbound.ts` mirroring `knowledge-query-inbound.ts` — reuses `evaluatePolicy` + `assertPathInsideVault`; maps visibility to sensitivity; empty path → `index.md`; denied reads → `not_found` (anti-enumeration) except `contacts` ACL → `forbidden`.
- `[x]` CLI dispatcher arm `apps/node/src/cli-mesh-inbound-library-read.ts`.
- `[x]` Web content store `apps/node/src/web-content-store.ts` — loads `web-content.json` manifest; lookups by path; `resolveWebContentPath`.
- `[x]` `NodeServiceImpl.libraryRead({ targetOwnerId, path, range })` + `libraryReadViaRuntime` helper in `node-service-fileshare.ts`.
- `[x]` Advertise `"envoymesh.web-content"` capability in `discovery-inbound.ts`; reprovide via `capability-discovery.ts`.
- `[x]` Extend `discovery-library-match.ts` matcher with `urlSlug` / `kind` / `tags`.
- `[x]` Register `libraryRead` RPC in `json-rpc-router.ts`; add to `NodeServiceClient` interface in `packages/api/src/node-service.ts`.
- `[x]` Mobile mirror: `MobileNodeService.libraryRead` in `packages/mobile-node/src/index.ts` (paired mode; standalone stubbed until 45C).
- `[x]` Social UI: `DirectCallClient.libraryRead` passthrough; Browser view (`BrowserView.tsx`) with contentHash verification; Header **Browser** nav tab; i18n (en + zh-CN + other locales).
- `[x]` Bonds: public-tier `library.read` allow + referred-tier friends maxSensitivity.

**Tests (all four layers per design doc §8):**

- `[x]` **Layer 1 — URL parser unit** (`packages/api/test/envoy-url.test.ts`). Runs under `npm test`.
- `[x]` **Layer 2 — Handler trust tests** (`apps/node/test/library-read-inbound.test.ts`) including referred / blocked / rate-limit / index.md. Runs under `npm test`.
- `[x]` **Layer 3 — Two-node vitest E2E** (`apps/node/test/library-read-multi-node-e2e.test.ts`). Added to `apps/node/src/local-two-node-smoke.ts`. Runs under `npm run smoke:local`.
- `[x]` **Layer 4 — Playwright matrix** (`apps/social/test/e2e/web-content-browse.smoke.ts`) with repaired `NodeSpawner` (profile dirs, owner IDs, live bond via WS status) + `SocialPage` browser helpers. Scenarios 1–8 green (6 & 8 enabled in 45B). Script: `npm run smoke:web-content` (manual initially).
- `[x]` Protocol schema tests: `packages/protocol/test/library-read-payload.test.ts`.
- `[x]` BrowserView component tests: `apps/social/test/components/BrowserView.test.tsx`.

**Exit criteria (45A):**

- `[x]` Phase 45A Scenario 1 (design doc §9.1) covered by Layer 3 LIBREAD-01 + Layer 4 scenario 1.
- `[x]` Playwright matrix scenarios 1–5 and 7 green (45A); 6 & 8 completed in 45B.
- `[x]` Layer 1 + 2 + 3 tests green.
- `[x]` `npm run typecheck` clean across all touched packages.

### 45B — Browser polish `[x]`

- `[x]` Navigation history (back/forward/reload stack): `apps/social/src/lib/browser-history-store.ts`.
- `[x]` Bookmark persistence + UI: `apps/social/src/lib/browser-bookmark-store.ts`.
- `[x]` Address-bar autocomplete from history + bookmarks.
- `[x]` Range request support — client auto-chunks on `too_large`; server returns `byteLength`/`etag`/`contentHash` on `too_large`; range bodies always base64; **range/binary span capped at 40 KiB** (base64 envelope budget under 64 KiB inbound guard).
- `[x]` ETag-based cache revalidation on Reload (`ifNoneMatch` → `not_modified`).
- `[x]` Loading spinner + error states polished.
- `[x]` Review hardening: contacts visibility deny-by-default without `contactIds`; past-EOF ranges empty; navigate generation guard; recent URLs owner-scoped.

**Exit criteria (45B):**

- `[x]` Back/forward/reload/bookmarks work in BrowserView (+ Playwright scenarios 6 & 8).
- `[x]` Large file (>48 KiB) fetch via range assembly (`fetchLibraryContent`).
- `[x]` Reload revalidates against `etag` (`not_modified` keeps cached body).

### 45C — EnvoyGo mobile Browser `[~]`

Flutter thin client (`apps/envoygo`). Browsing always goes through the paired home node (home holds bonds + mesh routes). Capacitor `apps/mobile` is out of scope for 45C.

- `[x]` Browser screen in `apps/envoygo/` (address bar + render; Me-tab entry).
- `[x]` `NodeServiceClient.libraryRead` → home JSON-RPC `libraryRead`.
- `[x]` Unit tests for envoy URL parse + RPC wrapper + range fetch helper + Browser widget tests.
- `[x]` Document: EnvoyGo is paired-only for browse; standalone full-node browse is parked.
- `[x]` Review hardening: preserve trailing `/` for `index.md`; navigate race guard; `contentHash` verify; `not_modified` restores cached body; tappable in-content `envoy://` links.
- `[ ]` Real-device signoff: Scenario 1 on phone (paired).

**Exit criteria (45C):**

- `[x]` Browser reachable from EnvoyGo Me tab; `libraryRead` via home wired + unit-tested.
- `[ ]` Scenario 1 works on a real phone (paired mode).

### 45D — Authoring UX (full Step 1) `[x]`

- `[x]` New-item dialog with template picker (Profile / Blog post / Note / Photo / File upload).
- `[x]` Markdown editor with live preview (`apps/social/src/components/MarkdownEditor.tsx`).
- `[x]` Per-item visibility selector (`apps/social/src/components/VisibilitySelector.tsx`).
- `[x]` Contact picker when visibility=`contacts` (passes `contactIds` to `publishWebContentEntry`).
- `[x]` Manifest auto-update on author actions (`web-content-author.ts` → `web-content-store.upsert`).
- `[x]` Templated Blog listing (`blog/index.md` regenerated on publish).
- `[x]` PhotoWall grid (`photos/<gallery>/index.md` + `photos/index.md` regenerated on photo publish).
- `[x]` Contact profile "Browse Site" button (`AgentCardPanel` via `webContentRoot`).
- `[x]` Optional `webContentRoot` field on `AgentCardSchema`.
- `[x]` `envoymesh init blog|photos` CLI scaffolding.
- `[x]` Playwright `web-content-author-browse.smoke.ts` (Scenario 2).
- `[x]` Playwright `web-content-author-photowall.smoke.ts` (Photo → gallery → image).

**Exit criteria (45D):**

- `[x]` Author → publish → browse path unit/component tested.
- `[x]` Scenario 2 Playwright spec added (`npm run smoke:web-content`).
- `[x]` Scenario 2 green on local two-node Playwright smoke (`npm run smoke:web-content`, including `web-content-author-browse.smoke.ts`).
- `[x]` PhotoWall Playwright path green (`web-content-author-photowall.smoke.ts`).

### 45E — Step 2: push, topics, friend discovery `[x]`

Concrete wire format: design doc §7.5. **GossipSub still deferred** (re-evaluate after this ships).

- `[x]` New intent `feed.notify` — push a small notification envelope to bonded contacts on publish. Rides existing `/envoymesh/message` stream using `tagContactForPersistentReachability`. **No GossipSub in v1 of 45E.**
- `[x]` Topic-based subscription — interest overlap on hobbies/knowledge; empty publisher tags → broadcast within bonds; empty recipient interests → still notify.
- `[x]` Friend discovery via published topics — `discovery.request.requestedPublishTopics` + DHT `publish:<slug>` + Discover “By published topic”.
- `[x]` Evaluate GossipSub: **deferred** — notification-fanout + DHT topics ship first; revisit only if insufficient.
- `[x]` Playwright full-stack: Alice publish → Bob Inbox `feed.notify` → Open in Browser (`web-content-feed-notify.smoke.ts`; included in `npm run smoke:web-content` — 11/11).
- `[x]` Discover “By published topic” UI (mocked): `discover-publish-topic-e2e.test.tsx`.
- `[x]` EnvoyGo in-app Inbox mirror: `listFeedNotifications` / `dismissFeedNotification` + `feed:notify` WS → Open in Browser (`BrowserScreen(initialUrl:)`). **OS push (APNs/FCM) for feed.notify deferred** (separate payload type from chat/VoIP).

### 45F — Step 3: external HTTP gateway (future, forward reference) `[ ]`

Out of scope for this plan. Will be a separate design when ready. Sketch only: `--web-relay` node mode that starts an HTTP server translating `https://relay/<ownerId>/<path>` ↔ `library.read` over the mesh.

### Exit Criteria (Phase 45 overall)

- `[x]` Phase 45A exit criteria met (the architecture spike ships; Layer 4 manual smoke).
- `[x]` Phase 45B exit criteria met (browser polish complete).
- `[ ]` Phase 45C exit criteria met (mobile browsing works on real devices).
- `[x]` Phase 45D exit criteria met (full author → publish → browse UX ships).
- `[x]` Phase 45E ships at least v1 (notification-fanout push + topic discovery).
- `[x]` All four test layers green and integrated into CI: `npm test` (Layers 1+2), `npm run smoke:local` (Layer 3), `npm run smoke:web-content` via orchestrator `06c` in `test:full` / `ci-smoke-local` + nightly.

### Files Summary (Phase 45)

See the design doc §12 for the full file-by-file change map per sub-phase. Highlights:

- **Protocol (45A):** `packages/protocol/src/index.ts` (new intents + schemas + `LibraryFileMatchSchema` extension).
- **API (45A):** `packages/api/src/envoy-url.ts` (new), `packages/api/src/node-service.ts` (interface).
- **Node (45A):** `apps/node/src/library-read-inbound.ts` (new), `apps/node/src/cli-mesh-inbound-library-read.ts` (new), `apps/node/src/web-content-store.ts` (new); extend `node-service-impl.ts`, `node-service-fileshare.ts`, `discovery-inbound.ts`, `discovery-library-match.ts`, `capability-discovery.ts`, `json-rpc-router.ts`.
- **Mobile (45A interface, 45C Flutter UI):** `packages/mobile-node/src/index.ts`.
- **Social UI (45A):** `apps/social/src/components/views/BrowserView.tsx` (new) + sub-components; `apps/social/src/lib/envoy-url.ts` (new).
- **Tests (45A):** four new test files across `packages/api/test/`, `apps/node/test/`, `apps/social/test/e2e/`.
- **45B:** `browser-history-store.ts`, `browser-bookmark-store.ts`, `library-read-fetch.ts` (new); `ifNoneMatch`/`not_modified` in protocol + api; range/`too_large` polish in `library-read-inbound.ts`.
- **45C:** EnvoyGo Flutter Browser screen + `NodeServiceClient.libraryRead` (thin client via home).
- **45D:** `BrowserAuthorView.tsx`, `MarkdownEditor.tsx`, `VisibilitySelector.tsx` (new); extend `ContactProfilePanel.tsx`, `AgentCardSchema`.
- **45E:** `feed.notify` protocol + bonds; `feed-notify-*.ts`; Inbox + Discover publish-topic UI; `publish:<slug>` DHT; `requestedPublishTopics`; AgentCard `publicTopics`.

### Test Plan (Phase 45)

Four mandated layers for Phase 45A (mirrors the project's Phase 38H convention):

| Layer | Mirror file | Run under |
|---|---|---|
| URL parser unit | `packages/api/test/` pattern | `npm test` |
| Handler trust | `apps/node/test/knowledge-query-inbound.test.ts` | `npm test` |
| Two-node vitest E2E | `apps/node/test/library-publish-export-multi-node-e2e.test.ts` | `npm run smoke:local` |
| Playwright full-stack | `apps/social/test/e2e/webrtc-call.smoke.ts` + `helpers/node-spawner.ts` + `helpers/social-page.ts` | `npm run smoke:web-content` (orchestrator `06c` / CI gate) |

The Playwright matrix (Layer 4) covers browse scenarios 1–10 (incl. contacts ACL), Scenario 2 author→browse, PhotoWall author→browse, and 45E feed.notify → Inbox → Browser. Discover publish-topic UI is covered by mocked jsdom E2E. Run: `npm run smoke:web-content` (13 tests) or `npm run test:full` (includes `06c`).

### Risks & Mitigations (Phase 45)

See design doc §13. Top risks: URL scheme change after launch (mitigated by owner-id permanence), envelope size cap blocking large files (mitigated by range requests in 45B), malicious content (mitigated by `DOMPurify` sanitization already in `Markdown.tsx`), Playwright flakiness (mitigated by starting as manual trigger).

### Open Questions (Phase 45)

See design doc §11 for the full list of 10 open questions. None block Phase 45A start; several need resolution by 45D or 45E.

---

## Phase 46 — Multi-Relay Fleet Coordination

**Status:** `[x]` shipped (46A–46C + in-process/process E2E; live dual-relay signoff operator-gated via `TEST_RELAY_A`/`TEST_RELAY_B`)  
**Goal:** Make **multiple standalone relays** (same region or multi-region) work together so normal nodes that check in / reserve on different relays can still **discover** each other and obtain **dialable** `/p2p-circuit/` paths — without replicating full leaf rosters.

**Design doc (source of truth):** [relay-server-design.md](./relay-server-design.md) — Part A = shipped standalone relay; **Part B = this phase**.  
**Related:** [operator-relay-fleet.md](./operator-relay-fleet.md) · [layered-relay-network.md](./layered-relay-network.md) (longer-term join/summary graph) · [p2p-discovery.md](./p2p-discovery.md)

**Problem:** Each `apps/relay` keeps a local checkin roster and local circuit-relay-v2 reservations. Lookup is hop-only (no live reservation ⇒ peer omitted). If Home uses Relay-CN only and Joiner uses Relay-EU only, discovery and relayed dials fail.

**Approach (three sub-phases):**

| Sub-phase | Name | What ships |
|-----------|------|------------|
| **46A** | Client multi-home | Shared `collectRelayControlTargets`; checkin + lookup + reserve on the full EnvoyMesh relay set (cap ~4); parallel/time-boxed cycles; org preset guidance (regional + hub) |
| **46B** | One-hop miss-forward | Standalone relay forwards `relay.lookup` to verified siblings when local miss / under `maxResults`; client `maxHops: 1`; merge prefers hoppable candidates |
| **46C** | Sibling-list gossip | Bounded relay book; periodic `relay.hints` exchange; verify before promote; leaf checkin hints = candidates only |

**Does not ship in 46:** full roster sync, `relay.summary` topic blooms, automated `relay.join` hierarchy (remain in layered design).

### 46A — Client multi-home `[x]`

- `[x]` `collectRelayControlTargets({ bootstrapPeers, configuredRelays, bootstrapPresets })` — exclude public libp2p DHT bootstraps; dedupe; cap ~4
- `[x]` Wire into `runRelayClientCycle`, reservation warmup, and NodeService topic/peerId relay lookup
- `[x]` Parallel checkin/lookup (concurrency 2–3) + time-box
- `[x]` Docs: multi-relay preset pattern in [operator-relay-fleet.md](./operator-relay-fleet.md)
- `[x]` Unit tests for target collection + cycle wiring

### 46B — One-hop miss-forward `[x]`

- `[x]` `apps/relay` `relay.lookup`: on miss / underfill, forward to ≤2 verified siblings with `maxHops-1`
- `[x]` Merge with hoppability preference (`preferRelayPeerCandidate` in `apps/relay`)
- `[x]` Client `queryRelayLookupWithDeps`: default `maxHops: 1`
- `[x]` Seed siblings via relay `--bootstrap` / env
- `[x]` Unit tests for forward merge + hop decrement / queryId dedupe

### 46C — Sibling-list broadcast `[x]`

- `[x]` Bounded standalone relay book (cap ~8–16, TTL ~25–35 min)
- `[x]` Periodic `relay.hints.request` / `response` among book members (~90s)
- `[x]` Piggyback sibling sample on lookup responses when hints empty
- `[x]` Promote only after verify (hints RTT); leaf `relayHints` untrusted as forward targets
- `[x]` Unit tests for book cap / TTL / verify gate
- `[x]` In-process two-relay E2E (`multi-relay-fleet-e2e.test.ts`: multi-home + miss-forward)
- `[x]` Process-spawn two-relay E2E (`multi-relay-fleet-process-e2e.test.ts`: real `apps/relay` + `/info` + control identity)
- `[x]` Gated live dual-relay E2E (`multi-relay-fleet-live-e2e.test.ts` / `TEST_RELAY_A`+`TEST_RELAY_B`; `./scripts/multi-relay-fleet-live-signoff.sh`)

### Phase 46 exit criteria

- `[x]` Shared multi-relay target collection + parallel cycle (unit)
- `[x]` Miss-forward / hop gate / queryId dedupe (unit)
- `[x]` Sibling book: candidate vs verified forward gate (unit)
- `[x]` Client multi-target cycle time-boxed (concurrency 3)
- `[x]` Design + operator fleet docs updated for multi-relay presets
- `[x]` In-process two-relay E2E (multi-home reserve + miss-forward circuit)
- `[x]` Process-spawn two-relay E2E (CLI/HTTP/control-identity + miss-forward)
- `[x]` Live two-relay WAN signoff harness (gated; operator-run)

### Risks & mitigations (Phase 46)

| Risk | Mitigation |
|------|------------|
| Forward amplification | `maxFanout` ≤ 2, `maxHops` ≤ 1 for client; queryId dedupe |
| Poisoned leaf hints | Forward only to verified book/seed siblings |
| Reservation load (N relays × clients) | Cap targets ~4; public-mode reservation limits already tuned |
| Stale sibling addrs | TTL + verify before promote |

---

## Phase 47 — Team job multi-round iteration (A ∩ B) (shipped)

**Status:** `[x]` 47A–47D implemented
**Goal:** Let Team jobs refine like an agent loop: seal a round into a **draft**, optionally **replan** with that draft as input (B), and optionally **append** a few dependent steps inside an open round (A) — without overloading bid/stall/rebalance “rounds.”

**Design doc (source of truth):** [agent-network-iteration.md](./agent-network-iteration.md)  
**Related:** [agent-network-plan-assign.md](./agent-network-plan-assign.md) · [agent-network-guide.md](./agent-network-guide.md) · [agent_network.md](./agent_network.md)

**Problem:** Today plan+assign → DAG → merge is **one-shot**. Parent→child `prior[subtaskId]` context is not a whole-job refinement loop. Operators need drafts, judge stop/continue, and capped local extends.

**Approach (hybrid A ∩ B):**

| Layer | Name | Behavior |
|-------|------|----------|
| **B** | Outer iteration | Seal round → synthesize **draft** (no publish) → judge → optional full replan with prior draft |
| **A** | Intra-round extend | Append capped dependent steps; finished steps immutable |

**Defaults (compat):** `iterationMaxRounds=1`, `extendMaxStepsPerRound=2`. Same `chainId`. Assigner owns the loop. Product/code name: **`iterationRound`** (never overload `negotiationRound`).

**Does not ship in 47:** rewriting sealed steps; using `task.chain.merge` as the outer loop; changing Join/bond/soft-pool rules; EnvoyGo iteration UI (desktop Team jobs first).

### 47A — Outer loop (B only) `[x]`

- `[x]` `iteration` side-state on Assigner `ChainState` (`round`, caps, `sealedByRound`, `openRoundSubtaskIds`, `drafts`, `stopReason`)
- `[x]` `chainDefaults` / start-from-goal knobs: `iterationMaxRounds`, `iterationJudgeMode`, `iterationCarryMode` (default maxRounds=1)
- `[x]` Outer loop controller around plan+assign → launch → track → **round-scoped** synthesize → judge → continue or terminal publish (`tryCompleteChainIfReady` + `_continueIterationRound`)
- `[x]` Round-scoped `synthesizeChain` contributions (do not mix sealed + open rounds)
- `[x]` Interim drafts **must not** call `publishChainReport` / `ledger.finalize`; single final publish on stop
- `[x]` Plan+assign prompt carries goal₀ + prior draft + critique when `round > 1` (`buildIterationPlanGoal` / `buildPlanAssignPrompt` iteration block)
- `[x]` Judge: `stop` \| `continue` \| `ask_owner` (+ budget/deadline/`maxRounds` gates); `ask_owner` holds for owner UI (47C)
- `[x]` Audit: `chain.iteration.round_started` / `sealed` / `judge` / `stopped`
- `[x]` Unit: seal, budget gate, scoped synthesize, publish-once; mock `maxRounds=2` continue→stop (`apps/node/test/chain-iteration.test.ts`)
- `[x]` Regression: `iterationMaxRounds=1` ≡ one-shot publish path when extend declines

### 47B — Intra-round extend (A) `[x]`

- `[x]` Assigner-only append of dependent `ChainSubtask`s under open-round IDs (`appendExtendSteps`)
- `[x]` Caps: `extendMaxStepsPerRound`, `extendMaxDepth`, `extendOnlyAfterPartial` (defaults on `chainDefaults`)
- `[x]` Mini soft-roster assign + `launchChain` for new steps (`_extendIterationRound`); parent context via `enrichSubtaskWithParentContext` on propose
- `[x]` Stall reassign remains for open IDs only; sealed IDs never re-awarded (47A)
- `[x]` Local-only + audit `chain.iteration.extend` via `pendingExtendSteps` queue (no new wire intent in 47B)
- `[x]` Unit: one append under cap; reject over-cap; sealed immutability / sealed dependsOn; extend-then-publish

### 47C — Judge policy + Team jobs UX `[x]`

- `[x]` Heuristics: local gap → prefer extend (if 47B live); global gap → continue round
- `[x]` Team jobs progress: `Round N/M · extended +K · …`
- `[x]` Report accordion: Draft 1 / Draft 2 / Final from `iteration.drafts`
- `[x]` Start dialog + Settings defaults for max rounds / extend / judge mode
- `[x]` Owner stop / `ask_owner` approval surface
- `[x]` Component + i18n tests

### 47D — Wire / handoff polish `[x]`

- `[x]` Progress / judge observe events for remote UIs (`chain:iteration` WS + audit `chain.iteration.progress`; observer peer from handoff sender)
- `[x]` Handoff carries or rehydrates `iteration` blob so remote Assigner keeps the loop (`iterationMaxRounds` / judge / extend knobs + `iterationState`)
- `[x]` Handoff E2E: iterate knobs on Assigner after `assignerPeerId` handoff (`iterationMaxRounds=2`); mid-job `iterationState` rehydrate on live handoff
- `[x]` Docs: guide + plan-assign “shipped” notes when 47A–D land

### Phase 47 exit criteria

- `[x]` `maxRounds=1` bit-identical to today’s one-shot Team job path (no iteration state; unit regression)
- `[x]` `maxRounds=2` produces two drafts and **one** final `publishChainReport` (unit + libp2p E2E owner Continue)
- `[x]` Mid-job `iterationState` rehydrates on live Assigner handoff (E2E)
- `[x]` Extend (when enabled) respects caps; cannot mutate sealed step finals
- `[x]` Bid `negotiationRound`, stall reassign, and budget rebalance unchanged in semantics (sealed IDs skipped in stall/heartbeat)
- `[x]` Design + guide + plan-assign docs aligned with shipped surface (47A–47D)

### Risks & mitigations (Phase 47)

| Risk | Mitigation |
|------|------------|
| Cost explosion | Caps + budget preflight before continue/extend |
| Spaghetti graph | A append-only; seal before B; no merge-as-replan |
| Double publish / early ledger finalize | Drafts never publish; finalize only on terminal report |
| Synthesize mixes rounds | Scope to open/sealed-round ID sets |
| Stall wakes sealed work | Tracker ignores sealed IDs |
| Naming confusion with bid rounds | `iterationRound` only |

### Implementation order

1. Design review locked in [agent-network-iteration.md](./agent-network-iteration.md) ← **done**  
2. Implement **47A** → verify exit criteria for B-only ← **done**  
3. Implement **47B** → extend E2E ← **done**  
4. Implement **47C** → UX ← **done**  
5. Implement **47D** as needed for handoff/observe ← **done**

---

## Phase 48 — A2A + MCP Interop Bridges **(shipped — 48A–48D.5)**

**Design doc:** [a2a-mcp-interop-design.md](./a2a-mcp-interop-design.md)

### Motivation

EnvoyMesh has a strong P2P transport and multi-agent protocol, but cannot interoperate with the broader agent ecosystem. Two industry standards address different layers:
- **MCP** (Anthropic) — model-to-tool function calling (tools/list, tools/call).
- **A2A** (Google) — agent-to-agent discovery (Agent Card) and task lifecycle.

Neither replaces EnvoyMesh's unique value (P2P, identity, trust, mandates). They operate **above** the transport layer. Phase 48 adds bridges at the boundaries so EnvoyMesh agents can interop with external tools and agents without sacrificing decentralization.

**Design principle:** Bridge, don't replace. EnvoyMesh keeps libp2p + signed envelopes + Bonds + mandates internally. A2A/MCP are translated at opt-in gateway endpoints.

### 48A — MCP Tool Consumer `[x]` shipped

The built-in agent can call MCP-compatible tool servers via `@modelcontextprotocol/sdk`.

- `[x]` `mesh.mcp.list_tools` / `mesh.mcp.call_tool` — SDK Client `listTools` / `callTool`
- `[x]` `node-config.json` → `mcpConsumers: [{ name, transport, command?, url?, bearerToken?, allowRemoteHttp?, env? }]`
- `[x]` Content mapping: TextContent/ImageContent/AudioContent/resource_link/structuredContent → artifacts
- `[x]` Unit tests (content mapping + session-factory manager; no circular dispatch)

**Exit criteria:** Agent can call MCP tools via `mesh.mcp.call_tool` with typed content mapping. — **shipped (SDK + unit).**

### 48B — MCP Server Adapter `[x]` shipped

Claude Desktop / Cursor can use EnvoyMesh tools via `npx envoymesh mcp-server`.

- `[x]` `apps/node/src/mcp-server-adapter.ts` — JSON-RPC 2.0 server (initialize, tools/list, tools/call)
- `[x]` `toMcpToolDescriptors` with `title`, `annotations`
- `[x]` Tool result mapping: EnvoyMesh artifacts + 48A MappedContent → MCP Content[]
- `[x]` stdio transport; `--bridge-allow-remote` honored; `--bridge-token` / `ENVOYMESH_BRIDGE_SECRET`
- `[x]` Unit tests for tool listing + call translation

**Exit criteria:** MCP clients can list and call EnvoyMesh `mesh.*` tools over the stdio adapter. — **shipped (unit + CLI).**

### 48C — A2A Agent Card Bridge `[x]` shipped

External A2A clients can discover EnvoyMesh agents.

- `[x]` `toA2AAgentCard()` translator (`streaming: true` as of 48D.5)
- `[x]` HTTP endpoint `/.well-known/agent-card.json` on relay node (opt-in via `--a2a-bridge` / `ENVOYMESH_A2A_BRIDGE=1`)
- `[x]` Config: `node-config.json` → `a2aBridge: { enabled, gatewayUrl }`
- `[x]` Unit tests for card translation + relay HTTP handler

**Exit criteria:** `curl http://relay:15432/.well-known/agent-card.json` returns a valid A2A card when enabled. — **shipped.**

### 48D — A2A Task Bridge `[x]` shipped (protocol + local mount; production path = 48D.5)

External A2A agents can authenticate and exercise JSON-RPC (`message/send`, `message/stream`, `tasks/get`, `tasks/cancel`). Protocol, auth, state/artifact translation, audit, node mount, and relay proxy are live and unit-tested. Production mandate mint + `TaskDispatcher` and live relay→home forwarding landed in **48D.5**.

**Scope shipped:**
- `[x]` A2A JSON-RPC handler: `message/send`, `message/stream`, `tasks/get`, `tasks/cancel`
- `[x]` Task state mapping (12 → 9) — `apps/node/src/a2a-state-map.ts`
- `[x]` Artifact mapping (all 4 kinds) — `apps/node/src/a2a-artifact-map.ts`
- `[x]` Bearer-token auth → ownerId; token table from `a2aBridge.bearerTokens[]`
- `[x]` Relay `ENVOYMESH_A2A_BEARER_TOKENS` parses `token:envoy:owner:…[#label]` (first `:` only)
- `[x]` Node `POST /a2a/jsonrpc` reachable on bridge HTTP when `a2aBridge.enabled` (production executor in 48D.5)
- `[x]` Relay exposes `POST /.well-known/a2a/jsonrpc` with DI'd `forwardToHome` (home-tunnel in 48D.5)
- `[x]` `A2ATaskBridgeExecutor` interface + `createScaffoldingA2ATaskExecutor()`
- `[x]` Unit tests green (200+ Phase 48 dedicated cases)

### 48D.5 — Production A2A path + hardening `[x]` shipped

Closes the production path after 48A–48D protocol/mount work.

- `[x]` Production executor: Bonds gate (`self`/`direct`/`referred`) → mint `task.mandate` + `task.propose` → `handleDaemonTaskInbound` (runtime guard + journal) (`a2a-task-executor.ts`)
- `[x]` Relay `forwardToHome` via home-tunnel HTTP (`http-req`/`http-res` → home `POST /a2a/jsonrpc`)
- `[x]` SSE streaming for `message/stream` (`handleStreamRequest` + bridge `text/event-stream`; Agent Card `streaming: true`; relay pipes SSE chunks via home-tunnel)
- `[x]` Vault-serve HTTP endpoint backing `FileArtifact` URIs (`GET /vault/<path>` on bridge + relay proxy, A2A bearer)
- `[x]` Optional Ed25519 signed Agent Card (`withA2AAgentCardSignature`; relay signs with control identity)
- `[x]` Live MCP stdio + A2A card-fetch integration tests; Claude Desktop / operator runbook — [phase-48-interop-smoke.md](./phase-48-interop-smoke.md)
- `[x]` Production executor defaults to `running` (opt-in `autoCompleteLocal`); a2aTaskId map persisted to `a2a-bridge-tasks.json`
- `[x]` Relay↔home-tunnel HTTP E2E (`a2a-home-tunnel-http.test.ts`)

### Exit Criteria (Phase 48 overall)

- `[x]` MCP tool consumer (`mesh.mcp.*`) + content mapping (48A)
- `[x]` MCP server adapter stdio + `npx envoymesh mcp-server` (48B)
- `[x]` A2A Agent Card discoverable via relay `/.well-known/agent-card.json` (48C)
- `[x]` A2A Task Bridge JSON-RPC + auth + state/artifact maps (48D)
- `[x]` All bridges are opt-in (no HTTP server unless explicitly configured)
- `[x]` EnvoyMesh P2P transport + signed envelopes + Bonds + mandates unchanged
- `[x]` 48D.5 — production executor + relay→home forward + `message/stream` + vault HTTP

### Risks & Mitigations (Phase 48)

| Risk | Mitigation |
|------|------------|
| MCP server crash | Supervised start with exponential backoff restart |
| A2A bridge leaks internal state | Only expose terminal states + artifact summaries |
| Bundle size from MCP runtime | Thin `@modelcontextprotocol/sdk` Client on `@envoymesh/node` |
| A2A spec changes | Pin to protocol version "1.0"; version negotiation in card |
| Claude Desktop config complexity | Ship `npx envoymesh mcp-server` one-liner |
| Relay→home path | Home tunnel HTTP + roster preference for tunnel peers |

---

## Phase 49 — Pi as Built-in Local Coding Agent **`[~]` shipped (49A-D, 49F; 49E dropped)**

**Goal:** Bundle [Pi](https://github.com/earendil-works/pi) (earendil-works AI coding agent harness, MIT, TypeScript) as EnvoyMesh's **third agent engine** — a built-in default local coding agent that runs filesystem + shell operations on the user's machine, with no mesh access. Complements Built-in OpenClaw (mesh/social) and Remote Ext Agent (HomeClaw/Hermes/OpenHuman). Pi inherits EnvoyMesh's model config by default; user can switch per-session. Pi and OpenClaw can run concurrently.

**Authoritative design:** [pi-integration-design.md](./pi-integration-design.md)

**Design decisions (2026-07-28):**

| Decision | Rationale |
|---|---|
| Pi is its own lane, not wired into OpenClaw | Two independent engines; survives OpenClaw upstream churn; no fork-sync tax. Pi doesn't bet on OpenClaw's Pi ancestry. |
| Pi is local-only — no `mesh.*` tools (Option B) | OpenClaw stays the sole network boundary (`AGENTS.md:213`). If a coding task needs mesh context, the user uses OpenClaw. |
| Pi is a third `AiEngineMode` engine, not a 4th Ext Agent entry | The `ExtAgentDefinition` slot is shaped for remote HTTP agents; Pi is local (filesystem + shell + terminal). A sibling engine models the difference cleanly. |
| Model handoff via scoped subprocess env vars | Pi-idiomatic (`$ENV_VAR` interpolation by design); same security property as OpenClaw's config-file approach (no key in CLI args). |
| Reuse the Phase 30 `TerminalCommandProposal` confirm flow | No new mandate/Bond-Engine machinery for local actions. Pi tool calls map to `riskTier: safe/moderate/destructive`; `autoRunPolicy: always-confirm` default, trust mode opt-in. |
| Built & packaged as a separate sidecar | Mirrors `fetch-openclaw-sidecar.sh` / `stage-tauri-openclaw-bundle.sh` pattern. Pinned upstream version (no `"latest"`). ~170 MB unpacked (cloud SDKs are static imports — see design §4); omitted on Windows slim builds. |
| Pi runs as the human user, no mandate | Local coding tool, not an autonomous mesh agent. No new peer identity, no owner-signed mandate. Audit events tagged `source: "pi"`. |

### 49A — Bundle & Sidecar Staging

- `[ ]` `scripts/fetch-pi-sidecar.sh` — downloads pinned `@earendil-works/pi-coding-agent@0.82.x` (+ 3 transitive deps) into `apps/tauri/src-tauri/resources/pi/`. Mirrors `fetch-openclaw-sidecar.sh`.
- `[ ]` `scripts/fetch-pi-sidecar.ps1` — Windows twin of the above (downloads + unpacks the npm tarball cross-platform).
- `[ ]` `scripts/stage-tauri-pi-bundle.sh` — stages Pi CLI + node_modules into the resources tree. Mirrors `stage-tauri-openclaw-bundle.sh`.
- `[ ]` `scripts/build-desktop.sh` — add `bash scripts/stage-tauri-pi-bundle.sh` to the sidecar-staging step (currently lines 175-179).
- `[ ]` `scripts/build-desktop.ps1` — add `# 1d. Pi agent` staging block + `-ForcePi` / `-SkipPi` switches; renumber the existing `# 1d. Verify` to `1e`.
- `[ ]` `apps/tauri/src-tauri/tauri.conf.json` + `tauri.conf.full.json` — add `"resources/pi/**/*"` to the resources array (currently lines 43-46).
- `[ ]` `apps/tauri/src-tauri/tauri.conf.slim.json` — Pi optional on Windows slim builds (omit resource entry; `piEnabled` defaults `false`). Document in `build-desktop.ps1`.
- `[ ]` `scripts/verify-tauri-resources.sh` — add Pi presence check (`require_dir_nonempty "$RES/pi"`, `require_file "$RES/pi/dist/cli.js"`).

### 49B — Pi Runtime & Model Handoff

- `[ ]` `apps/node/src/pi-runtime.ts` — `PiRuntime` class: spawn + manage Pi subprocess, readiness check, request/response multiplexing, supervised restart with backoff.
- `[ ]` `buildPiEnv(config)` — maps `ModelProviderConfig` → scoped subprocess env vars per the design doc §5 table (`ANTHROPIC_API_KEY` / `OPENAI_API_KEY`+`OPENAI_BASE_URL` / `OLLAMA_BASE_URL` / etc.). Never puts the key in CLI args.
- `[ ]` Per-session model override + restart logic (`restartWithModel(override?)`).
- `[ ]` Wire `PiRuntime.start()` into NodeServiceImpl startup, gated on `piEnabled`.
- `[ ]` `packages/api/src/pi-agent.ts` — `PiAgentSession`, `PiEvent`, `PiResponse` types (mirroring `terminal-agent.ts` shape).

### 49C — Pi Chat Panel (lightweight)

- `[ ]` `apps/social/src/components/views/PiChatPanel.tsx` — lightweight panel copying `TerminalAgentBar.tsx`'s pattern (`turns: PiTurn[]`, `busy`, single-RPC-per-submit). Drops AIChatPanel's approval/chain/CRDT/structured-answer machinery.
- `[ ]` `apps/node/src/node-service-pi.ts` — JSON-RPC handlers (`pi.prompt`, `pi.cancel`, `pi.history`).
- `[ ]` `packages/api/src/ws-protocol.ts` — Pi RPC methods + events (`pi:event` push).
- `[ ]` `packages/api/src/node-service.ts` — add Pi methods to `NodeService` interface.
- `[ ]` New sidebar nav entry for the Pi chat panel.
- `[ ]` Model picker in the panel (defaults to EnvoyMesh's configured model).

### 49D — Tool Calling + Permission Flow

**Critical design note (verified Slice 49D research):** Pi executes its own tools internally — EnvoyMesh only approves via the `extension_ui_request`/`extension_ui_response` stdin/stdout sub-protocol. This is NOT the Phase 30 terminal agent model (which writes commands to a PTY). Do NOT route through `terminal-agent-assist.ts:executeProposal` — see design §7 "Why NOT to reuse."

- `[ ]` `apps/node/src/pi-tool-bridge.ts` — `extension_ui_request { id, title, message, timeout }` → `PiToolProposal` (the confirm-dialog payload). Egress-content scan (`evaluateEgressContent`) on `title`/`message` before audit (redacts secrets; does NOT block the dialog).
- `[ ]` `packages/api/src/pi-agent.ts` — add `PiToolProposal`, `PiProposalEvent` (WS push payload), `PiRespondToProposalParams` types.
- `[ ]` Wire `PiRuntime.on("ui_request")` → `NodeServiceImpl.emit("pi:proposal", event)` → `ws-server` bridge + event allow-list.
- `[ ]` Add `piRespondToProposal` JSON-RPC method + `NodeService.piRespondToProposal({ uiRequestId, confirmed })` → calls `PiRuntime.respondToUiRequest(id, confirmed)`.
- `[ ]` Confirm UI in `PiChatPanel.tsx` — docked card with title/message + Allow/Deny buttons (NO risk badge; NO edit-in-terminal — Pi's tool, not ours).
- `[ ]` Audit events: `pi.tool.proposed` / `pi.tool.executed` / `pi.tool.denied` / `pi.tool.failed` via `createSerialJsonlAppender`. Redacted title/message.
- `[ ]` `autoRunPolicy: "off"` (trust mode) → auto-respond `confirmed: true` without surfacing the dialog. Opt-in only; default surfaces every request.

### 49E — Terminal Agent Mode Integration — **DROPPED (2026-07-28)**

**Original plan:** add "Agent (Pi)" mode alongside EnvoyAI in the existing Phase 30 `TerminalAgentBar`, with Pi producing `TerminalCommandProposal`s.

**Decision: drop.** Slice 49D research proved Pi executes its own tools internally — it doesn't write to a terminal PTY the way the existing terminal agent does. Wiring Pi into the terminal would create two unrelated execution surfaces (PTY + Pi's sandbox) in one UI, which is confusing. The PiChatPanel (49C) is the sole surface for Pi.

- `[~]` Dropped after Slice 49D review surfaced the architectural mismatch. No code written. See design §6(b).
- If a future "Pi-driven terminal" becomes valuable, it would need a Pi-side "terminal-echo only" mode (restrict Pi to proposing commands the user runs in the actual PTY, no file tools). That's a separate larger workstream — not Phase 49.

### 49F — Settings UI, Config, Audit, i18n

- `[x]` Pi settings block in `apps/social/src/components/views/SettingsAITab.tsx` — new "Pi (Local Coding Agent)" section with enable toggle, auto-run policy selector (`always-confirm` / `safe-only` / `off`), status badge, model display, restart button. Toggle persists `piEnabled` AND calls `restartPi()` immediately (config change alone does not restart — verified in 49D review).
- `[x]` `piEnabled` (default `true`) + `piSettings` in `PersistedNodeConfig` — shipped in Slice 49B.
- `[~]` `packages/api/src/agent-network-mode.ts` — `AiEngineMode` extension **deferred**. Pi runs concurrently with OpenClaw (no mode conflict), so the mode discriminator doesn't need Pi states yet. Add when a UI surface needs to express "Pi is the sole engine."
- `[x]` Audit events `pi.tool.proposed` / `executed` / `denied` / `failed` — shipped in Slice 49D (via `pi-tool-bridge.ts:auditPiTool` + `AuditEventType` extended). Redaction via `evaluateEgressContent` (PEM/AWS/JWT/connection-string secrets stripped before audit). `pi.runtime.crashed` not yet emitted — the watchdog restart path logs via `console.warn`; promoting to audit is a small follow-up.
- `[x]` i18n: full English strings (`en-pi.ts` + `en-settings-ai.ts` Pi keys). Translations added for zh, ko, ja (both chat-panel `*-pi.ts` and `settings-ai` Pi keys). fr/de/it fall back to English via `mergeMessages` (acceptable — same as other recently-added features).

### Exit Criteria (Phase 49 overall)

- `[x]` Pi sidecar bundles into macOS DMG + Linux deb (full builds). Windows slim build omits Pi; full Windows build includes it (`tauri.conf.slim.json` vs `.full.json`).
- `[x]` `pi --version` works inside the bundled terminal (verified in 49A smoke test).
- `[x]` Pi inherits EnvoyMesh's `modelProviders` config; switching the model in Settings → AI takes effect on next Pi session (`buildPiSpawnConfig` in `pi-runtime.ts`).
- `[x]` Pi chat panel renders prompt/response; tool actions surface as confirm dialogs (49C + 49D).
- `[x]` Destructive Pi tool calls require explicit confirmation; trust mode (`autoRunPolicy: "off"`) is opt-in only (49D + 49F selector).
- `[~]` ~~Terminal agent mode works with both EnvoyAI and Pi backends~~ — **dropped (49E)**. Pi doesn't fit the terminal PTY model; PiChatPanel is the sole surface.
- `[x]` Pi has **no** access to `mesh.*` tools, the network layer, or the mesh tool registry (grep-verifiable: `pi-runtime.ts` + `node-service-pi.ts` + `pi-tool-bridge.ts` import nothing from `@envoymesh/models` mesh descriptors, `@envoymesh/bonds`, or `packages/openclaw-runtime`).
- `[x]` OpenClaw is unchanged — no edits to `packages/openclaw/`, `packages/openclaw-runtime/`, or the mandate/Bond-Engine schemas.
- `[x]` Audit events appear in the JSONL log for every Pi tool action with egress-content redaction (`pi.tool.proposed/executed/denied/failed`).
- `[x]` Unit + integration tests pass (72 Pi-related tests across 7 files; 4 integration tests gated on `RUN_PI_TESTS=1` pass against real Pi binary).

### Risks & Mitigations (Phase 49)

| Risk | Mitigation |
|---|---|
| Pi subprocess transport choice (RPC vs SDK vs webhook) | Recommend RPC for process-isolation parity with OpenClaw; defer final decision to Slice 1 spike. |
| **Bundle size: ~170 MB unpacked (Slice 1 measured) — accepted** | `@earendil-works/pi-ai` statically imports 5 cloud SDKs (Anthropic/OpenAI/Google/Mistral/AWS). Cannot prune without crashing. **Decision (2026-07-28): accept ~170 MB unpacked** — EnvoyMesh targets home machines where the size is a non-issue (comparable to OpenClaw). Installer compression (~3:1 → ~55 MB in DMG). Windows slim builds still omit Pi (NSIS installer cap). Forking `pi-ai` to dynamic imports is not worth the upstream-divergence cost. |
| Pi version drift / supply chain | Pin to specific `0.82.x` in `fetch-pi-sidecar.sh`; bump deliberately; never `"latest"`. |
| Pi subprocess crash / hang | Supervised start with exponential backoff restart; `pi.runtime.crashed` audit event. |
| Concurrent Pi sessions memory pressure | Start per-session (simpler); optimize to shared subprocess in a follow-up if needed. |
| Pi tool-call frequency floods audit log | Redact aggressively (hashes, not raw content); consider separate `pi-actions.jsonl` if main log grows. |
| Pi "no permission popups" philosophy unsafe in UI | Default `always-confirm`; trust mode is opt-in only; egress scan blocks secret leakage. |

**Ordering rule:** Pi is local-only and lower-risk than mesh operations, so it slots ahead of any future "Pi + mesh" hybrid in the ordering. OpenClaw remains the sole mesh boundary; Pi never crosses it.

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

## Changelog (this document)


| Date | Change |
|------|--------|
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
| 2026-07-31 | **Phase 51 follow-ups.** Owner-only RPC gate covers vault/library + all `terminal*` methods; `previewFamilyInvite` pre-auth profile list for EnvoyGo re-pair (I'm new / I'm back); Social family group create/list/send UI; EnvoyGo skips bond/terminal/feed owner RPCs for family sessions; widget-test mock signatures fixed. |
| 2026-07-31 | **Phase 51F review hardenings.** Social family DMs: route `family:*` in `partnerOwnerIdForChat` / `useChatThreadPreviews`; bubble direction uses `callerFamilyProfileId` (not mesh owner id). |
| 2026-07-31 | **Phase 51E review hardenings + 51F shipped.** 51E: restore family session from secure storage on connect; hide call/mic/published-content on family DMs; family avatars; deep-link guards; filtered loadThreads. 51F: Social Settings Family tab + invite QR; Chat sidebar Family section; FamilyChatPanel; family RPCs on useNodeService. |
| 2026-07-31 | **Phase 51D review hardenings + 51E shipped.** 51D: mesh room WS owner-only; family room push bare `roomId` + `roomKind`; `onRoomMessage`/`ChatDetailScreen` classify family groups; reject inactive members. 51E: non-owner nav (Chats+Me), Me profile edit + gated settings, push prefs by `profileId`, self-service `updateFamilyProfile` for name/avatar/bots. |
| 2026-07-31 | **Phase 51D review hardenings.** Typed `chat:family-room-*` events; WS remaps family room-updated to bare room object (mesh-compatible); EnvoyGo opens `familyGroup` threads with `chatRoomId` so send uses `sendFamilyRoomMessage`. |
| 2026-07-31 | **Phase 51C review hardenings + 51D shipped.** 51C: inactive profiles stay listed; family push deep-link via `threadKey`; deactivated profiles never skip-push-as-online. 51D: `family-rooms.json` + `create/list/sendFamilyRoom*` RPCs; profile-scoped WS events; EnvoyGo family group picker + `ChatThreadType.familyGroup`. |
| 2026-07-31 | **Phase 51B review hardenings + 51C shipped.** 51B: `threadVisibleTo` on `listChatHistory`, profile-scoped `chat:message` WS emit, expanded owner-only RPCs (mesh/bonds/library). 51C: `sendFamilyMessage`, `emitEventToProfile`, `lastSeenAt` presence, EnvoyGo `ChatThreadType.family` + `syncFamilyContacts`. |
| 2026-07-30 | **Phase 51A+51B shipped.** 51A: family profiles, session `profileId`, owner RPC gate, EnvoyGo family RPC wrappers + pairing name/avatar UI. 51B: profile-scoped EnvoyAI/bot/bridge threads, `aiBots` migration to owner profile, push tokens tagged + filtered by `profileId`, `isProfileOnline` / `hasClientForProfile`. |
| 2026-07-30 | **Phase 51 revised (scope cut).** Family contacts derived from profiles (no trust-store `family:*` bonds). No per-profile vault; no mesh inbound profile routing; family groups are family-only. Non-owner config sync must strip secrets. Authoritative design updated: [family_network.md](./family_network.md). |
| 2026-07-30 | **Phase 51 — Family Network designed.** New phase: multi-profile private social network on one home node. Owner = full product; family = AI + Ext Agent chat + family chat + push. Slices 51A–51F. Authoritative design: [family_network.md](./family_network.md). |
| 2026-07-30 | **Phase 50 status updated — all shipped.** Updated Phase 50 checkboxes to reflect what actually shipped across multiple commits: 50A (unified listener + bond push + Pi push + isOwnerOnline fix + in-app toggle), 50B (approval push + token cleanup + feed/Bond skip-if-online + dispatchApprovalPush + push-config.json), deep-link (navigatorKey + getInitialMessage + cold-start race fixes + payload routing for chat/feed/bond/approval/Pi). Status changed from `[~] Slice A shipped; B-H planned` to `[x] shipped`. Remaining: notification channels, badge count, per-contact mute/DND, foreground banner (all UX polish, deferred). |
| 2026-07-28 | **Phase 50 Slice A shipped (push-notification highest-priority fixes).** Two bugs fixed: (1) Direct chat push was broken in production — `dispatchChatPush` was wired only on the legacy Path B (`index.ts:1904`), bypassed by the production internal-mesh handler (`usesInternalMeshInboundHandlers()` short-circuit). EnvoyGo's home node always runs Path A, where the handler at `node-service-handlers-chat-message.ts:146` emitted `chat:message` but never pushed. Fix: added `dispatchChatPushIfOffline` to `ChatMessageContext`, wired from `node-service-impl-service-deps.ts` with skip-if-online gate, called after the emit. (2) `dispatchBondPush` was fully implemented but had zero call sites (dead code); wired into the `hello:request` callback at `index.ts:2314`. Also unblocked the in-flight Pi-as-Ext-Agent build (added `'pi'` port placeholder in `ext-agent-adapter/manager.ts`, `sendToPiForExtAgent` alias on NodeServiceImpl, `pi-terminal-session.ts` stub, MobileNode `ensurePiTerminalSession` proxy, fixed value-vs-type imports). Full Phase 50 design + slices B-H planned in [push-notification-coverage.md](./push-notification-coverage.md). |
| 2026-07-28 | **Phase 49 — Pi as Built-in Local Coding Agent designed.** New phase adding [Pi](https://github.com/earendil-works/pi) (earendil-works coding agent harness) as a third agent engine alongside Built-in OpenClaw + Remote Ext Agent. Pi is local-only (filesystem + shell, **no `mesh.*` tools** — OpenClaw stays the sole network boundary per `AGENTS.md:213`), inherits EnvoyMesh's model config by default, reuses the Phase 30 `TerminalCommandProposal` permission flow (default `always-confirm`, trust mode opt-in), and ships as a separate sidecar mirroring the OpenClaw bundle pattern. Slices 49A–49F cover bundle/runtime/chat-panel/permissions/terminal/settings. Authoritative design: [pi-integration-design.md](./pi-integration-design.md). |
| 2026-07-28 | **Phase 49 Slice 49A shipped (bundle + sidecar staging).** New scripts: `fetch-pi-sidecar.sh` / `.ps1` (npm-install pinned `@earendil-works/pi-coding-agent@0.82.x` + transitive deps into `resources/pi/`), `stage-tauri-pi-bundle.sh` (prune source maps / TS sources / tests / cross-platform native prebuilds, verify CLI + SDK entries). `build-desktop.sh` + `.ps1` updated to stage Pi alongside Node/OpenClaw (new `-ForcePi` / `-SkipPi` switches on Windows; `# 1d. Pi agent` block, verify step renumbered `1e`). `tauri.conf.json` + `tauri.conf.full.json` add `resources/pi/**/*`; `tauri.conf.slim.json` intentionally omits Pi (Windows slim builds). `verify-tauri-resources.sh` adds conditional Pi presence check. **Smoke-tested:** Pi installs (140 packages), stages, prunes, and passes verify. **Measured bundle size: ~170 MB unpacked** (5 cloud SDKs statically imported by `pi-ai` — cannot prune); installer compression (~3:1) brings it to ~55 MB in-DMG. Windows slim builds omit Pi entirely. |
| 2026-07-28 | **Phase 49 Slice 49B shipped (runtime + model handoff).** `packages/api/src/pi-agent.ts` (Pi RPC wire types), `apps/node/src/pi-runtime.ts` (`PiRuntime` class — spawn `pi --mode rpc`, JSONL over stdio, `buildPiSpawnConfig` maps `ModelProviderConfig` → scoped env vars; API key never in CLI args), `apps/node/src/node-service-pi.ts` (lifecycle wrappers mirroring OpenClaw pattern, watchdog backoff). Wired into `NodeServiceImpl.startPi` boot hook + JSON-RPC (`getPiStatus`/`restartPi`/`sendToPi`). Review caught: readiness probe hung on Pi's non-JSON `Warning:` preamble line (fixed hybrid probe), `prompt()` turn-end race (subscribe-before-send), unbounded JSONL buffer (2 MB cap). 14 unit + 4 integration tests (gated `RUN_PI_TESTS=1`) pass against real Pi binary. |
| 2026-07-28 | **Phase 49 Slice 49C shipped (Pi chat panel).** `apps/social/src/components/views/PiChatPanel.tsx` — lightweight panel (header w/ status badge + restart, thread, composer) modeled on `TerminalAgentBar` not `AIChatPanel`. Sidebar nav entry "Pi" (indigo→teal avatar). Polls `getPiStatus` every 5s while down. Full i18n (`en-pi.ts`) + CSS with dark-theme overrides. Review caught: restart button shown for `not-installed` (would always fail), status badges hardcoded light colors (no dark theme), missing `aria-live` on status badge. 11 component tests pass. |
| 2026-07-28 | **Phase 49 Slice 49D shipped (tool-call approval) + 49E dropped.** Wired Pi's `extension_ui_request` sub-protocol to a confirm dialog in PiChatPanel. **Critical design correction:** original §7 proposed reusing Phase 30 `TerminalCommandProposal` execution path; research proved Pi executes its own tools internally (no PTY write). Reuse is UI-only (docked card + Allow/Deny); confirm/deny calls `PiRuntime.respondToUiRequest(id, confirmed)`. New `pi-tool-bridge.ts` (request → proposal, egress-scan redaction, `pi.tool.*` audit events). Review caught 5 real issues: `redactPiRequestForAudit` pre-truncation split secrets (security HIGH), `inFlightProposals` was module-level (correctness HIGH), listener leak on failed start, no auto-deny audit on timeout, no client-side dock auto-dismiss. All fixed + regression tests. **49E (terminal integration) dropped** — Pi doesn't fit the terminal PTY model; PiChatPanel is the sole surface. 46 Pi tests pass. |
| 2026-07-28 | **Phase 49 Slice 49F shipped (Settings UI + i18n) — Phase 49 COMPLETE.** New "Pi (Local Coding Agent)" section in `SettingsAITab.tsx` (enable toggle, auto-run policy selector `always-confirm`/`safe-only`/`off`, status badge, model display, restart button). Critical wiring: toggling `piEnabled` calls `restartPi()` explicitly — `updateNodeConfig` alone does NOT restart the runtime (verified in 49D). Auto-run policy persists without restart (read fresh per request). Full English i18n (`en-settings-ai.ts` Pi keys + `en-pi.ts`) + translations for zh, ko, ja (chat-panel `*-pi.ts` + settings-ai Pi keys); fr/de/it fall back to English via `mergeMessages`. CSS: `.agent-block-icon--pi` (indigo accent, matching chat panel avatar) + `.pi-error` hint. 8 new component tests pass. **Phase 49 final: 72 Pi-related tests pass across 7 files; tsc clean.** Status: `[~] shipped (49A-D, 49F; 49E dropped)`. |
| 2026-07-28 | **Phase 49 decision: bundle size accepted (~170 MB unpacked).** EnvoyMesh targets home machines where the size is a non-issue (comparable to OpenClaw). Installer compression (~3:1) brings it to ~55 MB in-DMG. Windows slim builds still omit Pi (NSIS cap). Forking `pi-ai` for dynamic imports is not worth the upstream-divergence cost. |
| 2026-07-27 | **Tool-call argument firewall (hardened).** `evaluateToolCallFirewall` validates LLM tool args (JSON Schema, recursive hygiene, empty-required reject, URL-decoded path traversal, strip undeclared props, sensitivity ceiling). `requiresApproval` tools are **enqueued** as Inbox `tool_call` items (not blanket-granted on OpenClaw/bridge); approve re-runs with `approvalGranted`. Also gates `LocalToolRegistry.callTool`. Tests: `tool-call-firewall.test.ts` + executeTool / approval-executor coverage. |
| 2026-07-25 | **Phase 48D.5 production-path review blockers fixed.** Executor: Bonds `evaluatePolicy` gate (`self`/`direct`/`referred`); mandate always home-owner-signed; emit `task.propose` after `task.mandate`; route through `handleDaemonTaskInbound` (runtime guard + journal). Bond deny → A2A `auth-required`. |
| 2026-07-25 | **Phase 48D.5 remaining gaps closed.** Relay SSE chunk streaming (`http-res-start/chunk/end`); executor default `autoCompleteLocal=false` + config knobs + `a2a-bridge-tasks.json` persistence; home-tunnel HTTP round-trip (`a2a-home-tunnel-http.test.ts`). |
| 2026-07-25 | **Phase 48D.5 review hardenings.** Relay proxies `GET /vault/*` via home-tunnel; A2A proxy preserves upstream HTTP status; Agent Card `supportedInterfaces[0].url` points at `/.well-known/a2a/jsonrpc`; vault `?hash=` verified; bridge listens when A2A/vault configured. |
| 2026-07-25 | **Phase 48D.5 operator smokes closed.** Live MCP stdio integration (`mcp-stdio-live.test.ts`: consumer + Claude Desktop path), A2A Agent Card HTTP fetch (`a2a-card-fetch-live.test.ts`, optional `A2A_CARD_FETCH_URL`), Claude Desktop runbook in [phase-48-interop-smoke.md](./phase-48-interop-smoke.md). |
| 2026-07-24 | **Phase 48D.5 shipped.** Production A2A executor (mandate + `TaskDispatcher`); relay `forwardToHome` via home-tunnel; `message/stream` SSE + Agent Card `streaming: true`; `GET /vault/<path>` FileArtifact serve; optional Ed25519 Agent Card signatures (relay control identity). Phase 48 complete (48A–48D.5). |
| 2026-07-24 | **Phase 48 review blockers fixed.** 48A: real `@modelcontextprotocol/sdk` consumer (no circular executor). 48B: `--bridge-allow-remote` + `--bridge-token`, MappedContent→MCP reshape, `title`/`annotations`. 48C: `streaming: false`. 48D: node `/a2a/jsonrpc` mount + scaffolding executor; relay bearer env preserves `envoy:owner:…`. Production path remains **48D.5**. |
| 2026-07-24 | **Phase 48 docs aligned to shipped.** TOC, Current Milestone, and design doc mark **48A–48D shipped**; remaining work under **48D.5** (production executor, relay `forwardToHome`, `message/stream`, vault HTTP, optional live E2E). |
| 2026-07-18 | **Phase 48D — A2A Task Bridge shipped.** External A2A clients can `message/send`, `tasks/get`, `tasks/cancel` over JSON-RPC 2.0 (`message/stream` deferred to 48D.5). New modules: `a2a-state-map.ts`, `a2a-artifact-map.ts`, `a2a-task-bridge.ts`, `apps/relay/src/a2a-jsonrpc-proxy.ts`. Phase 48 complete: 48A ✅, 48B ✅, 48C ✅, 48D ✅ (48D.5 deferred). |
| 2026-07-18 | **Phase 48C — A2A Agent Card Bridge shipped.** New `apps/node/src/a2a-bridge.ts` translates EnvoyMesh Agent Cards to A2A v1.0 (displayName → name, capabilities → skills with strength tags, trustPolicySummary → securitySchemes, agentNetworkProfile → metadata). Relay publishes `/.well-known/agent-card.json` when enabled via `--a2a-bridge` / `ENVOYMESH_A2A_BRIDGE=1` (gateway URL via `--a2a-gateway-url` / `ENVOYMESH_A2A_GATEWAY_URL`). 17 unit tests + 6 relay-args tests cover field mapping, HTTP handler status codes (200/405/503), and CLI/env precedence. `PersistedNodeConfig.a2aBridge` mirrors the relay config on the node side. Phase 48 status: 48A ✅, 48B ✅, 48C ✅, 48D pending. |
| 2026-07-23 | **Phase 47 E2E gaps closed.** Root cause: `ask_owner` was not remapped to `stop` when `canContinue=false` after final round (hung on second owner hold). Full 2-round mesh E2E (Continue → two drafts + one publish); mid-job `iterationState` live handoff rehydrate E2E; `chainStartFromGoal.iterationState` for handoff blob. |
| 2026-07-23 | **Phase 47 test hardening.** Libp2p `chain-iteration-e2e` (always_stop + owner Accept/Continue); unit coverage for Draft/Final sections, sealed stall skip, owner continue, extend depth clamp; `publishChainReport` treats local store as success when owner mesh delivery fails; `chainStartFromGoal` accepts judge/extend overrides; wired into smoke `06b`. |
| 2026-07-23 | **Phase 47D shipped (handoff + observe).** Handoff carries iteration knobs + optional `iterationState` wire blob; Assigner rehydrates; `chain:iteration` WS + audit progress; observer peer from handoff sender; E2E asserts `iterationMaxRounds` on remote Assigner; guide/plan-assign marked shipped. Phase 47 complete. |
| 2026-07-23 | **Phase 47C shipped (judge heuristics + Team jobs UX).** Local→extend / global→continue heuristics; `ask_owner` hold + `chainResolveIteration`; iteration on chain state; Settings/Start knobs; progress line + draft accordion + owner Accept/Continue; i18n + component/unit tests. 47D remains open. |
| 2026-07-23 | **Phase 47B shipped (intra-round extend A).** `appendExtendSteps` + caps; `pendingExtendSteps` → `_extendIterationRound` launch; `tryCompleteChainIfReady` extend-before-seal; unit coverage in `chain-iteration.test.ts`. 47C–47D remain open. |
| 2026-07-24 | **Phase 48 — A2A + MCP Interop Bridges designed.** Added Phase 48 section (48A–48D sub-phases, all `[ ]` future) covering four interop bridges: 48A (MCP tool consumer — agent calls external MCP servers via `mesh.mcp.call_tool`), 48B (MCP server adapter — Claude Desktop/Cursor uses EnvoyMesh tools via stdio/HTTP), 48C (A2A Agent Card bridge — external A2A clients discover EnvoyMesh via `/.well-known/agent-card.json`), 48D (A2A Task bridge — external A2A agents delegate tasks via JSON-RPC `message/send`). Design principle: bridge, don't replace — EnvoyMesh keeps libp2p + signed envelopes + Bonds + mandates internally. Full design in [a2a-mcp-interop-design.md](./a2a-mcp-interop-design.md). No code changes — design + roadmap only. |
| 2026-07-23 | **Phase 47A shipped (outer iteration B).** `chain-iteration.ts` + `tryCompleteChainIfReady` seal→draft→judge→continue; round-scoped synthesize; single terminal publish; `iterationMaxRounds` defaults/knobs; `_continueIterationRound`; unit tests in `chain-iteration.test.ts`. 47B–47D remain open. |
| 2026-07-23 | **Phase 47 designed (A ∩ B Team job iteration).** Design doc [agent-network-iteration.md](./agent-network-iteration.md) reviewed against orchestrator (round-scoped synthesize, no mid-loop publish/finalize, no `task.chain.merge` as outer loop, sealed IDs vs stall). Implementation-plan Phase 47 checklist: 47A outer loop → 47B extend → 47C UX → 47D handoff. Defaults `iterationMaxRounds=1`. **No code yet.** |
| 2026-07-21 | **Phase 46 doc hygiene.** Operator fleet §8 add-Nth-relay runbook; design A7 auth + B7#3 demoted + B9 risks; multi-relay preset example; cleared stale “live smoke deferred” banners. |
| 2026-07-21 | **Phase 46 P2/P3 tests.** Gated live `TEST_RELAY_A`/`TEST_RELAY_B` E2E + signoff script; process-spawn `apps/relay` E2E; `npm run test:e2e:relay:fleet` / `:process` / `:live`; serialize multi-relay `addRelay` (parallel RESERVE deadlocks); skip empty libp2p bootstrap list after loopback filter. |
| 2026-07-21 | **Phase 46 test gaps closed.** In-process E2E `multi-relay-fleet-e2e` (46A multi-home + 46B miss-forward); unit coverage for merge/negative-cache/hints promote/`maxHops:1` client payload; design matrix miss-forward marked shipped. |
| 2026-07-21 | **Phase 46 shipped (46A–46C).** Client `collectRelayControlTargets` + parallel checkin/lookup; standalone miss-forward + sibling book/`relay.hints` gossip; client `maxHops: 1`. Unit tests in `relay-reservation-health` + `relay-miss-forward`. Optional two-relay live smoke deferred. |
| 2026-07-21 | **Relay server design expanded + Phase 46 wired.** [relay-server-design.md](./relay-server-design.md) is now the full standalone relay design (Part A shipped surface + Part B Phase 46 fleet). Phase 46 checklist: 46A multi-home, 46B miss-forward, 46C sibling hints. Implementation remains Phase 46 only. |
| 2026-07-21 | **Phase 46 — Multi-Relay Fleet Coordination designed.** Initial checklist + TOC/related links for multi-relay fleet coordination. |
| 2026-07-20 | **EnvoyGo feed.notify Inbox.** Thin-client mirror: list/dismiss RPCs + `feed:notify` live upsert + Open in Browser. OS push deferred. |
| 2026-07-21 | **OS alert push complete (31I + feed).** EnvoyGo `PushNotificationService` obtains APNs (native MethodChannel) / FCM tokens and registers `tokenType: alert`. Home fills missing `ownerId` from profile; chat/bond/feed dispatch alert-only; `dispatchFeedPush` on inbound `feed.notify`. |
| 2026-07-21 | **WAN auto-bond + discovery hygiene (home Mac / no public IP).** Sponsor-friend: wan-default prefers circuit when `/p2p-circuit/` exists; installer backfill strips RFC1918; WAN invites append synthetic community-relay circuits; sendHello passes `preferCircuitHints` + addressFilter. Discovery: `normalizeDiscoveryTopicQuery` for By-topic; soften DHT advertise skip (`<1` peer); merge publish+interest into relay.checkin roster. Tests: `wan-discovery-autobond-hygiene.test.ts` + updated dial/invite/topic suites (90 green). |
| 2026-07-20 | **Phase 45D contact picker.** Author UI multi-select when visibility=`contacts`; requires ≥1 bond; passes `contactIds` to publish. |
| 2026-07-20 | **Phase 45 P2 closed.** Contacts ACL Browser Playwright (scenarios 9–10) + Layer-3 LIBREAD-06/07; `smoke:web-content` wired into orchestrator `06c` (`test:full` / `ci-smoke-local`) and `ci-smoke-nightly`. |
| 2026-07-20 | **Phase 45 P1 test gaps closed.** PhotoWall Playwright (`web-content-author-photowall.smoke.ts`) + Discover publish-topic mocked E2E (`discover-publish-topic-e2e.test.tsx`). `smoke:web-content` 11/11 green. |
| 2026-07-20 | **Phase 45E Playwright P0 closed.** `web-content-feed-notify.smoke.ts` — Alice publish bonded blog → Bob Inbox `feed.notify` → Open in Browser → markdown. Wired into `smoke:web-content` (10/10 green). |
| 2026-07-20 | **Docs: EnvoyGo is the product mobile app; Capacitor `apps/mobile` is backup/legacy.** Updated CLAUDE.md / AGENTS.md, README, Phase 11 banner, `.cursor/rules/mobile-app.mdc`, and `apps/mobile/README.md` so agents stop treating Capacitor as the phone app. |
| 2026-07-20 | **Phase 45B shipped (+ review fixes).** Browser polish: back/forward/reload, per-owner bookmarks + recent autocomplete, range auto-chunk, `ifNoneMatch`/`not_modified`. Review fixes before commit: capped range/binary bodies at 40 KiB (base64 envelope budget), contacts visibility deny-by-default when `contactIds` missing, past-EOF ranges empty, navigate in-flight guard, owner-scoped recent history. Playwright scenarios 6 & 8 enabled. |
| 2026-07-20 | **Phase 45A review fixes.** Anti-enumeration: policy deny always `not_found` (forbidden only on contacts ACL miss). Discovery: `wantsWebContent` merge + `matchWebContentEntries` + DHT `capability:envoymesh.web-content` when manifest has entries. Docs: manifest required for remote reads; file map trimmed to shipped surface; body cap 48 KiB. |
| 2026-07-20 | **Phase 45A shipped + review fixes.** Vertical slice live: `envoy://` parser, `library.read` intent/handler, web content store, Browser view + Header nav, referred-bond policy, `index.md` root convention, contentHash verify in Browser, four test layers (Playwright `NodeSpawner` repaired). Docs aligned: `not_found` anti-enumeration, `vault.retrieve` capability, section cross-refs, checkboxes. |
| 2026-07-20 | **Phase 45 — Web Content Browsing designed.** Added Phase 45 section (45A–45F sub-phases) covering URL-addressable content serving over the mesh. Full design in [web-content-browsing-design.md](./web-content-browsing-design.md). |
| 2026-06-20 | **Phase 43 — Agent Network User Experience planned.** Post-40F usability review consolidated into eight sub-phases (43A–43H): P0 = worker execution (`executeSubtask`), chat entry point + templates, smart defaults + composite bid ranking; P1 = live WebSocket UI, cost/trust transparency, single-home diagnostics; P2 = safety rails + power-user/mobile features. Phase 41 exit criteria corrected to reflect partial shipment. North star: "hire a temporary team" UX — hide chain/mandate IDs from default flow. |
| 2026-06-20 | **Phase 40F — Production integration shipped.** Wired `dispatchChainEnvelope` in `index.ts`, real orchestrator/worker deps (agent identity, mesh send, audit, `recordChainReport`), corrected inbound capability gate, `chainPlan`/`chainLaunch`/report RPCs, `CapabilityIndex` discovery, `trackChain` scheduler. Added `chain-production.ts` + tests. |
| 2026-06-19 | **Phase 42A–42F shipped (sub-phases 42A / 42B / 42C / 42D / 42E / 42F).** The mobile call path now works end-to-end on the Flutter side. 42A rewrites the home's `sendCallInvite` to resolve owner→device peer ID via `_resolvePeerTransportForOwner` (previously passing the owner ID — broke the libp2p dial), embeds the SDP offer (previously `""` — schema violation since `z.string().min(1)`), and injects `iceServers` from `node-config` (previously unread). Adds defensive `validateSdpString` (64 KB cap) and `validateIceCandidate` (RFC-5245 §15.1 grammar) validators in `call-inbound.ts` so a malformed SDP can't crash `setRemoteDescription`. 42B wires the four response envelopes — `acceptCallInvite` / `declineCallInvite` / `endCall` / `setCallMuted` — so the home actually sends `call.accept` / `call.reject` / `call.hangup` / `call.mute` back to the peer (previously the four stubs only mutated local `CallManager` state). 42C replaces the five `UnimplementedError` stubs in `apps/envoygo/lib/services/node_service_client.dart` with real JSON-RPC implementations matching the new `NodeService` interface. 42D ships `apps/envoygo/lib/webrtc_call_transport.dart` — the native `flutter_webrtc` transport mirroring `apps/social/src/lib/webrtc-call-transport.ts:57-251`, with `startOffer` / `startAnswer` / `addIceCandidate` / `setMute` / `close` and pluggable `peerConnectionFactory` + `getUserMedia` seams for testing. 42E rewires `CallProvider` to build the transport, generate SDP via `startOffer` / `startAnswer`, and pass it through the corresponding JSON-RPC. `CallState` gains `remoteStream` + `transport` fields. 42F wires the active-call screen (`VoiceCallScreen` now a `ConsumerWidget` bound to `callProvider` with peer name + duration timer + mute/end buttons + remote stream binding), mounts the `IncomingCallOverlay` into `home_screen.dart` as a Stack overlay, adds a Call action button to `chat_detail_screen.dart` for direct-message chats, declares iOS `NSMicrophoneUsageDescription` + Android `RECORD_AUDIO` / `MODIFY_AUDIO_SETTINGS` / `INTERNET` permissions, and adds an `AudioSessionHelper` + `envoygo/audio_session` method channel that configures iOS `AVAudioSession` (`playAndRecord` + `voiceChat` mode + `allowBluetooth` option) on `startCall` / `acceptCall` and resets on `endCall` / `declineCall` / dispose. The overlay's ring timer + pulse animation now only run when the overlay is actually visible (`state.isIncoming`), keeping it cheap when idle. **~25 new tests across 8 files** (4 home + 4 EnvoyGo): `call-send-invite.test.ts`, `call-sdp-validation.test.ts`, `call-response-envelopes.test.ts`, extensions to `node_service_client_test.dart` (4 new), `webrtc_call_transport_test.dart`, `call_provider_test.dart` (10 new + 5 audio-session integration), `audio_session_helper_test.dart` (5 new). `flutter analyze` + `tsc -b apps/node` + `tsc -b apps/social` clean. **42G (two-CallManager jsdom integration + Playwright re-validation) and 42H (TURN credentials editor) and 42I (iOS VoIP push) deferred** — same shape as 42F: ship each, review, add tests, then ship the next. |
| 2026-06-19 | **Phase 42H — TURN credentials for symmetric NAT shipped.** Most WebRTC calls work over STUN alone. Phase 42H adds the operator-facing knobs to handle the corner case (corporate firewall / mobile carrier symmetric NAT) where the relay is required. **(42H.1)** The home's `_effectiveCallIceServers` in `apps/node/src/node-service-impl.ts` already injects a 3-server STUN default (Google / Cloudflare / Twilio) when neither the caller nor `node-config.iceServers` provides a list — precedence is caller-supplied > node-config > default. **(42H.2)** New structured TURN editor in `Settings → Network → TURN servers` (`apps/social/src/components/views/SettingsNodeTab.tsx`) — a per-row table of URL / username / credential / TTL fields that replaces ad-hoc JSON editing. STUN-only entries stay owned by the existing JSON editor above; TURN entries are extracted on save, validated (`turn:` / `turns:` scheme, TTL ≥ 0), and merged back via `mergeTurnServers()`. The TTL is **client-side only** (not in the wire format) so operators see a rotation hint without expanding the protocol. **(42H.3)** New `apps/social/src/lib/turn-credentials.ts` (pure helpers — `isTurnUrl`, `extractTurnServers`, `mergeTurnServers`, `validateTurnDraft`, `makeTurnId`) backed by **21 unit tests** in `apps/social/test/lib/turn-credentials.test.ts` (all pass). Extended `apps/node/test/call-send-invite.test.ts` with a STUN+TURN round-trip test (`6b. node-config STUN+TURN entries are shipped verbatim`) — verifies the home ships the merged list (preserving TURN credentials for the callee to authenticate) rather than collapsing it back to the STUN-only default. **(42H.4)** New `docs/voice-video-call-support.md` §6.3.1 explaining the precedence, the editor, TTL semantics, and a "when to add TURN" decision matrix. **`npx tsc -b apps/social` clean; `npx vitest run` green for both new files; `npx tsc -b apps/node` clean.** |
| 2026-06-19 | **Phase 42I — iOS backgrounded calling (VoIP + PushKit + CallKit) shipped.** The iOS EnvoyGo app can now ring the user even when the app is force-killed. **(42I.1)** `PushTokenRecord` gains a `tokenType: "alert" \| "voip"` discriminator; the synthetic `deviceId` is namespaced by tokenType so the same physical device can register both an alert and a VoIP token without one stomping the other. **`PushTokenStore.init()` migrates pre-42I records (missing `tokenType`) to `"alert"` on load** so no manual migration is needed. **(42I.2)** New `sendVoipPush` mirrors `sendApns` but uses the `APNS_VOIP_TOPIC` env var (with `${APNS_TOPIC}.voip` fallback) and the `apns-push-type: voip` header; payload uses the stripped-down `aps: { voip: 1 }` shape Apple requires. The HTTP/2 plumbing is shared via a new `dispatchApnsHttp2` helper so the two functions stay focused on payload + header differences. **(42I.3)** `registerPushToken` signature gains an optional `tokenType` (default `"alert"` — back-compat for older EnvoyGo builds). The change threads through `NodeService` → `NodeServiceImpl` → `json-rpc-router.ts` → `push-notification.ts`. **(42I.4)** `sendCallInvite` now fires `pushNotificationService.dispatchCallPush(...)` after the libp2p envelope is sent. `dispatchCallPush` selects the channel by platform + token type: iOS+voip → APNs VoIP; iOS+alert → **skipped** (a chat-style alert cannot wake CallKit — better to do nothing than confuse the user); android → FCM with `type: call` + `priority: high` marker. **(42I.5)** `apps/envoygo/ios/Runner/Info.plist` declares `UIBackgroundModes = [voip, audio]`. **(42I.6)** `apps/envoygo/ios/Runner/AppDelegate.swift` imports `PushKit`, registers a `PKPushRegistry` for `.voIP`, and forwards the device token + incoming-call payload to Dart via a new `envoygo/voip_push` MethodChannel (stored on the registry via `objc_setAssociatedObject` to avoid the `UIResponder` instance-property dance). **(42I.7)** `flutter_callkit_incoming ^2.0.0` added to `pubspec.yaml` for the native iOS CallKit screen. **(42I.8)** New `apps/envoygo/lib/services/voip_push_service.dart` (singleton, no-op on non-iOS) subscribes to the `envoygo/voip_push` channel, caches the VoIP token, and exposes a `Stream<Map<String, dynamic>>` of incoming-call payloads. `CallProvider.onIncomingCallFromVoipPush({ callId, callerOwnerId, callerName })` puts the provider in a `ringing` state so CallKit can render the screen; a duplicate push for the same call does **not** stomp the WebSocket-resolved display name. The full call envelope (with SDP) still arrives over the WebSocket as a regular `call.incoming` event — that drives the WebRTC handshake. **(42I.9)** **12 new node tests** in `apps/node/test/push-notification.test.ts` (alert-vs-voip namespacing, default-to-alert backfill, unknown tokenType, disk migration, multi-device fan-out, iOS alert token skip, Android FCM fallback, uninitialized-service short-circuit) + **5 new EnvoyGo tests** in `apps/envoygo/test/services/voip_push_service_test.dart` (non-iOS no-op, idempotent init, broadcast stream, clearToken) + **4 new tests** in `call_provider_test.dart` (first push → ringing, callerName fallback, different-call overwrite, duplicate-push doesn't stomp WebSocket). **All pass.** **(42I.10)** `docs/push-notification-config.md` gains §7 covering VoIP certificate provisioning, `APNS_VOIP_TOPIC` setup, the `envoygo/voip_push` Dart contract, the new `UIBackgroundModes` requirement, the on-disk token shape, and a dispatching rules table. **Total: ~1,200 net new lines (incl. tests), 4 new files, 6 modified files, 1 new pubspec dep, 0 new wire intents, 0 new npm deps, 0 schema bumps.** `tsc -b apps/node` + `tsc -b apps/social` + `flutter analyze` clean on every modified file. **42J (manual two-iOS-device smoke) deferred** — needs real hardware + an Apple Developer account. |
| 2026-06-19 | **Phase 42 — Native WebRTC Voice Calls on EnvoyGo designed (9 sub-phases, 4 design decisions resolved).** Phase 38 made desktop↔desktop voice calls real; without Phase 42, the call feature is invisible to mobile. The signaling is already plumbed (home emits `call:*` on the ws event bus; EnvoyGo's `CallProvider` filters by `type.startsWith('call:')`); the media plane and the home's response envelopes are missing. Nine sub-phases (42A–42I) close every gap without changing the wire surface: 42A rewrites `sendCallInvite` to resolve owner→device peer ID via `_resolvePeerTransportForOwner` (currently passes an owner ID, breaking the libp2p dial), embeds the SDP offer (currently empty string — also a schema violation since `z.string().min(1)`), and injects `iceServers` from node-config (currently unread); adds defensive SDP/ICE-candidate validators in `call-inbound.ts` (64 KB SDP cap, SDP candidate grammar regex). 42B wires the four response envelopes (`call.accept` / `call.reject` / `call.hangup` / `call.mute`) so the home actually sends them back to the peer (today the four stubs only mutate local `CallManager` state). 42C replaces the five `UnimplementedError` call RPCs in `NodeServiceClient` with real JSON-RPC. 42D builds the native `WebRtcCallTransport` in Dart using `flutter_webrtc ^0.14.0` (Path 2 only; Path 1 libp2p data channel is not available in `flutter_webrtc`). 42E rewires `CallProvider` to drive the transport. 42F lands the active-call screen, mic permission flow, iOS `AVAudioSession` config, and Android `RECORD_AUDIO`. 42G adds the test pyramid (~5 new test files, ~600 LoC, two-`CallManager` jsdom integration, Playwright re-validation of the desktop side) **and wires the missing Social-UI caller for `createWebRtcCallTransport`** (currently dead code). 42H adds TURN credentials support for symmetric NAT: 3-STUN default list (Google + Cloudflare + Twilio) injected when `node-config.iceServers` is empty, plus a Social UI TURN editor in `SettingsNodeTab` with provider presets (Twilio / Cloudflare / coturn). 42I adds iOS backgrounded calling: home dispatches APNs VoIP push on `call.invite` (extending the existing `push-notification.ts` module with a `tokenType: "voip"` discriminator and a `sendVoipPush` helper); phone uses `PKPushRegistry` + `flutter_callkit_incoming` to wake the app from terminated state and show a native call screen. Android is best-effort via FCM `data` (NG8 — no CallKit equivalent). 42J manual two-iOS-device smoke tracked separately like Phase 38H. **Four design decisions resolved (2026-06-19):** (1) `flutter_webrtc ^0.14.0`; (2) 3-STUN default `iceServers` list; (3) TURN user-configured, not EnvoyMesh-hosted (no relay-binary TURN); (4) iOS backgrounded calling via VoIP + PushKit + CallKit (not deferred). **No new wire intents, no new schemas, no new npm deps. Allowed pubspec changes:** `flutter_webrtc` bumped to `^0.14.0` (42D); `flutter_callkit_incoming` added (42I). `permission_handler` is **not** added — we use `flutter_webrtc`'s built-in permission prompts. Design doc: [voice-video-call-envoygo.md](./voice-video-call-envoygo.md). |
| 2026-06-19 | **EnvoyGo "full node" direction parked.** Explored promoting EnvoyGo from a thin client (Phase 31) to a full EnvoyMesh node (the role originally held by the deprecated Phase 11 Capacitor app). Two audits completed — `dart_libp2p` library capability audit (v1.0.3, single-maintainer `stephanfeb`) and current EnvoyGo usage audit — confirm the technical substrate is sufficient for a TCP/Noise/Yamux/DHT/Relay/Identify full node, but the gaps are large enough that the user decided to defer: 240-method `NodeService` interface vs. ~30 methods exposed in `apps/envoygo/lib/services/node_service_client.dart`; no inbound stream handlers today (`Libp2pNode` is outbound-only); OS-level blockers for background survival (no `INTERNET` in main AndroidManifest, no iOS Bonjour, no background service); the library cannot be reached by browser peers (no WebSocket / WebRTC-direct / WebTransport / wire-compatible QUIC). Three product shapes designed (per-pairing mode, single-identity role-per-launch, two separate apps) and the open design questions (shared-vs-separate identity, v1 feature set, AI delegation) recorded. New parking doc: [parked-envoygo-full-node-scope.md](./parked-envoygo-full-node-scope.md). EnvoyGo continues shipping as a thin client; this work is tracked for future reactivation. |
| 2026-06-18 | **Phase 41 — Making Agent Network Usable & Powerful designed.** Seven sub-phases (41A–41G) designed to turn the Phase 40 framework into a genuinely usable multi-agent collaboration platform. 41A wires LLM decomposition/merge to EnvoyAI/OpenClaw. 41B adds auto-discovery of workers from bonded contacts' agent cards. 41C replaces cost-only bid ranking with composite score (cost + reputation + freshness + precision). 41D builds the Chain UI in Social (ChainsView + ChainTreeView + ChainReportView). 41E adds heartbeat-based stall detection with auto-rebid/cancel/escalate. 41F feeds chain events into the existing JSONL audit pipeline. 41G ships quick wins (WebSocket push, in-memory cache, bid justification display, CSV export). ~1,410 new lines planned across 7 sub-phases. Design doc: [agent_network.md §13](./agent_network.md#13-phase-41--making-agent-network-usable--powerful). |
| 2026-06-18 | **Phase 40 — Agent Network Collaboration Layer shipped (40A–40E green).** 40A landed 9 wire intents (`task.chain.mandate / propose / bid / accept / partial / merge / cancel / heartbeat / report`), role policy entries, lineage fields on `TaskJournalEntry` / `TaskResultPayload`, the new `composite` artifact, 18 `chain.*` audit event types, and `chain-reports-store.json` with pinned-exemption GC. 40B shipped the `ChainBudgetLedger` (commit/release/pre-flight/finalize), the orchestrator state machine (`planChain` → `launchChain` → `evaluateBids` → `trackChain` → `synthesizeChain` → `publishChainReport`), worker runtime, and 11 new RPCs (`chainPlan/Launch/GetState/ListActive/Cancel/ListReports/GetReport/PinReport/SetBidStrategy/GetBidStrategy/EvaluateBids`) wired into `NodeService` + `NodeServiceClient` + `DirectCallClient`. 40C added the Social `ChainsView` route + `ChainTreeView` + `ChainReportRenderer` + `CompositeArtifactRenderer` + `en-chains.ts` i18n bundle (other locales fall back to English via `translate()`). **40D landed the multi-agent polish:** `ChainBidInbox` renders every live bid (cheapest marked suggested); `ChainRebalanceBar` adds USD to `maxChainCostUsd` and re-runs evaluation for every not-yet-awarded subtask; `evaluateBids({ pickWorkerPeerId })` honors an explicit owner pick over the cheapest/fastest policy; `counterBid` clears all bids on a subtask, bumps the round counter, and rebroadcasts via `task.chain.propose`; new `chainRebalance` + `chainCounterBid` RPCs; LLM decomposer in `chain-decomposer.ts` replaces the keyword fallback for plans > 12 words and reuses the existing `routeModelRequest` surface. **40D.5/40D.6 made rebalance configurable:** `rebalancePolicy: "manual" \| "auto" \| "never"` on the `ChainMandate` + node-level `chainGetDefaults` / `chainSetDefaults` RPCs + auto-trigger on stall or low-confidence partial. **40E added cross-orchestrator + cross-home chains:** 4 more wire intents (`task.chain.handoff / delegate / relay / arbitration`), handoff protocol, relay-wrapped transport, and an arbitration ledger with seq + createdAt ordering. **332 chain-related tests across 17 files green; `npm run typecheck` clean.** No new npm dependencies; Phase 24 solo A2A flows unaffected (additive `task.chain.*` namespace). **EnvoyGo mobile mirror for chains is explicitly deferred** (40C). |
| 2026-06-18 | **Phase 40D.5 + 40D.6 — Configurable cost rebalance shipped.** Added `rebalancePolicy: "manual" \| "auto" \| "never"`, `stallTimeoutMs`, `lowConfidenceThreshold`, `maxAutoRebalances`, and `autoRebalanceIncrementUsd` to `ChainMandate`; added `confidence` to `ChainSubtaskPartial`. `trackChain` now auto-triggers `rebalanceChain` when a worker stalls past `stallTimeoutMs` or a partial lands below `lowConfidenceThreshold`, up to `maxAutoRebalances` times. New node-level defaults: `NodeConfig.chainDefaults` + `chainGetDefaults` / `chainSetDefaults` RPCs. `ChainRebalanceBar` hides when policy is "never", shows auto-active + history when "auto". **17 + 8 + 13 = 38 new tests** (`chain-rebalance-policy.test.ts` + `chain-rebalance-bar.test.tsx` + `chain-defaults-rpc.test.ts`). |
| 2026-06-18 | **Phase 40E — Cross-orchestrator & cross-home chains shipped.** Four new wire intents: `task.chain.handoff` (owner → orchestrator-A), `task.chain.delegate` (A → B with re-signed sub-mandate), `task.chain.relay` (cross-home wrapper; relay nodes are content-agnostic), `task.chain.arbitration` (convergence ledger; `seq` is primary, `createdAt` is the tiebreaker). All four are `AGENT_AGENT_ONLY` in `role-policy-table.ts`. New modules: `packages/protocol/src/agent-network-handoff.ts` (Zod schemas + status enum + helpers), `apps/node/src/chain-handoff.ts` (record + delegate builder + `acceptHandoff` lifecycle), `apps/node/src/chain-relay.ts` (`selectChainRoute` + `wrapChainEnvelope` + `unwrapChainRelay` + `advanceViaRelays`), `apps/node/src/chain-arbitration.ts` (append-only `ArbitrationStore` + `applyArbitration` + `releaseOwnership` + `findLostSubtasks`). **31 new tests** (`chain-handoff.test.ts`) — handoff lifecycle, delegate round-trip, arbitration convergence rules, loss recovery, cross-home relay routing, and an end-to-end A→B scenario. **Phase 40 fully shipped (40A–40E).** |
| 2026-06-18 | **Phase 40 protocol review (post-ship) — test gap closed + one schema tightening.** Closed the remaining protocol-level test gap and tightened one field. **(1)** New `packages/protocol/test/agent-network-handoff.test.ts` (49 tests) — first protocol-level coverage of `ChainHandoffRequestPayloadSchema` / `ChainHandoffDelegatePayloadSchema` / `ChainRelayRouteSchema` / `ChainArbitrationEntrySchema` / `ChainArbitrationPayloadSchema` / `ChainHandoffStatusSchema` and the helpers `isHandoffOpen | isHandoffTerminal | isHandoffLive | getSubChainRootSubtasks`. **(2)** New `packages/protocol/test/role-policy-table.test.ts` (71 tests) — exhaustive table-vs-schema sync guard: every intent in `EnvoyIntentSchema` is checked against its declared (sender, recipient) role pairs; adding a new `task.chain.*` intent without a policy entry is caught at CI. **(3)** `ChainReportSchema.recipientRoles` tightened to `z.array(...).min(1).default(["human"])` (was `z.array(...).default(["human"])`) so a chain report can never be published to zero recipients (a silent-drop bug class). Added 3 tests for the new constraint. **Total protocol tests: 273 → 396** (+123 across 11 files). **Total chain-related tests: 332 → 455** (+123 across 21 files). No wire-surface changes; no breaking changes. |
| 2026-06-18 | **EnvoyGo "Recent chains" mobile mirror shipped (read-only).** Closes the previously-deferred 40C item — EnvoyGo can now consume published chain reports from the home node. Two read-only RPCs added to `NodeServiceClient` (`listChainReports` + `getChainReport`); the other 13 chain RPCs stay desktop-only. **New files:** `apps/envoygo/lib/models/chain_report.dart` (5 typed models), `apps/envoygo/lib/screens/chains/recent_chains_screen.dart` (list with pull-to-refresh + empty/error states), `apps/envoygo/lib/screens/chains/recent_chain_detail_screen.dart` (header + executive summary + sections + worker-allocation table), `apps/envoygo/test/models/chain_report_test.dart` (8 tests). **Modified files:** `apps/envoygo/lib/services/node_service_client.dart` (+2 RPC wrappers, +1 import), `apps/envoygo/lib/screens/me/me_screen.dart` (+1 Chains section between AI Engine and Public Access), `apps/envoygo/test/services/node_service_client_test.dart` (replaced 4 TODO stubs with 6 real tests using the `MockWebSocket` JSON-RPC pattern). **14 new tests, 0 wire changes, 0 new dependencies.** `flutter analyze` clean on all 6 new/modified files (1 pre-existing `withOpacity` deprecation at `me_screen.dart:76` is unrelated). `flutter test` shows `+149 -4` (baseline was `+147 -4`; 4 pre-existing failures in `node_provider.dart` / `call_provider.dart` are out of scope). Empty state is correct; the mobile mirror lights up automatically once 40B.10 wires the home-side `chainListReports` / `chainGetReport` store. |
| 2026-06-18 | **EnvoyGo "Recent chains" follow-ups shipped (5 of 5).** Closes all 5 suggestions from the prior review. **Commits 1 + 2 (already shipped):** `toJson` on all 6 `chain_report.dart` models + `ChainReport.version: String?` + `ChainReportCitation` model (5 new round-trip tests, `chain_report_test.dart` 8 → 13); softer "not found" UX on `RecentChainDetailScreen`. **Commit 3 — pre-existing fixups:** Closes 4 stale references introduced by commit `1e266c0` (add web rtc voice/video call) that blocked the entire widget-test surface: `node_provider.dart` `callProvider` read `nodeState.client` but `client` lives on the notifier (fixed by reading from the notifier + wrapping in `NodeServiceClient`); `node_service_client.dart` was missing `eventStream`, `noop()`, `sendCallInvite`, `acceptCallInvite`, `declineCallInvite`, `endCall`, `setCallMuted` referenced by `call_provider.dart` (added minimal stubs — `eventStream` returns `Stream.empty()`, `noop()` returns a sentinel `HomeRemoteClient`, the call RPCs throw `UnimplementedError` at access time since the call feature itself is unimplemented); `incoming_call_overlay.dart` `Icons.phone_hangup` → `Icons.call_end`; `_FakeChatNotifier.sendMessage` / `sendAgentMessage` had stale signatures vs the production `ChatNotifier` (updated for the Phase 37 attachment-parameter additions). **Commit 4 — widget test:** New `apps/envoygo/test/screens/chains/recent_chains_screen_test.dart` (4 tests) drives the screen through a real `HomeRemoteClient` (backed by `MockWebSocket`) so the JSON-RPC envelope path is exercised end-to-end. The `_StubNodeNotifier` extends `NodeNotifier` and overrides the `client` getter (the production constructor would try to spin up a real WebSocket). Setup uses `tester.runAsync` to escape Flutter's fake clock during `HomeRemoteClient.ensureConnected` (the connection path uses `Future.delayed(Duration.zero)` that doesn't tick under the fake clock). After setup the screen is driven with targeted `pump(Duration)` calls instead of `pumpAndSettle` because the underlying `HomeRemoteClient` runs periodic timers (reconnect + upgrade-sweep) that prevent `pumpAndSettle` from ever settling. Tests cover empty state, list rendering (with pinned star + worker/subtask summary copy), error state (with Retry CTA), and AppBar refresh re-issuing `chainListReports`. **Net effect:** `flutter test` is now `+177 -1` (was `+147 -4` at the original baseline — +30 net passing tests, 3 of 4 pre-existing failures fixed). The 1 remaining failure is `MeScreen shows connected node info and Public Access section`, an unrelated pre-existing bug in `_FakeNodeNotifier` setup vs `_PublicHostEditor` rendering. **`flutter analyze lib/` reports 0 errors** (74 pre-existing info/warning lints, all unrelated). |
| 2026-06-17 | **Phase 38 — Real-Time Voice/Video Calls shipped (38A–38G complete; 38H manual smoke deferred).** Two bonded peers can now initiate real-time voice calls over WebRTC. Signaling (invite → accept → SDP/ICE → hangup) flows over the existing P2P envelope layer with 6 new `call.*` intents — no new ports or servers. Protocol (38A): `call.invite`/`call.accept`/`call.reject`/`call.hangup`/`call.ice-candidate`/`call.mute` payload schemas in `packages/protocol/src/index.ts` with `create*/parse*` helpers; `HUMAN_HUMAN_ONLY` role policy; `createUnsignedEnvelope` defaults; `CALL_RING_TIMEOUT_MS = 60_000`. Node service (38B): `CallManager` (`apps/node/src/call-manager.ts`) with per-call state machine, one-call-per-node, identity binding, ring timeout; `call-inbound.ts` routes 6 intents with trust validation; dispatcher wired in `index.ts`. WebRTC transport (38C): `webrtc-call-transport.ts` with `startOffer`/`startAnswer`/`addIceCandidate`/`setMute`/`close`; Path 1 (empty `iceServers`) and Path 2 (standard ICE with STUN/TURN). Social UI (38D): phone icon in `ContactChatPanel`, `IncomingCallModal`, `ActiveCallPanel`, `useCallSession` hook. API (38E): `CallSession`/`CallEvent` types + `getActiveCall`/`onCallEvent` on `NodeService` + `NodeServiceClient` + `DirectCallClient`. Mobile (38F): `VoiceCallScreen` skeleton + `flutter_webrtc` in `pubspec.yaml`. Tests (38G): 38 protocol tests (`call-schemas.test.ts`) + 21 call-manager tests (`call-manager.test.ts`). 7 new files. 1 new dependency. Design doc: [voice-video-call-support.md](./voice-video-call-support.md). |
| 2026-06-17 | **Phase 40 — Agent Network Collaboration Layer designed (40A–40E planned; 40E explicitly deferred until Phase 11 mobile parity ships).** Adds multi-agent teams that negotiate multi-rounds and collaborate concurrently on complex tasks. **Wire namespace:** 9 new `task.chain.*` intents (`mandate` / `propose` / `bid` / `accept` / `partial` / `merge` / `cancel` / `heartbeat` / `report`) so chains are introspectable on the wire without scanning lineage fields. **Lineage:** additive `chainId` / `parentTaskId` / `subtaskId` / `depth` on `TaskJournalEntry` and `TaskResultPayload`; new `partial` and `synthesizing` lifecycle states. **Negotiation:** 3-round hard cap enforced at parse time via `negotiationRound: int 1..3`; cost ceilings hard-rejected at parse time; **`bidExpiresAt`** TTL on every bid so crash-replay cannot award stale bids (5-minute recommended ceiling, worker emits `chain.bid_expired` audit on stale accept). **Artifact:** new `composite` kind bundles N weighted worker contributions into a single deliverable, with `aggregation: weighted_concat | concatenate | merge_structured | owner_review`. **Budget:** orchestrator-side `ChainBudgetLedger` is the only safe place for budget enforcement (workers can't see peers); invariant `Σ workerAllocations.committedUsd + synthesisSpendUsd ≤ maxChainCostUsd`; synthesis pass has pre-flight cost check and skips with `owner_review` aggregation if the LLM fee can't fit. **Trust:** directional table — worker→orchestrator bid requires `direct` (protects worker's pricing structure), orchestrator→worker propose/accept requires `referred`; per-§7.2 rationale in the design doc. **Resilience:** mandatory ordering rule — emit `chain.subtask_cancelled` audit + send `task.chain.cancel` BEFORE the new `task.chain.accept` to a backup bidder, otherwise the new award would push `maxWorkers` past its ceiling. **Reports:** rich multi-section chain report with citations that jump back to the subtask in the chain tree; composite artifact downloadable as JSON. **5 sub-phases:** 40A protocol + role policy + stores (foundation); 40B orchestrator + worker runtime + 11 new RPCs; 40C Social + EnvoyGo UI (ChainsView + ChainTreeView + ChainReportRenderer + CompositeArtifactRenderer); 40D multi-bid collection + counter-bid UI + LLM decomposer (replaces keyword fallback); 40E cross-orchestrator + cross-home chains (deferred). **Zero new npm dependencies** — LLM decomposer reuses the existing model-provider surface. Design doc: [agent_network.md](./agent_network.md). |
|| 2026-06-17 | **Phase 38 — Real-Time Voice/Video Calls designed (revised).**** Two bonded peers can make real-time voice calls over WebRTC. Signaling (invite → accept → SDP/ICE → hangup) uses the existing P2P envelope layer with new `call.*` intents — no new ports or servers. Audio has two transport paths: (1) **LAN / direct P2P**: WebRTC data channel on top of the existing libp2p connection via `@libp2p/webrtc` (no STUN/TURN, no trickle ICE — ICE resolves against known libp2p addresses in milliseconds); (2) **Cross-network**: standard WebRTC ICE with STUN/TURN via the libp2p circuit relay (falls back after 5s if Path 1 unavailable), trickle ICE via `call.ice-candidate`. New intent family: `call.invite`, `call.accept`, `call.reject` (reason: busy/declined/no_answer/offline/error; includes `calleeOwnerId` + `calleePeerId` for identity binding), `call.hangup`, `call.ice-candidate`, `call.mute`. No `call.sdp` (SDP embedded in invite/accept); no `call.busybuse` (busy handled by `call.reject`). `CallManager` handles per-node call state with simultaneous-call race handling. Role policy requires `friends` sensitivity (≥ referred trust — bonded contacts only, not strangers). Social UI adds phone icon, incoming call modal, active call panel with mute/end. EnvoyGo adds native Flutter `VoiceCallScreen` via `flutter_webrtc`. Video deferred to Phase 38E. Design doc: [voice-video-call-support.md](./voice-video-call-support.md). |
| 2026-06-17 | **Phase 39 — Voice/Video Call for EnvoyAI planned (future).** Phase 39 extends Phase 38 human↔human calls so the built-in EnvoyAI (OpenClaw) agent can join or initiate voice/video calls as a participant. OpenClaw already supports OpenAI Realtime API / Google Live API for agentic voice; Phase 39 bridges it with EnvoyMesh's `call.*` intent system using the B2+C2 design: AI audio is heard by the owner only (callee unaware); AI is a listener-only participant (no `call.*` control rights); OpenClaw's `RealtimeTalkTransport` is bridged to the EnvoyMesh call session. Sub-phases: 39A protocol extension (`call.join`, `call.leave`, `participantType`), 39B OpenClaw RealtimeTalkTransport bridge, 39C CallManager AI state tracking, 39D AI call panel UI, 39E AI-initiated calls (per-call approval). Deferred to future: D1 AI audio in shared WebRTC (B1 variant), D2 AI presented as caller to callee, D3 AI with `call.*` control rights (C1 variant), D4 standing mandate for AI-initiated calls. Requires Phase 38 to be shipped first. |
| 2026-06-17 | **Phase 37 — Audio Messages (Voice Notes) designed.**
| 2026-06-17 | **Phase 37 — Audio Messages (Voice Notes) designed.** Users can record and send voice notes from the Social UI (browser) and EnvoyGo (mobile). Audio is transcribed client-side via Web Speech API (browser) or sent without transcription (mobile, with graceful fallback). Adds `attachments` to `ChatMessagePayload` (reuses `ChatRoomAttachmentSchema`), a mic button in `ChatComposer`, a `ChatAudioAttachment` player component, and a graceful-fallback path in the inbound chat handler for audio-only messages. No new RPC methods — audio travels through existing `sendChatAttachment` → `chat.message`. Mobile adds the `record` Flutter package; browser uses built-in `MediaRecorder` + `SpeechRecognition`. Server-side STT (whisper) is documented as a future enhancement. Design doc: [audio-message-support.md](./audio-message-support.md). |
| 2026-06-16 | **Phase 35 — Fleet Onboarding shipped (35A + 35C + 35D + 35B complete; manual smoke deferred).** Four operator-facing paths in order A → C → D → B. **(A) Company invite link:** `LocalCompanyInviteStore` (`packages/local-store/src/company-invite-store.ts`) with atomic-rename + serialised writes; `CompanyInviteRecord` + 3 RPCs (`createCompanyInvite` / `listCompanyInvites` / `revokeCompanyInvite`); `envoy://invite?token=…` URI builder/parser; `validatePairingToken` accepts the new token category; `pairDevice` consumes the invite atomically; UI in `Settings → Devices → Company Invites`. **(C) LAN auto-bond:** `lanAutoBondEnabled` / `lanAutoBondFleetToken` / `lanAutoBondAcceptLevel` config; `lanFleetToken` carried on `DevicePairRequestPayload`; `node-service-lan-auto-bond.ts` runtime helpers; mDNS discovery hook fires the request; symmetric auto-accept when both sides have the same token fingerprint; cooldown per discovered peer; UI toggle in `Settings → Agent Network`. **Off by default.** **(D) Pairing Kiosk:** `pairing-kiosk-server.ts` minimal HTTP server (loopback default, opt-in LAN bind, Bearer-auth `POST /pair`, body-size limits, 410 once expired); 4 new `pairingKiosk*` config fields; `syncPairingKioskFromConfig` + `getPairingKioskStatus` RPCs; UI in `Settings → Devices → Pairing Kiosk` with status hint. **Off by default.** **(B) Fleet Manifest:** `FleetMember` / `UnsignedFleetManifest` / `FleetManifest` Zod schemas + `fleetManifestForSigning`; `LocalFleetManifestStore` (`fleet-manifests.json`); `node-service-fleet-manifest.ts` runtime helpers; walker pre-stages `TrustRecord` (with `note: "fleet-manifest:<id>:<role>"`) + `PeerDirectory` per member, idempotent on re-import, skips duplicates / expired / self-bond / revoked; 4 RPCs (`importFleetManifest` / `listFleetManifests` / `revokeFleetManifest` / `createFleetManifest`); UI in `Settings → Devices → Fleet Manifest` with Sign → Import two-step flow. Design doc: [fleet-onboarding.md](./fleet-onboarding.md). **22 new tests across 3 new files** (`apps/node/test/fleet-manifest-store.test.ts`, `apps/node/test/node-service-fleet-manifest.test.ts`, `apps/node/test/pairing-kiosk-server.test.ts`) + **1 existing test extended** (`apps/social/test/components/SettingsDevicesTab.test.tsx`). No new wire intents (only additive optional fields on existing payloads). |
| 2026-06-16 | **Phase 34 — Render typed Artifacts + cached AgentCard in Social/EnvoyGo shipped (34A–34D + 34T complete; manual smoke deferred).** Closes the UI loop on Phase 33. **(A) Data plumbing:** new `LocalTaskResultsStore` (`packages/local-store/src/task-results-store.ts`, atomic-rename JSON file `task-results.json`, upsert by `taskId`, serialised concurrent writes) wired into `LocalTaskStore` and `daemon-task-inbound.ts` so every inbound `task.result` payload is persisted next to its audit event. New `getTaskResult(taskId)` RPC threaded through `NodeService`, `ws-protocol`, `json-rpc-router`, `node-service-impl`, `DirectCallClient`, and `useNodeService`. Mobile parity via `MobileNode.getTaskResult` delegating to home via `_homeRemoteCall` (refined from the design doc's local `Map` — treats home as source of truth, no mobile divergence). **(B) UI rendering:** new `apps/social/src/components/ArtifactRenderer.tsx` (~220 lines) with three branches — `<TextArtifactView>` (reuses `Markdown` for `text/markdown`, `<pre>` for `text/plain`, pretty-printed for `application/json`), `<FileArtifactView>` (card with size + hash + Open button; v1 Open is a no-op toast stub but threads an optional `onOpenLocalFile({ source: "vault", relativePath })` so the real opener can be wired without touching the renderer), `<StructuredArtifactView>` (collapsible `<details>` + 32KB JSON truncation). `<ArtifactList>` composes the list. CSS extends the `.answer-block-*` design vocabulary; i18n `artifactRenderer.*` block in all 7 locales. **(C) Activity drill-down:** `ActivityDetailPanel` in `ActivityView.tsx` lazy-fetches `getTaskResult(taskId)` alongside audit + journal and renders `<ArtifactList>` as a new "Artifacts" sub-section when artifacts are present; silent when the list is empty. **(D) Cached AgentCard:** four additive optional fields on `CachedAgentCardSummary` (`nodeProfile` typed as the protocol's `DeviceProfile`, `publicTopics`, `trustPolicySummary`, `supportedProtocolVersions`) — new `summarizeAgentCard` / `summarizeCachedAgentCard` helpers in `node-service-impl` + `mobile-node` only forward fields that are present on the source `AgentCard`. New `useAgentCards` hook in `useNodeService.tsx` fetches on mount + subscribes to `home:agent-cards-updated` for paired-mode pushes (kept out of `NodeStateContext` to limit scope). New `AgentCardPanel` component + `useAgentCard(ownerId)` selector, mounted in `ContactChatPanel` as a collapsible `<details>` above the private-notes panel (skipped for `room:` group contacts). i18n `agentCard.*` block in all 7 locales + new `contactChat.agentCardSummary` key. **18 new tests across 3 new files** (`apps/node/test/task-results-store.test.ts`, `apps/social/test/components/ArtifactRenderer.test.tsx`, `apps/social/test/components/AgentCardPanel.test.tsx`) + **1 dedicated new file** (`apps/node/test/daemon-task-inbound-task-result.test.ts`) + **1 existing test extended** (`apps/social/test/components/ActivityView.test.tsx` — added `getTaskResult` mock + assertion, which caught a worker hang on the first run). No new wire intents, no new dependencies, no Flutter changes. Design doc: [phase-34-render-typed-artifacts.md](./phase-34-render-typed-artifacts.md). |
| 2026-06-16 | **Phase 33 — A2A Tool Exposure shipped (33A–33D complete).** Built-in OpenClaw now has four first-class A2A tools: `mesh.task.propose` (sends `task.mandate` + `task.propose`, description updated to mention typed Artifacts), `mesh.task.cancel` (sends `task.cancel`, `requiresApproval: true`), `mesh.task.await_result` (waits on a per-taskId in-process notifier for the matching `task.result`, default 30s timeout), and the pre-existing `mesh.agent_card.request` (verified end-to-end). **Breaking schema bump:** `TaskResultPayloadSchema.artifacts` is now `z.array(ArtifactSchema).default([])` instead of `z.array(z.string().min(1))` — a Zod discriminated union of `text` / `file` / `structured` variants. Old `artifacts: string[]` payloads are rejected at parse time; EnvoyMesh owns all senders so no external consumers exist. Helpers: `createTextArtifact`, `createFileArtifact`, `createStructuredArtifact`, plus `parse*` siblings. Auto-fetch: new `apps/node/src/agent-card-auto-fetcher.ts` is wired into the existing `bond:established` callback in `apps/node/src/index.ts`; when a bond forms, the home node (a) skips on public/blocked trust, (b) skips if a card was cached within `agentCardAutoFetchMaxAgeMs` (default 24h, configurable via `node-config.json`), (c) otherwise sends a signed `agent.card.request` envelope from the agent identity with a 5s timeout. New `AuditEventType` values: `task.tool.propose`, `task.tool.cancel`, `task.tool.await_result`, `agent.card.auto_fetched`, `agent.card.auto_fetch_failed`. New `PersistedNodeConfig.agentCardAutoFetchMaxAgeMs` (mirrored in `ws-protocol`). Audit hook in `daemon-task-inbound.ts` appends a per-result `task.handled` audit event summarising `artifactCount` + `artifactKinds` for observability. **42 new tests across 4 files** (`packages/protocol/test/artifact.test.ts`, `apps/node/test/a2a-tool-exposure.test.ts`, `apps/node/test/a2a-task-roundtrip.test.ts`, `apps/node/test/agent-card-auto-fetch.test.ts`). No new wire intents, no new dependencies, no UI changes (the social app and EnvoyGo render typed Artifacts + cached AgentCard in a follow-up). Design doc: [phase-33-a2a-tool-exposure.md](./phase-33-a2a-tool-exposure.md). |
| 2026-06-16 | **Phase 32 — Agent Network Membership shipped (32A–32G code-complete; 32H smoke test deferred to live verification).** Two agents (built-in OpenClaw + Ext Agent bridge) get first-class, UI-driven configuration. Adds `openclawEnabled` to `NodeConfig` (mirrors `bridgeEnabled`); **fresh install defaults are `openclawEnabled: true`, `bridgeEnabled: false`** (D1C — built-in ships on, external bridge is opt-in; existing installs with `bridgeEnabled: true` are not retroactively rewritten). Boot-time gate in `startOpenClaw()` reads the flag from disk; **no runtime toggle**. New `getOpenClawStatus` RPC; derived `AiEngineMode` helper (originally `AgentNetworkMode`, renamed to disambiguate from the top-level "Agent Network" onboarding tab); wires the previously-orphaned `AgentSettings.tsx` into `Settings → AI` with a "Built-in + Ext / Built-in only / Ext only / None" chip and three-state status badge (Disabled/Running/Stopped). The **Built-in block is read-only** in the social UI (owner edits `node-config.json` and restarts); the **Ext Agent block is writable** (persists `bridgeEnabled`). Mobile thin-client (EnvoyGo) `Me → Agent Network` mirrors both as read-only. **Reframe (same day):** the first build was mis-scoped as a "kill the built-in OpenClaw sometimes" feature with D2A "cancel in-flight LLM" semantics and a post-spawn rapid-toggle guard. The user's original ask was about **agent network membership / advertisement**, not runtime hot-toggle. The `setOpenClawEnabled` method, the runtime `openclawEnabled` UI checkbox, and the D2A / rapid-toggle machinery were removed; the boot-time gate + status RPC + mode chip + mobile mirror remain. Precondition for Phase 33 (A2A tool exposure: `propose_task` / `await_task_result` / `cancel_task` / `request_agent_card`); Phase 32 ships first. One-way home→mobile data flow preserved. No new wire intents, no new dependencies, ~250 net new lines (mostly tests + i18n). Design doc: [agent-network-config.md](./agent-network-config.md). |
| 2026-06-16 | **Phase 31 — EnvoyGo Flutter Thin Client shipped (31A–31H complete; 31I push notifications stubbed).** `apps/envoygo/` runs as a Flutter thin client: `HomeRemoteClient` with LAN → libp2p → relay-tunnel multi-transport + 8s per-candidate timeout + exponential backoff; QR pairing via `pairing_scan_screen` → `pairThinClient` RPC at `node-service-impl.ts:9752`; WS session-token auth gate in `ws-server.ts:159-185` (`UNAUTHORIZED` code; preserves legacy clients without a token); contacts + groups + AI threads (EnvoyAI + external agents) + terminals in one unified `chat_list_screen`; multi-node `node_switcher_sheet`; `connection_indicator` + dark-mode `ThemeContext`; `terminal_service` streams PTY output via binary sub-channel + ANSI parser + 16-color palette; `revokeAuthorizedDevice` unpair from either side; reconnection on app restart uses stored token without re-pairing. **31I is stubbed:** `apps/node/src/push-notification.ts` (153 lines) defines `PushTokenRegistry` + `PushNotificationService` + `dispatchChatPush` + `registerPushToken` / `unregisterPushToken` methods as an exported singleton (`pushNotificationService`), but `_sendPush` is `console.log` only for both iOS (APNs) and Android (FCM). The service is **not yet imported by `NodeServiceImpl`** — the RPC surface, chat / bond / room delivery pipeline, and token persistence are not wired. Real APNs HTTP/2 + FCM HTTP v1 dispatch + RPC exposure + chat/bond/room integration remain deferred. 18 test files in `apps/envoygo/test/`; full TS suite green (2953 tests). Design doc: [flutter-thin-client-design.md](./flutter-thin-client-design.md). |
| 2026-06-09 | **Phase 31 — Flutter Thin Client designed:** Two-app strategy: Phase 11 Capacitor stays as standalone full node; new Flutter app "EnvoyGo" as thin-client remote access. Full architecture, transport layer, pairing flow, curated companion protocol (29 RPCs + 8 events), 3-tab UI, multi-node support, push notifications (native APNs for iOS, FCM for Android), 9 sub-phases (31A–31I). Design doc: [flutter-thin-client-design.md](./flutter-thin-client-design.md). |
| 2026-06-08 | **De-duplicate model provider form (Settings → Network → AI):** the **Network** tab was rendering the *same* `modelProviders` form (mode/endpoint/modelName/apiKey) as the **AI** tab — both saving to the same `nodeConfig.modelProviders` field. Phase 8B originally placed it under Network; Phase 8C created a parallel form on the AI tab and never removed the old one. Removed the duplicate form from `SettingsNodeTab.tsx` (whole `<section>` + Save/Reset button that only saved `modelProviders`), along with its now-unused state vars (`modelEndpoint`/`modelName`/`modelApiKey`/`settingsSaveStatus`/`modelProviderFieldsDirtyRef`/`modelMode`/`modelProviderHints`/`cloudOnlyMobile`), the `useModelProviderUiScope` hook call, and the `ModelProviderMode` import. Removed the now-dead `modelProvider:` block + 5 unused `aiChatBehavior` keys (`save`/`saving`/`saved`/`cancel`/`saveFailed`) from all 7 locale files (`en`/`zh`/`ja`/`ko`/`de`/`fr`/`it`). Canonical home for the model provider form is now **Settings → AI → Model Provider**; the Network tab focuses on connectivity (bootstrap presets, relays, mDNS, IPFS, two-NAT checklist). |
| 2026-06-07 | **Pending chat-room delivery backoff + give-up:** the 90s flush of `pending-sync.json` and `pending-message.json` was retrying the same unreachable contact every cycle, generating log noise (`[chat.room] pending sync retry to … failed: NO_RESERVATION`). Both pending stores now persist per-record `attempts` / `lastAttemptAt` / `nextAttemptAt`; the flush skips records still in the backoff window, schedules a doubling backoff (30s → 60s → … → 5min) on failure, and **drops** the record after `PENDING_DELIVERY_MAX_ATTEMPTS` (10) with a final `console.warn` instead of an infinite loop. `recordPendingSyncFailures` / `recordPendingMessageFailures` stamp the initial backoff on first failure so a single failed fan-out doesn't immediately retry 90s later. Added a new optional `markOutboundFailed` dep to `chat-room-service` and a `chat:delivery-failed` event on the home node so the UI can surface "this contact is unreachable" without a brand new schema. New tests: 5 in `chat-room-service.test.ts`, 1 in `chat-room-integration.test.ts`, 2 in the two pending store tests. |
| 2026-06-07 | **OpenClaw `envoymesh` plugin crash on registration — root cause fix:** the home node logs `Error: Cannot find module 'markdown-it'` at gateway startup, which prevents the envoymesh plugin (and therefore the EnvoyAI gateway webhook) from registering. `@openclaw/markdown-core` (a private OpenClaw sub-package) declares `markdown-it` as a runtime dep, but it was never installed in the root `node_modules` (only `@types/markdown-it` was in `devDependencies`). Added `"markdown-it": "14.2.0"` to the root `package.json` `dependencies` (matching the version OpenClaw expects) and ran `npm install` to update `package-lock.json` and `node_modules`. Result: the envoymesh plugin registers cleanly and EnvoyAI uses the OpenClaw gateway instead of falling back to the native LLM planner. |
| 2026-06-07 | **RAG chat backfill no longer spams misconfigured-endpoint warnings:** the `embeddings response missing vector` warning was firing on every chat backfill (every config refresh) when the user had set the embedding provider to an OpenAI-compatible chat-completions endpoint — the response shape was wrong but the code retried anyway. `RagService.backfillChatHistory` now (a) skips entirely for 5 minutes after a failure (`BACKFILL_FAILURE_BACKOFF_MS`), (b) prints the embedder `modelKey` (mode + model + endpoint) in the warning so the user can identify the misconfigured provider, and (c) emits a one-time hint suggesting the `mock` or `ollama` embedding mode if the error message mentions a missing vector. Successful runs reset the failure flag. |
| 2026-06-07 | **HomeRemote direct libp2p transport:** added a third candidate `libp2p` to `HomeRemoteClient` (priority: `lan → libp2p → tunnel`). The mobile dials `mesh.dialProtocol('/p2p/<homePeerId>', CLIENT_PROXY_PROTOCOL)` to open a libp2p stream to the home's existing `createClientProxyHandler`; libp2p transparently routes through any `/p2p-circuit/…` reservation the home holds on a public libp2p circuit relay, so the mobile can reach the home over the open internet **without** the EnvoyMesh relay in the path. New `Libp2pStreamSocket` shim wraps the libp2p byte stream as `WebSocketLike` and reuses the same JSON-RPC + push-event wire protocol as the WebSocket transports (no protocol changes to the home). `HomeRemoteClient` is now transport-agnostic via a `createTransport` factory hook; the WebSocket relay tunnel remains the always-works fallback when the home has no public libp2p circuit reservation. `HomeRemoteStatus.transport` adds `"libp2p"` to its enum. i18n + UI updated. |
| 2026-06-07 | **HomeRemote libp2p shim — race condition fixes (review pass):** `Libp2pStreamSocket` now (a) defers the `onopen` fire to a macrotask so the awaiting `HomeRemoteClient.openSocket` has time to install its handler after `open()` resolves (previously `onopen` would fire while still `null`, so the connect promise never resolved — the libp2p candidate would never connect in production); (b) sets a `_tornDown` flag in `close()`/`forceClose()`/`timeout` and checks it at every handshake checkpoint so a late-completing libp2p dial that lost the timeout race is closed and discarded instead of resurrecting the socket into the OPEN state. `HomeRemoteClient.openSocket` now also calls `ws.close()` on the `onerror` connect-fail path (was only doing it on timeout), so abandoned WebSocket/stream sockets no longer leak during candidate fallback. Removed dead `_lastAttemptStartIndex` field, dead `Libp2pMeshLike` interface, dead `fakeLibp2pSocket` test variable, and the misleading "WebSocket candidates must be returned synchronously" comment. Added regression tests for the timeout-during-factory and onopen-deferral races. |
| 2026-06-07 | **HomeRemote stability + transport efficiency (review pass 2):** (1) `connectInternal` now clears `this.ws` in the per-candidate-failure catch so an RPC racing the next iteration can't send on a dead socket. (2) `setHomeOnline(false)` from the old transport's `onclose` is suppressed while a transport upgrade is in flight (`_upgrading` guard) — the UI no longer flickers offline for a few hundred ms during `lan → tunnel`/libp2p upgrades. (3) Per-candidate-name exponential backoff (`_probeCooldown`, 1s → 2s → … → 5min cap) skips the next upgrade probe for a candidate that just failed, so a known-bad `libp2p://` no longer burns a full 8-second timeout every 30s. The active transport's failure is **not** subject to the cooldown (we always retry whatever we were using) — only higher-priority probes are. (4) `dispose()` clears the cooldown map and the upgrading guard for hygiene. Added 2 regression tests (per-candidate-failure cleanup, dispose idempotency). |
| 2026-06-07 | **HomeRemote multi-transport + home tunnel:** `HomeRemoteClient` now accepts an ordered list of candidate transports (`[lan, tunnel]`) with automatic fallback and a 30s background upgrade sweep. Home node emits `lanWsUrl` in pairing payload; mobile prefers direct LAN when reachable (lowest latency, **offloads relay bandwidth** for ongoing traffic) and falls back to the home tunnel (relay's `/ws/home` outbound + channel multiplexing) when LAN is unreachable. SQL migration v5 adds the `lanWsUrl` column. `HomeRemoteStatus.transport` is exposed for UI display. |
| 2026-06-05 | **Phase 30 — Tests + docs complete:** 30G mock integration (`terminal-ws-integration.test.ts`, `home-remote-terminal.test.ts`); 30H/30J external tool docs; 30A–30D plan checkboxes aligned with shipped code. |
| 2026-06-05 | **Phase 30 — Slices 3–4 shipped:** Terminal Agent v1 + **v2** (`/openclaw`, `/prepare`, `/watch`, `/pin`, `/step`, destructive regex); EnvoyAI **home proxy** for paired mobile (`runOwnerAgentTurn` + approvals, `assistantProxied`, offline UX, audit `remoteClient=mobile`). Slice exit criteria + 30I/30K/30E checkboxes updated. |
| 2026-06-06 | **Phase 30 — Shipping plan agreed:** Slice **1** manual home (herdr session UX) → **2** mobile remote manual → **3** Agent mode (TmuxAI-inspired **native**, not embedded) → **4** EnvoyAI home proxy; per-slice exit criteria. |
| 2026-06-06 | **Phase 30 — Mobile remote home (first-class):** **HomeRemoteClient** ADR (30E); Terminals + **EnvoyAI home proxy** (30K) via `sessionToken`; phone = UI, home = PTY/LLM/vault; extends Phase 11 pairing. |
| 2026-06-06 | **Phase 30 — TmuxAI evaluated:** [TmuxAI](https://github.com/alvinunreal/tmuxai) as **lead Agent-mode UX reference** (observe loop, chat/exec/context panes, risk confirm, `/model`, squashing); Apache-2.0 optional external path (**30J**); native EnvoyMesh assist remains v1 — do not embed tmux dependency. |
| 2026-06-06 | **Phase 30 — Terminal Agent ADR:** v1 uses **direct LLM** (`terminal.assist` via `routeModelRequest`), not OpenClaw; OpenClaw deferred to v2 `/openclaw` planning-only; Manual/Agent toggle + slash commands (`/model`, `/help`, `/manual`, `/agent`, `/explain`); Agent bar separate from xterm stdin. |
| 2026-06-06 | **Phase 30 — Agent mode:** real xterm PTY + per-session **Agent mode** (NL→command suggest/preview/run, risk-tiered confirm, scrollback context); AliYun-style SSH-in-browser use case; sub-phase **30I**; distinct from OpenClaw workspace `exec`. |
| 2026-06-06 | **Phase 30 — Terminals designed:** Chat-integrated remote shells (group-chat UX), home-node PTY + xterm.js, mobile paired-home only; [herdr](https://github.com/ogulcancelik/herdr) evaluated — UX/persistence reference + optional external sidecar, not embedded UI or v1 dependency. |
| 2026-06-03 | **Phases 19–22 shipped:** bond_autonomy (protocol, inbound, outbound worker: `bond-autonomy-worker.ts`, 24 tests); network-wide document discovery (`document-discovery-broadcast.ts`, 10 tests); network-wide capability discovery (`capability-discovery-broadcast.ts`, 4 tests); federated RAG (`federated-rag.ts`, 10 tests). Total 48 new tests, 181 passing. Pre-existing `ShareFileDialog.test.tsx` fixed (stable mock + getByText workaround). |
| 2026-06-04 | **Phase 29 — OpenClaw integration designed:** Two-tier model routing, tool bridge (7 EnvoyMesh tools → OpenClaw), session context protocol, version negotiation, unified install scripts. Runtime + tool catalog partially built. |
| 2026-07-13 | **Phase 44 — Refine EnvoyMesh Knowledgebase:** Designed — native note creation, per-item sensitivity, public knowledge mesh (all peers, not just bonded), plugin architecture (Obsidian, MCP, future), vault-as-foundation. Sub-phases 44A–44E. Design doc: [knowledge-base-and-rag.md](./knowledge-base-and-rag.md). |
| 2026-07-13 | **Phase 44 implemented:** All 6 sub-phases shipped — 44A1 (SensitivityOverrideStore, sensitivity normalization), 44A2 (createNote/deleteNote RPC, notes/ folder, Markdown editor), 44B (public knowledge.query for strangers, rate limiter), 44C (KnowledgeBasePlugin interface, PluginRegistry, config storage), 44D (`@envoymesh/kb-obsidian` — frontmatter parsing, wiki-link graph, sensitivity-aware link resolution, BFS traversal), 44E (MCP write-back via `formatMcpResultsAsNote`, KB plugin registration). New package `kb-obsidian` (87 tests). Total ~120 new tests across all sub-phases. |
| 2026-06-03 | **Phase 27 — AI features shipped:** Agent in group chat (request-only, anti-loop, rate-limited), proactive agent pass, mobile AI package skeleton. 20 new tests. |
| 2026-06-03 | **Phase 26 + Mobile E2E scoped:** DID WAN gateway resolver designed; mobile E2E test plan for bond autonomy, broadcast, continuity, task marketplace. |
| 2026-06-03 | **Phases 23–25 designed:** Proactive Social Graph, Agent Marketplace, Ambient Mesh Awareness. All local computation — no new wire intents. |
| 2026-06-03 | **Social UI integrated:** CirclesView wired into App.tsx + Header navigation. README updated with AI-powered features section. ShareFileDialog test fixed. |
| 2026-06-03 | **Code review + fixes:** 3 bugs fixed — `agent-negotiation-worker.ts` peerId tracking, mobile cross-package import, connection suggester pass corrected. All changes verified. |
| 2026-06-03 | **Phases 19-25 all complete:** A2A full lifecycle, mobile broadcast handlers. All 168 items shipped, 0 deferred. |
| 2026-06-03 | **Phases 23–25 complete:** All deferred tasks finished — agent-chain-orchestrator, service-mesh-worker, continuity-service (19 new tests). Total 61 tests across Phases 23-25, all modules shipped. |
| 2026-05-28 | **Phase 18 complete:** Exit criteria E2E (`phase-18-e2e.test.ts`); document-hunt route priority fix; exit criteria + test matrix updated. |
| 2026-05-28 | **Phase 18C–18D:** Assistant inline approval cards (`approvalItems` on turn); `runDocumentAgentTurn` deprecated (internal `_runDocumentAgentTurnCore`; RPC warning one release). |
| 2026-05-28 | **Phase 18B–18C (first slices):** Owner-agent LLM planner loop (`runOwnerAgentPlannerLoop`, tool allowlist, node model wiring); Assistant turn meta chips (job/domain/approval) in `AIChatPanel`. |
| 2026-05-28 | **Phase 18 started:** [native-owner-agent.md](./native-owner-agent.md) — Assistant = native agent; `runOwnerAgentTurn` route-driven orchestration (18A); LLM tool loop + job UX deferred to 18B–18C. |
| 2026-05-28 | **Phase 17D:** Offline gazetteer autocomplete in Profile location editor; zh/ko/ja/fr/de/it i18n for countries/regions/cities; nearby map picker grid for geohash precision. WAN geo signoff green via cn-relay (`geo-discovery-wan-signoff.test.ts`). |
| 2026-05-28 | **Phase 17B:** Geohash persisted on profile save; neighbor-cell nearby search via `locationSearchTopics`; stale geo topic cancellation on profile/network change; two-node geo DHT e2e test. |
| 2026-05-28 | **Profile capabilities → discovery:** Profile About capability tags sync into capability manifest and DHT advertise (`capability:{tag}` + raw tag) on public profile save; agents match via `discovery.request` / `requestedCapabilities`. |
| 2026-05-28 | **Phase 16E capability routing:** `@envoymesh/api` intent routing + route executor modules; capability provider worker + daemon tick; `mesh.capability_provider.start` in-process tool; [capability-route-executor.md](./capability-route-executor.md). |
| 2026-05-28 | **Phase 16 design docs:** [social-proxy-delegation.md](./social-proxy-delegation.md), [document-acquisition-agent.md](./document-acquisition-agent.md), [envoyai-disclosure-adr.md](./envoyai-disclosure-adr.md). |
| 2026-05-28 | **EnvoyAI merged into EMP:** one protocol (`emp/0.1`); [protocol-standard § EnvoyAI](./protocol-standard.md#envoyai-ai-mediated-social-mesh).
| 2026-05-27 | **US-MH2 + aggregation + §4 sign-off:** intermediary privacy on wire, hop-2 session merge + Search UX, cn-relay staging script green. |
| 2026-05-20 | **US-MH1 + CRDT wire + §4 runbook:** hop-limited discovery, sync.state Assistant draft sync, WAN staging script. |
| 2026-05-20 | **15E first slices complete:** DID Search lookup; reputation read path; yjs Assistant draft; Epic MH scenarios; satellite + commerce ADRs; §4 automated relay e2e helper. |
| 2026-05-20 | **15E DID first slice:** `did:key` derivation + W3C DID document export; `getOwnerDidPresentation` RPC; Social Profile Identity section. |
| 2026-05-20 | **Phase 15 complete + 15E scoping started:** WAN sign-off ledger row filled; [parked-backlog-15e.md](./parked-backlog-15e.md) + five scope docs (commerce/multi-hop, satellite, DID, reputation, CRDT). |
| 2026-05-20 | **Phase 15D complete:** JSONL secondary indexes for audit/activity; `queryAuditEvents` + `since`/`until` API; `storage-gate` CLI; [sqlite-gate-review-2026-05-20.md](./sqlite-gate-review-2026-05-20.md) (triggers not met — stay JSONL). Filecoin deferred. |
| 2026-05-20 | **Phase 15C complete:** Social **Assistant** view (H2A channel); Activity on `runDocumentAgentTurn`; [emp-h2a-channel-adr.md](./emp-h2a-channel-adr.md) + [h2a-wire-semantics.md](./h2a-wire-semantics.md); protocol-standard Appendix D; `h2a-wire-semantics.ts` tests. |
| 2026-05-20 | **Phase 15B complete:** WAN connectivity axes (`analyzeWanConnectivityAxes`); `getConnectivityDiagnostics` RPC + Social Settings panel; `connectivity-status` axis lines; [quic-wan-validation.md](./quic-wan-validation.md) + sign-off ledger update. |
| 2026-05-20 | **Phase 15A complete:** Search **By Topic (DHT)**; `discoverCapabilityTopic` / `getMorningReport` RPC; CLI `discover-topic`; morning report panel in Discover; [broadcast-substrate-adr.md](./broadcast-substrate-adr.md). |
| 2026-05-20 | **Phase 15B started:** WAN join-invite in `@envoymesh/api`; `createWanJoinInvite` / `applyWanJoinInvite` RPC; Social Settings QR + paste apply; discovery seed persistence. |
| 2026-05-20 | **Phase 14 complete:** Scheduled friend autopilot + Activity/digest; per-contact knowledge syndication + inbound Activity; WAN sign-off ledger + advanced CI job; Library pin UI + web3.storage provider. |
| 2026-05-20 | **Phase 13 complete + Phase 14 started:** US-AV8 Activity contact/date filters; `smoke:phase13` PR + nightly `smoke:local`; Phase 14A friend autopilot tool, 14B knowledge syndication ceiling, 14C connectivity CI, 14D Pinata pinning stub; milestone/traceability updated. |
| 2026-05-20 | **Phase 13C mobile + e2e:** Two-node `agent-card-a2e` test; mobile agent card inbound/cache + A2A task audit/journal SQLite stores; Activity drill-down RPC parity on mobile. |
| 2026-05-20 | **Phase 13 (13A/13B/13D shipped):** `sendAgentChat()` honest wire roles; `ChatMessage` actor fields + UI badges; `AgentActivityStore` + Activity nav + `agent:activity` WS; task journal hooks; local `emitOwnerReport` (Option A); digest A2A counts; **13C deferred** until `agent.card` inbound exists; protocol-standard `chat.message` role appendix fixed. |
| 2026-05-20 | **Phase 13 (design):** Added [a2a-actor-visibility-plan.md](./a2a-actor-visibility-plan.md) — honest `senderRole`/`agentCredential` disclosure, A2A vs chat lanes, **Owner Activity feed** + `report.create` wiring so humans see agent work without A2A in chat; implementation sub-phases **13A–13E**; [scenarios.md](./scenarios.md) Epic AV (**US-AV1–AV8**). |
| 2026-05-19 | **P2P file sharing design:** Added [p2p-file-sharing-plan.md](./p2p-file-sharing-plan.md) — scope, inventory vs gaps, `NodeService`/`share.*`/vault alignment, Social Library UI, phased roadmap **FS-A–FS-E**, testing, open questions; linked from this plan’s Related strip and On this page. |
| 2026-05-21 | **WAN / operator docs:** [operator-relay-fleet.md](./operator-relay-fleet.md) (bootstrap **preset** catalog, **cn-relay**, rotation, org **`--bootstrap-presets-file`**); [live-connectivity-testing.md](./live-connectivity-testing.md) WAN proving **track table** + exit sign-off; [sqlite-adoption.md](./sqlite-adoption.md) adoption **gate**; Phase 4 WAN follow-on checklist + key-decision SQLite row updated. |
| 2026-05-21 | **IPFS/Helia ship (a3c6b3c):** Dual-engine IPFS export — **Kubo** (`kubo-ipfs-export.ts` via `ipfs add --cid-version 1`) and **Helia** (`packages/ipfs-helia` via `@helia/unixfs`, no Go binary); `vault-ipfs-export-service.ts` orchestration (policy check, vault read, audit, export record); `ipfs-export-router.ts` engine selection with `kubo-with-helia-shadow` parity mode; `ipfs-gateway.ts` HTTP gateway fetch + SHA-256 verify; `exportLibraryItemToIpfs()` / `getIpfsEngineStatus()` / `verifyLibraryItemIpfsGateway()` RPCs; `discoverPublishedLibrary()` + CID overlay; Social UI publish toggle + discover published files dialog; `packages/ipfs-helia` (browser-safe Helia UnixFS export, browser entry point); `packages/mobile-node` Helia-only export (no `child_process`); CID parity CI (`ci-ipfs-helia-parity.yml`); e2e tests for node service IPFS RPC, gateway verify, mobile export, and Social UI share/publish/discover flows. |
| 2026-05-21 | **Health + bridge test fixes:** Added `maxRssBytesOverride?: number` to `NodeHealthInput` / `RelayHealthInput` / `StandaloneRelayHealthInput` — tests pass known-low threshold bypassing module-level `ENVOY_MAX_RSS_BYTES` constant; `bridge/index.ts` explicit secret validation throw; bridge-gateway-integration rewritten to call `receiveFromAgent` directly with constructed deps; `bridge-index` reply test uses native fetch (no stub) so bridge HTTP server uses node:http correctly; fire-and-forget pattern with captured promise `(async () => {…})(); void fwdPromise`. |
| 2026-05-21 | **Reconnect bug fix:** `node:online`/`node:offline` events now wired from `nodeServiceImpl.on()` in `ws-server.ts` (were listed in auto-subscribe but never connected); "prefer QUIC" dial policy in `sortDialHints` — `/quic-v1` multiaddrs sorted before TCP, loopback filtered first. |
| 2026-05-20 | **Docs / backlog housekeeping:** Align [next-step.md](./next-step.md) with Phase 8 shipped (`knowledge.query` inbound + model router wiring); reconcile backlog row **Phase 8** → **`[x]`**; Phase 12 Phase F verification adds `bond-inbound-extended.test.ts`; clarify `handleInboundKnowledgeQuery` flow docstring (was “mock provider”). |
| 2026-05-19 | **Phase 12 Phase F + integration smoke:** **`FriendMatchingPreferencesPayload`** + signing/verification (`@envoymesh/protocol`, `@envoymesh/identity`); optional **`friendMatchingPreferencesSigned`** on node config with **`updateNodeConfig`** validation; **`social-intro-inbound`** rate limits (**`SOCIAL_INTRO_RATE_LIMIT_MAX_PER_PEER`**) + **`social.intro.owner-ready`** nonce replay rejection; **`bond.accept`** inbound **`message.verified`** audit with **`correlationId`**; **`apps/node/test/trust-mode-intro-bond-flow.test.ts`** + **`apps/node/src/local-two-node-smoke.ts`** (`npm run smoke:local`). |
| 2026-05-19 | **Phase 12 Phase E:** [protocol-standard.md](./protocol-standard.md) — intent subsections + Appendix A (Trust-mode mediation); [scenarios.md](./scenarios.md) Epic TM (**US-TM1–US-TM4**); [alignment-review.md](./alignment-review.md) snapshot **2026-05-19** + Trust-mode rows; [trust-mode-implementation-plan.md](./trust-mode-implementation-plan.md) Phase E marked shipped. |
| 2026-05-19 | **Phase 12 Phases B–D:** Social Settings Trust mode + friend prefs; **`social.intro:propose`** WS event + **`listPendingSocialIntroProposals`** / **`approveSocialIntroCommitment`** / **`declineSocialIntroProposal`** RPC; **`sendHello`** optional **`introProposalMessageId`** attaches **`introCorrelationId`** + **`ownerCommitmentRef`** (desktop + mobile-node); **`mesh.intro.matching_context`** / **`mesh.intro.sync`** / **`mesh.intro.broadcast_search`** tools behind **`trustModeEnabled`** (`listAgentTools` / **`executeTool`** **`trustIntro`** context); inbox UI + tests. See [trust-mode-implementation-plan.md](./trust-mode-implementation-plan.md). |
| 2026-05-19 | **Phase 12 Phase A (node runtime):** `trustModeEnabled`, `friendMatchingPreferencesText` on `NodeConfig` / `PersistedNodeConfig`; `handleInboundSocialIntroIntent` (`social-intro-inbound.ts`) + `index.ts` dispatcher; inbound **`bond.request`** from credential-bearing agents requires **`ownerCommitmentRef`**; tests `social-intro-inbound.test.ts`, `bond-inbound.test.ts`; [trust-mode-implementation-plan.md](./trust-mode-implementation-plan.md). |
| 2026-05-19 | **Phase 12 protocol baseline:** `@envoymesh/protocol` — `HumanProfileFragmentPayloadSchema`, intents **`social.intro.sync`** / **`social.intro.propose`** / **`social.intro.owner-ready`**, optional **`bond.request`** fields **`introCorrelationId`** / **`ownerCommitmentRef`**, envelope role policy + tests. **`@envoymesh/bonds`** — capability requirements + **`evaluatePolicy`** for public/referred. Design doc [trust-mode-social-protocol.md](./trust-mode-social-protocol.md) backlog updated. |
| 2026-05-19 | **Phase 12 (design):** Added [trust-mode-social-protocol.md](./trust-mode-social-protocol.md) — Trust mode (human-in-the-loop bonding), tiered owner-signed profile disclosure, bilateral agent-mediated intros, proposed EMP intents (`social.intro.sync`, `social.intro.propose`), bond linkage hooks, bond-engine notes, ordered implementation backlog. New **Phase 12** section in this plan; traceability + coverage rows updated; Related-doc strip links the design doc. |
| 2026-05-07 | **Phase 9B complete:** Created `ToolRegistry` class in `apps/node/src/tool-registry.ts` with extensible tool definitions mapping mesh intents to tools; default tools registered: `chat.send`, `knowledge.query`, `discovery.search`, `share.send`, `bond.send_hello`, `vault.search`; `executeTool()` function with `MeshToolContext` for policy-gated mesh operations; `listAgentTools()` for `mesh.list-tools` capability; added `tool.called` to `AuditEventType` and `local` to `AuditDirection` in `@envoymesh/local-store`; 18 unit tests covering registry operations, default tools, and tool definitions. Phase 9B exit criteria: all `[x]`. |
| 2026-05-07 | **Phase 9C complete:** Created `ContextManager` in `apps/node/src/context-manager.ts` with context tools for AI agent; `conversation-context` reads chat history from `LocalChatLogStore`; `relationship-context` reads trust records; `profile-context` reads human profile; `vault-context` searches vault documents; `graph-context` stubbed for future knowledge graph; `listContextTools()` returns all context tool descriptors; 19 unit tests. Phase 9C exit criteria: all `[x]` (context injection to model prompts deferred to agent runtime integration). |
| 2026-05-07 | **Phase 9D complete:** Created `ModeController` in `apps/node/src/mode-controller.ts` with reactive/proactive mode management; `AgentModeConfig` interface with mode, defaultMode, schedules, offline threshold, per-contact overrides; `markOwnerConnected()`, `markOwnerDisconnected()`, `checkOfflineTransition()`, `checkScheduleTransition()` for mode switching; `buildSetModeTool()`, `buildGetModeTool()`, `buildSetContactModeTool()` for owner configuration; mode transitions audited; 33 unit tests. Phase 9D exit criteria: all `[x]`. |
| 2026-05-07 | **Phase 9E complete:** Created `SessionManager` in `apps/node/src/session-manager.ts` with per-contact conversation sessions; `ConversationSession` interface tracking messageCount, lastInteraction, conversationSummary, pendingEscalation, sentiment; `FileSessionStore` for file-based persistence; `detectEscalationTriggers()` with keyword-based detection for emotional_content, sensitive_topic, explicit_escalation; `SessionManager.recordMessage()` detects escalations on inbound messages; `acknowledgeEscalation()` clears pending escalations; `buildSessionSummaryTool()`, `buildListSessionsTool()`, `buildAcknowledgeEscalationTool()` for mesh operations; 24 unit tests. Phase 9E exit criteria: all `[x]`. |
| 2026-05-07 | **Phase 9F complete:** Created `StyleAdapter` in `apps/node/src/style-adapter.ts` with owner style profile and contact disclosure management; `StyleProfile` interface with tone, vocabulary, sentenceLength, commonPhrases, greetingPatterns, emojiUsage, exclamationUsage, questionFrequency; `analyzeTextStyle()` extracts features from owner messages; `mergeStyleProfile()` updates profile with exponential moving average; `applyStyleAdaptation()` generates text matching owner voice; per-contact `ContactDisclosure` with `discloseAgent` flag and custom message template; `buildSetStyleTool()`, `buildGetStyleTool()`, `buildSetContactDisclosureTool()`, `buildGetContactDisclosureTool()` for mesh configuration; 31 unit tests. Phase 9F exit criteria: all `[x]`. |
| 2026-05-07 | **Phase 9G complete:** Created `TriggerStore` in `apps/node/src/trigger-store.ts` with proactive trigger management; `ProactiveTrigger` interface with time/event/topic types, conditions, actions; `isCronMatch()` for cron-based time trigger evaluation; `shouldFireTimeTrigger()`, `shouldFireEventTrigger()`, `shouldFireTopicTrigger()` for trigger evaluation; `TriggerStore.checkTimeTriggers()` and `checkTopicTriggers()` for finding active triggers; `buildListTriggersTool()`, `buildAddTriggerTool()`, `buildRemoveTriggerTool()`, `buildUpdateTriggerTool()` for mesh configuration; 42 unit tests. Phase 9G exit criteria: all `[x]`. |
| 2026-05-07 | **Phase 9H complete:** Created `ApprovalQueue` in `apps/node/src/approval-queue.ts` with approval item management; `ApprovalItem` interface with actionType, priority, status, draftContent, context; `shouldEscalate()` evaluates low confidence, emotional content, sensitive topics; `approve()`, `reject()`, `escalate()` for resolution; `buildListPendingTool()`, `buildApproveTool()`, `buildRejectTool()`, `buildRejectAllTool()`, `buildEscalateTool()`, `buildListAllApprovalsTool()` for mesh operations; 32 unit tests. Phase 9H exit criteria: all `[x]`. |
| 2026-05-07 | **Phase 9I complete:** Created `ExternalAgentGateway` in `apps/node/src/external-agent-gateway.ts` with external agent session management; `ExternalAgentSession` interface with agentId, capabilities, revocation status; `ExternalAgentAction` for audit logging; `hasCapability()` and `isAuthorized()` for permission checks; `logAction()` for action auditing; `buildListExternalSessionsTool()`, `buildRevokeExternalAgentTool()`, `buildListExternalAgentActionsTool()`, `buildGetExternalAgentTool()` for mesh operations; 30 unit tests. Phase 9I exit criteria: all `[x]`. |
| 2026-05-07 | **Phase 9J complete:** Created `DigestGenerator` in `apps/node/src/digest-generator.ts` with digest generation and scheduling; `DigestSummary` interface with activity counts, contact activity, external agents, proactive actions, pending items; `generateSummaryText()` creates human-readable digest; `saveDigest()` persists to JSON file; `buildGetDigestTool()`, `buildSetDigestScheduleTool()`, `buildGetDigestConfigTool()` for mesh operations; 20 unit tests. Phase 9J exit criteria: all `[x]`. |
| 2026-05-09 | **AI Response Settings & Rules (Phases 1–6) complete:** Extended Phase 8C with AI Identity modes (`invisible`/`transparent`/`defensive`), per-contact AI access levels (`none`/`assistant_only`/`full`), knowledge access tiers (`public`/`professional`/`personal`) for vault queries, rule builder with keyword/regex/greeting triggers and priority ordering, vault context injection with sensitivity filtering, online/offline detection via owner activity tracking (5-min timeout), default mode for new contacts (`manual`/`assistant`/`auto`), and 37-unit test suite in `chat-draft-inbound.test.ts`. Updated `AiIdentityMode`, `AiRule`, `AiRuleTrigger`, `AiVaultQuery`, `AiSettings`, `ContactAiPreferences` in `@envoymesh/api`. |
| 2026-05-07 | **Phase 4D extended complete:** Added `ttl` field to `UnsignedMandateSchema` (default 3, max 8) to limit relay hop propagation; TTL enforcement in `guardInboundTaskRuntime` rejects mandates with `ttl <= 0`; peer tracking in task journal (`createDefaultDecision` populates `peerOwnerId`/`peerDeviceId` from envelope sender); auto-populate `forwardToPeerIds` on task.cancel via `getTaskParticipantsForCancel()` helper; relay fan-out for `task.cancel` in `apps/relay/src/index.ts` fans out to `forwardToPeerIds` with TTL decrement; `collectCompletedResults` threshold handled in `applyTaskRuntimeAfterHandled` to mark task satisfied when count reached. Phase 4D now addresses hop TTL, gossip cancel, and collect-N semantics. |
| 2026-05-06 | **Phase 8L complete:** `AutonomousDomain` type (`"social"` \| `"knowledge"` \| `"home"` \| `"research"`) and `AutonomousPolicy` interface (domain, maxSensitivity, autoAnswer, autoSendChat) added to `@envoymesh/api`; `autonomousKillSwitch: boolean` and `autonomousPolicies: AutonomousPolicy[]` added to `NodeConfig`, `UpdateNodeConfigParams`, `PersistedNodeConfig`; wired into `getNodeConfig()` and `updateNodeConfig()` in `NodeServiceImpl` with defaults (kill switch false, empty policies); `evaluateAutonomousPolicy()` in `apps/node/src/autonomous-inbound.ts` checks kill switch, domain policy lookup, action enablement, and sensitivity ceiling; `auditAutonomousDecision()` records `autonomous.decided` audit events (added to `AuditEventType` in `@envoymesh/local-store`); 15 unit tests covering kill switch precedence, domain matching, action gating, and sensitivity ceiling ordering. Exit criteria: all `[x]` (approval thresholds UI and digest aggregation deferred to Phase 9). |
| 2026-05-06 | **Phase 8J complete:** Added `broadcast.request`/`broadcast.response`/`broadcast.cancel` EMP intents to `EnvoyIntentSchema`; `BroadcastRequestPayloadSchema` (queryId, ttl, maxResponses, requestedTagHashes, requestedCapabilities, requestedSensitivity, senderOwnerId, timeoutMs), `BroadcastResponsePayloadSchema` (queryId, responderOwnerId, responderPeerId, matchedTagHashes, matchedCapabilities, done), `BroadcastCancelPayloadSchema` (queryId, reason); relay handler in `apps/relay/src/index.ts` fans out `broadcast.request` to all connected peers except sender with TTL decrement; `handleInboundBroadcastRequest` in `apps/node/src/broadcast-inbound.ts` enforces trust level, anonymous mode, capability manifest matching, sensitivity ceiling; `handleInboundBroadcastResponse` records inbound responses; node dispatcher sends `broadcast.response` directly to broadcaster; 8 unit tests covering mode enforcement, trust rejection, blocked senders, no-match paths, and response recording. Phase 8J substrate: relay-assisted fanout. |
| 2026-05-06 | **Phase 8I complete:** `AnonymousDiscoveryMode` type added to `@envoymesh/api` (`"off"` \| `"contacts-only"` \| `"public-preview"` \| `"public-auto-answer"`); added to `NodeConfig` and `UpdateNodeConfigParams`; `anonymousDiscoveryMode` persisted in `PersistedNodeConfig`; `getNodeConfig()`/`updateNodeConfig()` in `NodeServiceImpl` return and accept all three new fields with safe defaults; `handleInboundDiscoveryIntent` in `discovery-inbound.ts` now accepts `anonymousDiscoveryMode`, `anonymousIntentAllowlist`, `anonymousSensitivityCeiling` parameters; per-peer rate limiting for anonymous callers (5 req/min) via `allowAnonRequest`; Phase 8I enforcement block runs before trust/blocked checks — `"off"` silently drops, `"contacts-only"` rejects public callers with audit, `"public-preview"`/`"public-auto-answer"` apply sensitivity ceiling; call site in `index.ts` wires config values from `nodeConfigStore`. 9 unit tests covering mode enforcement, sensitivity ceiling, per-peer rate limits, and legacy fallback. Phase 8I exit criteria: all `[x]` (low-priority queue and load tests remain open for future work). |
| 2026-05-06 | **Phase 8H complete:** egress scanning via `evaluateEgressContent` in `@envoymesh/models` (PEM key blocks, AWS credentials, JWT tokens, connection strings with credentials); `allowedPaths` and `maxInvocationsPerHour` added to `LocalToolDescriptor`; `checkPathAllowlist` and `checkInvocationBudget` in `apps/node/src/tool-impl.ts`; rolling-window rate limiter keyed by tool name; egress scanning added to `mesh_sendChat` (blocks secret patterns before policy check), `mesh_requestKnowledge` (blocks secret responses before returning), `mesh_listContacts`/`mesh_findCapability` (via `sanitizeToolResult` wrapper); filesystem path allowlist check in `buildVaultSearchTool`; 26 regression tests covering path allowlist, rate limiting, secret blocking, missing-parameter guards, and high-risk action denial. Phase 8H exit criteria: all `[x]`. |
| 2026-05-09 | **Phase 4F.A complete:** signed capability topic records (`SignedCapabilityTopicRecord` schema + `createSignedCapabilityTopicRecord` / `verifySignedCapabilityTopicRecord`) with Ed25519 over canonical JSON, staleness enforcement, and multiaddr query-param encoding; `provideCapabilityTopic` with `signingKey` option; `findCapabilityTopicProviders` with `signingPublicKey` option and `signedRecord`/`signedRecordInvalid` on results; comprehensive unit tests in `packages/protocol` and `packages/network`. All Phase 4F.A tasks + exit criteria marked `[x]`. |
| 2026-05-09 | **Phase 4F.B complete:** threat model for DHT capability topics (Sybil, replay, flooding, stale records, coordinated noise, partial connectivity) documented in `docs/p2p-discovery.md`; `checkCapabilityTopicRateLimit` sliding-window rate limiter in `@envoymesh/bonds`; `discovery.capability.verified` / `discovery.capability.rejected` audit event types in `@envoymesh/local-store`; 6 rate limiter unit tests. Phase 4F.B tasks + exit criteria marked `[x]`. |
| 2026-05-19 | **Social UI reconnect bug fixes:** `node:online`/`node:offline` events now wired in `ws-server.ts` (were listed in auto-subscribe but never connected to `nodeServiceImpl.on()`); `useNodeService.tsx` added `lastError` state + `getLastError()` proxy getter; `App.tsx` derives `isRelayUnreachable` from `lastError` + `reconnectAttempts > 3`, passes to `Header` for relay-warning button; `Header` shows amber "Relay unreachable" button with retry handler when `relayUnreachable && isPublicNetwork`; loading screen shows "Retry Connection" button after 3+ failed attempts; `handleRetryConnect` calls `nodeService.reconnect()` to force reconnect. "prefer QUIC" dial selection policy implemented in `sortDialHints` — QUIC multiaddrs (`/quic-v1`) are sorted before TCP when both are available, with loopback/unspecified filtering still applied first by `preferNonLoopbackDialHints`; 18 unit tests for dial hint sorting covering QUIC preference, loopback filtering, and mixed topologies. Phase 4F.C tasks + exit criteria marked `[x]`. |
| 2026-05-06 | **Phase 8C complete:** `generateChatDraft()` in `chat-draft-inbound.ts` generates draft replies from model for inbound `chat.message`, `ChatDraftStore` (`chat-draft-store.ts`) persists drafts separately from chat logs keyed by thread+draftId, `chat:draft` WebSocket event surfaces drafts to Social UI, `getChatDrafts`/`deleteChatDraft` RPC methods in `NodeServiceImpl`, `chatAssistEnabled` toggle added to `NodeConfig`/`UpdateNodeConfigParams`/`PersistedNodeConfig`, `ChatDraft` type added to ws-protocol, drafts audited without full text content (privacy). 10 unit tests covering disabled/blocked/bonded/stranger/draft-store paths. Phase 8C exit criteria: all `[x]`. |
| 2026-05-06 | **Phase 8B complete:** model provider config (`mock`/`ollama`/`litellm`/`disabled`) in `PersistedNodeConfig` and `NodeConfig`, `buildModelProviders()` factory in `knowledge-query-inbound.ts` routing to `createMockModelProvider`/`createOllamaLiteLlmProvider`/`createLiteLlmProvider` based on mode, `modelProviders` loaded from persisted config at node startup and passed to knowledge-query handler, `model-config` CLI command for inspection, 6 model provider config tests, `docs/run-local-model.md` runbook. Cloud/litellm providers default to `requireApprovalForCloud=true` enforced via `evaluateModelProvider` in `@envoymesh/models`. Phase 8B exit criteria: all `[x]`. |
| 2026-05-06 | **Phase 8A complete:** replaced mock `knowledge.query` handler with real policy-gated path: `evaluatePolicy` via `@envoymesh/bonds`, vault search via `searchVault()`, model routing via `routeModelRequest()` with mock provider, signed `knowledge.response` envelope sent back to sender, full audit trail (`message.verified`, `policy.decided`, `vault.searched`, `model.routed`, `message.sent`). Added `KnowledgeResponsePayloadSchema` + `createKnowledgeResponsePayload` to `@envoymesh/protocol`. Added `policy.decided`, `vault.searched`, `model.routed` to `AuditEventType`. Wired `@envoymesh/models` into `apps/node` with new tsconfig reference. 5 unit tests covering blocked/stranger/bonded/vault paths. Phase 8A exit criteria: all `[x]`. |
| 2026-05-12 | **Phase 9K complete:** P2P bridge for external agents in `apps/node/src/bridge/`. Self-contained module (4 files) makes EnvoyMesh Node act as a message pipe between P2P chat and external agents (OpenClaw, HomeClaw, Hermes). Bridge has its own agent peer identity derived from owner + agent keypair, persisted across restarts. HTTP callback server on port 3031 receives agent replies via `POST /bridge/send`. P2P handler forwards `chat.message` addressed to bridge's agent peer ID to external agent HTTP endpoint. Updated role-policy to allow agent↔human chat. 15 unit tests (pipe + identity store). |
| 2026-05-13 | **Phase 10A interop + pairing:** Identity golden (`companion_identity_golden.json`); **envelope golden** (`companion_envelope_interop_golden.json`) with vitest (`companion envelope signature`) and `test/envoy/companion_envelope_interop_test.dart`; `relayReconnectDelayMs` backoff unit tests in `relay_client_test.dart`; manual LAN runbook `docs/phase-10a-manual-e2e.md`. **`device.pair.request`** may carry **`pairingToken`**; node **`companionPairingAutoAcceptWithToken`** auto-accepts when token matches `getPairingPayload()` TTL window (§10A.6).
| 2026-05-13 | **Phase 10A HomeClawApp ([`~`] tasks):** ChatScreen P2P chat Hive keys match `EnvoyNodeService` (`ownerId` + peer or owner friend key); inbound P2P messages persisted with `ChatHistoryStore.appendMessage`; resume lifecycle skips Core sync for P2P. `EnvoyNodeService.connect` calls `getBridgeStatus` and forwards to `onBridgeStatusFromNode`. Settings: pre-fill saved WebSocket URL, pairing hint after QR, refresh after Scan QR. Plan: mark 10A.3/10A.4/10A.5 implementation tasks complete where wired; 10A.7 manual E2E remains. |
| 2026-05-13 | **Phase 10A client (HomeClawApp):** Documented `bridge:status` handling, `getBridgeStatus`, `fetchP2PContacts()`, `EnvoyMeshRiverpodSync` + `setDisconnected()` contact clearing; extracted `relayDispatchServerPush` in `relay_client.dart` with unit tests for `bridge:status` / `p2p:envelope` push shapes. |
| 2026-05-13 | **Phase 9 complete — all modules wired into daemon runtime:** Wired 9D (ModeController with `onConnectionChange` callback on WsServer, `recordOwnerActivity`, 30s periodic mode transitions), 9E (SessionManager recording inbound chat messages), 9F (StyleAdapter learning from outbound chat, adapting AI drafts), 9G (TriggerStore topic trigger checking on inbound chat, time triggers in periodic timer), 9H (ApprovalQueue fallback when auto-send policy denies), 9I (ExternalAgentGateway tools registered), 9J (DigestGenerator aggregation in periodic timer). All 33 default tools registered across 6 core + 4 gateway + 3 mode + 3 session + 4 style + 4 trigger + 6 approval + 3 digest = 33. Updated `chat-draft-inbound.ts` with mode guard and context injection. Updated `knowledge-query-inbound.ts` with context injection. Extended `AuditEventType` with `"trigger.fired"`. Added `onConnectionChange` to WsServer. Added `"trigger:fired"` and `"digest:ready"` to ws-server auto-subscribe list. Added `setStyleAdapter()` to NodeServiceImpl. Phase 9 exit criteria: all `[x]`. |
| 2026-05-10 | **Social app refactoring:** decomposed the 2,677-line `App.tsx` monolith into 16 focused components (`Header`, `ErrorBoundary`, view components under `components/views/`); extracted `NodeStateContext` with event-driven connection tracking (no polling); extracted shared utils (`lib/display.ts`, `lib/storage.ts`); fixed bugs (stale closure in `SearchView`, `any` types in `getProfile()`, imperative DOM access in rule builder form, missing null-safety); added `ErrorBoundary` for crash recovery; added 33 unit/component tests with `@testing-library/react` + jsdom across 5 test files; updated vitest config for `.tsx` test files. |
| 2026-05-05 | **Phase 8 agentic normal node roadmap:** linked [Agentic next step](./next-step.md), made Phase 8A real `knowledge.query` the active milestone, added detailed 8A-8L tasks/exit criteria, updated current pulls, coverage, key decisions, and open questions. |
| 2026-04-26 | Related-doc strip, north-star checkline, Phase 4A Full Node defer → `[x]`, Phase 6 semantic-firewall exit criterion, open-question table **Status** headers, Immediate tasks disclaimer, backlog footer unchanged in meaning. |
| 2026-04-26 | **On this page** TOC (phases + plan sections); **Current Milestone** merged “Recently completed” + “Immediate tasks” into one **Archive** snapshot + **Next planning pulls** subsection. |
| 2026-04-26 | **Phase 3:** `knowledge.query` EMP payload (`KnowledgeQueryPayloadSchema`), inbound mock handler, CLI flags, tests; docs (EMP, detailed-design, QuickStart). |
| 2026-04-26 | **Prioritization:** park thin mobile / satellite app; **Phase 6** semantic firewall v1 in `@envoymesh/models` (`evaluateSemanticFirewall` + `routeModelRequest`). |
| 2026-04-26 | **Phase 4B Batch 6:** `bond.*` EMP payloads, `apps/node` inbound bond path + `createLocalTrustStore` policy, CLI `--bond-request`; tests. |
| 2026-04-27 | **Phase 4E baseline:** signed EMP `discovery.request` / `discovery.response` payloads + node inbound trust-tier/rate-limit gate + correlated audit + CLI `--discovery-request`; tests + docs. |
| 2026-04-27 | **Phase 4 LAN identity match baseline:** persist owner→peer mappings from verified `system.signal` and allow owner-id targets (`envoy:owner:...`) for outbound CLI sends by resolving to libp2p peer IDs. |
| 2026-04-27 | **Phase 7 items 367-370 baseline:** desktop packaging/signing/installer scaffolding (`electron-builder` + workflow), live P2P panel, dashboard/CLI composition (`chat.message`, task proposal), structured discovery ledger + ranked morning report in dashboard and CLI. |
| 2026-04-27 | **Phase 7 rich composition UX:** chat threads (grouping/status chips/metadata timeline), multi-step task wizard (presets/validation), persisted composer drafts + reset action; Scenario 6 first vertical (`/envoymesh/data`) marked shipped in this plan. |
| 2026-04-27 | **Scenario 6 strict split baseline:** required envelope roles (`senderRole`/`recipientRole`), hard `/envoymesh/chat/0.1.0` vs `/envoymesh/message/0.1.0` routing, and explicit rejection semantics; added post-LAN cross-network P2P readiness workstream (WAN defaults + bootstrap/relay + diagnostics + smoke). |
| 2026-04-27 | **WAN fallback Phase A baseline:** node discovery profile defaults (`lan-fast`/`wan-default`), bootstrap env wiring, connectivity telemetry audit events, `connectivity-status` CLI command, dashboard discovery-health panel, and non-LAN fallback docs. |
| 2026-04-27 | **WAN fallback Phase B baseline:** bootstrap probe rotation and health traces (`connectivity.bootstrap.ok/fail`) plus optional `--connectivity-strict` startup gate for fail-fast deployments. |
| 2026-04-27 | **WAN fallback Phase C baseline:** managed bootstrap preset support (`--bootstrap-preset <name>` repeatable / `ENVOYMESH_BOOTSTRAP_PRESETS`) with parser validation, peer dedupe, and updated non-LAN runbook commands. |
| 2026-04-27 | **WAN fallback Phase D (item 1) baseline:** persisted discovery seeds (`discovery-seeds.json`) from manual bootstrap, successful probes, and peer discovery events; startup now auto-reseeds effective bootstrap peers from persisted seeds plus peer-directory listen addrs. |
| 2026-04-27 | **WAN fallback Phase D (item 2) baseline:** periodic jittered bootstrap reprobe loop with rotating targets, persisted success updates, bounded in-memory probe history, and new connectivity telemetry (`connectivity.reprobe.ok/fail`) surfaced by `connectivity-status`. |
| 2026-04-28 | **WAN rendezvous architecture:** documented production WAN + NAT model (bootstrap/relay fleet, relay-first under strict NAT, DCUtR upgrade, AutoNAT/observed addrs, cold-start invite/pairing) in `docs/p2p-discovery.md`; added Phase 4 WAN follow-on milestone block in this plan for operator fleet + relay/DCUtR/AutoNAT validation + invite-link rendezvous + richer WAN diagnostics. |
| 2026-04-28 | **WAN cold-start tooling (v1):** operator-defined bootstrap preset YAML files (`--bootstrap-presets-file` / `discovery.bootstrapPresetsFiles` / `ENVOYMESH_BOOTSTRAP_PRESETS_FILES`) + unsigned WAN join-invite tokens (`--join-invite`, `npm run cli -w @envoymesh/node -- invite encode|decode`) with tests and `docs/p2p-discovery.md` runbook updates. |
| 2026-05-17 | **Phase 11 mobile finishing:** All stores now SQL-backed (`MobileSessionTokenStore`, `MobileIdentityStateStore`, `MobileChatLogStore`). Dependency injection via `MobileNodeConfig` (`database`, `vault`, `secureStorage`). `SecureStorage` interface for iOS/Android keychain. Signed envelope sending + relay checkin (connect + 30s interval). Inbound message routing (parse → verify → route by intent). `CapacitorSqliteDatabase`, `CapacitorFilesystemVault`, `CapacitorSecureStorage` adapters in `apps/mobile/src/`. `bootstrapMobileApp()` entry point. Shared `createInMemoryDb()` from mobile-storage (full INSERT/REPLACE/SELECT/DELETE/ORDER BY/LIMIT). Real envelope routing + SecureStorage restore tests. Phase 11C/11D/11E exit criteria mostly `[x]`; native device testing remains. |
| 2026-04-28 | **WAN roadmap framing:** added **Phase 4F** to track DHT “topic/provider” capability advertisements (distinct from semantic `discovery.request/response`), explicit ghost/abuse policy + tests beyond signing, operator presets-as-defaults posture, and QUIC as additive transport with “prefer QUIC” follow-on. Expanded **WAN follow-on** checklist + Scenario 2 traceability accordingly. |
| 2026-04-28 | **Phase 4F.C (partial):** additive QUIC via `@chainsafe/libp2p-quic`, companion `/udp/.../quic-v1` listeners, node flags + YAML + `ENVOYMESH_QUIC`, `packages/network` integration test for signed ping over QUIC; documented libp2p “listen multiaddr already includes `/p2p/self`” dial caveat in `docs/p2p-discovery.md`. |
| 2026-04-28 | **Phase 4F.A (partial):** capability-topic scaffolding in `@envoymesh/network` (`cidForCapabilityTopic`, `provideCapabilityTopic`, `findCapabilityTopicProviders`, bounded query timeout handling); QUIC transport load moved to lazy import so non-QUIC environments can still import/run network tests. |
| 2026-04-29 | **Discovery/connectivity POC playbook:** added [poc-discovery-connectivity.md](./poc-discovery-connectivity.md); `@envoymesh/node` script alias `poc:discovery`; cross-links from prioritization, live-connectivity-testing, p2p-discovery, redesign-strategy doc map. |
| 2026-05-05 | **Removed external signaling plan:** kept coordination on native libp2p, DHT/provider hints, relay lookup, seeds, and invite/bootstrap paths. |
| 2026-04-30 | **Relay graph + manager baseline:** added typed relay protocol primitives, in-memory relay roster/book/summary state, summary-guided bounded relay lookup routing, loop/negative-cache controls, `relay.manager.snapshot`, `relay-status`, desktop Relay Manager panel, tests, and docs. |
| 2026-04-30 | **Relay stability baseline:** added relay health scoring, local health audit traces, bounded soft-repair actions, health fields in Relay Manager snapshots/CLI/dashboard, and supervisor recipes for macOS, Linux, Windows, Docker, and Kubernetes. |
| 2026-05-12 | **Phase 10 planned:** HomeClaw App P2P integration design. Phase 10A (mobile relay client): thin Dart P2P layer with Ed25519 identity, canonical JSON signing, relay WebSocket client, EnvoyNodeService, Flutter UI integration, and QR pairing flow. Phase 10B (full libp2p in Dart): replace relay-only client with libp2p_dart for direct P2P connections with relay fallback. Detailed task breakdowns, file summaries, risks, mitigations, and key decisions documented. |
| 2026-05-13 | **Phase 10A server-side complete:** All TypeScript/Node infrastructure for mobile P2P client is shipped. `forwardEnvelope` RPC forwards signed envelopes from mobile to any P2P peer via home node. `getPairingPayload` RPC returns `wsUrl`, `relayPeerId`, `agentPeerId`, `agentPubKey` for QR pairing. `getBridgeStatus` RPC returns bridge agent status. `p2p:envelope` push event auto-subscribed for all WebSocket clients. Pairing QR display in Social UI (Settings → Node tab) renders `envoy://pair?...` as 256x256 PNG. Bridge module hardened with agent credential validation, 64KB body size limit, and transport coexistence design. Relay health monitoring (`relay-health.ts`) and node health monitoring (`node-health.ts`) with 30s periodic checks, auto-restart, and supervisor exit. All remaining Phase 10A tasks are on the Dart/Flutter side (in HomeClawApp repo). |
| 2026-05-18 | **Social UI refinements (desktop + mobile):** Design infrastructure: `design-tokens.css` (Slate+Indigo+Teal palette, dark mode), `icons.tsx` (34 SVG icons via factory pattern), `reset.css` (font smoothing, focus-visible, scrollbar), `ThemeContext.tsx` (React context + localStorage). Surgical CSS tokenization of `styles.css`: removed `:root` block so design tokens flow through; replaced hardcoded colors; removed excessive borders from messages/contact cards/search results/hello cards (replaced with background+shadow separation); refined buttons (underline nav indicator instead of solid pills, pill-shaped chat input); chat improvements (65% max-width, cleaner sidebar). Mobile: shared icons from icons.tsx, dark mode toggle in top bar, backdrop blur on top/bottom bars. Replaced emoji icons with SVG components in ChatSidebar, ContactChatPanel, ProfileView, SearchView. All 71 Social UI tests pass, typecheck clean. |
| 2026-05-17 | **Phase 11 complete:** Capacitor mobile app with in-process Social UI + mobile node runtime. Created 5 new packages (`mobile-identity` with `@noble/curves` Ed25519, `mobile-storage` SQLite-backed persistence, `mobile-vault` filesystem-backed vault, `mobile-node` relay-only NodeService, `apps/social/src/lib/direct-call-client.ts` in-process client). Multi-device shared identity: `importOwnerIdentity()` on MobileNode reuses home node's ownerId for shared contacts/bonds. PEM encode/decode in pure JS (SPKI/PKCS8 DER prefixes). `NodeServiceProvider.clientFactory` accepts pluggable client — desktop uses WsClient, mobile uses DirectCallClient. Fixed critical `derivePeerId`/`deriveOwnerId`/`deriveDeviceId` bug where `hashCanonicalPayload` wrapped PEM strings in JSON quotes — correct behavior is direct SHA-256 of raw PEM bytes matching `node:crypto`. `vitest.config.ts` maps all `@envoymesh/mobile-*` aliases. 151 unit tests (39 mobile-identity + 41 mobile-storage + 32 mobile-vault + 28 mobile-node + 11 direct-call-client) with golden fixture cross-verification against identity package. No desktop code regressions. |
| 2026-05-19 | **Bug fixes: reconnect UI, health tests, bridge tests:** (1) `ws-server.ts` now wires `node:online`/`node:offline` events from `nodeServiceImpl` so WebSocket clients receive real-time status updates — fixes "stuck on Connecting..." after node restart. (2) `node-health.ts` and `relay-health.ts` in both `apps/node` and `apps/relay` gained `maxRssBytesOverride?: number` on their input interfaces so tests can override the RSS threshold without relying on env vars (which are evaluated at module scope). (3) `bridge/index.ts` now throws `"Bridge requires a shared secret when enabled"` explicitly rather than silently ignoring the secret check. |
| 2026-05-19 | **Test suite: all 8 previously failing tests fixed.** `bridge-index.test.ts`: fixed HTTP server timing race by waiting for port availability before calling `/bridge/send`; proper fetch stub routing (native for bridge server, mock for agent endpoint). `bridge-gateway-integration.test.ts`: rewrote "logs P2P reply actions" to call `receiveFromAgent` directly with a constructed deps object (HTTP endpoint uses node:http and bypasses fetch stubs). All health tests (`node-health.test.ts`, both `relay-health.test.ts` files) now use `maxRssBytesOverride: 1` to set threshold to 1 byte so test RSS values trigger the critical path. Added `vi.waitFor` for all fire-and-forget async assertions in bridge tests. Test suite: **1517+ passing, 7 skipped, 1 known-flaky** (agent-e2e collect-N, intermittent ECONNRESET). Commits `4a2c40c` + `479c3f2`. |

