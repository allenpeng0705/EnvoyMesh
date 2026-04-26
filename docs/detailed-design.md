# Detailed Design

This document describes the first practical implementation design for EnvoyMesh. It focuses on a TypeScript local prototype that can grow into a wider peer-to-peer social agent network.

## Repository Layout

```text
EnvoyMesh/
  apps/
    node/                    # Long-running Envoy node process
    cli/                     # Developer CLI
  packages/
    protocol/                # Message schemas, envelopes, intent types
    identity/                # Key generation, signing, verification
    network/                 # libp2p node creation and stream handling
    bonds/                   # Trust records and policy decisions
    vault/                   # Shared vault metadata, indexing, retrieval
    agent/                   # Workflow engine and intent handlers
    models/                  # Model routing and provider adapters
    sandbox/                 # Worker isolation and restricted execution
    storage/                 # SQLite/filesystem repositories
    audit/                   # Audit event schema and writer
  docs/
  shared_vault/              # Local development vault, gitignored later
```

The first version should use package boundaries to keep security decisions clear. The network package should not directly read vault files. The agent package should call the bond and vault APIs rather than bypassing them.

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

Command:

```bash
envoy-node start --profile ./data/alice
```

### CLI Process

The CLI helps during development and early operation.

Example commands:

```bash
envoy peers list
envoy peers trust <peer-id>
envoy vault index ./shared_vault
envoy query <peer-id> "What can you share about EnvoyMesh?"
envoy audit tail
```

### Brain Worker And Model Router

The Brain Worker is a separate process or worker thread that handles summarization, retrieval-augmented answering, and later LLM calls. It is fronted by a Model Router that can select local, cloud, or peer providers when owner policy allows it.

The Brain Worker receives approved context only. It should not own the network connection and should not read arbitrary paths. Cloud and peer model calls must go through provider adapters with audit logging and policy checks.

## Package Design

### `packages/protocol`

Defines all network message contracts.

Core types:

```ts
type EnvoyIntent =
  | "system.ping"
  | "bond.request"
  | "bond.challenge"
  | "bond.challenge.response"
  | "knowledge.query"
  | "knowledge.response"
  | "task.propose"
  | "task.accept"
  | "task.result"
  | "sync.state";

interface EnvoyEnvelope<TPayload> {
  version: "0.1";
  messageId: string;
  createdAt: string;
  senderPeerId: string;
  senderPublicKey: string;
  recipientPeerId?: string;
  intent: EnvoyIntent;
  payload: TPayload;
  signature: string;
}
```

Use `zod` schemas for runtime validation. TypeScript types alone are not enough because every remote message is untrusted.

Responsibilities:

- Envelope schema.
- Intent-specific payload schemas.
- Size limits.
- Versioning helpers.
- Serialization and deserialization.

Rules:

- Reject unknown intent types by default.
- Reject payloads larger than the configured limit.
- Keep protocol messages deterministic and easy to sign.

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

First-version storage:

```text
data/
  identity.json             # Public identity metadata
  private.key               # Restricted local key file
```

Private keys must never be exposed to the agent Brain or remote peers.

### `packages/network`

Owns libp2p setup and message transport.

Initial libp2p modules:

- `libp2p`
- `@libp2p/tcp`
- `@libp2p/mdns`
- `@chainsafe/libp2p-noise`
- `@chainsafe/libp2p-yamux`

Later modules:

- `@libp2p/webrtc`
- DHT support.
- relay support.
- identify service.
- GossipSub.

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

The network package should expose a small API:

```ts
interface NetworkService {
  start(): Promise<void>;
  stop(): Promise<void>;
  send(peerId: string, envelope: EnvoyEnvelope<unknown>): Promise<void>;
  onMessage(handler: (message: InboundMessage) => Promise<void>): void;
}
```

### `packages/bonds`

Owns trust records and authorization.

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

### `packages/agent`

Contains workflow handlers for protocol intents.

Responsibilities:

- Route validated messages by intent.
- Ask the Bond Engine for policy decisions.
- Call Vault only after authorization.
- Call the Model Router only with approved context.
- Build response envelopes.
- Request owner approval when needed.

Example handler flow for `knowledge.query`:

```text
validate envelope
verify signature
load sender bond
evaluate policy
if denied: send safe denial
if challenged: send challenge
if approval required: queue owner approval
if allowed: search vault
redact context
ask model router for summary
send signed response
write audit event
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

### `packages/sandbox`

Provides isolation for risky work.

First version:

- Run Brain as a separate Node.js worker or child process.
- Pass approved context through stdin, IPC, or a local restricted API.
- Do not pass arbitrary filesystem paths.
- Disable direct network behavior by convention and process separation.

Later version:

- WASI/WebAssembly sandbox for tools.
- OS-level sandbox profiles.
- Read-only mount of specific vault paths.
- Capability-based tool permissions.

The sandbox should be designed so the Brain can answer from provided context without needing filesystem or network access.

### `packages/storage`

Abstracts local persistence.

First storage choice:

- JSON files for identity and simple config.
- SQLite for peers, bonds, messages, documents, and audit logs.

Suggested tables:

```text
peers(id, peer_id, public_key, display_name, created_at, updated_at)
bonds(id, peer_id, level, status, notes, created_at, updated_at)
documents(id, path_hash, title, sensitivity, indexed_at, updated_at)
document_chunks(id, document_id, chunk_index, content, embedding_ref)
messages(id, message_id, peer_id, direction, intent, status, created_at)
audit_events(id, event_type, peer_id, intent, decision, resource_id, created_at)
approvals(id, peer_id, request_json, status, created_at, decided_at)
```

### `packages/audit`

Writes security-relevant events.

Events:

- Peer discovered.
- Message received.
- Signature verified or rejected.
- Policy decision made.
- Vault resource accessed.
- Response sent.
- Approval queued.
- Trust level changed.

Audit logging should be append-oriented. The owner should be able to inspect what happened while offline.

## Message Design

### Envelope Signing

Sign the canonical serialized envelope without the `signature` field.

Important rules:

- Canonicalize JSON before signing.
- Include `messageId`, `createdAt`, `intent`, sender, recipient, and payload.
- Reject messages outside an acceptable time window unless they are queued offline messages.
- Track `messageId` to prevent replay.

### Example `knowledge.query`

```json
{
  "version": "0.1",
  "messageId": "msg_123",
  "createdAt": "2026-04-26T09:20:00.000Z",
  "senderPeerId": "peer_alice",
  "senderPublicKey": "pub_alice",
  "recipientPeerId": "peer_bob",
  "intent": "knowledge.query",
  "payload": {
    "query": "What can you share about EnvoyMesh?",
    "maxSensitivity": "friends",
    "allowRawFiles": false
  },
  "signature": "sig..."
}
```

### Example `knowledge.response`

```json
{
  "version": "0.1",
  "messageId": "msg_124",
  "createdAt": "2026-04-26T09:20:03.000Z",
  "senderPeerId": "peer_bob",
  "senderPublicKey": "pub_bob",
  "recipientPeerId": "peer_alice",
  "intent": "knowledge.response",
  "payload": {
    "answer": "Bob has shared a high-level summary about EnvoyMesh...",
    "sources": [
      {
        "documentId": "doc_1",
        "title": "EnvoyMesh Notes",
        "sharedAs": "summary"
      }
    ],
    "sensitivity": "friends"
  },
  "signature": "sig..."
}
```

## Request Lifecycle

### Inbound Message

1. Network receives bytes from libp2p stream.
2. Protocol package parses and validates size/schema.
3. Identity package verifies signature.
4. Storage checks replay by `messageId`.
5. Bonds package evaluates policy.
6. Agent package runs the intent workflow.
7. Audit package writes decision and result.
8. Network sends response if needed.

### Outbound Message

1. Workflow creates typed payload.
2. Protocol package wraps payload in envelope.
3. Identity package signs envelope.
4. Storage records pending outbound message.
5. Network sends message if peer is online.
6. If offline, message remains queued for retry.

## First Prototype Scope

Build the first prototype in this order:

1. Monorepo and TypeScript tooling.
2. Protocol schemas with tests.
3. Identity generation and message signing.
4. Local libp2p discovery with mDNS.
5. Signed `system.ping`.
6. Peer trust list.
7. Policy checks for public versus direct peers.
8. Basic `knowledge.query` with mock vault response.
9. Real `shared_vault/` text indexing.
10. Audit log.

Do not add real LLM providers before the signed P2P and trust flow is stable. Start with a mock model provider, then add local providers, then cloud providers after redaction and approval flows exist.

## Testing Strategy

Unit tests:

- Protocol validation.
- Signature verification.
- Policy decisions.
- Model routing policy.
- Vault path restrictions.
- Replay detection.

Integration tests:

- Two in-process Envoy nodes exchange ping messages.
- Trusted peer receives a response.
- Public peer receives a challenge or denial.
- Blocked peer receives no useful response.

Manual tests:

- Run two terminals on the same LAN.
- Pair peers.
- Send a query.
- Inspect audit log.

## Security Requirements For Version 0.1

- No request may access files outside configured vault roots.
- No unsigned message may be processed.
- No schema-invalid message may reach workflow code.
- No public peer may query vault content.
- No raw file transfer is allowed by default.
- No cloud model may receive non-public context without explicit policy approval.
- Every allowed or denied sensitive request must be audited.

## Open Implementation Decisions

- Use `pnpm` workspaces or another package manager.
- Use SQLite from the start or begin with JSON files.
- Choose the canonical JSON signing library.
- Decide how much identity data should come from libp2p PeerID versus Envoy's own Ed25519 key.
- Decide whether the first UI is CLI-only or a local web dashboard.
- Decide which model provider interface should be implemented first.
