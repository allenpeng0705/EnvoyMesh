# Roadmap

> **Note:** Phase numbering and shipped status live in the **[implementation plan](./implementation-plan.md)**. **[Redesign strategy](./redesign-strategy.md)** governs early-stage breaking changes. This file keeps a **historical sketch** of early roadmap thinking—prefer the implementation plan for current truth.

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
- Add optional content-addressing metadata so approved documents can be referenced by exact content identity.
- Add audit logging for vault access.

Success criteria:

- Files outside the vault cannot be queried.
- Trusted peers can receive summaries from approved vault content.
- Raw file transfer is disabled by default.
- External IPFS publishing or pinning requires an explicit owner-approved action.
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

## Later: Decentralized Persistence

Goals:

- Support optional IPFS export and local pinning for approved vault content.
- Treat IPFS CIDs as references to exact content, not as permission to publish private data.
- Add Filecoin only as a later backup/persistence provider behind owner policy, approval, cost limits, and audit logging.

Success criteria:

- No vault content is published to IPFS or Filecoin by default.
- Every external storage action records what was exported, why, who approved it, and how it can be revoked or unpinned.
- Filecoin storage deals are optional and never required for local EnvoyMesh operation.

## Phase 6: Product Surface

Goals:

- Build a CLI for developers.
- Build a local web dashboard.
- Add QR-code trust exchange.
- Add owner approval flows.

Potential tools:

- React or Next.js for local dashboard.
- Tauri for desktop packaging (Electron path removed).
- Capacitor for mobile Social UI + in-process node (Phase 11, shipped).

Success criteria:

- [x] Owner can see peers, trust levels, vault documents, requests, and audit events.
- [x] Owner can approve or reject raw sharing requests.
- [x] Owner can pair devices or friends without editing JSON by hand.
- [x] Mobile app (iOS + Android) runs Social UI and node in-process via Capacitor (Phase 11).

## Open Questions

- Should the first storage layer use SQLite, files, or an embedded document database?
- Which CRDT should be used first: `loro` or `yjs`?
- Should DIDs be introduced early, or should raw Ed25519 identities come first?
- What is the minimal secure mobile UI channel for pairing, approvals, and task control?
- Which cloud providers should be supported first, and what context can they receive by default?
- How much relay infrastructure is acceptable while still keeping the design P2P-first?

---

## AI/Agent Vision (beyond Phase 18)

> **Note:** Phases 0–18 are complete per the [implementation plan](./implementation-plan.md). This section captures the **forward-looking AI/Agent roadmap** — directions for how EnvoyMesh's native agent can leverage the P2P mesh in ways no centralized platform can. Tracking moves to the implementation plan when phased.

### Refined existing features

These build on what Phase 18 already shipped, with expanded scope:

#### 1. Making friends — with AI bond autonomy

**Current (Phase 18):** Social proxy discovers profiles, runs Trust-mode intros, and proposes bonds. The human always commits the bond.

**Next:** Owner can grant the agent a `bond_autonomy` mandate. When active, the agent can auto-accept bond requests within policy bounds — e.g. only for contacts that pass a referral check, meet capability/topic overlap thresholds, or fall below a sensitivity ceiling. All auto-bonds are fully audited and surfaced in the Activity feed. The human retains an override and can revoke any auto-bond.

**Key constraint:** `bond.accept` remains a human commit boundary by default. Autonomy is opt-in, mandate-scoped, and revocable.

#### 2. Document find & request — network-wide, not just bonded

**Current (Phase 18):** Document acquisition searches bonded contacts' published libraries, then proposes shares.

**Next:** Expand to the **full network**. Every node can publish **public documents/data** that are discoverable and retrievable by any peer, not just bonded contacts. The agent starts search from bonded contacts (cheapest, highest trust), then expands outward using the DHT/broadcast substrate. Every search carries stopping rules:
- **Hop TTL** — how far the request propagates
- **Wall-clock expiry** — deadline
- **Max responses** — stop after N results
- **Sensitivity ceiling** — only public-tagged documents are returned from non-bonded peers

A responding node validates: is this document tagged public? Is the requester within policy bounds? If yes, return metadata + retrieval path (direct share, IPFS CID, or relayed data channel).

**Key principle:** Metadata ≠ bytes. Discovery returns document metadata (title, hash, topic tags). Bytes move only after explicit consent (share.accept or autonomous retrieve under mandate).

#### 3. Capability query → task — network-wide, not just bonded

**Current (Phase 18):** Capability provider discovers capabilities via bonded contacts and DHT topics, then negotiates tasks.

**Next:** Same network-wide expansion as document discovery. The agent broadcasts a capability query across the mesh with TTL/expiry/max-responses. Any node that has advertised a matching capability (via DHT provider records or `agent.card`) can respond. The agent then proposes a `task.*` to the best-matched responder — bonded or not. Unbonded task execution is gated by:
- Mandate bounds (cost, sensitivity, allowed actions)
- Trust tier (public tier gets narrow scope)
- Reputation scores from `task.feedback`
- Owner approval for high-risk actions

---

### Four strategic directions

#### Direction 1: AI Social Network — "the graph learns"

The agent actively maintains and enriches the owner's social graph:

- **AI-curated circles:** Based on communication patterns, shared interests (published document topics, capability tags), and bond tiers, the agent proposes circle groupings.
- **Proactive connection suggestions:** The agent monitors the mesh and suggests contacts when interests align — "Bob just published a paper on distributed systems; you've been searching this topic."
- **Social graph stewardship:** The agent notices dormant bonds and suggests check-ins. "You haven't talked to Carol in 3 months. She's still bonded."
- **Social memory:** Local RAG over the owner's chat history. When a conversation references a past topic, the agent surfaces: "You and David discussed Kubernetes last October — here's that thread."

**What makes this unique to P2P:** No central server sees your graph. The agent works on your device, with your data, and only what you choose to share leaves your node.

#### Direction 2: AI Library — "the mesh as a distributed knowledge base"

Every node is a knowledge publisher. The mesh becomes a federated, owner-controlled library:

- **Federated RAG:** A `knowledge.query` searches the local vault AND queries bonded peers' published libraries. The agent synthesizes a single answer from distributed sources. No central index — each node answers from its own vault.
- **Auto-curation:** The agent notices reading/saving/sharing patterns, auto-tags documents, and suggests related content from the mesh.
- **Library as identity:** A node's published library defines its intellectual profile on the mesh. Agent cards include topic distributions. "Alice's agent knows a lot about cryptography — ask her."
- **Subscription model:** "Alert me when anyone publishes content about distributed consensus." The agent monitors discovery topics and surfaces new content.

**What makes this unique to P2P:** You're not uploading to a platform's knowledge base. Your documents stay on your device. Peers query YOUR agent, through YOUR policy, and only see what you've chosen to publish.

#### Direction 3: Agent Network — "multi-agent collaboration"

Agents discover and compose each other's capabilities through the A2A lane:

- **Bilateral agent negotiation:** Alice's agent and Bob's agent negotiate tasks without human intervention — within mandate bounds. Alice says "Find a good restaurant for Friday" — her agent discovers Bob's `restaurant_knowledge` capability, queries it, returns a recommendation.
- **Agent chains:** Carol needs a Rust code review. Her agent discovers Dave's `rust_reviewer` capability, proposes a task. Dave's agent runs the review, returns results. No human in the loop — mandate boundaries and Activity records provide visibility.
- **Autonomous service mesh:** Owners publish service capabilities (`code_review`, `translation`, `data_conversion`, `research_synthesis`). Agents discover and compose these. "Translate this doc to French, then have someone review the translation" becomes a 3-agent chain.
- **Reputation as currency:** `task.feedback` (Phase 8K) scores agents by task quality. High-scoring agents get preferred routing. A mesh-native reputation layer emerges without a central authority.

**Where A2A fits:** The A2A lane (Phase 13) is the protocol substrate for all of this — `task.*`, `knowledge.*`, `agent.card.*`, `discovery.*`, `report.create`. A2A is structured work between agents, separate from human chat, with its own visibility (Activity feed) and policy (mandates). It is not a separate protocol — it is the structured-work lane of EMP.

#### Direction 4: Ambient Mesh Awareness — "the mesh as your extended mind"

The agent works proactively, not just reactively:

- **Proactive mesh awareness:** The agent watches your vault growth, search patterns, and conversations, then surfaces relevant mesh content: "3 people in your circles are researching WASM sandboxes — here's a summary of what they've published."
- **Cross-device continuity:** Start a research task on desktop; the agent continues querying the mesh from your phone; results appear wherever you are (Phase 11 mobile node makes this architecturally possible).
- **Ambient morning digest:** Extended beyond current daily roll-up. "While you slept, Bob's agent finished the Rust review. 2 new documents in your Rust circle. Carol accepted your friend request."
- **Intent prediction:** "You're about to search for Kubernetes operators — I've already queried your Rust circle and found 3 relevant documents. Want them?"

---

### Design principles (all four directions)

| # | Principle | Why |
|---|-----------|-----|
| 1 | **Owner-owned, always** | No central AI index, no platform agent. Every agent runs on the owner's device, with the owner's keys. |
| 2 | **Policy before LLM** | Bond Engine, mandates, approval queue, and kill switch gate every tool call. The model can't exfiltrate even if it "wants" to. |
| 3 | **Cryptographic truth on the wire** | `senderRole=agent` + `agentCredential` is verifiable. No "I thought it was a human" ambiguity. |
| 4 | **A2A is work, not chat** | Agent-to-agent traffic lives in Activity and task journals — not in human chat threads. |
| 5 | **Progressive autonomy** | Start bonded, expand network-wide. Start with approval, move to mandate-gated autonomy. Start reactive, grow proactive. |
| 6 | **Stopping rules everywhere** | Every network-wide action carries TTL, expiry, and max-responses. The mesh is not an infinite amplifier. |

### Suggested sequencing

1. **Federated RAG** (Direction 2) — highest immediate value; uses what's already built; uniquely differentiates EnvoyMesh from centralized AI products.
2. **Bond autonomy** (Refined #1) — small protocol change (new mandate type), big product feel.
3. **Network-wide document discovery** (Refined #2) — expands ADB beyond bonded contacts with stopping rules.
4. **Network-wide capability discovery** (Refined #3) — parallel expansion for capability/task matching.
5. **Proactive social graph** (Direction 1) — product evolution from reactive to proactive; the social proxy already has the data.
6. **Agent-to-agent task marketplace** (Direction 3) — needs the layers above as foundation: discoverable capabilities, reputation, mandate infrastructure.
7. **Ambient mesh awareness** (Direction 4) — the digest is already wired; expand to real-time awareness.
