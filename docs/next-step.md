# EnvoyMesh Next Step: LLM And Agentic Normal Nodes

This document captures the next-step design direction after the current EnvoyMesh baseline: nodes can discover each other, connect through libp2p and relay support, exchange signed messages, perform bond/hello flows, chat, send task/data intents, index a local vault, and audit activity.

The goal is not to replace the existing protocol with a new JSON-RPC layer. EnvoyMesh already has a signed EMP envelope, typed intents, trust tiers, device capabilities, task lifecycle, vault, model router, and relay control intents. The next step should reuse those pieces and wire LLM/agent behavior into normal nodes gradually.

Use this file as the **design rationale**. Use [implementation-plan.md](./implementation-plan.md) as the **source of truth for task status**. When implementation status changes, update Phase 8 in `implementation-plan.md`; only update this file when the design direction changes.

## Design Principles

1. Keep relay nodes lean.
   Relay nodes provide connectivity, check-in, lookup, summaries, routing hints, and operator visibility. They should not run LLMs, read payloads, execute agents, or store private knowledge.

2. Put intelligence at the edge.
   Normal nodes run on user machines and may host an LLM, OpenClaw/HomeClaw-style agents, a vault, a capability registry, policy checks, and approval UX.

3. Do not let the LLM become the security boundary.
   The node runtime, bond engine, device capabilities, vault path rules, model router policy, egress filter, and approval queue must decide what is allowed before and after LLM/agent execution.

4. Start with direct, testable behavior.
   Each round should produce a small feature that can be verified with two or three nodes before adding broader discovery, anonymous traffic, agent tools, or reputation.

5. Prefer existing EMP intents over a parallel protocol.
   `knowledge.query`, `knowledge.response`, `task.*`, `agent.card.*`, `discovery.*`, `bond.*`, and `report.create` are already the right direction. Add fields or new intents only when the current intent model cannot express the behavior.

## Current Foundation To Reuse

- Signed EMP envelopes in `packages/protocol/src/index.ts`.
- Inbound guard for size limit, schema parse, signature verification, and replay protection in `apps/node/src/inbound-guard.ts`.
- Bond/hello workflow based on `bond.request` and `bond.accept` in `apps/node/src/bond-inbound.ts` and `apps/node/src/node-service-impl.ts`.
- Human chat path using `chat.message` and local chat log storage.
- A2A task path through `apps/node/src/task-dispatcher.ts` and `apps/node/src/task-runtime-guard.ts`.
- Relay check-in, lookup, summary, hints, and relay manager snapshots in `apps/node/src/index.ts` plus relay helpers.
- Vault indexing/search/read helpers in `packages/vault/src/index.ts`.
- Model routing and semantic firewall in `packages/models/src/index.ts` and `packages/models/src/semantic-firewall.ts`.
- Trust policy and capability evaluation in `packages/bonds/src/index.ts`.
- Audit and local stores in `packages/local-store/src/index.ts`.

Important current gap: `knowledge.query` is still a mock inbound handler, and `routeModelRequest()` is not wired into the node runtime yet. This is the best first integration point.

## Target Topology

### Relay Node

Relay nodes are the lean core.

Responsibilities:

- Accept relay clients and circuit relay reservations where configured.
- Store short-lived `relay.checkin` rows.
- Answer bounded `relay.lookup` requests from the local roster.
- Forward selected lookup requests across relay neighbors with `maxHops`, `maxFanout`, query IDs, summaries, and negative caching.
- Publish local operator visibility through relay status and relay manager snapshots.
- Enforce resource limits: reservation count, TTL, lookup fanout, rate limits, and payload caps for relay-control messages.

Non-responsibilities:

- No LLM calls.
- No agent execution.
- No vault or user data.
- No semantic matching of private payloads.
- No inspection of encrypted application streams.
- No reputation judgment beyond coarse abuse controls needed to protect the relay.

### Normal Node

Normal nodes are the intelligent edge.

Responsibilities:

- Represent the owner through signed owner/device/peer identity.
- Maintain contacts, bond levels, trust records, device capabilities, and approvals.
- Run or route LLM requests through the existing model router.
- Index and search owner-approved vault content.
- Host agent/tool integrations such as OpenClaw or HomeClaw behind a local tool registry.
- Publish only owner-approved public capabilities or knowledge summaries.
- Handle incoming contact, task, knowledge, discovery, and sharing requests according to policy.
- Produce audit records for inbound decisions, model routing, vault access, tool execution, egress filtering, approvals, and task results.

## Normal Node Internal Planes

### 1. Diplomat / Transport Plane

Uses existing libp2p streams and relay lookup support.

Near-term:

- Continue using `/envoymesh/message/0.1.0` for signed EMP envelopes.
- Continue using `/envoymesh/chat/0.1.0` for human chat.
- Continue using `/envoymesh/data/0.1.0` for data transfer.
- Use relay lookup and dial hints for peers behind NAT.

Later:

- Add a broadcast substrate only when needed. This may be libp2p gossipsub, relay-assisted fanout, or topic/provider records. It should not be required for the first LLM integration.

### 2. Policy And Identity Plane

Every inbound request should pass:

1. Envelope validation and signature verification.
2. Role policy.
3. Contact/trust lookup.
4. Device capability check where a device certificate is available.
5. Bond policy based on intent and requested sensitivity.
6. Rate limit and replay checks.
7. Optional anonymous-discovery gate.

The LLM only sees requests that survive these checks.

### 3. Fast Matching Plane

This plane prevents anonymous or high-volume discovery from blocking chat, contacts, or active tasks.

Suggested tiers:

1. Configuration gate:
   If `allowAnonymousDiscovery` is false, drop anonymous discovery and query traffic before any semantic work.

2. Cheap intent and capability check:
   Check EMP intent, requested capability, sensitivity, topic tags, and sender trust level.

3. Keyword or small manifest match:
   Match against owner-approved capability and knowledge metadata. Start with simple normalized keywords, not a Bloom filter. Add Bloom filters later only if the simple list becomes too slow or too revealing.

4. Lightweight vector match:
   Compare the query against public summaries or public knowledge anchors. This is optional for early rounds.

5. LLM deep match:
   Only call the LLM when the request is relevant, policy-allowed, and worth spending compute on.

### 4. Agent Orchestration Plane

The orchestrator decides how to handle a policy-approved request.

Possible routes:

- Direct LLM answer using approved prompt context.
- Vault search plus LLM summarization for `knowledge.query`.
- OpenClaw/HomeClaw tool call for a local skill.
- Task negotiation using `task.propose`, `task.accept`, `task.result`, and related intents.
- Human approval request before sensitive sharing or physical-world actions.
- Decline or ignore when policy, relevance, cost, or trust is insufficient.

OpenClaw/HomeClaw should not call libp2p directly. They should call local Envoy tools, and Envoy should inspect and sign all outbound messages.

### 5. Sandbox And Egress Plane

The sandbox is a product requirement, not a later polish item.

Initial sandbox:

- Only expose configured tools.
- Only expose owner-approved vault paths.
- Use sensitivity labels for retrieved context.
- Run model prompts through the semantic firewall.
- Scan outbound text for obvious secrets and private-key material.
- Require approval for file transfer, private sensitivity, unknown peers, high cost, and physical actions.

Later sandbox:

- Separate process for agent execution.
- Filesystem allowlist.
- CPU/memory/time limits.
- Container or stronger isolation for untrusted tools.
- More advanced egress classifier.

## Core Workflows

### Workflow A: Contact Sends Knowledge Query

1. Contact sends signed `knowledge.query`.
2. Receiver verifies envelope and trust.
3. Receiver applies bond policy and requested sensitivity.
4. Receiver searches the vault within allowed sensitivity.
5. Receiver builds a model request with approved context only.
6. Model router selects local/cloud/peer provider according to policy.
7. Receiver sends signed `knowledge.response`.
8. Receiver writes audit rows for policy, vault, model, egress, and response.

This should be the first real LLM workflow.

### Workflow B: Contact Sends Task Request

1. Contact sends `task.propose` or a mandate-backed task intent.
2. Task runtime guard checks mandate expiry, cancellation, and completion conditions.
3. Dispatcher records task state.
4. Agent orchestrator decides whether the task needs an LLM, vault, local tool, or human approval.
5. Result is returned with `task.result` or a report intent.

### Workflow C: Normal Node Extends OpenClaw/HomeClaw

1. User asks OpenClaw/HomeClaw to do something.
2. The local agent realizes it needs mesh help.
3. The agent calls an Envoy local tool such as `mesh.findCapability()` or `mesh.requestKnowledge()`.
4. Envoy applies policy, signs EMP messages, and communicates with peers.
5. Envoy returns only approved peer responses to the agent.

EnvoyMesh is the secure network extension of the local agent, not a raw network socket handed to the agent.

### Workflow D: Direct Mesh Query

1. User sends a query through EnvoyMesh directly.
2. Envoy chooses contacts, discovered peers, or public discovery depending on settings.
3. Responses are ranked by trust, relevance, freshness, and reputation.
4. Local LLM synthesizes a user-facing answer only from approved responses.

### Workflow E: Node Stands For The User

1. A request arrives.
2. Envoy decides whether it is allowed, relevant, and safe.
3. Envoy may answer automatically for low-risk public/friends data.
4. Envoy asks the owner for approval for higher-risk actions.
5. Envoy records the decision and result.

This is the most important long-term goal, but it should emerge from the earlier workflows, not be implemented as a giant first step.

## Broadcasting And Sharing

Broadcasting and sharing are different features and should use different mechanics.

### Broadcasting

Broadcasting means one-to-many visibility: "I need this", "I can do this", or "who matches this?"

Early implementation options:

- Contact fanout: send `discovery.request` or `knowledge.query` to known contacts.
- Relay-assisted discovery: use existing relay lookup/check-in metadata to find reachable candidates.
- Capability/provider records: publish coarse capability identifiers when DHT/provider support is ready.

Later implementation options:

- libp2p gossipsub topics such as capability or interest channels.
- Topic TTL and hop limits.
- Query IDs and duplicate suppression.
- Cancellation when enough results arrive.

Broadcasting must be low priority, rate-limited, and interruptible. It must not block chat, contact acceptance, relay check-ins, or active direct tasks.

### Sharing

Sharing means one-to-one exchange after a match.

Recommended flow:

1. Requester sends query or discovery request.
2. Provider replies with a safe preview, match score, or capability claim.
3. Requester accepts the match.
4. Provider applies policy and approval checks.
5. Provider sends a `knowledge.response`, `task.result`, or `/envoymesh/data/0.1.0` transfer.
6. Both sides audit the exchange.

Sharing should never send raw vault data just because a broadcast matched. Broadcast finds candidates; direct sharing enforces consent and policy.

## Capability And Knowledge Publication

Normal nodes need a selective publication mechanism.

### Capability Manifest

Each normal node should maintain an owner-approved manifest of what it is willing to do.

Example shape:

```json
{
  "version": "0.1",
  "ownerApprovedAt": "2026-05-05T00:00:00.000Z",
  "capabilities": [
    {
      "id": "io.envoymesh.knowledge.answer",
      "version": "0.1",
      "visibility": "contacts",
      "sensitivityCeiling": "friends",
      "keywords": ["envoymesh", "libp2p", "typescript"]
    },
    {
      "id": "io.homeclaw.device.status",
      "version": "0.1",
      "visibility": "private",
      "sensitivityCeiling": "private",
      "keywords": []
    }
  ]
}
```

Visibility levels:

- `private`: never published; local use only.
- `contacts`: visible only to bonded contacts.
- `public`: visible to anonymous discovery if the owner enables it.
- `official`: visible publicly and backed by a signed credential or known issuer.

### Knowledge Publication

Do not publish raw knowledge by default.

Allowed publication forms:

- Public keywords.
- Public summaries.
- Coarse topic tags.
- Capability IDs.
- Freshness and availability signals.

Avoid publishing:

- Private documents.
- Full embeddings of sensitive content until privacy implications are understood.
- Any personal identifiers not explicitly approved by the owner.

## Anonymous Discovery

Anonymous discovery should be user-configurable.

Modes:

- `off`: drop anonymous discovery/query traffic.
- `contacts-only`: only bonded contacts can request matching.
- `public-preview`: anonymous peers can receive safe previews only.
- `public-auto-answer`: anonymous peers may receive low-sensitivity answers within strict policy, quotas, and egress filters.

Anonymous request pipeline:

1. Check mode.
2. Check intent allowlist.
3. Check payload size and rate limits.
4. Check requested sensitivity is `public`.
5. Fast-match against public capability manifest.
6. Optionally run vector match against public summaries.
7. Optionally run LLM deep match.
8. Return no response, a decline, a safe preview, or a request to start `bond.request`.

Anonymous traffic should use a separate low-priority queue and strict budgets.

## Reputation, Scoring, And Official Nodes

Reputation is useful, but it should start local and signed, not global and complicated.

### Local Score First

Each node can maintain a local score per peer:

- Successful task completions.
- Failed or abandoned tasks.
- Response latency.
- Result usefulness as rated by the user or requester.
- Policy compliance.
- Spam or abusive behavior.
- Contact relationship and referral path.

Use it first for local prioritization:

- High score gets faster processing.
- Low score gets low priority or requires approval.
- Blocked score gets ignored.

### Signed Task Feedback

After a task completes, peers may exchange signed feedback records:

- `taskId`
- provider peer/owner
- requester peer/owner
- outcome
- latency bucket
- optional user rating
- createdAt
- signature

Do not build a global trust ledger in the first rounds. Store signed feedback locally, then later consider gossip, federation, or official index nodes.

### Official Feature Nodes

Some nodes may be official feature nodes, such as official relays, official documentation/search nodes, or trusted domain expert nodes.

Recommended approach:

- Use signed credentials issued by configured trust anchors.
- Ship a small default trust-anchor list only for EnvoyMesh-operated services.
- Let users add or remove trust anchors.
- Treat official status as one input to policy, not a bypass around sandboxing.

Official nodes can receive priority in matching, but they still use signed EMP messages and normal policy checks.

## Design Roadmap

Each round should be independently testable. Do not implement all future architecture at once. The canonical implementation checklist lives in [implementation-plan.md](./implementation-plan.md) Phase 8; the order below explains **why** the work is sequenced this way.

| Phase | Design step | Why this order |
|-------|-------------|----------------|
| 8A | Real `knowledge.query`: policy gate → vault search/read → model router → signed `knowledge.response` → audit | Smallest useful LLM feature; uses existing mock handler and existing packages. |
| 8B | Model provider configuration | Keeps 8A testable with mock/local defaults first, then makes provider selection configurable. |
| 8C | LLM-assisted chat, draft first | Adds user-facing help without letting the model impersonate the owner. |
| 8D | Capability manifest for contact-scoped matching | Gives the node a cheap, owner-approved self-description before discovery grows. |
| 8E | Safe match-to-share workflow | Ensures matches produce previews and consented direct sharing, not raw-data leaks. |
| 8F | Local agent tool registry | Adds controlled "limbs" for the LLM before external agents enter. |
| 8G | OpenClaw/HomeClaw adapter boundary | Lets external agents request mesh help without raw network/filesystem access. |
| 8H | Stronger sandbox and egress hardening | Required before broader unknown-peer or broadcast traffic. |
| 8I | Anonymous discovery toggle and fast path | Only after manifests, policy gates, queues, and egress controls are in place. |
| 8J | Broadcast substrate | One-to-many traffic comes after direct/contact paths and anonymous fast-path controls. |
| 8K | Reputation and official credentials | Useful for prioritization, but must not bypass policy. |
| 8L | Autonomous user representative | Final synthesis: bounded autonomy, approvals, digests, and kill switch. |

Ordering rule: direct bonded-contact workflows come first; public/anonymous/broadcast workflows come later; broad autonomy comes last.

## Missing Topics To Keep In View

These are important, but should not block Phase 8A.

- Queue priorities: chat/contact/active tasks before anonymous discovery.
- Resource budgets: model cost, CPU, memory, time, and network bandwidth.
- Backpressure: drop or defer low-priority requests under load.
- Offline tasks: local persistent queue and retry behavior.
- Result validation: requester-side validation before task feedback.
- Cancellation: stop broadcast/task once enough results arrive.
- Versioning: capability and intent schema versions.
- Abuse handling: rate limits, proof-of-work only if needed, spam quarantine.
- Observability: audit rows plus operator-visible summaries.
- UI controls: model settings, capability manifest, anonymous mode, approvals, kill switch.
- Data retention: how long to keep prompts, responses, feedback, and peer scores.
- Multi-device owner control: phone or satellite device as approval channel later.

## Immediate Recommendation

Start with Phase 8A.

The current system already has the right place for it: `apps/node/src/knowledge-query-inbound.ts` is a mock handler, and `@envoymesh/models` already has a model router and semantic firewall. Replacing the mock with a policy-gated vault + model + signed response path gives EnvoyMesh its first real "Brain" while staying small, secure, and testable.
