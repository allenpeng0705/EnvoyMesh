# Implementation Plan

This is the living plan for EnvoyMesh. Update it whenever scope changes, decisions are made, or milestones are completed.

## Status Legend

- `[ ]` Not started
- `[~]` In progress
- `[x]` Done
- `[!]` Blocked or needs a decision

## Current Direction

EnvoyMesh will be implemented as a TypeScript-first, owner-controlled, peer-to-peer agent network.

The project should start small:

1. Define the protocol and trust boundaries.
2. Build a local TypeScript node that can exchange signed messages.
3. Add P2P discovery and transport.
4. Add the shared vault and policy checks.
5. Add model routing after the security path is stable.

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
- `[ ]` First UI: CLI first, dashboard later.

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
- `[ ]` Add mock `knowledge.query` handler.
- `[x]` Add audit event writer.
- `[x]` Add CLI command for local test messages.

Exit criteria:

- A local command can create, sign, dispatch, and verify a message.
- The response path writes audit events.

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

## Phase 4A: Multi-Device Protocol

Goal: support one Envoy owner identity across Primary and Satellite devices.

- `[x]` Define owner identity schema.
- `[x]` Define device identity schema.
- `[x]` Define device certificate schema.
- `[ ]` Add device pairing request and approval workflow.
- `[x]` Add Primary Envoy profile.
- `[x]` Add Satellite Envoy profile for Thin UI Mode.
- `[ ]` Add thin mobile UI channel assumptions.
- `[ ]` Explicitly defer mobile Full Node Mode.
- `[x]` Add capability checks for EMP intents.

Exit criteria:

- One owner can authorize multiple device keys.
- Device messages verify against an owner-signed device certificate.
- A device can be revoked without changing the owner identity.
- Primary and Satellite profiles are represented in protocol types.
- Mobile v1 does not require full P2P mesh participation on the phone.

## Phase 4B: A2A Ambassador Protocol

Goal: let Envoys perform long-running tasks for owners through bounded, auditable agent-to-agent workflows.

- `[x]` Define Agent Card schema.
- `[x]` Define mandate schema.
- `[x]` Define Proof of Intent schema.
- `[x]` Define task journal schema.
- `[x]` Define report schema.
- `[x]` Add `agent.card.request` and `agent.card.response`.
- `[x]` Add `task.mandate`.
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

Exit criteria:

- A task can be bounded by a signed mandate.
- A peer can verify Proof of Intent before negotiation.
- An Envoy can record task state across multiple A2A messages.
- An Envoy can produce a report with evidence and suggested actions.
- Owner can cancel an active task.

Exit criteria:

- Two terminals can run two nodes.
- Nodes discover each other locally.
- `[x]` A signed message round trip succeeds.

## Phase 5: Shared Vault

Goal: the Envoy can answer only from owner-approved data.

- `[x]` Add `shared_vault/` convention.
- `[x]` Scan `.txt`, `.md`, and `.json` files only.
- `[x]` Store document metadata.
- `[x]` Add basic text chunking.
- `[x]` Add simple search.
- `[x]` Enforce vault root path restrictions.
- `[x]` Audit vault access.

Exit criteria:

- Files outside the vault cannot be queried.
- Trusted peers can receive approved summaries.
- Raw file transfer remains disabled by default.

## Phase 6: Model Router

Goal: support local, cloud, and peer models through policy.

- `[x]` Define model provider interface.
- `[x]` Add mock provider.
- `[x]` Add local provider adapter.
- `[x]` Add cloud provider adapter behind policy.
- `[x]` Add owner approval for sensitive external calls.
- `[x]` Audit model routing decisions.

Exit criteria:

- Private context defaults to local-only.
- Cloud models can be used for approved tasks.
- Model routing decisions are visible in audit logs.

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
- `[ ]` Add dashboard packaging, signing, and installer flow later.
- `[ ]` Add live P2P visualization later.
- `[ ]` Add chat/task composition flows later.

## Current Milestone

Milestone: Phase 7 Product Surface first slice complete.

Immediate tasks:

- `[x]` Set up TypeScript workspace.
- `[x]` Create `packages/protocol`.
- `[x]` Create `packages/identity`.
- `[x]` Create `packages/bonds`.
- `[x]` Add first unit tests.
- `[x]` Create `packages/network`.
- `[x]` Add minimal `apps/node` start command.
- `[x]` Prove two local nodes can exchange a signed ping.
- `[!]` Prove two local nodes can discover each other through mDNS outside the current runner.
- `[x]` Implement EMP owner/device identity split.
- `[x]` Emit and verify certified `system.signal` at runtime.
- `[x]` Implement Agent Card and mandate schemas.
- `[x]` Add developer CLI for local profile, audit, task, approval, peer, and vault inspection.
- `[x]` Add persisted trust store and trust mutation commands.
- `[x]` Extract shared local stores into `packages/local-store`.
- `[x]` Add Electron desktop operator console for local profile, approval, trust, audit, task, peer, and vault views.
- `[x]` Verify Product Surface with `npm run typecheck`, `npm test`, and `npm run desktop:build`.

## Open Questions

- Should we use npm workspaces long term, or switch to pnpm once the repo grows?
- Should SQLite be introduced in Phase 1 or delayed until audit/storage needs are clearer?
- Should libp2p PeerID be derived from the Envoy identity key or kept separate?
- Which cloud model providers should be supported first?
- What is the default policy for sending redacted context to cloud models?
