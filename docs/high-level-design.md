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

Early-stage products may **redesign transports and coordination** deliberately—see [redesign strategy](./redesign-strategy.md).

For **user stories, epics, and prioritization** (discovery, broadcast termination, communication roles, file sharing, and so on), see:

- [EnvoyMesh scenarios](./scenarios.md) — structured backlog and acceptance.
- [UserStory.md](./UserStory.md) — narrative requirements and journeys.
- [Alignment review](./alignment-review.md) — how design and code compare today.
- [Implementation plan](./implementation-plan.md) — phased delivery and traceability table.
- [Detailed design](./detailed-design.md) — packages, runtime flow, and definition of **EMP fields**.

This high-level design is **living** during early development; major architecture moves are summarized in [redesign strategy](./redesign-strategy.md). When user stories and code diverge, update the **alignment review** and the **implementation plan** first, then reflect lasting architecture changes here.

## Story-driven product themes

These themes come from [UserStory.md](./UserStory.md) and map to the system diagram below:

1. **Identity and trust** — Owner authority, device keys, bonds, and policy before the Brain or Vault is exposed (Scenarios 1 and 4; Stories A, C).
2. **Mesh and discovery** — Diplomat finds peers safely; semantic discovery is a **planned** extension beyond raw mDNS/DHT (Scenario 2; Stories B, D, F).
3. **Tasks and termination** — Work is bounded in time and outcome; agents stop when policy says so (Scenario 3; Phase 4D–4E in the implementation plan).
4. **Data and communication** — Vault for approved retrieval; separate human vs agent traffic and file-transfer paths are **directional** design (Scenarios 5–6; Stories A, E).

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

### Mobile Envoy (Capacitor, Phase 11)

The mobile app is a **full EnvoyMesh node**, not a thin client. It runs on a phone or tablet and participates directly in the P2P mesh — it has its own peer identity, signing key, and can send/receive any EnvoyMesh intent.

**Architecture:** The Social UI (React SPA) and the Node runtime (`MobileNode`) run **in-process** within a single Capacitor WebView. No child process, no WebSocket server. The `DirectCallClient` wraps `NodeService` and calls methods directly — no JSON-RPC serialization. Storage uses Capacitor-native SQLite (`@capacitor-community/sqlite`) and Filesystem APIs.

**Multi-device shared identity:** The mobile app can either generate a standalone identity or **import the home node's owner identity** via QR + device certificate. When shared, ownerId is identical on both devices — contacts, bonds, and chat history are shared. Each device gets its own device keypair, and the home node signs a device certificate authorizing the mobile device.

**Crypto:** Uses `@noble/curves` (pure-JS Ed25519) and `@noble/hashes` (SHA-256) — works in browsers, WebViews, and Node.js without `node:crypto`. PEM encode/decode is implemented in pure JS using Ed25519 SPKI/PKCS8 DER prefix bytes.

**Networking:** Relay-only WebSocket transport (outbound only). No TCP/QUIC/mDNS listeners. The node acts as a WebSocket client connecting to relay URLs; all P2P traffic flows through the relay. The home node proxies P2P envelopes via `forwardEnvelope` RPC.

**Pairing via QR code:** When the mobile app scans a QR code from the Primary Envoy (home computer), the QR contains the `envoy://pair` URI with `wsUrl`, `relayPeerId`, `agentPeerId`, `agentPubKey`, and owner identity info. Both nodes create a direct bond. The mobile app becomes a peer like any other in the network. This means:

- Mobile app sends intents directly to the Primary Envoy and its AI agent
- The AI agent running on the home node is addressed as a **contact/peer** in the mobile app
- When the owner sends a message to their agent from mobile, it's just `chat.message` → agent peer
- Everything is standard EnvoyMesh P2P — no separate control channel or WebSocket API

Responsibilities:

- Generate own peer identity and signing key (standalone mode) or import owner identity (shared mode)
- Bond with Primary Envoy via QR code (same as bonding with any peer)
- Send and receive all EnvoyMesh intents (chat, knowledge, discovery, etc.)
- Connect via relay when on different network from Primary Envoy
- Cache messages and sync when reconnecting (asynchronous by default)

### Friend Envoy

A Friend Envoy belongs to someone else. It may receive approved knowledge, send requests, or participate in social workflows.

Responsibilities:

- Prove identity through signed messages.
- Respect trust policies.
- Send queries, task requests, or bond requests.
- Store encrypted offline messages only when permitted.

## Core User Flows

### Pair My Own Devices

1. The owner starts EnvoyMesh on a Primary Envoy (home computer).
2. The Primary Envoy generates a QR code containing its peer ID and multiaddr.
3. The Mobile Envoy scans the QR code and sends a `bond.hello` to the Primary Envoy.
4. The Primary Envoy accepts the bond — both nodes now have a direct P2P connection.
5. The mobile app now sees the home node and its AI agent as contacts in the peer list.
6. The owner can message their AI agent directly from the mobile app, or the agent can send proactive notifications back.

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

1. The owner sends a message to their AI agent from the Mobile Envoy.
2. The message is routed via relay (if needed) to the Primary Envoy's AI agent.
3. The AI agent processes it locally (vault search, model routing, etc.) or queues for later.
4. The AI agent responds via `chat.message` back to the Mobile Envoy.
5. The owner sees the response in the mobile app.

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

Available or emerging additions:

- WebRTC for browser/mobile connectivity.
- DHT, circuit relay, AutoNAT/DCUtR, and summary-guided relay graph routing for wider mesh discovery.
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

No cloud backend is required for the local prototype. For WAN deployments, operator-owned bootstrap and relay nodes improve connectivity, but they should not own user data or social state. Relay nodes act as address switchers and routing hints: normal nodes check in with short TTLs, relays answer bounded `relay.lookup` requests, and relay-to-relay forwarding is constrained by summaries, `maxHops`, `maxFanout`, query IDs, and negative caching.

Relay nodes also have local operator surfaces: `relay-status` in the developer CLI and the desktop Relay Manager panel. These surfaces read local snapshots and do not expose public administration by default.

## First Milestone

The first milestone is a local network prototype:

- Two TypeScript Envoy nodes run in separate terminals.
- They discover each other with mDNS.
- They exchange signed messages over libp2p.
- One node can mark the other as trusted.
- A trusted query can receive a safe mock response.
- Unknown peers are rejected or challenged.
