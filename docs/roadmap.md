# Roadmap

This roadmap favors a small working mesh before advanced AI behavior.

## Phase 0: Project Foundation

Goals:

- Document the product vision.
- Choose TypeScript as the primary language.
- Define the first architecture and security boundaries.
- Set up a basic monorepo structure.

Deliverables:

- README and design docs.
- TypeScript package setup.
- Shared protocol package.
- Initial development commands.

## Phase 1: Local P2P Prototype

Goals:

- Run two Envoy nodes on the same machine or LAN.
- Generate stable peer identities.
- Discover peers with mDNS.
- Open libp2p streams.
- Exchange signed JSON messages.

Recommended libraries:

- `libp2p`
- `@libp2p/tcp`
- `@libp2p/mdns`
- `@chainsafe/libp2p-noise`
- `@chainsafe/libp2p-yamux`
- `zod`
- `@noble/ed25519`

Success criteria:

- Two terminals can start two Envoys.
- Each Envoy prints its peer ID.
- One Envoy can send a signed `ping` or `knowledge.query` message.
- The receiver verifies the signature and returns a signed response.

## Phase 2: Bond And Trust Policy

Goals:

- Create a local trust list.
- Classify peers as self, direct, referred, public, or blocked.
- Enforce policy before any agent or vault operation.
- Add challenge flow for unknown peers.

Success criteria:

- Unknown peer requests are denied or challenged.
- Trusted peer requests are allowed for summary-level access.
- Blocked peers receive no useful response.
- Policy decisions are covered by tests.

## Phase 3: Shared Vault

Goals:

- Add a `shared_vault/` directory.
- Index only files from the vault.
- Support basic metadata and text search.
- Add audit logging for vault access.

Success criteria:

- Files outside the vault cannot be queried.
- Trusted peers can receive summaries from approved vault content.
- Raw file transfer is disabled by default.
- Audit records show what was accessed and shared.

## Phase 4: Model Integration

Goals:

- Add model routing for summarization and question answering.
- Keep the model worker isolated from the network.
- Support mock and local models first, then add cloud providers behind policy.

Recommended options:

- `node-llama-cpp` for direct TypeScript integration.
- Ollama or LM Studio as local provider adapters.
- Cloud model adapters for approved tasks.
- A local Python or native process for model execution if needed.
- A simple local embedding model or external embedding process during early development.

Success criteria:

- The Envoy can answer a trusted query using vault content.
- The response includes redaction.
- The selected model provider follows owner policy.
- No cloud provider receives sensitive context unless explicitly allowed.

## Phase 5: Wider Mesh

Goals:

- Add DHT-based discovery.
- Add relay and hole punching support.
- Add offline message handling.
- Add encrypted asynchronous task workflows.

Success criteria:

- Envoys on different networks can connect.
- Offline messages are delivered when peers reconnect.
- Primary Envoy can process delegated tasks from the Mobile UI.

## Phase 6: Product Surface

Goals:

- Build a CLI for developers.
- Build a local web dashboard.
- Add QR-code trust exchange.
- Add owner approval flows.

Potential tools:

- React or Next.js for local dashboard.
- Tauri or Electron for desktop packaging.
- Capacitor or React Native for thin mobile UI exploration.

Success criteria:

- Owner can see peers, trust levels, vault documents, requests, and audit events.
- Owner can approve or reject raw sharing requests.
- Owner can pair devices or friends without editing JSON by hand.

## Open Questions

- Should the first storage layer use SQLite, files, or an embedded document database?
- Which CRDT should be used first: `loro` or `yjs`?
- Should DIDs be introduced early, or should raw Ed25519 identities come first?
- What is the minimal secure mobile UI channel for pairing, approvals, and task control?
- Which cloud providers should be supported first, and what context can they receive by default?
- How much relay infrastructure is acceptable while still keeping the design P2P-first?
