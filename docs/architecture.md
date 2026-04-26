# Architecture

EnvoyMesh is built as a set of local nodes connected through peer-to-peer protocols. Each node runs the same core software, but devices can take different roles depending on their capabilities.

The network follows the [EnvoyMesh Protocol](protocol-standard.md). The key architectural rule is that a person has one owner identity, while each device has its own revocable device identity. Friends trust the owner identity. Individual devices prove they are authorized representatives of that owner.

## Identity Scope

### Owner Identity

The owner identity represents the person or organization behind an Envoy.

Responsibilities:

- Act as the long-term trust anchor.
- Authorize and revoke devices.
- Sign high-risk trust changes.
- Later map to a DID document.

The owner identity should not need to be online for normal messaging. Day-to-day messages are signed by authorized devices.

### Device Identity

Every desktop, phone, home server, or embedded device has its own device key.

Responsibilities:

- Sign normal EMP messages.
- Join the P2P network when capable.
- Advertise device profile and capabilities.
- Prove authorization through an owner-signed device certificate.

This lets the same Envoy run across a computer and phone. Losing one device does not require changing the owner's social identity.

## Node Roles

### Primary Envoy

A Primary Envoy runs on a laptop, desktop, NAS, home server, or private cloud machine. It is expected to have better availability, more storage, and stronger local AI models.

Responsibilities:

- Maintain the owner's main identity and trust graph.
- Store private replicated state for the owner's devices.
- Index approved documents from the shared vault.
- Run heavier model tasks locally or route approved tasks to allowed providers.
- Help route messages for the owner's lighter devices.

### Satellite Envoy

A Satellite Envoy runs on a phone, tablet, wearable, or other lightweight device. For the first mobile version, it is a secure UI/control channel to the Primary Envoy, not a full mesh node.

Responsibilities:

- Act as the owner's personal interface.
- Receive notifications and approvals.
- Run small local tasks.
- Delegate heavier work to a trusted Primary Envoy.
- Let the Primary Envoy handle continuous P2P discovery, vault access, and heavy model work.

### Mobile UI Channel

The first mobile implementation is a thin UI channel rather than a full independent node.

Responsibilities:

- Pair with the Primary Envoy.
- Send owner commands to the Primary Envoy.
- Display results and approval prompts.
- Avoid running continuous P2P discovery or heavy model workloads.

### Friend Envoy

A friend Envoy belongs to another trusted person.

Responsibilities:

- Exchange signed messages.
- Share approved knowledge or files.
- Participate in gossip and asynchronous delivery.
- Optionally help store encrypted messages for offline peers.
- Negotiate agent-to-agent tasks within owner-approved mandates.

## Main Layers

### 1. Network Layer

The network layer is responsible for finding peers and moving encrypted messages.

Recommended tools:

- `js-libp2p` for P2P networking.
- mDNS for local discovery.
- Kademlia DHT for wider peer discovery.
- GossipSub for topic-based social updates.
- Relay and hole punching for difficult NAT environments.
- Noise or libp2p-native secure channels for encrypted transport.

The first prototype should use mDNS and direct streams on a local network. DHT, relay, and WebRTC can be added after the local protocol is stable.

### 2. Identity Layer

Every Envoy owner has a cryptographic owner identity, and every device has a device identity. The early version can use Ed25519 key pairs directly. Later versions can add DIDs and verifiable credentials.

Responsibilities:

- Generate and store owner and device keys.
- Create owner-signed device certificates.
- Sign outbound messages.
- Verify inbound messages.
- Map owner IDs and device IDs to trust records.
- Support key rotation and revocation.

### 3. Bond Layer

The bond layer contains the social trust model.

Example trust levels:

- **Self**: another device owned by the same person.
- **Direct**: a trusted friend approved by the owner.
- **Referred**: a friend of a trusted friend.
- **Public**: unknown or untrusted peer.
- **Blocked**: peer that must not receive responses.

The bond layer decides what an inbound request is allowed to do before the agent or memory layer sees it.

### 4. Agent Layer

The agent layer interprets intents and manages workflows. It should not have raw access to the machine.

Example intents:

- `system.signal`
- `agent.card.request`
- `agent.card.response`
- `bond.request`
- `auth.challenge`
- `auth.challenge.response`
- `knowledge.query`
- `knowledge.signal`
- `task.mandate`
- `task.propose`
- `task.negotiate`
- `task.accept`
- `task.reject`
- `task.result`
- `task.cancel`
- `report.create`
- `sync.state`

The agent layer should be implemented as deterministic workflow code first. LLM reasoning can be added only where it improves the workflow.

### 5. Mandate And Task Layer

The mandate and task layer controls autonomous work. It lets the Envoy act for the owner without becoming unbounded.

Responsibilities:

- Store owner-approved task mandates.
- Attach Proof of Intent to delegated A2A messages.
- Track long-running task state.
- Retry asynchronous work when peers reconnect.
- Escalate to the owner when a mandate boundary is reached.
- Support cancellation and task heartbeat.

Example task states:

- `created`
- `discovering`
- `negotiating`
- `waiting_for_peer`
- `waiting_for_owner`
- `running`
- `completed`
- `failed`
- `cancelled`

### 6. Agent Card Layer

The Agent Card layer exposes safe public or semi-public metadata about an Envoy.

Responsibilities:

- Advertise capabilities.
- Advertise public topics.
- Advertise protocol versions.
- Summarize public trust policy.
- Help other Envoys decide whether negotiation is useful.

Agent Cards must not expose private vault contents or private social graph data.

### 7. Model Layer

The model layer chooses how approved reasoning work should run. It can use a local model, a cloud model, or trusted peer compute depending on owner policy.

Recommended components:

- A Model Router for provider selection.
- Local provider adapters for `node-llama-cpp`, Ollama, LM Studio, or native workers.
- Cloud provider adapters behind explicit policy gates.
- Peer provider adapters for owner devices or trusted friends.
- Audit logging for every non-local model call.

Model selection must not bypass privacy policy. Private vault context should stay local unless the owner explicitly allows another provider.

### 8. Vault And Memory Layer

The vault is the only approved data area for sharing. The Envoy can index this data, summarize it, and answer controlled queries.

Recommended components:

- A `shared_vault/` directory for explicit owner-approved files.
- A local metadata database for documents, permissions, and audit records.
- A local vector index for semantic retrieval.
- A redaction pipeline before responses leave the device.

The raw filesystem outside the vault is out of scope for the Envoy.

### 9. Reporting Layer

The reporting layer decides when and how to brief the owner.

Reporting modes:

- `instant`: high-value or time-sensitive alert.
- `brief`: batched report such as morning summary.
- `silent`: record in audit only.
- `approval`: ask the owner before continuing.

The reporting layer should summarize the work rather than replay every A2A message.

### 10. Sandbox Layer

The sandbox layer prevents the agent and tool execution from becoming a privacy leak.

Possible techniques:

- OS-level process sandboxing.
- WASI/WebAssembly modules for isolated logic.
- Worker processes with restricted environment variables.
- Read-only mounts for approved vault paths.
- Network isolation for the LLM/retrieval worker.

The network-facing Diplomat should be separated from the Brain that processes private data. The Brain should not directly open arbitrary network connections.

## Message Flow

### Trusted Knowledge Query

1. Peer A sends a signed `knowledge.query` request.
2. Peer B verifies the signature.
3. Peer B checks the sender's bond level.
4. Peer B searches only the approved vault index.
5. Peer B redacts sensitive output.
6. Peer B returns a signed encrypted response.
7. Peer B records the exchange in an audit log.

### Stranger Bond Request

1. Unknown peer sends `bond.request`.
2. Local Envoy verifies the message is well-formed and rate-limited.
3. Local Envoy exposes only a minimal public profile.
4. Local Envoy issues a challenge or asks for referral proof.
5. If the workflow succeeds, the peer becomes `Referred` or awaits owner approval.

### Owner Device Delegation

1. Mobile UI receives a task or owner command.
2. Mobile UI sends it to the owner's Primary Envoy over the secure channel.
3. Primary Envoy creates or updates the signed task workflow.
4. Primary Envoy runs the task locally or routes it through approved model policy.
5. Primary Envoy returns `task.result`.
6. Mobile UI presents the result to the owner.

### Owner Device Pairing

1. Primary Envoy displays a QR code containing owner ID, pairing endpoint, and nonce.
2. New device generates a device key.
3. New device sends a signed pairing request.
4. Owner approves the device.
5. Primary Envoy signs a device certificate.
6. New device uses its device key and certificate for future EMP messages.

### Autonomous Friend Or Book Search

1. Owner gives the Envoy a task, such as finding a friend with a skill or locating a book.
2. Envoy checks whether it has a valid mandate for the task.
3. Envoy uses Agent Cards, trusted peers, and discovery topics to find candidate Envoys.
4. Envoy sends `task.propose` with Proof of Intent.
5. Candidate Envoys verify identity, mandate, and policy.
6. Envoys negotiate scope using `task.negotiate`.
7. Envoy records partial results as peers respond or time out.
8. Envoy creates a report in instant, brief, silent, or approval mode.

### Owner Reporting

1. Task state changes or completes.
2. Reporting layer evaluates priority, urgency, and owner presence.
3. Low-value updates stay silent and go to audit.
4. Routine summaries become a brief.
5. Time-sensitive opportunities become instant alerts.
6. Boundary-crossing actions become approval prompts.

## Suggested Repository Structure

```text
EnvoyMesh/
  apps/
    node/                 # Desktop/home Envoy process
    cli/                  # Developer CLI
  packages/
    protocol/             # Message schemas and intent types
    identity/             # Keys, signatures, peer IDs
    network/              # libp2p setup and transport
    bonds/                # Trust policy engine
    vault/                # Shared vault indexing and retrieval
    agent/                # Workflows and local reasoning interface
    sandbox/              # Isolated execution helpers
  docs/
  shared_vault/           # Local example only, likely gitignored later
```

The first implementation should keep packages small and explicit. Avoid building a complex plugin system until the core handshake, trust, and vault flows work end to end.
