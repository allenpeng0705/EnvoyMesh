# Implementation Plan

This is the living plan for EnvoyMesh. Update it whenever scope changes, decisions are made, or milestones are completed.

**Related:** [EnvoyMesh scenarios](./scenarios.md) · [User stories](./UserStory.md) · [Alignment review](./alignment-review.md) · [Detailed design](./detailed-design.md) · [EMP](./protocol-standard.md) · [QuickStart](../QuickStart.md)

## Status Legend

- `[ ]` Not started
- `[~]` In progress
- `[x]` Done
- `[!]` Blocked or needs a decision

Use these prefixes on **every phased work item** and on **exit criteria** below so merges show what moved. **`[~]`** is optional in **traceability** and **coverage** summary cells when both shipped and missing parts apply. **Open questions**: the first table column is **`[x]`** once settled or **`[ ]`** while open—flip it and move the row when answered.

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
- [Phase 4A — Multi-device protocol](#phase-4a-multi-device-protocol)
- [Phase 4B — A2A ambassador protocol](#phase-4b-a2a-ambassador-protocol)
- [Phase 4C — Observability and multi-peer traceability](#phase-4c-observability-and-multi-peer-traceability)
- [Phase 4D — Task broadcast termination (local enforcement)](#phase-4d-task-broadcast-termination-local-enforcement)
- [Phase 4E — Semantic discovery (story-driven)](#phase-4e-semantic-discovery-story-driven)
- [Phase 5 — Shared vault](#phase-5-shared-vault)
- [Phase 6 — Model router](#phase-6-model-router)
- [Phase 7 — Product surface](#phase-7-product-surface)

## Current Direction

EnvoyMesh will be implemented as a TypeScript-first, owner-controlled, peer-to-peer agent network.

The project should start small:

1. Define the protocol and trust boundaries.
2. Build a local TypeScript node that can exchange signed messages.
3. Add P2P discovery and transport.
4. Add the shared vault and policy checks.
5. Add model routing after the security path is stable.

Product-level **user stories and epics** (discovery, broadcast termination, communication matrix, and so on) live in [EnvoyMesh scenarios](./scenarios.md). Narrative journeys live in [UserStory.md](./UserStory.md). Periodically reconcile both with code via [alignment-review.md](./alignment-review.md). Use those files to prioritize; keep this plan aligned when scope or shipped work changes.

**Story-driven principle:** Implementation phases stay anchored to **testable** entries in `scenarios.md`. Narrative text in `UserStory.md` becomes plan items only when it gains acceptance criteria and (usually) a scenario id.

**North-star steps (all bootstrapped at high level; depth = open `[ ]` in phases below):** `[x]` protocol and trust boundaries · `[x]` local signed node · `[x]` P2P discovery/transport · `[x]` shared vault + policy · `[x]` model routing behind policy.

**Prioritization:** **Parked for now** — satellite / **thin mobile UI** product path and phone-centric UX (no mobile app milestone). **Active next** — post-LAN **real P2P network** readiness: default WAN profile (DHT/relay/DCUtR/AutoNAT), bootstrap + relay strategy, cross-network smoke/docs, and connectivity diagnostics UX. In parallel: Phase **4D** fan-out termination on wire (TTL/gossip cancel/correlation-only cancel) and Phase **5** vault CA/export controls. Phase **4A** pairing + primary-offline defer baseline is shipped; thin-mobile checkbox stays documented but not scheduled ahead of those.

## User story traceability

Shipped vs gap (see [alignment-review](./alignment-review.md) for narrative). Update **`[x]` / `[ ]`** when code or docs change.

| Theme ([UserStory.md](./UserStory.md)) | Primary phases | Shipped (`[x]`) · still missing (`[ ]`) |
|----------------------------------------|-----------------|----------------------------------------|
| Identity birth (Scenario 1) | 1, 4A | `[x]` Signed envelopes, owner/device split, device certs · `[ ]` DID as first-class product (beyond directional docs) |
| Blind discovery (Scenario 2) | 4, **4E** | `[x]` Transport discovery (mDNS, optional DHT/relay/DCUtR), Agent Card types, signed `discovery.request/response`, trust+rate-gated inbound handling, ranked digest baseline (`morning-report`) · `[ ]` richer narrative ranking/UX iteration |
| Broadcast & kill (Scenario 3) | 4B, **4D** | `[x]` Local mandate/propose expiry, cancel / satisfied, first completed result + `closeOnFirstCompletedResult`, `correlationId`, audits · `[ ]` Hop TTL / gossip-wide cancel / collect-N (`Phase 4D` “not in this slice”) |
| Social handshake (Scenario 4) | 2, 4B, 7 | `[x]` Trust store, bonds/policy, approvals, mandates, A2A tasks, **EMP `bond.*` payloads + inbound bond path + CLI `bond.request`** · `[ ]` Rich referral / owner queue UX beyond audit |
| Intent-based file share (Scenario 5) | 5, Scenario 6 pick | `[x]` Shared vault, indexing, search, policy hooks, audit · `[x]` Voucher + verified P2P chunk stream (`/envoymesh/data/0.1.0`) |
| Communication matrix (Scenario 6) | Scenario 6 pick, Open questions | `[x]` Required envelope roles (`senderRole`/`recipientRole`), strict role-policy enforcement, and hard split for `/envoymesh/chat/0.1.0` vs `/envoymesh/message/0.1.0` (plus `/envoymesh/data/0.1.0`) · `[ ]` Broader H2A product semantics beyond current strict role/channel policy |
| **Story A** (multi-device collaborator) | 4A, 5, 6, 7 | `[x]` Primary/Satellite **protocol** profiles, P2P, vault-backed tasks, pairing + primary-offline defer baseline (`Phase 4A`) · `[ ]` Thin mobile / satellite app **parked** |
| **Stories B–C** (recruiter, researcher) | 4E, 2, 6, 7 | `[x]` Policy, approvals, audit, model path scaffolding · `[ ]` Discovery UX (**4E**), H2A wire path (**6**), morning report (**7**) |
| **Stories D–E** (multi-hop, deals) | Backlog | `[ ]` Multi-hop / commerce / receipts — add phased work when scenarios + EMP economics are scoped |
| **Story F** (crisis / LAN) | 4, 4C | `[x]` mDNS, local TCP, correlated audits, optional P2P debug, owner-id LAN target resolution (`system.signal` owner→peer map) · `[ ]` live proofs outside CI (`Phase 4` `[!]`) |

## Key Decisions

- `[x]` Primary language: TypeScript.
- `[x]` Architecture style: P2P-first, no central social backend.
- `[x]` Privacy model: owner-controlled data and explicit shared vault.
- `[x]` Model strategy: local, cloud, and peer models are all allowed through policy.
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

- `[x]` Design discovery transport: start with direct signed request/response over EMP; keep gossipsub/DHT hybrid as later extension; document privacy properties (hashed vs cleartext tags).
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
- `[x]` Add Electron desktop dashboard shell.
- `[x]` Add secure preload bridge with typed dashboard IPC.
- `[x]` Add dashboard profile, approval, trust, peer, task, audit, and vault panels.
- `[x]` Add dashboard actions for approving/rejecting requests and setting/removing trust records.
- `[x]` Add desktop dashboard documentation.
- `[x]` Add dashboard packaging, signing, and installer flow baseline (`electron-builder` config + release workflow + packaged data-path defaults).
- `[x]` Add live P2P visualization baseline (dashboard panel from `p2p.trace` with live refresh).
- `[x]` Add chat/task composition flows baseline (dashboard composer + CLI `--chat`; signed `chat.message` / `task.propose` send path).
- `[x]` **Morning report** / ranked discovery digest UX baseline (CLI `morning-report` + dashboard ranking panel backed by structured discovery events).

Exit criteria:

- `[x]` Operator can inspect profile, peers, trust, vault index, audits, approvals, and tasks from CLI and/or desktop dashboard.
- `[x]` Installable / signed desktop release pipeline baseline (CI workflow and signing/notarization secret wiring in place; credentials required in release environment).
- `[x]` Rich chat + multi-step task composition UX (thread grouping/status chips + wizard composer with presets/validation/persisted drafts).

## Current Milestone

Milestone: **Phase 7** operator console baseline is now feature-complete for this slice (dashboard + CLI + rich composition UX + pairing + discovery digest). Immediate next milestone (after same-LAN verification) is **real cross-network P2P readiness**: WAN-capable defaults + bootstrap/relay path + diagnostics and smoke tests on non-LAN topologies.

### Archive (historical snapshot — do not use for status)

**Source of truth** for shipped vs open work is the **phase checklists** above (`Phase 0`–`Phase 7`, **Open questions**, **Coverage**). This block is a compact merge of the old “Recently completed” + “Immediate tasks” lists so we do not maintain duplicate checklines.

- `[x]` **Docs:** `docs/scenarios.md`, `docs/UserStory.md`, `docs/alignment-review.md` in place as story / alignment spine.
- `[x]` **Monorepo bootstrap:** npm workspaces, `packages/protocol`, `packages/identity`, `packages/bonds`, `packages/network`, `apps/node` entry, first tests, two-node signed ping.
- `[x]` **Runtime slice:** EMP owner/device split, certified `system.signal`, Agent Card + mandate schemas, CLI (profile, audit, tasks, approvals, peers, vault), persisted trust store, `@envoymesh/local-store`, Electron dashboard shell + panels; `npm run typecheck`, `npm test`, `npm run desktop:build` clean.
- `[x]` **Observability / termination slice:** Phase 4C (correlation, audit enrichment, optional `p2p.trace`, probes, dashboard audit UX); Phase 4D (mandate/propose expiry, cancel / satisfied / `closeOnFirstCompletedResult`, `task-runtime-state`, CLI flags).
- `[!]` **Live connectivity proofs** outside the default CI runner (mDNS / DHT / relay / DCUtR) — same as Phase 4 `[!]` items and [live-connectivity-testing.md](./live-connectivity-testing.md).

### Next planning pulls (from [scenarios](./scenarios.md), [UserStory](./UserStory.md); [alignment](./alignment-review.md))

- `[~]` Broadcast / fan-out **termination** — **Phase 4D shipped locally**: mandate / propose expiry, `task.cancel` / satisfied lifecycle, `closeOnFirstCompletedResult`, correlation in envelopes + audit. Still **open**: hop TTL, gossip-wide cancel, collect-N, correlation-only cancel on the wire.
- `[x]` **Phase 4E** semantic **discovery** (signed `discovery.request/response`, trust+rate-gated inbound handling, Scenario 2, Story B baseline).
- `[x]` **Phase 4A** (**non-mobile**): device pairing + primary-offline defer / owner surface baseline. *Thin-mobile channel checkbox **parked** (satellite app out of scope for now).*
- `[x]` **Scenario 6 pick (first vertical):** voucher + chunked data path (`/envoymesh/data/0.1.0`) shipped with signed vouchers, verification, and inbound write guards.
- `[x]` **Scenario 6 follow-on (strict baseline):** required envelope roles + hard channel split for `/chat` vs `/message` + runtime rejection semantics for violations.
- `[ ]` **Cross-network P2P readiness (post-LAN gate):** WAN defaults/profile, bootstrap + relay fleet strategy, non-LAN smoke checklist, and dashboard connectivity diagnostics.
- `[x]` **Semantic firewall** (US-F5) — first slice shipped in `@envoymesh/models` (`routeModelRequest`); extend with trust/redaction/tool gates later.

## Coverage vs UserStory and design docs

Periodic pass: compare this plan and [scenarios.md](./scenarios.md) to [UserStory.md](./UserStory.md), [alignment-review.md](./alignment-review.md), [detailed-design.md](./detailed-design.md), and [protocol-standard.md](./protocol-standard.md). The traceability table at the top of this file is the primary map; the bullets below call out **narrative pressure** that is easy to under-specify in phase checklists alone.

| Pressure (source) | In plan today? | Gap / where to track | Shipped (`[x]`) · missing (`[ ]`) |
|-------------------|----------------|----------------------|----------------------------------|
| Scenario 2 / Story B — **hashed or tag-scoped discovery** | Phase **4E** | EMP discovery intents (`discovery.request` / `discovery.response`) + node trust/rate gating + audit correlation shipped as baseline. | `[x]` |
| Scenario 3 / US-C2 — **hop TTL, gossip cancel, collect-N** | Phase **4D** “not in slice” + **Open questions** | Two **`[ ]`** lines under Phase 4D; EMP fan-out TBD. | `[ ]` |
| Scenario 3 — **local expiry / cancel / first result / correlation** | Phase **4D** + 4C | CLI + `task-runtime-state` + audits. | `[x]` |
| Scenario 4 — **bond + proof-of-context on wire** | Phase **4B** Batch 6 + 2 / 4A | Batch 6 **`[x]`**; trust/approvals + policy today. | `[x]` |
| Scenario 5 — **vault path** | Phase 5 | Indexing, policy, audit. | `[x]` |
| Scenario 5 — **voucher + verified P2P chunk stream** | Phase 5 + Scenario 6 pick | `/envoymesh/data/0.1.0` voucher + chunk stream shipped. | `[x]` |
| Scenario 6 — **roles, `/chat` `/agent` `/data`** | Scenario 6 pick + **Open questions** | Strict roles + `/chat`/`/message`/`/data` split baseline shipped; WAN fallback diagnostics/profile baseline shipped (`wan-default`, connectivity telemetry + CLI/dashboard visibility); broader H2A product semantics remain open. | `[~]` |
| Story A — **pairing (+ thin mobile parked)** | Phase **4A** | Pairing + offline defer baseline **`[x]`**; thin mobile **`[ ]`** *parked*. | `[~]` |
| Story A — **offline primary, defer / notify** | Phase **4A** | Baseline defer + owner surface in approval/audit path; richer notify/retry UX later. | `[~]` |
| Story B — **morning report / ranked discovery UX** | Phase **7** | Morning report digest baseline in dashboard + CLI. | `[x]` |
| Story C — **H2A as distinct channel** | Scenario 6 pick | Same as matrix. | `[ ]` |
| Stories D / E — **multi-hop, payments** | **Backlog** | No phase block yet. | `[ ]` |
| Story F — **DID-targeted LAN discovery** | Phase **4** | LAN identity match by owner-id target resolution **`[x]`**; live proofs **`[!]`** | `[~]` |
| **Semantic firewall** (UserStory + US-F5) | Phase **6** | `evaluateSemanticFirewall` + `routeModelRequest` integration. | `[x]` |
| **`knowledge.query` handler** | Phase 3 | Inbound mock + CLI; EMP payload schema in protocol. | `[x]` |
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
| `[ ]` | **Broadcast termination on the wire** — hop TTL, **network-wide** cancel propagation, **collect-N** (`k > 1`), correlation-only cancel | Scenario 3, US-C2/US-C3 | Phase 4D is **per-receiver local** only; fan-out EMP/gossip shape TBD. |
| `[x]` | **Sender / receiver role** (human vs agent) | Scenario 6, UserStory header sketch | Required envelope roles and strict validation shipped with channel split (`/chat` vs `/message`); violations are rejected in schema/runtime/network send paths. |
| `[ ]` | **Live mDNS / DHT / relay proofs outside CI** | Story F, wide-area connectivity | Blocked on environment; [live-connectivity-testing.md](./live-connectivity-testing.md). |
| `[ ]` | **WAN bootstrap/relay operating model** | Real cross-network P2P (not LAN-only) | Need managed bootstrap peers, relay policy, and default config for desktop/node startup. |

### Backlog (track in scenarios / phases, not as single-line Q&A)

- `[x]` **Phase 4E** — semantic discovery baseline (Scenario 2, Story B, US-B1).
- `[~]` **Phase 4A** — device pairing; primary-offline defer / owner surface baseline shipped. *Thin mobile channel: **parked** (see Prioritization).*
- `[x]` **Scenario 6 vertical (first)** — voucher + `/envoymesh/data` shipped (matrix, Scenario 5).
- `[x]` **Scenario 6 vertical (next baseline)** — explicit role fields + strict `/chat` vs `/message` split with rejection semantics.
- `[ ]` **Cross-network P2P rollout** — WAN-first profile, bootstrap/relay strategy, diagnostics, and non-LAN smoke.
- `[ ]` **Stories D / E** — multi-hop discovery, commerce, receipts (no dedicated phase yet; add when scenarios are scoped).
- `[ ]` **Optional vault** — content-addressing, IPFS/Filecoin paths (Phase 5 open items).

*Bond wire work* (payloads + inbound + CLI) is Phase **4B** Batch 6 **`[x]`**; *Phase 4E discovery baseline* (`discovery.request/response`, trust/rate gating, audit correlation) is **`[x]`**; *Phase 4 LAN identity match baseline* (`system.signal` owner→peer directory + owner-id target resolution) is **`[x]`**; *semantic firewall* v1 is Phase **6** **`[x]`**; *morning report* under Phase **7**. *Hop TTL / gossip cancel / collect-N* are Phase **4D** “not in this slice” **`[ ]`** lines.

## Changelog (this document)

| Date | Change |
|------|--------|
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
| 2026-04-27 | **WAN fallback Phase C baseline:** managed bootstrap preset support (`--bootstrap-preset public-libp2p` / `ENVOYMESH_BOOTSTRAP_PRESET`) with parser validation, peer dedupe, and updated non-LAN runbook commands. |
| 2026-04-27 | **WAN fallback Phase D (item 1) baseline:** persisted discovery seeds (`discovery-seeds.json`) from manual bootstrap, successful probes, and peer discovery events; startup now auto-reseeds effective bootstrap peers from persisted seeds plus peer-directory listen addrs. |
| 2026-04-27 | **WAN fallback Phase D (item 2) baseline:** periodic jittered bootstrap reprobe loop with rotating targets, persisted success updates, bounded in-memory probe history, and new connectivity telemetry (`connectivity.reprobe.ok/fail`) surfaced by `connectivity-status`. |
