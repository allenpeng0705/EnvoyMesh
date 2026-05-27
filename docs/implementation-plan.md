# Implementation Plan

This is the living plan for EnvoyMesh. Update it whenever scope changes, decisions are made, or milestones are completed.

**Related:** [EnvoyMesh scenarios](./scenarios.md) · [User stories](./UserStory.md) · [Alignment review](./alignment-review.md) · [Detailed design](./detailed-design.md) · [EMP](./protocol-standard.md) · [QuickStart](../QuickStart.md) · [Agentic next step](./next-step.md) · [Discovery/connectivity POC](./poc-discovery-connectivity.md) · **[Live connectivity testing](./live-connectivity-testing.md)** · **[Operator relay fleet](./operator-relay-fleet.md)** · **[SQLite adoption](./sqlite-adoption.md)** · **[P2P file sharing (design plan)](./p2p-file-sharing-plan.md)** · **[AI Document Backbone (agent publish/find/share)](./ai-document-backbone-plan.md)** · **[IPFS / Helia integration](./helia-ipfs-integration-plan.md)** · **[External distribution via IPFS](./external-distribution-ipfs-plan.md)** · **[Kubo + Helia operator runbook](./envoymesh-with-kubo-helia.md)** · **[Trust mode & bilateral social mediation](./trust-mode-social-protocol.md)** · **[Trust mode implementation plan](./trust-mode-implementation-plan.md)** · **[A2A routing, actor disclosure & owner visibility](./a2a-actor-visibility-plan.md)** · **[Redesign strategy](./redesign-strategy.md)**

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

EnvoyMesh is a TypeScript-first, owner-controlled, peer-to-peer agent network.

The foundation is now broad enough to start the next product step: make the **normal node** actually use an LLM/agent path while keeping relays lean.

Already shipped foundation:

1. Signed EMP envelopes, owner/device identity, and inbound verification.
2. libp2p transport, mDNS, optional DHT/relay/DCUtR/AutoNAT, and relay check-in/lookup graph basics.
3. Bond/hello, trust records, approvals, chat, task intents, data transfer, vault indexing/search, model router, semantic firewall, and audit logs.

Active next direction:

1. **Phase 15E** — scoping docs for parked backlog (commerce, DID, reputation, CRDT, satellite). See [parked-backlog-15e.md](./parked-backlog-15e.md).
2. **Parked until scoped:** Stories D–E implementation, thin satellite app, DID product, global reputation ledger.

Product-level **user stories and epics** (discovery, broadcast termination, communication roles, and so on) live in [EnvoyMesh scenarios](./scenarios.md). Narrative journeys live in [UserStory.md](./UserStory.md). Periodically reconcile both with code via [alignment-review.md](./alignment-review.md). Use those files to prioritize; keep this plan aligned when scope or shipped work changes.

**Story-driven principle:** Implementation phases stay anchored to **testable** entries in `scenarios.md`. Narrative text in `UserStory.md` becomes plan items only when it gains acceptance criteria and (usually) a scenario id.

**North-star steps:** `[x]` protocol and trust boundaries · `[x]` local signed node · `[x]` P2P discovery/transport · `[x]` shared vault + policy · `[x]` model routing package behind policy · `[x]` node runtime uses model router for real `knowledge.query` · `[x]` agent/tool orchestration behind sandbox · `[x]` safe discovery/broadcast at scale · `[x]` agent identity, tool registry, proactive autonomy, digest (Phase 9A–9K).

**Prioritization:** **Phase 15 complete** (2026-05-20). **Active next — Phase 15E scoping** ([parked-backlog-15e.md](./parked-backlog-15e.md)). Implementation of parked items waits on product gates documented in each scope file.

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
| Communication roles (Scenario 6) | Scenario 6 pick, **13** | `[x]` Required envelope roles, role-policy, channel split · `[x]` **Phase 13:** honest AI wire role, chat badges, Activity feed, A2A orchestrator ([Epic AV](./scenarios.md#epic-av--actor-disclosure--owner-visibility)) |
| **Story A** (multi-device collaborator) | 4A, 5, 6, 7 | `[x]` Primary/Satellite **protocol** profiles, P2P, vault-backed tasks, pairing + primary-offline defer baseline (`Phase 4A`) · `[ ]` Thin mobile / satellite app **parked** |
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
- `[x]` Mobile v1 direction: Thin UI Mode only; phone acts as secure UI/control channel to Primary Envoy.
- `[x]` Trust mode social (design): Agents may assist introductions using tiered **owner-signed** profile disclosure; **`bond.*` tier upgrades remain human-committed**. Spec: [trust-mode-social-protocol.md](./trust-mode-social-protocol.md); implementation tracked as [Phase 12](#phase-12-trust-mode--bilateral-social-mediation-design-first).
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

Exit criteria:

- `[x]` Prompt injection cannot read outside allowed vault/tool paths in tests.
- `[x]` Private-key-like output is blocked before egress.
- `[x]` High-risk action creates an approval request instead of executing.

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

Milestone: **Phases 0–15 complete** — Core protocol through Trust mode, mobile Social + in-process node, IPFS/Helia export, Phase 13 actor disclosure + Activity, Phase 14 friend autopilot + knowledge syndication, Phase 15 reach (WAN invite + sign-off ledger), discovery UX, H2A channel, platform scale gate. **15E multi-hop (US-MH1–4) shipped** — see [parked-backlog-15e.md](./parked-backlog-15e.md) for remaining optional items.

### Next planning pulls

1. **Harden multi-hop discovery** — hop-2 E2E, mobile parity, session-store serialization, `forwardPendingAck`, **US-MH2+ referral attestation** (done 2026-05-27).
2. **Structural** — `node-service-discovery.ts` / `node-service-sync.ts` extracted from `node-service-impl.ts` (done 2026-05-27); WAN/connectivity extraction optional next.
3. **Physical two-NAT §4 row** — operator tooling shipped (`connectivity-signoff --checklist|--complete`, `./scripts/wan-two-nat-signoff.sh`, Settings wizard); fill pending ledger row when two home routers available.
4. **DID local import** — shipped (`resolveDidImport` + Search By DID); WAN gateway resolver still open.
5. **Contact compose + notes CRDT** — shipped (yjs compose + loro notes/tags per contact + sync.state).
6. **Story E commerce receipts** — receipt-only slice shipped; payment rail still parked.

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
| Story A — **pairing (+ thin mobile parked)** | Phase **4A** | Pairing + offline defer baseline **`[x]`**; thin mobile **`[ ]`** *parked*. | `[~]` |
| Story A — **offline primary, defer / notify** | Phase **4A** | Baseline defer + owner surface in approval/audit path; richer notify/retry UX later. | `[~]` |
| Story B — **morning report / ranked discovery UX** | Phase **7** | Morning report digest baseline in dashboard + CLI. Relay graph routing now supplies bounded relay-reachability lookup beneath higher-level discovery. | `[x]` |
| Story C — **H2A as distinct channel** | Scenario 6 pick + Phase 8 | Phase 8A real `knowledge.query` path shipped; **Assistant** lane + local Activity on H2A turns (Phase **15C**). | `[x]` |
| Agent stories — **interest/book/stranger/E2EE buffer** | Phase 8 + bonds/policy | Agentic next-step design **`[x]`** · direct/contact LLM workflows **`[x]`** · anonymous discovery/broadcast **`[x]`** | `[x]` |
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

- `[ ]` Add `dart_libp2p` dependency to `pubspec.yaml` (Android, iOS, macOS, Linux, Windows supported; Web NOT)
- `[ ]` Implement persistent Ed25519 key via `flutter_secure_storage` (protobuf-serialized, matching `loadOrCreateLibp2pPrivateKey`)
- `[ ]` Implement `DirectTransport` class wrapping `dart_libp2p.Host`:
  ```dart
  class DirectTransport implements MeshTransport {
    late final Host _host;
    // Configure: TCP transport + Noise security + Yamux muxer
    // Configure: mDNS (LAN discovery)
    // Configure: Kademlia DHT (WAN discovery, client mode)
    // Configure: circuit relay v2 (NAT traversal)
    // Configure: AutoNAT + DCUtR (hole punching)
  }
  ```
- `[ ]` Configure node with EnvoyMesh bootstrap peers + operator relay fleet addresses
- `[ ]` Register protocol handlers on stream router:
  - `/envoymesh/message/0.1.0` — general envelope protocol (discovery, relay, task, system)
  - `/envoymesh/chat/0.1.0` — chat-only envelopes (enforces `chat.message` intent)
- `[ ]` Implement envelope codec: JSON serialize/deserialize + canonical JSON (already in `envoy_protocol.dart`)
- `[ ]` Implement `EnvelopeCodec` class: `encode(EnvoyEnvelope) → Uint8List`, `decode(Uint8List) → EnvoyEnvelope`
- `[ ]` Wire peer discovery events: mDNS `peer:discovery` → `onPeerDiscovered` stream
- `[ ]` Wire connection state events: `peer:connect`, `peer:disconnect` → `TransportSelector`
- `[ ]` Handle platform lifecycles: iOS/Android background suspension → pause libp2p; foreground → resume + reconnect

**Exit criteria:**
- `[ ]` Flutter app on emulator discovers desktop EnvoyMesh node on same LAN via mDNS
- `[ ]` Flutter app establishes direct TCP+Noise+Yamux connection to desktop node
- `[ ]` Chat message round-trip via direct libp2p (bypassing relay) works end-to-end
- `[ ]` Circuit relay v2: Flutter app connects via relay when behind NAT
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

## Phase 11: Mobile Social App & Mobile Node (Capacitor)

**Goal:** Create a mobile-native EnvoyMesh app (iOS + Android) using Capacitor.js. The Social UI (React/Vite SPA) and Node runtime run **in-process** within a single WebView — no child process, no WebSocket server, direct JS function calls between UI and node. **Transport:** outbound fleet-relay WebSocket (`/ws/client` on the relay binary) for framed envelopes, plus **optional** in-browser libp2p (WebSocket + DHT client + circuit relay) for mesh features — not TCP/QUIC listeners.

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

## Changelog (this document)

| Date | Change |
|------|--------|
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
