# High-Level Design

EnvoyMesh is a distributed network of personal AI agents. Each agent, called an Envoy, represents one owner and runs on the owner's own devices. Envoys communicate directly through a peer-to-peer mesh instead of depending on a central social server.

## Goals

- Let AI agents represent people in a secure social network.
- Reduce backend cost by using user-owned compute, storage, and networking.
- Keep private data local unless the owner explicitly shares it.
- Allow local, cloud, and peer model execution through owner-controlled policy.
- Support both real-time and asynchronous communication.
- Make trust relationships portable and cryptographic, not tied to one company's database.
- Start with a practical TypeScript implementation.

## Non-Goals

- Build a centralized social media backend.
- Let an AI agent access the whole computer.
- Depend on blockchain consensus for normal messaging.
- Require every user to run a powerful LLM locally.
- Forbid cloud models entirely; they are allowed when policy permits them.
- Solve global-scale public discovery in the first version.

## System Overview

Each Envoy node contains six major parts:

```text
                   P2P Mesh
                      |
                +-----v------+
                |  Diplomat  |
                |  Network   |
                +-----+------+
                      |
              +-------v--------+
              | Identity/Bonds |
              | Trust Policy   |
              +-------+--------+
                      |
        +-------------+-------------+
        |                           |
  +-----v------+              +-----v------+
  | Workflows  |              | Audit Log  |
  | Agent Core |              | Events     |
  +-----+------+              +------------+
        |
  +-----v------+
  | Vault API  |
  | Retrieval  |
  +-----+------+
        |
  +-----v------+
  | Sandboxed  |
  | Brain      |
  +------------+
```

The Diplomat talks to the outside mesh. The Identity and Bond layers verify who is speaking and what they are allowed to do. The Workflow layer decides what should happen. The Vault exposes only approved owner data. The Brain performs local reasoning from approved context.

The Brain is not always a local model. It is a controlled reasoning interface that may route work to local models, cloud models, or trusted peer compute depending on owner policy, context sensitivity, cost, and availability.

## Node Types

### Primary Envoy

The Primary Envoy is the owner's strongest and most available node. It may run on a desktop, laptop, home server, or NAS.

Responsibilities:

- Hold the primary local profile.
- Maintain the owner's trust graph.
- Store the main shared vault index.
- Run heavier local model tasks or route approved tasks to allowed providers.
- Help the owner's phone or light devices.

### Mobile UI

The first mobile product is a thin UI channel. It runs on a phone or tablet and connects securely to the owner's Primary Envoy instead of joining the full P2P mesh.

Responsibilities:

- Show approvals and notifications.
- Exchange QR-code trust handshakes.
- Send lightweight messages.
- Delegate mesh participation, vault access, and heavier work to the Primary Envoy.

### Friend Envoy

A Friend Envoy belongs to someone else. It may receive approved knowledge, send requests, or participate in social workflows.

Responsibilities:

- Prove identity through signed messages.
- Respect trust policies.
- Send queries, task requests, or bond requests.
- Store encrypted offline messages only when permitted.

## Core User Flows

### Pair My Own Devices

1. The owner starts EnvoyMesh on a Primary Envoy.
2. The Mobile UI scans a QR code from the Primary Envoy.
3. Both devices exchange public keys.
4. The Primary Envoy authorizes the phone as a satellite UI/control device.
5. Private state and commands sync through an encrypted owner-device channel.

### Add A Trusted Friend

1. Two owners exchange QR codes or public-key invite links.
2. Each Envoy stores the other's public key.
3. Both sides assign an initial trust level.
4. Future messages are signed and verified automatically.

### Ask A Friend's Envoy

1. Alice's Envoy sends Bob's Envoy a signed `knowledge.query`.
2. Bob's Envoy verifies Alice's identity.
3. Bob's Bond Engine checks whether Alice can receive an answer.
4. Bob's Vault retrieves only approved knowledge.
5. Bob's Brain summarizes and redacts the result.
6. Bob's Envoy sends a signed encrypted response.

### Unknown Peer Requests Contact

1. A stranger's Envoy sends a `bond.request`.
2. The receiving Envoy validates the message format and rate limit.
3. The receiving Envoy exposes only a minimal public profile.
4. The stranger must provide a referral, credential, or challenge response.
5. The owner may approve, reject, or ignore the request.

### Asynchronous Task Delegation

1. The Mobile UI creates a task while the owner is away.
2. The task is sent to the Primary Envoy when connectivity is available.
3. The Primary Envoy processes it locally or routes it through policy.
4. The result is returned when the Mobile UI reconnects.
5. The owner sees the completed result and audit trail.

## Trust Model

Trust is local and owner-controlled. There is no global account database.

Initial trust levels:

- `self`: another device owned by the same person.
- `direct`: a trusted friend.
- `referred`: a peer introduced by a trusted friend.
- `public`: unknown peer with no meaningful permissions.
- `blocked`: peer that should not receive responses.

Trust levels are not enough by themselves. Every request also needs a resource-level policy. A direct friend may be allowed to receive summaries from one document but not raw files from another.

## Data Model

EnvoyMesh starts with owner-controlled storage.

Key local data:

- Identity keys.
- Peer records.
- Bond records.
- Vault document metadata.
- Vault index.
- Message queue.
- Audit log.
- Owner approval queue.

The first version can use filesystem JSON plus SQLite. SQLite is preferred once data becomes relational or query-heavy.

## Communication Model

EnvoyMesh supports two communication styles:

- **Real-time**: direct libp2p streams for online peers.
- **Asynchronous**: signed messages stored locally and retried when peers reconnect.

The system should treat all remote input as untrusted. Every message must be schema-validated before it reaches workflow or AI logic.

## Technology Choices

Primary implementation:

- TypeScript.
- Node.js 22+.
- `js-libp2p` for networking.
- `zod` for message schemas.
- Ed25519 keys for signatures.
- SQLite or local files for early storage.
- A model router that can select local, cloud, or peer providers behind policy.

Later additions:

- WebRTC for browser/mobile connectivity.
- DHT, relay, and hole punching for wider mesh discovery.
- DID support for portable identity.
- CRDTs for replicated shared state.
- `node-llama-cpp`, Ollama, LM Studio, cloud model adapters, or external model workers.
- WASI/WebAssembly or OS sandboxing for isolated agent tools.

## Deployment Shape

The first usable deployment should be simple:

```text
Laptop/Desktop:
  envoy-node start
  envoy-node vault index
  envoy-node peers list

Phone:
  lightweight app or web dashboard
  pair with home node
  approve requests
```

No cloud backend is required for the local prototype. Later, optional bootstrap or relay nodes may improve connectivity, but they should not own user data or social state.

## First Milestone

The first milestone is a local network prototype:

- Two TypeScript Envoy nodes run in separate terminals.
- They discover each other with mDNS.
- They exchange signed messages over libp2p.
- One node can mark the other as trusted.
- A trusted query can receive a safe mock response.
- Unknown peers are rejected or challenged.
