# Detailed Design

This document is the **engineering companion** to the [EnvoyMesh Protocol](./protocol-standard.md) (EMP) and the product narratives in [UserStory.md](./UserStory.md). It describes how the **current TypeScript monorepo** is structured, how messages move through a node, and which concerns are **implemented today** versus **planned** (older sketches mentioned separate `agent` / `audit` / `storage` packages; those responsibilities are mostly folded into `apps/node` and `@envoymesh/local-store` for now).

For phased delivery and user-story traceability, see [implementation plan](./implementation-plan.md) and [alignment review](./alignment-review.md).

## EnvoyMesh Protocol (EMP) and “EMP fields”

**EMP** (EnvoyMesh Protocol) is the **normative contract** for wire messages: intent names, payload shapes, signing rules, mandates, and task lifecycle. The human-readable spec is [`protocol-standard.md`](./protocol-standard.md); the **executable** definitions live in `@envoymesh/protocol` (`packages/protocol`) as **Zod** schemas and TypeScript types.

**EMP fields** are the **named, schema-defined properties** on those protocol objects — the keys you must treat as part of the contract when validating, signing, or persisting messages. Examples (non-exhaustive; see Zod schemas in `packages/protocol/src/index.ts`):

| Artifact | Examples of EMP fields |
|----------|-------------------------|
| **Envelope** | `version`, `messageId`, `correlationId?`, `createdAt`, `senderPeerId`, `senderPublicKey`, `recipientPeerId?`, `intent`, `payload`, `signature` |
| **Mandate** (unsigned + `signature`) | `mandateId`, `ownerId`, `issuedToDeviceId`, `taskIntent`, `objective`, `expiresAt`, `closeOnFirstCompletedResult`, `allowedActions`, `maxSensitivity`, … |
| **Task A2A payloads** | e.g. `task.propose`: `taskId`, `mandateId`, `proofOfIntent`, `objective`, `requestedResult`, `expiresAt?`, … |

Rules of thumb:

- If a property is **not** in the Zod schema for that artifact, it is **not** an EMP field yet (even if user stories talk about it).
- New cross-cutting headers (e.g. **sender/receiver role** from [communication roles](./UserStory.md#scenario-6--communication-roles-who-talks-to-whom)) become EMP fields only after a **protocol version** bump and updated **canonical signing** (`envelopeForSigning`, etc.).

## Repository layout (current)

```text
EnvoyMesh/
  apps/
    node/                 # libp2p node, relay roster/router, inbound guard, task dispatcher, task runtime guard, developer CLI
    social/               # Social web UI (Vite + React)
    tauri/                # Native shell: WebView loads built Social; spawns Node
    relay/                # Standalone relay binary
  packages/
    protocol/             # EMP: Zod schemas, intents, payloads, helpers
    identity/             # Keys, signing, verification, mandates, device certs
    bonds/                # Policy evaluation (bond level × sensitivity × intent)
    network/              # js-libp2p: TCP, Noise, Yamux, optional DHT/relay/DCUtR, /envoymesh/message/0.1.0
    local-store/          # Profile, task journal JSONL, audit JSONL, approvals, trust store, relay manager snapshots, task-runtime-state.json
    vault/                # shared_vault indexing, chunking, search, vault audit helpers
    models/               # Model router and provider adapters
  docs/
  shared_vault/           # Local dev vault content (convention; not always committed)
```

**Boundary rule:** `packages/network` must not read vault files. `apps/node` (and future workflow packages) should call **bonds**, **vault**, and **local-store** through typed APIs rather than bypassing them.

## Runtime Processes

### Envoy Node Process

The node process is the main local daemon.

Responsibilities:

- Start the libp2p node.
- Load identity keys.
- Load local peer and bond records.
- Register protocol stream handlers.
- Dispatch validated messages to workflows.
- Write audit events.

Command (workspace):

```bash
npm run node:dev -- --profile ./data/alice
```

### CLI process

Developer CLI runs via **`npm run cli -w @envoymesh/node`** (see [QuickStart](../QuickStart.md)): profile, audit, tasks, approvals, trust, vault-index, vault-search. Published binaries `envoy-node` / `envoyctl` map to built `apps/node` output.

### Brain Worker And Model Router

The Brain Worker is a separate process or worker thread that handles summarization, retrieval-augmented answering, and later LLM calls. It is fronted by a Model Router that can select local, cloud, or peer providers when owner policy allows it.

The Brain Worker receives approved context only. It should not own the network connection and should not read arbitrary paths. Cloud and peer model calls must go through provider adapters with audit logging and policy checks.

### Bridge (P2P ↔ HTTP Pipe)

The bridge is a lightweight, self-contained module (`apps/node/src/bridge/`) that makes the EnvoyMesh Node act as a transparent message pipe between P2P `chat.message` traffic and an external agent (OpenClaw, HomeClaw, Hermes, etc.).

**Design principles:**
- **Pure message pipe** — no tool discovery, no session management, no SDK. The bridge forwards messages and returns replies.
- **One node = one bridge = one agent** — each node runs at most one bridge, configured to talk to one external agent.
- **Agent-agnostic** — the bridge does not know or care what agent is on the other end. Any HTTP-speaking agent works.
- **Self-contained** — the bridge lives entirely in `apps/node/src/bridge/` with its own config, identity, and HTTP server.
- **Separate from `__envoy_ai__`** — the bridge agent has its own peer identity, distinct from EnvoyMesh's native AI agent.

**Architecture:**

```
┌──────────────────────┐                         ┌──────────────────────┐
│   External Agent     │                         │   EnvoyMesh Node     │
│   (OpenClaw etc.)    │                         │                      │
│                      │  POST /bridge/send      │  ┌────────────────┐  │
│  agentUrl ◄──────────┼─────────────────────────┼──► HTTP server    │  │
│  (default:           │                         │  │ (port 3031)    │  │
│   localhost:8080)    │  { text: "reply" }      │  └───────┬────────┘  │
│                      │◄─────────────────────────┼──────────┘           │
└──────────────────────┘   HTTP response          │         │            │
                                                  │  receiveFromAgent()  │
                                                  │         │            │
                                                  │  sign EMP envelope   │
                                                  │  senderRole: agent   │
                                                  │         │            │
                                                  │   mesh.sendChat()    │
                                                  │         │            │
                                                  │    P2P (libp2p)      │
                                                  │         │            │
                                                  │  ┌──────▼─────────┐  │
                                                  │  │  Peer Contact   │  │
                                                  │  └────────────────┘  │
                                                  └──────────────────────┘
```

**Message flow:**

1. Peer sends `chat.message` to the bridge's agent peer ID → P2P network delivers to node
2. `mesh.onMessage()` dispatches to bridge handler
3. Bridge forwards to external agent via `POST agentUrl` with `{ from, fromOwnerId, fromName, text }`
4. Agent processes and optionally replies by calling `POST /bridge/send` with `{ to, text }`
5. Bridge resolves `to` to a peer ID (accepts peer IDs directly, or resolves ownerIds via peer directory)
6. Bridge creates signed EMP envelope (`senderRole: "agent"`, `recipientRole: "human"`, intent `chat.message`)
7. Envelope is sent via P2P

**Identity:**

The bridge generates its own agent keypair on first run, persisted as `bridge-identity.json`. The agent peer ID is derived from `sha256(ownerId + agentPublicKeyPem)`. This identity is separate from the node's libp2p peer ID and from the native AI agent identity (`__envoy_ai__`).

**Configuration:**

```json
// bridge-config.json in profile directory
{
  "enabled": true,
  "agentUrl": "http://localhost:8080/message",
  "listenPort": 3031,
  "secret": "optional-shared-secret"
}
```

**Security:**
- Optional Bearer token auth on both directions (HTTP server and outbound fetch)
- Bridge handler only processes messages addressed to its agent peer ID
- Agent replies go through standard P2P signing and role policy
- Role policy updated: `chat.message` requires at least one human role (agent↔human OK, agent↔agent blocked)

## Package Design

### `packages/protocol` (EMP implementation)

Defines **all EMP message contracts**: `EnvoyEnvelopeSchema`, mandate and task payloads, agent card types, reports, and helpers such as `createUnsignedEnvelope`, `envelopeForSigning`, and parsers used by nodes.

**Source of truth for intent names** is `EnvoyIntentSchema` in `packages/protocol/src/index.ts` (also documented in [protocol-standard.md](./protocol-standard.md)). The table below lists **every** enum value in that order and how its **payload** is typed today. Intents **without** a dedicated `*PayloadSchema` still participate in bonds/capability evaluation; their `payload` is only `z.unknown()` on `EnvoyEnvelopeSchema` until a schema lands.

| Intent | Payload contract (`packages/protocol/src/index.ts`) |
|--------|--------------------------------------------------------|
| `system.ping` | `SystemPingPayloadSchema` · `parseSystemPingPayload` |
| `system.signal` | `SystemSignalPayloadSchema` · `parseSystemSignalPayload` |
| `agent.card.request` | `AgentCardRequestPayloadSchema` · `parseAgentCardRequestPayload` |
| `agent.card.response` | `AgentCardResponsePayloadSchema` · `parseAgentCardResponsePayload` |
| `auth.challenge` | `AuthChallengePayloadSchema` · `parseAuthChallengePayload` |
| `auth.challenge.response` | `AuthChallengeResponsePayloadSchema` · `parseAuthChallengeResponsePayload` |
| `bond.request` | `BondRequestPayloadSchema` · `parseBondRequestPayload` · `createBondRequestPayload` |
| `bond.challenge` | `BondChallengePayloadSchema` · `parseBondChallengePayload` · `createBondChallengePayload` |
| `bond.challenge.response` | `BondChallengeResponsePayloadSchema` · `parseBondChallengeResponsePayload` · `createBondChallengeResponsePayload` |
| `discovery.request` | `DiscoveryRequestPayloadSchema` · `parseDiscoveryRequestPayload` · `createDiscoveryRequestPayload` |
| `discovery.response` | `DiscoveryResponsePayloadSchema` · `parseDiscoveryResponsePayload` · `createDiscoveryResponsePayload` |
| `chat.message` | `ChatMessagePayloadSchema` · `parseChatMessagePayload` · `createChatMessagePayload` |
| `knowledge.query` | `KnowledgeQueryPayloadSchema` · `parseKnowledgeQueryPayload` · `createKnowledgeQueryPayload` |
| `knowledge.response` | No intent-specific payload schema. |
| `task.mandate` | `TaskMandatePayloadSchema` · `parseTaskMandatePayload` |
| `task.propose` | `TaskProposePayloadSchema` · `parseTaskProposePayload` |
| `task.negotiate` | `TaskNegotiatePayloadSchema` · `parseTaskNegotiatePayload` |
| `task.accept` | `TaskAcceptPayloadSchema` · `parseTaskAcceptPayload` |
| `task.reject` | `TaskRejectPayloadSchema` · `parseTaskRejectPayload` |
| `task.cancel` | `TaskCancelPayloadSchema` · `parseTaskCancelPayload` |
| `task.heartbeat` | `TaskHeartbeatPayloadSchema` · `parseTaskHeartbeatPayload` |
| `task.result` | `TaskResultPayloadSchema` · `parseTaskResultPayload` |
| `report.create` | `ReportCreatePayloadSchema` · `parseReportCreatePayload` |
| `sync.state` | No intent-specific payload schema. |

**Keeping this table aligned**

1. **Canonical list and order** — Match `EnvoyIntentSchema` in `packages/protocol/src/index.ts` exactly (same strings, same order as the `z.enum([...])` array). Any reorder is a doc + spec decision, not silent drift.
2. **Add or rename an intent** — Update `EnvoyIntentSchema`, then add or adjust the row here. If the intent is normative in EMP, update [protocol-standard.md](./protocol-standard.md) intent sections in the same change when practical.
3. **Add a typed payload** — Introduce `*PayloadSchema`, export the inferred type, add `parse*Payload` (same file, same naming pattern as existing intents), use it from inbound/task paths in `apps/node` (or callers) where validation applies; set the table cell to `*PayloadSchema` · `parse*Payload`.
4. **Intent without a payload schema** — Keep one row with the “No intent-specific payload schema” wording so the table still enumerates every enum member.
5. **Quick check before merge** — `rg 'EnvoyIntentSchema' packages/protocol/src/index.ts` and compare the string list to the markdown table; row count must equal `EnvoyIntentSchema` options length.

Responsibilities:

- Zod schemas for envelopes and payloads (**EMP fields**).
- Canonical JSON for signing.
- Size and replay constraints (see inbound guard in `apps/node` for envelope byte limits and `messageId` replay).

Rules:

- Reject unknown intents and invalid payloads at the boundary.
- Keep serialized shapes stable for signing; version bumps when breaking EMP fields.

### `packages/identity`

Handles local keys and signatures.

Responsibilities:

- Generate Ed25519 key pairs.
- Persist encrypted or permission-protected private keys.
- Derive peer identity.
- Sign message envelopes.
- Verify inbound signatures.

Initial library options:

- `@noble/ed25519` for signatures.
- Node.js `crypto` for random bytes and key storage helpers.

**Storage today:** owner and device material live under the node **profile directory** (e.g. `profile.json` with PEM keys and device certificate paths). Private keys must never be exposed to model workers or remote peers.

### `packages/network`

Owns libp2p setup and message transport.

Initial libp2p modules:

- `libp2p`
- `@libp2p/tcp`
- `@libp2p/mdns`
- `@chainsafe/libp2p-noise`
- `@chainsafe/libp2p-yamux`

**Also available in-repo (optional flags):** DHT (`kad-dht`), bootstrap, circuit relay transport and relay server, AutoNAT, DCUtR, identify — see `packages/network` and node CLI. The node runtime now layers EMP-level relay control on top of this transport stack: `relay.checkin`, bounded `relay.lookup`, relay hints, relay join/register, and compact `relay.summary` messages.

Responsibilities:

- Create and start the libp2p node.
- Advertise supported Envoy protocols.
- Discover local peers.
- Open streams to peers.
- Register stream handlers.
- Convert byte streams into validated protocol envelopes.

Protocol name:

```text
/envoymesh/message/0.1.0
```

The `EnvoyMesh` class (`packages/network`) exposes a small API: `start` / `stop`, `send(target, envelope)` → **`Promise<number>`** (round-trip latency ms), `sendRawBytes` for probes, `onMessage`, optional `onPeerDiscovered`, and `enabledFeatures` (includes `p2p-debug` when enabled).

### Relay graph modules

Relay-node behavior is split into testable state and routing helpers under `apps/node/src`:

- `relay-roster.ts` stores short-lived normal-node check-ins, relay-book entries, relay summaries, and client-side active/candidate/failed relay state.
- `relay-lookup-router.ts` selects relay neighbors for forwarded lookup using fresh summaries, relation fallback, `maxHops`, `maxFanout`, seen-query loop suppression, and a short negative cache.
- `index.ts` wires the relay protocol intents into the node runtime, emits routing traces, and periodically writes local `relay.manager.snapshot` audit rows.

The local manager read model lives in `@envoymesh/local-store` so both `relay-status` and the desktop dashboard can render the same relay roster/book/summary/routing view without opening a public admin API.

### `packages/bonds`

Owns **policy evaluation** (bond level × intent × resource sensitivity). **Persisted trust records** today live in `@envoymesh/local-store` (`trust-records.json`); bonds package stays pure and testable.

Core types:

```ts
type BondLevel = "self" | "direct" | "referred" | "public" | "blocked";

type PolicyDecision =
  | { action: "allow"; maxSensitivity: Sensitivity }
  | { action: "deny"; reason: string }
  | { action: "challenge"; challengeType: string }
  | { action: "approval_required"; reason: string };

type Sensitivity = "public" | "friends" | "trusted" | "private";
```

Responsibilities:

- Store peer trust records.
- Evaluate inbound requests.
- Enforce per-intent permissions.
- Enforce per-resource permissions.
- Create challenge workflows for unknown peers.

Example default policy:

```text
blocked  -> deny all
public   -> allow bond.request only
referred -> allow public metadata
direct   -> allow summaries from approved docs
self     -> allow private sync and delegated tasks
```

Policy must be deterministic and testable. LLMs should not decide authorization.

### `packages/vault`

Manages owner-approved shared data.

Responsibilities:

- Scan only configured vault roots.
- Store document metadata.
- Store optional content-addressing metadata, such as content hashes and future CIDs.
- Extract text from supported files.
- Build a local search index.
- Return approved snippets or summaries.
- Apply document-level permissions.

First supported file types:

- `.txt`
- `.md`
- `.json`

PDF and office documents can come later because parsing introduces more complexity and security risk.

Vault API:

```ts
interface VaultService {
  index(): Promise<void>;
  search(request: VaultSearchRequest): Promise<VaultSearchResult[]>;
  getDocumentPolicy(documentId: string): Promise<DocumentPolicy>;
}
```

The Vault should not send data directly over the network. It returns data to the workflow layer, which applies redaction, audit logging, and response shaping.

Content addressing should be introduced before any external decentralized storage integration. The first version can compute stable local content hashes for vault documents and later map those hashes to IPFS CIDs when the owner explicitly approves export or pinning.

IPFS and Filecoin are not default storage requirements. IPFS export/pinning should be an explicit owner-approved action for selected vault content. Filecoin should come later as an optional backup or persistence provider behind policy, approval, cost limits, and audit logging.

### Workflow surface (`apps/node`)

Today the **orchestration** that older docs called `packages/agent` lives in **`apps/node`**:

- **`inbound-guard`** — size, schema, replay, signature (`verifyEnvelope`).
- **`task-runtime-guard`** — mandate/propose expiry, cancelled/satisfied task state (`task-runtime-state.json`); see implementation plan Phase 4D.
- **`task-dispatcher`** — parses A2A payloads, writes **task journal** entries for handled task intents.
- **System paths** — `system.signal` / `system.ping` verification and capability checks.
- **CLI / developer CLI** — outbound envelopes for ping, signal, and A2A demos.

Future: extract a dedicated `packages/agent` (or similar) if multiple runtimes need the same workflow graph.

Example handler flow for **task A2A** (simplified):

```text
receive bytes on /envoymesh/message/0.1.0
decode envelope; inbound guard
if A2A intent: task-runtime guard (deadline / lifecycle)
task dispatcher: parse payload -> journal + state transitions
append audit rows (correlation, direction, latency, verification)
```

### `packages/models`

Chooses which model provider should handle an approved task.

Provider types:

- `local`: same device or local network service owned by the user.
- `cloud`: external hosted model provider.
- `peer`: trusted Envoy that can perform model work.

Core types:

```ts
type ModelProviderType = "local" | "cloud" | "peer";

interface ModelTask {
  taskId: string;
  taskType: "summarize" | "answer" | "classify" | "code" | "plan";
  prompt: string;
  context: string[];
  sensitivity: Sensitivity;
  triggeredByPeerId?: string;
}

interface ModelProvider {
  providerId: string;
  providerType: ModelProviderType;
  run(task: ModelTask): Promise<ModelResult>;
}

interface ModelRouter {
  run(task: ModelTask): Promise<ModelResult>;
}
```

Responsibilities:

- Register available providers.
- Evaluate owner model policy.
- Prefer local models for private context.
- Allow cloud models for approved tasks.
- Delegate to owner devices or trusted peers when useful.
- Record routing decisions in the audit log.

Default policy:

```text
private context -> local provider only
trusted context -> local provider, or cloud with explicit approval
friends context -> local provider, or cloud if owner policy allows it
public context  -> any enabled provider within cost limits
unknown peer    -> no model execution
```

The Model Router may make an automatic choice, but only inside hard policy limits. LLMs can help choose a provider later, but they must not override privacy, trust, or cost policy.

### Persistence and audit (`@envoymesh/local-store`)

**Today:** append-only **JSONL** files under the profile directory — `task-journal.jsonl`, `audit-events.jsonl`, `approval-queue.jsonl`, `trust-records.json`, `peer-directory.json` (owner-id to recent peer-id mapping from verified `system.signal`), plus **`task-runtime-state.json`** for broadcast-termination metadata. Types include audit fields such as `correlationId`, `direction`, `verificationStatus`, `latencyMs`, `protocol`, and `p2p.trace` when enabled.

**Future:** optional **SQLite** (or similar) if query volume or indexing needs exceed JSONL; see implementation plan open questions.

Audit logging stays **append-oriented** so owners can reconstruct timelines (especially with `correlationId` across peers).

## Message Design

### Envelope signing

Sign the **canonical** JSON representation of the envelope **without** the `signature` field (`envelopeForSigning` in `@envoymesh/protocol`).

Important rules:

- Canonicalize object keys before signing.
- **EMP fields** included in the signing material today: `version`, `messageId`, `correlationId` (when present), `createdAt`, `senderPeerId`, `senderPublicKey`, `recipientPeerId`, `intent`, `payload`.
- Inbound path: verify signature, enforce replay and size limits (`inbound-guard`), then domain-specific guards (task runtime, signal verification, etc.).

Optional **`correlationId`** is an EMP field used to **line up** multi-message flows in audit and operator tools; it is not a substitute for hop-level TTL until gossip semantics exist.

### Example shape (`task.propose`, illustrative)

Real payloads must satisfy `TaskProposePayloadSchema` (proof of intent, mandate id, etc.). Sketch only:

```json
{
  "version": "0.1",
  "messageId": "msg_123",
  "correlationId": "corr-search-blueprint",
  "createdAt": "2026-04-26T09:20:00.000Z",
  "senderPeerId": "peer_alice_device",
  "senderPublicKey": "-----BEGIN PUBLIC KEY-----...",
  "recipientPeerId": "peer_bob_device",
  "intent": "task.propose",
  "payload": { "...": "see TaskProposePayloadSchema" },
  "signature": "sig..."
}
```

## Request Lifecycle

### Inbound message (`apps/node` today)

1. **Network** receives bytes on `/envoymesh/message/0.1.0`; decode JSON envelope (invalid JSON does not crash the handler).
2. **Protocol** validates schema where applicable; **inbound guard** enforces size, replay, and signature.
3. **System intents** — signal/ping paths verify device binding and capabilities as required.
4. **A2A intents** — **task-runtime guard** (expiry / cancelled / satisfied), then **task dispatcher** parses payload and appends **task journal**; **local-store** appends **audit** rows (with correlation, direction, latency where implemented).
5. No separate “storage” package for replay — replay set lives in the inbound guard process (restart clears in-memory replay window; persisted journal/audit remain).

### Outbound message

1. CLI or workflow builds payload + `createUnsignedEnvelope` (optional `correlationId`).
2. **Identity** signs envelope.
3. **Network** `send` dials peer and returns latency; **local-store** may record `message.sent` audit on the sending node.

**Not yet:** durable offline outbound queue at the network layer.

## First prototype scope (status)

**Done (high level):** monorepo, protocol + tests, identity split, signed P2P ping/signal, mDNS + optional advanced connectivity, A2A task intents with journal + audits, trust store + approvals, shared vault indexing/search, model router scaffolding, Social UI + optional Tauri native wrapper (Electron-era desktop retired), correlated audit + optional `p2p-debug`, local task termination slice (Phase 4D).

**Next (story-aligned):** semantic discovery (Phase 4E), mobile as full node (Phase 9), chat **or** data sub-protocol (Scenario 6), semantic firewall before LLM on untrusted text.

Keep **mock / policy-gated** model providers until inbound trust and redaction paths are stable for each new intent surface.

## Testing Strategy

Unit tests:

- Protocol validation.
- Signature verification.
- Policy decisions.
- Model routing policy.
- Vault path restrictions.
- Replay detection.

Integration tests:

- Two EnvoyMesh nodes exchange signed `system.ping` (and optionally A2A task flows in `apps/node/test`).
- Policy tests for vault and bonds (`packages/bonds`, `packages/vault` tests).
- Task runtime guard and local-store persistence (`apps/node`, `packages/local-store` tests).

Manual tests:

- Run two terminals on the same LAN (`npm run node:dev`, `docs/live-connectivity-testing.md` where OS multicast works).
- Exchange ping/signal or CLI task envelopes; inspect **audit** JSONL (`correlationId`, direction, `p2p.trace` if `--p2p-debug`).

## Security Requirements For Version 0.1

- No request may access files outside configured vault roots.
- No unsigned message may be processed.
- No schema-invalid message may reach workflow code.
- No public peer may query vault content.
- No raw file transfer is allowed by default.
- No cloud model may receive non-public context without explicit policy approval.
- Every allowed or denied sensitive request must be audited.

## Open implementation decisions

Product- and protocol-level Q&A with **resolved vs open** status lives in [implementation plan § Open questions](./implementation-plan.md#open-questions). The bullets below stay as quick engineering defaults for this doc.

- **Package manager:** npm workspaces today; revisit **pnpm** when the repo grows (see implementation plan).
- **SQLite vs JSONL:** JSONL + JSON files for local-store today; SQLite when query/reporting needs justify it.
- **Canonical signing:** current stack uses protocol helpers + `@noble/ed25519` paths in identity; keep documented in EMP.
- **libp2p PeerID vs Envoy keys:** still open — whether to derive or explicitly map (implementation plan).
- **UI:** developer CLI + **Social** (browser or Tauri-wrapped web) for the graphical surface.
- **Model providers:** interface exists in `packages/models`; expand providers as policy stories harden.
