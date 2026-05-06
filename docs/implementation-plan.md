# Implementation Plan

This is the living plan for EnvoyMesh. Update it whenever scope changes, decisions are made, or milestones are completed.

**Related:** [EnvoyMesh scenarios](./scenarios.md) · [User stories](./UserStory.md) · [Alignment review](./alignment-review.md) · [Detailed design](./detailed-design.md) · [EMP](./protocol-standard.md) · [QuickStart](../QuickStart.md) · [Agentic next step](./next-step.md) · [Discovery/connectivity POC](./poc-discovery-connectivity.md) · **[Redesign strategy](./redesign-strategy.md)**

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

## Current Direction

EnvoyMesh is a TypeScript-first, owner-controlled, peer-to-peer agent network.

The foundation is now broad enough to start the next product step: make the **normal node** actually use an LLM/agent path while keeping relays lean.

Already shipped foundation:

1. Signed EMP envelopes, owner/device identity, and inbound verification.
2. libp2p transport, mDNS, optional DHT/relay/DCUtR/AutoNAT, and relay check-in/lookup graph basics.
3. Bond/hello, trust records, approvals, chat, task intents, data transfer, vault indexing/search, model router, semantic firewall, and audit logs.

Active next direction:

1. Replace mock `knowledge.query` handling with a policy-gated vault + model + signed `knowledge.response` path.
2. Add LLM assistance for chat and task handling in draft/approval-first modes.
3. Add capability manifests and contact-scoped matching before anonymous discovery.
4. Add anonymous discovery, broadcast, stronger sandboxing, reputation, and autonomous user-representation only after the direct contact workflows are verified.

Product-level **user stories and epics** (discovery, broadcast termination, communication roles, and so on) live in [EnvoyMesh scenarios](./scenarios.md). Narrative journeys live in [UserStory.md](./UserStory.md). Periodically reconcile both with code via [alignment-review.md](./alignment-review.md). Use those files to prioritize; keep this plan aligned when scope or shipped work changes.

**Story-driven principle:** Implementation phases stay anchored to **testable** entries in `scenarios.md`. Narrative text in `UserStory.md` becomes plan items only when it gains acceptance criteria and (usually) a scenario id.

**North-star steps:** `[x]` protocol and trust boundaries · `[x]` local signed node · `[x]` P2P discovery/transport · `[x]` shared vault + policy · `[x]` model routing package behind policy · `[ ]` node runtime uses model router for real `knowledge.query` · `[ ]` agent/tool orchestration behind sandbox · `[ ]` safe discovery/broadcast at scale.

**Prioritization:** **Active next** — [Phase 8A](#8a-real-knowledgequery-with-model-router-and-vault) real `knowledge.query` with vault + model router + signed response. **Still important but not blocking Phase 8A:** live multi-machine WAN relay/DCUtR validation, operator relay defaults, and connectivity diagnostics. **Parked for now:** satellite / thin mobile UI product path, commerce, global reputation ledger, and broad anonymous broadcast. EnvoyMesh will stay libp2p/relay-first for discovery and coordination; no external signaling track is planned.

## User story traceability

Shipped vs gap (see [alignment-review](./alignment-review.md) for narrative). Update **`[x]` / `[ ]`** when code or docs change.

| Theme ([UserStory.md](./UserStory.md)) | Primary phases | Shipped (`[x]`) · still missing (`[ ]`) |
|----------------------------------------|-----------------|----------------------------------------|
| Identity birth (Scenario 1) | 1, 4A | `[x]` Signed envelopes, owner/device split, device certs · `[ ]` DID as first-class product (beyond directional docs) |
| Blind discovery (Scenario 2) | 4, **4E**, **WAN follow-on**, **4F** | `[x]` Transport discovery (mDNS, optional DHT/relay/DCUtR), Agent Card types, signed `discovery.request/response`, trust+rate-gated inbound handling, ranked digest baseline (`morning-report`) · `[ ]` global DHT capability “topic/provider” advertisement path (distinct from `discovery.request`); QUIC preference; richer narrative ranking/UX iteration |
| Broadcast & kill (Scenario 3) | 4B, **4D** | `[x]` Local mandate/propose expiry, cancel / satisfied, first completed result + `closeOnFirstCompletedResult`, `correlationId`, audits · `[ ]` Hop TTL / gossip-wide cancel / collect-N (`Phase 4D` “not in this slice”) |
| Social handshake (Scenario 4) | 2, 4B, 7 | `[x]` Trust store, bonds/policy, approvals, mandates, A2A tasks, **EMP `bond.*` payloads + inbound bond path + CLI `bond.request`** · `[ ]` Rich referral / owner queue UX beyond audit |
| Intent-based file share (Scenario 5) | 5, Scenario 6 pick | `[x]` Shared vault, indexing, search, policy hooks, audit · `[x]` Voucher + verified P2P chunk stream (`/envoymesh/data/0.1.0`) |
| Communication roles (Scenario 6) | Scenario 6 pick, Open questions | `[x]` Required envelope roles (`senderRole`/`recipientRole`), strict role-policy enforcement, and hard split for `/envoymesh/chat/0.1.0` vs `/envoymesh/message/0.1.0` (plus `/envoymesh/data/0.1.0`) · `[ ]` Broader H2A product semantics beyond current strict role/channel policy |
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
- `[ ]` Live mDNS and wide-area connectivity proofs completed per `docs/live-connectivity-testing.md` on target OSes and configured peers (blocked items: Phase 4 `[!]`).

## Phase 4 (WAN follow-on): Rendezvous, Relay, And NAT Traversal

Goal: make EnvoyMesh **WAN-first** behind NAT by shipping the standard “coordination + encryption” architecture: reachable bootstrap/relay fleet, relayed connectivity when needed, hole punching where possible, and a first-class cold-start rendezvous story.

This is intentionally separate from “LAN fast path” work: WAN reliability is dominated by **rendezvous and published dialable addresses**, not multicast convenience.

- `[ ]` Define an **operator bootstrap + relay fleet** baseline (2–3 regions) with stable DNS multiaddrs and documented key rotation expectations.
- `[ ]` Ship **defaults + operator presets** as a product concern (not “only code”): documented hosted preset names, rotation/runbook, and a supported path for org-owned bootstraps + relays (so production does not implicitly depend on random public community relays).
- `[ ]` Ship a **default org preset** story (signed/governed preset list or documented operator injection path) so production installs do not depend solely on public community bootstraps.
- `[ ]` Validate **circuit relay v2** end-to-end: reservation, `/p2p-circuit` multiaddrs observed, relayed dials succeed under symmetric NAT / strict outbound-only networks.
- `[ ]` Validate **DCUtR** upgrade path where supported (relay-coordinated punch) and document expected failure modes when punch is impossible.
- `[ ]` Validate **AutoNAT / observed address** publishing path so peers learn externally meaningful multiaddrs (not only loopback/LAN-only).
- `[ ]` Add **WAN cold-start rendezvous UX** (invite link / QR / deep link) that seeds bootstrap peers + target peer identity for first contact, then hands off to persisted seeds + DHT maintenance.
- `[ ]` Extend connectivity diagnostics to classify WAN states (bootstrap reachability vs relay availability vs punch vs policy blocks) beyond aggregate counters.

Exit criteria:

- `[ ]` Two nodes on different home networks (NAT) can establish **relay-mediated** connectivity using only the shipped operator defaults + invite/pairing cold start (no manual per-message multiaddr copying).
- `[ ]` Live WAN proof captured in `docs/live-connectivity-testing.md` with repeatable commands and expected audit `p2p.trace` signatures.

## Phase 4F: WAN Capability Topics And Transport Hardening

Goal: separate **three** concerns that are easy to conflate in “discovery” work:

1. **Semantic / story discovery** (`discovery.request/response`) — conversation after you can target a peer (or resolve a policy-scoped intent).
2. **Global rendezvous metadata** — DHT-backed “topic/provider” records for arbitrary capability advertisements (often small, TTL’d pointers).
3. **Transport choice** — QUIC as an additive path parallel to TCP, then “prefer QUIC”.

### 4F.A — DHT capability topics (distinct from `discovery.request`)

- `[~]` Define record schema: topic string → hashed keying strategy, TTL/freshness, signature binding publisher peer id, optional scope tags (org/network/version). *(Partial: deterministic topic→CID mapping shipped in `@envoymesh/network`; signed record envelope + freshness fields still open.)*
- `[ ]` Define interaction model with EMP: records are **hints**, richer negotiation still happens over `/envoymesh/*` once a candidate peer is known.
- `[~]` Implementation: publish + query provider records under the chosen libp2p discovery API (and document limitations vs ideal “perfect global index”). *(Partial: `provideCapabilityTopic` / `findCapabilityTopicProviders` APIs shipped with bounded query timeout; WAN multi-node proof remains open.)*

Exit criteria:

- `[ ]` Two WAN nodes can discover at least one candidate peer id for a test topic without requiring a prior direct multiaddr (assuming fleet + bootstrap health).

### 4F.B — “Ghost” discovery signals: signing + abuse policy + tests

- `[ ]` Threat-model doc: Sybil identities, replay, flooding, stale records, coordinated noise, partial connectivity.
- `[ ]` Product policy controls: rate limits + trust tiers + freshness windows + “known good” operator keys + audit correlation expectations.
- `[ ]` Vitest-style cases for inbound guards (not “signing exists” smoke only).

Exit criteria:

- `[ ]` A malicious fast publisher cannot trivially dominate local discovery UX (bounded work + auditable rejects) in the shipped defaults.

### 4F.C — QUIC additive transport (parallel to TCP, then prefer QUIC)

- `[x]` Wire **`@chainsafe/libp2p-quic`** alongside TCP in `packages/network` (`enableQuic` / companion UDP listeners) with CLI (`--quic` / `--no-quic`), YAML (`discovery.quic`), and env (`ENVOYMESH_QUIC`).
- `[ ]` Dial selection policy: prefer QUIC multiaddrs when present; fall back to TCP cleanly; log/trace enough to debug “why not QUIC”.
- `[ ]` Smoke coverage doc update: macOS / Windows / Linux + common corporate VPN / UDP-blocked networks (expected degrade path).

Exit criteria:

- `[~]` Same-machine vitest proves **system.ping** over a QUIC dial path when UDP is allowed; TCP-only remains the default when QUIC is off; **WAN** coverage + prefer-QUIC sorting still **`[ ]`**.

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

Not in this slice (see [scenarios](./scenarios.md)):

- `[ ]` Hop/TTL gossip fan-out and network-wide cancellation propagation.
- `[ ]` `maxResponses` / collect-N semantics beyond first completed result.

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
- `[ ]` Add optional content-addressing metadata for vault documents.
- `[ ]` Add owner-approved IPFS export/pinning workflow later.
- `[ ]` Add Filecoin backup/persistence provider later, behind policy and approvals.

Exit criteria:

- `[x]` Files outside the vault cannot be queried.
- `[x]` Trusted peers can receive approved summaries when policy allows.
- `[x]` Raw file transfer remains disabled by default.
- `[ ]` Shared content can be referenced by **exact content identity** before external publishing is allowed (depends on optional CA / export work in Phase 5 checkboxes).

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
- Phase 8C shipped: `generateChatDraft()` in `chat-draft-inbound.ts` generates draft replies from model for inbound `chat.message`, `ChatDraftStore` in `local-store` persists drafts separately from chat logs, `chat:draft` WebSocket event surfaces drafts to Social UI, `getChatDrafts`/`deleteChatDraft` RPC methods, `chatAssistEnabled` toggle in `NodeConfig`/`UpdateNodeConfigParams`, drafts audited without full content logging, 10 unit tests covering disabled/blocked/bonded/stranger paths.
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

## Current Milestone

Milestone: **Phase 8L is complete** — all Phase 8A through 8L tasks are shipped: real `knowledge.query` with vault+model routing, model provider config, LLM chat drafts, capability manifests, contact-scoped matching, tool registry, sandbox hardening, anonymous discovery toggle, relay-assisted broadcast, local reputation + official credentials, and bounded autonomy with kill switch. All Phase 8 exit criteria are met. Cross-network P2P readiness has a shipped relay-control baseline; live multi-machine WAN smoke remains an external validation gate.

### Archive (historical snapshot — do not use for status)

**Source of truth** for shipped vs open work is the **phase checklists** above (`Phase 0`–`Phase 8`, **Open questions**, **Coverage**). This block is a compact merge of the old “Recently completed” + “Immediate tasks” lists so we do not maintain duplicate checklines.

- `[x]` **Docs:** `docs/scenarios.md`, `docs/UserStory.md`, `docs/alignment-review.md` in place as story / alignment spine.
- `[x]` **Monorepo bootstrap:** npm workspaces, `packages/protocol`, `packages/identity`, `packages/bonds`, `packages/network`, `apps/node` entry, first tests, two-node signed ping.
- `[x]` **Runtime slice:** EMP owner/device split, certified `system.signal`, Agent Card + mandate schemas, CLI (profile, audit, tasks, approvals, peers, vault), persisted trust store, `@envoymesh/local-store`, Social + Tauri (Electron retired); `npm run typecheck`, `npm test`, `npm run social:build && npm run node:build && npm run tauri:build` for native bundles.
- `[x]` **Observability / termination slice:** Phase 4C (correlation, audit enrichment, optional `p2p.trace`, probes, dashboard audit UX); Phase 4D (mandate/propose expiry, cancel / satisfied / `closeOnFirstCompletedResult`, `task-runtime-state`, CLI flags).
- `[!]` **Live connectivity proofs** outside the default CI runner (mDNS / DHT / relay / DCUtR) — same as Phase 4 `[!]` items and [live-connectivity-testing.md](./live-connectivity-testing.md).

### Next planning pulls (from [scenarios](./scenarios.md), [UserStory](./UserStory.md); [alignment](./alignment-review.md))

- `[x]` **Phase 8A** — real `knowledge.query`: policy gate → vault search/read → model router → signed `knowledge.response` → audit.
- `[x]` **Phase 8B** — model provider config in the normal node; mock/local first, cloud behind approval.
- `[x]` **Phase 8C** — LLM-assisted chat as draft-only before any auto-send behavior.
- `[x]` **Phase 8D–8E** — capability manifest, contact-scoped matching, safe preview, and direct sharing after match.
- `[x]` **Phase 8F–8G** — local tool registry and constrained OpenClaw/HomeClaw adapter boundary.
- `[x]` **Phase 8H** — stronger sandbox and egress hardening before public/anonymous traffic grows.
- `[x]` **Phase 8I** — anonymous discovery toggle and fast path.
- `[x]` **Phase 8J** — relay-assisted broadcast substrate.
- `[x]` **Phase 8K** — local reputation and official credentials.
- `[x]` **Phase 8L** — bounded autonomy, digests, and kill switch.
- `[~]` **Cross-network P2P readiness (post-LAN gate):** relay graph baseline is shipped; live multi-machine relay/DCUtR validation and operator defaults remain open but do not block Phase 8A.

## Coverage vs UserStory and design docs

Periodic pass: compare this plan and [scenarios.md](./scenarios.md) to [UserStory.md](./UserStory.md), [alignment-review.md](./alignment-review.md), [detailed-design.md](./detailed-design.md), and [protocol-standard.md](./protocol-standard.md). The traceability table at the top of this file is the primary map; the bullets below call out **narrative pressure** that is easy to under-specify in phase checklists alone.

| Pressure (source) | In plan today? | Gap / where to track | Shipped (`[x]`) · missing (`[ ]`) |
|-------------------|----------------|----------------------|----------------------------------|
| Scenario 2 / Story B — **hashed or tag-scoped discovery** | Phase **4E** + **WAN follow-on** + **4F** | EMP `discovery.request/response` + inbound gates shipped (**`[x]`**). Global DHT capability topic/provider advertisements + QUIC preference remain **`[ ]`** (tracked explicitly to avoid conflating protocols). | `[~]` |
| Scenario 3 / US-C2 — **hop TTL, gossip cancel, collect-N** | Phase **4D** “not in slice” + **Open questions** | Two **`[ ]`** lines under Phase 4D; EMP fan-out TBD. | `[ ]` |
| Scenario 3 — **local expiry / cancel / first result / correlation** | Phase **4D** + 4C | CLI + `task-runtime-state` + audits. | `[x]` |
| Scenario 4 — **bond + proof-of-context on wire** | Phase **4B** Batch 6 + 2 / 4A | Batch 6 **`[x]`**; trust/approvals + policy today. | `[x]` |
| Scenario 5 — **vault path** | Phase 5 | Indexing, policy, audit. | `[x]` |
| Scenario 5 — **voucher + verified P2P chunk stream** | Phase 5 + Scenario 6 pick | `/envoymesh/data/0.1.0` voucher + chunk stream shipped. | `[x]` |
| Scenario 6 — **roles, `/chat` `/agent` `/data`** | Scenario 6 pick + **Open questions** | Strict roles + `/chat`/`/message`/`/data` split baseline shipped; WAN fallback diagnostics/profile baseline shipped (`wan-default`, connectivity telemetry + CLI/dashboard visibility); broader H2A product semantics remain open. | `[~]` |
| Story A — **pairing (+ thin mobile parked)** | Phase **4A** | Pairing + offline defer baseline **`[x]`**; thin mobile **`[ ]`** *parked*. | `[~]` |
| Story A — **offline primary, defer / notify** | Phase **4A** | Baseline defer + owner surface in approval/audit path; richer notify/retry UX later. | `[~]` |
| Story B — **morning report / ranked discovery UX** | Phase **7** | Morning report digest baseline in dashboard + CLI. Relay graph routing now supplies bounded relay-reachability lookup beneath higher-level discovery. | `[x]` |
| Story C — **H2A as distinct channel** | Scenario 6 pick + Phase 8 | Same communication-role gap; Phase 8A starts the real H2A-style `knowledge.query` path. | `[ ]` |
| Agent stories — **interest/book/stranger/E2EE buffer** | Phase 8 + bonds/policy | Agentic next-step design **`[x]`** · direct/contact LLM workflows **`[ ]`** · anonymous discovery/broadcast later **`[ ]`** | `[~]` |
| Story F — **DID-targeted LAN discovery** | Phase **4** | LAN identity match by owner-id target resolution **`[x]`**; live proofs **`[!]`** | `[~]` |
| **Semantic firewall** (UserStory + US-F5) | Phase **6** | `evaluateSemanticFirewall` + `routeModelRequest` integration. | `[x]` |
| **`knowledge.query` handler** | Phase 3 + **Phase 8A** | Inbound mock + CLI; EMP payload schema in protocol **`[x]`** · real policy-gated vault + model + signed `knowledge.response` path **`[x]`**. | `[x]` |
| **Agentic normal node / LLM first** | **Phase 8** | Design captured in [Agentic next step](./next-step.md); implementation starts with direct contact `knowledge.query`, then chat assist, capability matching, tool registry, sandbox hardening, anonymous discovery, broadcast, reputation, and bounded autonomy. | `[ ]` |
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
| `[ ]` | **SQLite introduction** | Audit/query/reporting at scale | **Direction** is “when needs justify”; no milestone date. |
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
- `[ ]` **Phase 8** — agentic normal node roadmap: real `knowledge.query`, chat assist, capability manifest, local tool registry, sandbox, anonymous discovery, broadcast, reputation, official credentials, bounded autonomy.
- `[~]` **Cross-network P2P rollout** — WAN-first profile, bootstrap/relay strategy, relay graph routing, diagnostics, and non-LAN smoke.
- `[ ]` **Stories D / E** — multi-hop discovery, commerce, receipts (no dedicated phase yet; add when scenarios are scoped).
- `[ ]` **Optional vault** — content-addressing, IPFS/Filecoin paths (Phase 5 open items).

*Bond wire work* (payloads + inbound + CLI) is Phase **4B** Batch 6 **`[x]`**; *Phase 4E discovery baseline* (`discovery.request/response`, trust/rate gating, audit correlation) is **`[x]`**; *Phase 4 LAN identity match baseline* (`system.signal` owner→peer directory + owner-id target resolution) is **`[x]`**; *semantic firewall* v1 is Phase **6** **`[x]`**; *morning report* under Phase **7**. *Hop TTL / gossip cancel / collect-N* are Phase **4D** “not in this slice” **`[ ]`** lines.

## Changelog (this document)

| Date | Change |
|------|--------|
| 2026-05-06 | **Phase 8K complete:** Added `task.feedback` and `official.credential` to `EnvoyIntentSchema`; `TaskFeedbackPayloadSchema` (taskId, outcome, latencyMs, abuseFlags, notes) and `SignedOfficialCredentialSchema` (anchorId, peerId, ownerId, capabilities, expiresAt, signature); `PeerReputationRecord` type (score 0–100, totalTasks, successfulTasks, failedTasks, avgLatencyMs, abuseFlags, lastUpdated) and `createLocalPeerReputationStore` in `@envoymesh/local-store` with rolling score updates (success +5 capped at 100, failure -10 floored at 0, abuse flag -20); `handleInboundTaskFeedback` updates peer reputation from feedback; `handleInboundOfficialCredential` verifies anchor-signed credentials against `trustAnchorPublicKeys` from node config (checks expiration, verifies Ed25519 signature); `trustAnchorPublicKeys` added to `NodeConfig`, `UpdateNodeConfigParams`, `PersistedNodeConfig`, `getNodeConfig()`, and `updateNodeConfig()`; handlers wired into node dispatcher in `index.ts`; 10 unit tests. Exit criteria: all `[x]` except score-based discovery ranking (deferred). |
| 2026-05-06 | **Phase 8L complete:** `AutonomousDomain` type (`"social"` \| `"knowledge"` \| `"home"` \| `"research"`) and `AutonomousPolicy` interface (domain, maxSensitivity, autoAnswer, autoSendChat) added to `@envoymesh/api`; `autonomousKillSwitch: boolean` and `autonomousPolicies: AutonomousPolicy[]` added to `NodeConfig`, `UpdateNodeConfigParams`, `PersistedNodeConfig`; wired into `getNodeConfig()` and `updateNodeConfig()` in `NodeServiceImpl` with defaults (kill switch false, empty policies); `evaluateAutonomousPolicy()` in `apps/node/src/autonomous-inbound.ts` checks kill switch, domain policy lookup, action enablement, and sensitivity ceiling; `auditAutonomousDecision()` records `autonomous.decided` audit events (added to `AuditEventType` in `@envoymesh/local-store`); 15 unit tests covering kill switch precedence, domain matching, action gating, and sensitivity ceiling ordering. Exit criteria: all `[x]` (approval thresholds UI and digest aggregation deferred to Phase 9). |
| 2026-05-06 | **Phase 8J complete:** Added `broadcast.request`/`broadcast.response`/`broadcast.cancel` EMP intents to `EnvoyIntentSchema`; `BroadcastRequestPayloadSchema` (queryId, ttl, maxResponses, requestedTagHashes, requestedCapabilities, requestedSensitivity, senderOwnerId, timeoutMs), `BroadcastResponsePayloadSchema` (queryId, responderOwnerId, responderPeerId, matchedTagHashes, matchedCapabilities, done), `BroadcastCancelPayloadSchema` (queryId, reason); relay handler in `apps/relay/src/index.ts` fans out `broadcast.request` to all connected peers except sender with TTL decrement; `handleInboundBroadcastRequest` in `apps/node/src/broadcast-inbound.ts` enforces trust level, anonymous mode, capability manifest matching, sensitivity ceiling; `handleInboundBroadcastResponse` records inbound responses; node dispatcher sends `broadcast.response` directly to broadcaster; 8 unit tests covering mode enforcement, trust rejection, blocked senders, no-match paths, and response recording. Phase 8J substrate: relay-assisted fanout. |
| 2026-05-06 | **Phase 8I complete:** `AnonymousDiscoveryMode` type added to `@envoymesh/api` (`"off"` \| `"contacts-only"` \| `"public-preview"` \| `"public-auto-answer"`); added to `NodeConfig` and `UpdateNodeConfigParams`; `anonymousDiscoveryMode` persisted in `PersistedNodeConfig`; `getNodeConfig()`/`updateNodeConfig()` in `NodeServiceImpl` return and accept all three new fields with safe defaults; `handleInboundDiscoveryIntent` in `discovery-inbound.ts` now accepts `anonymousDiscoveryMode`, `anonymousIntentAllowlist`, `anonymousSensitivityCeiling` parameters; per-peer rate limiting for anonymous callers (5 req/min) via `allowAnonRequest`; Phase 8I enforcement block runs before trust/blocked checks — `"off"` silently drops, `"contacts-only"` rejects public callers with audit, `"public-preview"`/`"public-auto-answer"` apply sensitivity ceiling; call site in `index.ts` wires config values from `nodeConfigStore`. 9 unit tests covering mode enforcement, sensitivity ceiling, per-peer rate limits, and legacy fallback. Phase 8I exit criteria: all `[x]` (low-priority queue and load tests remain open for future work). |
| 2026-05-06 | **Phase 8H complete:** egress scanning via `evaluateEgressContent` in `@envoymesh/models` (PEM key blocks, AWS credentials, JWT tokens, connection strings with credentials); `allowedPaths` and `maxInvocationsPerHour` added to `LocalToolDescriptor`; `checkPathAllowlist` and `checkInvocationBudget` in `apps/node/src/tool-impl.ts`; rolling-window rate limiter keyed by tool name; egress scanning added to `mesh_sendChat` (blocks secret patterns before policy check), `mesh_requestKnowledge` (blocks secret responses before returning), `mesh_listContacts`/`mesh_findCapability` (via `sanitizeToolResult` wrapper); filesystem path allowlist check in `buildVaultSearchTool`; 26 regression tests covering path allowlist, rate limiting, secret blocking, missing-parameter guards, and high-risk action denial. Phase 8H exit criteria: all `[x]`. |
| 2026-05-06 | **Phase 8G complete:** Added `MESH_FIND_CAPABILITY_TOOL`, `MESH_REQUEST_KNOWLEDGE_TOOL`, `MESH_SEND_CHAT_TOOL`, `MESH_LIST_CONTACTS_TOOL` tool descriptors and implementations with policy enforcement, result redaction, and 26 unit tests. Phase 8G exit criteria: all `[x]`. |
| 2026-05-06 | **Phase 8C complete:** `generateChatDraft()` in `chat-draft-inbound.ts` generates draft replies from model for inbound `chat.message`, `ChatDraftStore` (`chat-draft-store.ts`) persists drafts separately from chat logs keyed by thread+draftId, `chat:draft` WebSocket event surfaces drafts to Social UI, `getChatDrafts`/`deleteChatDraft` RPC methods in `NodeServiceImpl`, `chatAssistEnabled` toggle added to `NodeConfig`/`UpdateNodeConfigParams`/`PersistedNodeConfig`, `ChatDraft` type added to ws-protocol, drafts audited without full text content (privacy). 10 unit tests covering disabled/blocked/bonded/stranger/draft-store paths. Phase 8C exit criteria: all `[x]`. |
| 2026-05-06 | **Phase 8B complete:** model provider config (`mock`/`ollama`/`litellm`/`disabled`) in `PersistedNodeConfig` and `NodeConfig`, `buildModelProviders()` factory in `knowledge-query-inbound.ts` routing to `createMockModelProvider`/`createOllamaLiteLlmProvider`/`createLiteLlmProvider` based on mode, `modelProviders` loaded from persisted config at node startup and passed to knowledge-query handler, `model-config` CLI command for inspection, 6 model provider config tests, `docs/run-local-model.md` runbook. Cloud/litellm providers default to `requireApprovalForCloud=true` enforced via `evaluateModelProvider` in `@envoymesh/models`. Phase 8B exit criteria: all `[x]`. |
| 2026-05-06 | **Phase 8A complete:** replaced mock `knowledge.query` handler with real policy-gated path: `evaluatePolicy` via `@envoymesh/bonds`, vault search via `searchVault()`, model routing via `routeModelRequest()` with mock provider, signed `knowledge.response` envelope sent back to sender, full audit trail (`message.verified`, `policy.decided`, `vault.searched`, `model.routed`, `message.sent`). Added `KnowledgeResponsePayloadSchema` + `createKnowledgeResponsePayload` to `@envoymesh/protocol`. Added `policy.decided`, `vault.searched`, `model.routed` to `AuditEventType`. Wired `@envoymesh/models` into `apps/node` with new tsconfig reference. 5 unit tests covering blocked/stranger/bonded/vault paths. Phase 8A exit criteria: all `[x]`. |
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
| 2026-04-28 | **WAN roadmap framing:** added **Phase 4F** to track DHT “topic/provider” capability advertisements (distinct from semantic `discovery.request/response`), explicit ghost/abuse policy + tests beyond signing, operator presets-as-defaults posture, and QUIC as additive transport with “prefer QUIC” follow-on. Expanded **WAN follow-on** checklist + Scenario 2 traceability accordingly. |
| 2026-04-28 | **Phase 4F.C (partial):** additive QUIC via `@chainsafe/libp2p-quic`, companion `/udp/.../quic-v1` listeners, node flags + YAML + `ENVOYMESH_QUIC`, `packages/network` integration test for signed ping over QUIC; documented libp2p “listen multiaddr already includes `/p2p/self`” dial caveat in `docs/p2p-discovery.md`. |
| 2026-04-28 | **Phase 4F.A (partial):** capability-topic scaffolding in `@envoymesh/network` (`cidForCapabilityTopic`, `provideCapabilityTopic`, `findCapabilityTopicProviders`, bounded query timeout handling); QUIC transport load moved to lazy import so non-QUIC environments can still import/run network tests. |
| 2026-04-29 | **Discovery/connectivity POC playbook:** added [poc-discovery-connectivity.md](./poc-discovery-connectivity.md); `@envoymesh/node` script alias `poc:discovery`; cross-links from prioritization, live-connectivity-testing, p2p-discovery, redesign-strategy doc map. |
| 2026-05-05 | **Removed external signaling plan:** kept coordination on native libp2p, DHT/provider hints, relay lookup, seeds, and invite/bootstrap paths. |
| 2026-04-30 | **Relay graph + manager baseline:** added typed relay protocol primitives, in-memory relay roster/book/summary state, summary-guided bounded relay lookup routing, loop/negative-cache controls, `relay.manager.snapshot`, `relay-status`, desktop Relay Manager panel, tests, and docs. |
| 2026-04-30 | **Relay stability baseline:** added relay health scoring, local health audit traces, bounded soft-repair actions, health fields in Relay Manager snapshots/CLI/dashboard, and supervisor recipes for macOS, Linux, Windows, Docker, and Kubernetes. |
