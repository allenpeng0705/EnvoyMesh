# EnvoyMesh Protocol

EnvoyMesh Protocol, or **EMP**, is the **single standard contract** for EnvoyMesh — including AI-mediated peer-to-peer social networking. One protocol, one version line (`emp/0.1`), reusable across desktop, mobile, relay, and future implementations.

EMP defines identity, device roles, signed envelopes, trust workflows, human and agent communication lanes, mandates, standing autonomous **postures** (EnvoyAI), and the minimum intents every Envoy must understand. Humans and agents share the same wire; policy and presentation distinguish who acted.

For product narratives and user stories, see [EnvoyMesh scenarios](./scenarios.md), [narrative user stories](./UserStory.md), and [design ↔ implementation alignment](./alignment-review.md). For package and runtime mapping, see [detailed design](./detailed-design.md). For third-party implementers, see [emp-implementers-guide.md](./emp-implementers-guide.md) and `packages/protocol/schemas/emp-0.1/`. EnvoyAI design notes that mirror this spec: [envoyai-protocol.md](./envoyai-protocol.md) (guide only — **normative text lives here**).

## Design Goals

- One human owner can control one Envoy identity across many devices.
- Every device has its own revocable device key.
- Mobile v1 runs as a thin UI channel to the Primary Envoy.
- Messages are signed, versioned, and schema-validated.
- Agents can act for humans through explicit mandates.
- Agent-to-agent negotiation is structured, auditable, and policy-bound.
- Long-running tasks can complete asynchronously and report at the right time.
- Trust is local, cryptographic, and portable.
- Protocol features can evolve without breaking old nodes.
- **One protocol for AI + social mesh** — standing delegation postures, honest wire roles, and configurable UI disclosure are part of EMP, not a parallel standard.
- **Humans and agents are first-class peers** — same envelopes and intents; `senderRole` + `agentCredential` disambiguate actors.
- **Human commit for trust** — bond tier upgrades and high-risk actions stay owner-committed unless explicitly mandated.

## Identity Model

EMP separates owner identity from device identity.

### Owner Identity

The owner identity represents the person or organization.

In the first implementation this can be an Ed25519 key pair. Later it can become a DID document.

Example owner identifier:

```text
envoy:owner:z6Mk...
```

Responsibilities:

- Represents the long-term Envoy identity.
- Signs device authorization records.
- Signs friend/bond records when needed.
- Revokes lost or compromised devices.
- Can later map to a DID.

The owner key should not need to be online all the time. It can be stored securely and used only for device pairing, recovery, and high-risk trust changes.

### Device Identity

Each device has its own key pair.

Example device identifier:

```text
envoy:device:z6Mk...
```

Responsibilities:

- Signs daily network messages.
- Joins the P2P mesh.
- Proves it is authorized by an owner identity.
- Can be revoked without changing the owner's identity.

This model means the same Envoy can run on both a computer and a phone. Friends trust the owner identity. Devices prove they are valid representatives of that owner.

## Device Authorization

An owner authorizes a device by signing a device certificate.

```json
{
  "version": "0.1",
  "ownerId": "envoy:owner:z6MkOwner",
  "deviceId": "envoy:device:z6MkPhone",
  "devicePublicKey": "-----BEGIN PUBLIC KEY-----...",
  "deviceProfile": "satellite",
  "capabilities": ["ui.channel", "message.send", "approval.prompt"],
  "issuedAt": "2026-04-26T10:00:00.000Z",
  "expiresAt": null,
  "signature": "owner-signature"
}
```

Minimum validation:

1. Verify the device certificate is signed by the owner key.
2. Verify the message is signed by the device key.
3. Verify the device is not revoked.
4. Verify the device has the capability required by the message intent.

## Node Profiles

EMP supports heterogeneous devices through node profiles.

### Primary Envoy

A Primary Envoy is usually a desktop, laptop, home server, or private cloud machine.

Responsibilities:

- Stay online more often.
- Maintain the main vault index.
- Maintain the owner's trust graph.
- Run heavier model tasks.
- Relay approved state to satellite devices.

Recommended capabilities:

- `mesh.listen`
- `mesh.discovery`
- `vault.index`
- `vault.retrieve`
- `model.local`
- `task.execute`
- `device.sync`

### Satellite Envoy

A Satellite Envoy is usually a phone, tablet, or lightweight device. In the first mobile direction, it is an authorized UI/control channel for the Primary Envoy, not a full mesh participant.

Responsibilities:

- Act as a mobile interface.
- Send requests to the Primary Envoy.
- Receive notifications.
- Approve or reject sensitive actions.
- Delegate mesh participation and heavy work to the Primary Envoy.

Recommended capabilities:

- `ui.channel`
- `message.send`
- `approval.prompt`
- `device.sync`

### Full Envoy

A Full Envoy is a device that can operate independently.

Responsibilities:

- Join the P2P mesh directly.
- Store part or all of the owner state.
- Answer allowed requests.
- Run local models if available.

Recommended capabilities:

- `mesh.listen`
- `mesh.discovery`
- `vault.retrieve`
- `model.local`
- `task.execute`

### Relay Envoy

A Relay Envoy helps with connectivity but should not own private data.

Responsibilities:

- Relay encrypted libp2p streams and help peers behind NAT.
- Accept short-lived `relay.checkin` presence from normal nodes.
- Answer bounded `relay.lookup` requests from local roster records.
- Exchange `relay.summary` with relay neighbors for graph routing hints.
- Maintain a bounded relay book and avoid unbounded global address-book growth.
- Expose local operator visibility through `relay.manager.snapshot`, CLI `relay-status`, and the desktop Relay Manager panel.

Recommended capabilities:

- `mesh.relay`
- `message.store_encrypted`

Relay protocol intents currently include:

- `relay.checkin`
- `relay.lookup`
- `relay.lookup.response`
- `relay.hints.request`
- `relay.hints.response`
- `relay.join.request`
- `relay.join.response`
- `relay.register`
- `relay.register.response`
- `relay.summary`

The debug-oriented `relay.peers.request` / `relay.peers.response` shortcut can remain for development, but production discovery should use check-in, lookup, and summary-guided routing.

## Mobile Modes

Mobile support has two modes, but only Thin UI Mode is in scope for the first product version.

### Thin UI Mode

The phone is only a secure UI and control channel for the Primary Envoy.

This is the first mobile product direction because it saves battery and avoids forcing mobile devices to run full P2P and model workloads.

In this mode:

- The Primary Envoy owns the vault and mesh presence.
- The phone pairs as an authorized satellite device.
- The phone sends commands to the Primary Envoy.
- The phone receives notifications and approval prompts.

### Full Node Mode

The phone joins the P2P mesh directly.

This is useful for powerful devices or offline workflows, but it is explicitly later and optional. Version 0.1 should not depend on mobile full-node behavior.

In this mode:

- The phone still has its own device key.
- The phone advertises limited capabilities.
- The phone may run small local models.
- The phone syncs state with the Primary Envoy when available.

## Agent Card

Every Envoy should expose an Agent Card to trusted peers. An Agent Card is a public or semi-public manifest that helps other Envoys decide whether this Envoy is relevant for a task.

The Agent Card is not a private profile. It should contain only information the owner is willing to advertise.

Example:

```json
{
  "version": "0.1",
  "ownerId": "envoy:owner:z6MkOwner",
  "displayName": "Allen's Envoy",
  "nodeProfile": "primary",
  "capabilities": ["knowledge.query", "task.negotiate", "find.books", "summarize.code"],
  "publicTopics": ["distributed systems", "local-first AI", "TypeScript", "books"],
  "trustPolicySummary": {
    "acceptsDirectBondRequests": false,
    "acceptsReferralRequests": true,
    "requiresHumanApprovalForRawFiles": true
  },
  "supportedProtocolVersions": ["emp/0.1"],
  "supportedCapabilities": ["standing-delegation", "social-proxy", "document-acquisition"]
}
```

Uses:

- Discovery by topic or capability.
- Matching tasks to suitable Envoys.
- Advertising safe public knowledge areas.
- Avoiding unnecessary private negotiation.

## Mandates

A mandate is a signed permission for an Envoy to act on behalf of its owner.

This is the core rule for autonomous agency: an Envoy does not simply decide it can do anything. It acts within a bounded mandate.

Example:

```json
{
  "version": "0.1",
  "mandateId": "mandate_123",
  "ownerId": "envoy:owner:z6MkOwner",
  "issuedToDeviceId": "envoy:device:z6MkDesktop",
  "taskIntent": "find.book",
  "objective": "Find available copies of a specific rare book and report options.",
  "allowedPeerScopes": ["direct", "referred", "public"],
  "allowedActions": ["discover", "query", "negotiate", "report"],
  "disallowedActions": ["purchase", "share.private_data", "send.raw_files"],
  "maxSensitivity": "public",
  "maxCost": {
    "amount": 0,
    "currency": "USD"
  },
  "expiresAt": "2026-04-27T10:00:00.000Z",
  "requiresApprovalFor": ["purchase", "raw_contact_exchange"],
  "signature": "owner-signature"
}
```

Mandates should be:

- Specific to a task or task class.
- Time-limited.
- Revocable.
- Auditable.
- Bound to allowed actions, sensitivity, and cost.

Every A2A request that performs delegated work should include either a mandate reference or a proof derived from the mandate.

### Standing mandates and postures

Task mandates (above) authorize **one job**. **Standing mandates** authorize a **posture** — a named autonomous mode the owner enables until expiry or revocation. Postures are the EnvoyAI capability within EMP; they reuse the same mandate schema with optional fields:

| Field | Purpose |
|-------|---------|
| `posture` | `social_proxy` \| `document_acquisition` (extensible enum in `@envoymesh/protocol`) |
| `posturePolicy` | Posture-specific bounds (JSON object — see [EnvoyAI](#envoyai-ai-mediated-social-mesh)) |
| `taskIntent` | e.g. `emp.social_proxy`, `emp.document_acquisition` |

Standing mandates MUST still be owner-signed, time-limited, revocable, and auditable. Optional envelope field **`postureRef`** links automated traffic to the active standing `mandateId`.

<a id="envoyai-ai-mediated-social-mesh"></a>

## EnvoyAI (AI-mediated social mesh)

**EnvoyAI** is the name for EMP's AI-social capabilities: standing delegation, honest automation on the wire, negotiation lanes, and presentation rules. It is **not** a separate protocol or version — implementations advertise support via `supportedCapabilities` on Agent Card / `system.signal` under `emp/0.1`.

```text
┌─────────────────────────────────────────────────────────────┐
│ Presentation (local Social UI — configurable badges)        │
├─────────────────────────────────────────────────────────────┤
│ EnvoyMesh Protocol (emp/0.1)                                │
│   envelopes · intents · bonds · mandates · postures       │
│   chat · social.intro.* · discovery · share · task · report │
├─────────────────────────────────────────────────────────────┤
│ Transport (libp2p, relay, /envoymesh/chat|message|data)     │
└─────────────────────────────────────────────────────────────┘
```

Implementation: [Phase 16](./implementation-plan.md#phase-16-envoyai-standing-delegation--autonomous-postures). Stories: [Epic SP](./scenarios.md#epic-sp--delegated-social-presence), [Epic DA](./scenarios.md#epic-da--document-acquisition), US-AV9.

### Postures

A **posture** is a standing autonomous mode:

| Posture | Purpose | Human commit still required for |
|---------|---------|--------------------------------|
| `social_proxy` | Discover candidates, intro sync, say hello, pre-bond chat with humans or peer agents | `bond.accept` (unless `bond_autonomy` active), trust tier upgrade, sensitive profile disclosure |
| `document_acquisition` | Hunt documents (vault → bonded catalog → optional discovery); negotiate; retrieve bytes when policy allows | Publishing local vault items, share above mandate ceiling |
| `capability_provider` | Match capability routes; execute mesh tool steps; delegate `task.*` when bonded | Human bond commit, approval-gated chat |
| `bond_autonomy` | Auto-accept bond requests within policy bounds (referral proof, sensitivity ceiling, daily cap) | bond tier upgrade beyond `maxAutoBondTier`, bond requests without referral proof |

### Three agent workflows (one protocol)

EnvoyMesh ships **one protocol** (`emp/0.1`). Product scenarios are **user stories** that share the same wire:

```text
Advertise → Discover → Negotiate → Commit/Execute
```

| Workflow | User stories | Standing posture | Planner route id (agent-only) |
|----------|--------------|------------------|-------------------------------|
| **Social** | Epic SP — intros, hello, pre-bond chat | `social_proxy` | `social.intro-bond` |
| **Documents** | Epic DA — hunt, negotiate, retrieve bytes | `document_acquisition` | `document.published-library` |
| **Capabilities** | Agent services — match tags, route intents, task delegate | `capability_provider` | `service.task-negotiation` (+ manifest-derived `custom:*`) |

**Capability routing** is an **AI orchestration layer** — not human discovery UI. Agents call in-process tools (`mesh.match_capability_route`, `mesh.capability_provider.start`) on the home node. External bridge/RPC exposure is optional and deferred.

Custom manifest capability tags map to generic task-service routes via `@envoymesh/api` `deriveRoutesFromManifestCapabilities()`. Bond tier and mandate ceilings still gate every EMP hop.

Postures are **not** time-boxed “night modes.” They are standing delegations with optional schedules and a kill switch (`autonomousKillSwitch`).

Example standing mandate:

```json
{
  "version": "0.1",
  "mandateId": "mandate-social-proxy-001",
  "ownerId": "envoy:owner:z6MkOwner",
  "agentId": "envoy:agent:z6MkAgent",
  "posture": "social_proxy",
  "taskIntent": "emp.social_proxy",
  "allowedActions": ["discovery.request", "social.intro.sync", "social.intro.propose", "chat.message", "bond.request"],
  "disallowedActions": ["bond.accept", "bond.revoke"],
  "maxSensitivity": "friends",
  "maxCost": { "amount": 0, "currency": "USD" },
  "expiresAt": "2027-01-01T00:00:00.000Z",
  "requiresApprovalFor": ["bond.request"],
  "posturePolicy": {
    "autoHello": true,
    "autoChatWithPeerAgents": true,
    "maxNewIntrosPerDay": 5,
    "requireOwnerCommitmentRefOnBondRequest": true
  },
  "signature": "owner-signature"
}
```

`document_acquisition` uses `posturePolicy` fields such as `searchBondedOnly`, `maxNegotiationRounds`, `autoAcceptInboundShareUpTo`, `autoRequestShareUpTo`.

Inbound handlers MUST verify mandate signature, expiry, `allowedActions`, and `posturePolicy` before autonomous execution.

### Three disclosure planes

| Plane | Audience | Rule |
|-------|----------|------|
| **Wire** | All peers | Cryptographic honesty — `senderRole`, `agentCredential`, signed mandates (Appendix C). |
| **Protocol / audit** | Bond Engine, Activity, audit JSONL | Full actor metadata always retained for the owner. |
| **Presentation** | Local Social UI | Owner-configurable badges; MUST NOT change outbound wire roles (US-AV2). |

Presentation settings (`showAgentBadges`, `collapsePeerAgentToContact`) are **local-only** — not transmitted on the wire.

### Negotiation lanes

| Lane | Intents | UI surface |
|------|---------|------------|
| Human chat | `chat.message` | Contact thread |
| Pre-bond social | `social.intro.*`, `bond.request` (+ `ownerCommitmentRef` when agent-sent) | Inbox / Trust |
| A2A orchestration | `task.*`, `agent.card.*`, `knowledge.*` (agent↔agent) | Activity |
| Document hunt | `discovery.request`, `knowledge.query`, `share.request` / `share.accept` | Activity + Assistant + Library |
| Owner H2A | Local RPC (`runDocumentAgentTurn`, …) | Assistant view |

Long agent↔agent work MUST NOT spam human chat; summaries use Activity / `report.create`.

### Posture: `social_proxy`

| Action | Intent | Sender role | Notes |
|--------|--------|-------------|-------|
| Find candidates | `discovery.request` | agent | Trust mode + mandate |
| Intro context | `social.intro.sync`, `social.intro.propose` | agent | Rate limits |
| Say hello | `bond.request` | agent | **`ownerCommitmentRef`** required (Appendix A) |
| Pre-bond chat | `chat.message` | agent | `agentCredential` required |
| Commit friendship | `bond.accept` | **human** (or **agent** under `bond_autonomy` mandate) | Delegatable via `bond_autonomy` posture; human-default otherwise |

### Posture: `document_acquisition`

Async job keyed by `correlationId`:

```text
vault.search → discoverPublishedLibrary (bonded) → optional discovery.request
  → negotiate (knowledge.query, chat.message) → share.request / share.accept
  → verified /envoymesh/data transfer → report.create
```

**Metadata ≠ bytes:** discovery matches never imply transfer consent (ADB Layer 2 vs Layer 3).

| Stage | Intents | Autonomy |
|-------|---------|----------|
| Local search | vault APIs, self `knowledge.query` | Within mandate |
| Bonded catalog | `discovery.request` | Auto |
| Wider discovery | `discovery.request` (hop-limited) | Per forward approval (US-MH3) |
| Negotiate | `chat.message`, `knowledge.query` | ≤ `maxSensitivity` |
| Request / accept bytes | `share.request`, `share.accept` | Per `posturePolicy` thresholds |

### EnvoyAI security rules

1. **`bond.accept`** MUST use `senderRole=human` in emp/0.1, **except** when the sender holds a valid `bond_autonomy` posture mandate — in which case `senderRole=agent` with a `bond_autonomy`-scoped `agentCredential` is permitted (Phase 19).
2. Agent **`bond.request`** MUST include valid **`ownerCommitmentRef`** when credential-bearing (Appendix A).
3. **`share.accept`** without human approval only when `posturePolicy` explicitly allows and sensitivity ≤ mandate ceiling.
4. **`autonomousKillSwitch`** disables all postures immediately.
5. Peers MUST verify `agentCredential` regardless of sender UI disclosure settings.

Agent credential **`scope`** MAY include `emp.social_proxy`, `emp.document_acquisition`, `emp.capability_provider`, `emp.bond_autonomy` to gate delegated intents.

## Proof Of Intent

Proof of Intent, or PoI, proves that a device is acting under an owner-approved mandate.

PoI should include:

- Mandate ID.
- Hash of the mandate.
- Current task ID.
- Request intent.
- Nonce or timestamp.
- Device signature.

The receiving Envoy can use PoI to answer these questions:

- Is this peer acting for a known owner?
- Is the request inside the mandate?
- Has the mandate expired?
- Is the request replayed?
- Does the sender's device certificate allow this action?

PoI does not force the receiver to comply. It only proves that the sender has delegated authority from its owner.

## A2A Negotiation

Agent-to-agent communication should be structured negotiation, not free-form chat.

Recommended lifecycle:

1. `system.signal`: advertise presence, protocol version, profile, and safe capabilities.
2. `agent.card.request`: request an Agent Card when policy allows it.
3. `auth.challenge`: prove key control and freshness.
4. `task.propose`: describe objective, mandate proof, constraints, and desired result.
5. `task.negotiate`: clarify, counter-propose, or ask for missing constraints.
6. `task.accept` or `task.reject`: create a small agreement.
7. `task.heartbeat`: announce progress for active long-running work.
8. `task.result`: deliver result or partial result.
9. `report.create`: package what should be shown to the owner.

Negotiation should remain bounded by policy. LLMs can write summaries and proposals, but deterministic policy decides authorization.

## Task Lifecycle

Long-running tasks need durable state because peers can be offline.

Task states:

- `created`
- `planned`
- `discovering`
- `negotiating`
- `waiting_for_peer`
- `waiting_for_owner`
- `running`
- `partial`
- `completed`
- `failed`
- `cancelled`

Examples:

- Find a friend who knows a topic.
- Look for a book.
- Ask trusted Envoys for recommendations.
- Search approved knowledge across a friend group.
- Delegate a computation to a Primary Envoy.

The Envoy should keep a local task journal. If it restarts, it can continue or safely mark the task as interrupted.

## Reporting Model

The Envoy decides when and how to report within owner policy.

Reporting modes:

- `instant`: urgent or time-sensitive.
- `brief`: batched summary, such as morning report.
- `silent`: no interruption; record in audit log.
- `approval`: requires owner decision before continuing.

Example report:

```json
{
  "version": "0.1",
  "reportId": "report_123",
  "taskId": "task_rare_book",
  "ownerId": "envoy:owner:z6MkOwner",
  "status": "completed",
  "mode": "brief",
  "summary": "I found two promising copies of the book and one collector who may know more.",
  "evidence": [
    {
      "type": "peer_response",
      "source": "envoy:owner:z6MkCollector",
      "sensitivity": "public"
    }
  ],
  "suggestedActions": [
    {
      "label": "Ask collector for details",
      "action": "task.continue",
      "requiresApproval": true
    }
  ],
  "createdAt": "2026-04-27T08:00:00.000Z"
}
```

The reporting system should support:

- Morning briefs.
- Instant alerts.
- Human approval prompts.
- Silent audit-only updates.
- Cancel/kill switch for active tasks.

## Heartbeat And Cancellation

Autonomous tasks need owner visibility without noisy notifications.

Heartbeat:

- Shows that a task is still active.
- Includes current state and next retry time.
- Does not expose private peer messages unless the owner opens details.

Cancellation:

- The owner can cancel a task locally.
- The Envoy stops new outbound work.
- The Envoy sends signed cancellation messages to peers involved in the task when appropriate.
- Cancelled tasks remain in the audit log.

## Core EMP Verbs

EMP messages use intent strings. The first stable group should be small.

### `system.signal`

Announces presence and capabilities.

Purpose:

- Tell trusted peers which owner/device is online.
- Advertise node profile and capabilities.
- Support discovery without exposing private data.

### `system.ping`

Tests signed communication.

Purpose:

- Prove the sender can sign a message.
- Prove the receiver can verify it.
- Debug transport and identity.

### `auth.challenge`

Asks a peer or device to prove control of a key.

Purpose:

- Verify a friend.
- Verify a device.
- Prevent replay by using a nonce.

### `auth.challenge.response`

Responds to a challenge with a signed proof.

Purpose:

- Complete handshake.
- Bind a device or peer to a key.

### `bond.request`

Requests a social trust relationship.

Executable payload shape: **`BondRequestPayloadSchema`** in `@envoymesh/protocol` (e.g. **`requesterOwnerId`**, optional **`proofOfContext`**, **`requestedLevel`**).

**Trust-mode linkage (optional, Phase 12):** payloads MAY include **`introCorrelationId`** (ties the handshake to an intro thread; often mirrored on the envelope **`correlationId`**) and **`ownerCommitmentRef`** (opaque id proving the owner reviewed an intro — required when **`bond.request`** is sent by a credential-bearing **agent** per inbound policy). See [Appendix A: Trust-mode social mediation](#appendix-a-trust-mode-social-mediation-socialintro).

Purpose:

- Ask to become a direct friend or referred peer.
- Carry referral proof or public profile metadata.

### `bond.challenge`

Presents a challenge in the bond / trust flow.

Executable payload shape: **`BondChallengePayloadSchema`** in `@envoymesh/protocol` (e.g. **`targetOwnerId`**, optional **`message`**).

### `bond.challenge.response`

Responds to a bond challenge (nonces / proofs as designed).

Executable payload shape: **`BondChallengeResponsePayloadSchema`** in `@envoymesh/protocol` (e.g. optional **`message`**, optional **`signedProof`**, **`challengedByOwnerId`**).

### `social.intro.sync`

Agent-to-agent coordination for Trust-mode intros (**non-binding** — does not establish a bond).

Executable payload shape: **`SocialIntroSyncPayloadSchema`** in `@envoymesh/protocol` ( **`introCorrelationId`**, **`ownerId`**, **`interest`** ∈ {`explore`|`decline`|`request-human-review`|`withdraw`}, optional **`counterpartyOwnerIdHint`**, **`profileFragmentRefs`**, **`noteToCounterpartyAgent`**).

Envelope roles (normative in current implementation): **`senderRole=agent`**, **`recipientRole=agent`**. Agent senders SHOULD carry **`agentCredential`**; receivers validate **`agentCredential.ownerId`** against payload **`ownerId`**.

Purpose:

- Align two sides’ agents before a human sees a formal **`social.intro.propose`**.
- Share opaque fragment refs or coordination signals without claiming a bond outcome.

### `social.intro.propose`

Agent-to-human: proposes introducing a **candidate** peer using owner-signed profile material or an opaque reference.

Executable payload shape: **`SocialIntroProposePayloadSchema`** in `@envoymesh/protocol` — requires **`introCorrelationId`**, **`candidateOwnerId`**, **`candidatePeerId`**, and either **`profileFragment`** or **`profileFragmentRef`**; optional **`rationale`**.

**`HumanProfileFragmentPayload`** (when inlined): bounded disclosure snippet signed by the profile owner (**`purpose`**, **`expiresAt`**, optional **`displayName`** / **`bio`** / **`hobbies`** / **`tags`**, **`signature`**). Normative schema: **`HumanProfileFragmentPayloadSchema`** in `@envoymesh/protocol`.

Envelope roles: **`senderRole=agent`**, **`recipientRole=human`**. **`agentCredential`** is required for validated inbound paths.

Purpose:

- Surface a vetted candidate to the owner’s UI / inbox while keeping biography grounded in signed material.

### `social.intro.owner-ready`

Human-to-agent or human-to-human: signals that an owner has reviewed an intro thread and is willing to proceed toward bonding (does not replace **`bond.request`** / **`bond.accept`**).

Executable payload shape: **`SocialIntroOwnerReadyPayloadSchema`** in `@envoymesh/protocol` (**`introCorrelationId`**, **`ownerId`**, **`nonce`**, **`expiresAt`**).

Envelope roles: **`senderRole=human`**, **`recipientRole`** ∈ {**`agent`**, **`human`**}.

Purpose:

- Timestamp-bound owner intent before an outbound **`bond.request`** carries **`ownerCommitmentRef`**.

### `discovery.request`

Requests tag-scoped or capability-scoped discovery without sharing a full profile.

Executable payload shape: **`DiscoveryRequestPayloadSchema`** in `@envoymesh/protocol` (includes **`requestedTagHashes`**, **`requestedCapabilities`**, **`maxResults`**).

Purpose:

- Ask a trusted peer for bounded discovery matches.
- Keep requests scoped to hashed topics and/or capabilities.

### `discovery.response`

Returns bounded discovery matches correlated to a prior request.

Executable payload shape: **`DiscoveryResponsePayloadSchema`** in `@envoymesh/protocol` (includes **`requestMessageId`**, **`matches`**, **`truncated`**).

Purpose:

- Return one or more scoped discovery candidates.
- Preserve request/response correlation in audit trails.

### `chat.message`

Sends a signed human-readable chat payload between peers on **`/envoymesh/chat/0.1.0`** only.

Executable payload shape: **`ChatMessagePayloadSchema`** in `@envoymesh/protocol` (includes **`senderOwnerId`**, **`text`**).

Purpose:

- Support direct conversational handoff between trusted peers.
- Provide correlation-friendly conversational traffic on a dedicated channel split from task/control traffic.

### `bond.update`

Shares a trust or revocation update.

Purpose:

- Revoke a device.
- Update trust level.
- Sync owner-approved bond changes across devices.

### `agent.card.request`

Requests an Agent Card.

Purpose:

- Learn safe public capabilities.
- Decide whether a peer is relevant for a task.
- Avoid sending detailed task information to irrelevant peers.

### `agent.card.response`

Returns an Agent Card.

Purpose:

- Advertise capabilities, topics, and public trust policy.
- Keep discovery structured.

### `task.mandate`

Carries or references an owner-approved mandate.

Purpose:

- Prove delegated authority.
- Bound an autonomous task.
- Let receivers inspect constraints before negotiating.

### `knowledge.query`

Requests knowledge from an Envoy.

Executable payload shape: **`KnowledgeQueryPayloadSchema`** in `@envoymesh/protocol` (fields include **`query`** and optional **`requestedSensitivity`**).

Purpose:

- Ask for a summary or answer from approved vault data.
- Never imply raw file access by default.

### `knowledge.response`

Returns an approved answer.

Executable payload shape: **`KnowledgeResponsePayloadSchema`** in `@envoymesh/protocol` (fields include **`answer`**, optional **`requestedSensitivity`**, optional **`suggestedRelativePath`**, optional **`matchScore`**, optional **`refused`** / **`refusalReason`**).

Purpose:

- Send summaries, citations, or permitted snippets.
- Include sensitivity and audit metadata.
- For document acquisition interop, set **`suggestedRelativePath`** when a published vault item matches (preferred over parsing path from `answer` text). See [EMP implementer's guide](./emp-implementers-guide.md#5-document-acquisition-interop-knowledgeresponse).

### `task.propose`

Requests work from another Envoy.

Purpose:

- Delegate model work.
- Ask a Primary Envoy to process a mobile request.
- Ask a trusted peer to help with a permitted task.

### `task.negotiate`

Clarifies or counter-proposes task terms.

Purpose:

- Ask for refinement.
- Negotiate scope, privacy, cost, or timing.
- Avoid unnecessary owner escalation.

### `task.reject`

Rejects a proposed task.

Purpose:

- Decline outside-policy work.
- Explain whether rejection is permanent or approval-dependent.

### `task.result`

Returns a task result.

Purpose:

- Complete asynchronous work.
- Attach status, cost, and audit metadata.

### `task.heartbeat`

Reports progress for an active long-running task.

Purpose:

- Keep owners and peers aware that work is still active.
- Share current task state and retry timing.
- Avoid noisy owner interruptions for normal progress.

### `report.create`

Creates a report for the owner.

Purpose:

- Summarize autonomous task progress.
- Package evidence and suggested actions.
- Decide instant, brief, silent, or approval mode.

### `task.cancel`

Cancels an active delegated task.

Purpose:

- Stop active work.
- Notify involved peers.
- Preserve audit history.

### `sync.state`

Synchronizes owner state between authorized devices.

Purpose:

- Sync trust graph changes.
- Sync approval queue.
- Sync device certificates and revocations.
- Later sync CRDT state.

<a id="appendix-a-trust-mode-social-mediation-socialintro"></a>

## Appendix A: Trust-mode social mediation (`social.intro.*`)

This appendix normatively summarizes **Phase 12** Trust-mode intents shipped in `@envoymesh/protocol` and enforced in **`@envoymesh/bonds`** + `apps/node`. Product narrative, tier rules, and backlog live in [trust-mode-social-protocol.md](./trust-mode-social-protocol.md) and [trust-mode-implementation-plan.md](./trust-mode-implementation-plan.md).

### Human vs agent commitment

- **Agents** MAY coordinate via **`social.intro.sync`**, **`social.intro.propose`**, and (with owner involvement) **`social.intro.owner-ready`**.
- **Bonding** still uses **`bond.request`** / **`bond.accept`** (or challenge flows). Humans retain exclusive **commit** unless policy explicitly allows agent-mediated **`bond.request`** with **`ownerCommitmentRef`**.

### Profile fragments

**`HumanProfileFragmentPayload`** is a **tier-B** disclosure: short-lived, purpose-tagged, owner-signed structured fields. Receivers MUST reject **`social.intro.propose`** fragments past **`expiresAt`**.

### Bond payload linkage

**`bond.request`** MAY carry:

| Field | Meaning |
|-------|---------|
| **`introCorrelationId`** | Same identifier used across **`social.intro.*`** messages for one intro thread. |
| **`ownerCommitmentRef`** | Opaque handle (e.g. UUID) proving UI/approval-layer commitment before bond.

Inbound nodes SHOULD reject **`bond.request`** from **`senderRole=agent`** when **`agentCredential`** is present and **`ownerCommitmentRef`** is absent (device-signed hello-style **`bond.request`** without credential remains valid).

### Discovery helpers

Trust-mode tooling MAY emit **`discovery.request`** and **`broadcast.request`** for matching; those intents are defined elsewhere in this document and share the usual EMP envelope rules.

### Audit

Inbound outcomes SHOULD be recorded as **`message.verified`** / **`message.rejected`** with intent, **`correlationId`**, and **`remotePeerId`** where applicable — see node audit types in `@envoymesh/local-store`.

<a id="appendix-b-canonical-capability-vocabularies"></a>

## Appendix B: Canonical capability vocabularies

EMP uses **several capability namespaces** for different jobs: **cryptographically bound device powers**, **agent intent scope**, and **advertised discovery / matching** metadata. Use the right namespace so policy, matching, and audits stay consistent.

**Normative source of truth for device capability strings:** `CapabilitySchema` in `@envoymesh/protocol` (Zod enum). If this appendix and the package diverge, the **package wins** until the spec is updated.

### B.1 Device certificate & `system.signal` capabilities

These strings appear on **owner-signed device certificates** and in **`system.signal`** payloads. A device MUST NOT assert a capability the owner did not grant; verifying peers SHOULD reject operations that require a capability the sender’s certificate does not include (see also **intent ↔ capability** below).

| Capability | Intended meaning |
|------------|------------------|
| `mesh.listen` | Accept inbound mesh / libp2p listens appropriate to the implementation. |
| `mesh.discovery` | Participate in discovery (mDNS/DHT/rendezvous-style lookups as implemented). |
| `mesh.relay` | Relay or forward traffic for others (relay-class nodes). |
| `ui.channel` | Satellite / UI control channel pairing (human-facing device role). |
| `approval.prompt` | Surface owner approvals (risky actions, pairing, etc.). |
| `message.send` | Send signed EMP envelopes over the mesh/chat channels. |
| `message.store_encrypted` | Store encrypted message material where local policy allows. |
| `vault.index` | Maintain or query a vault index. |
| `vault.retrieve` | Read vault payloads for knowledge / tooling (often paired with indexing). |
| `model.local` | Run models locally on this device class. |
| `model.cloud.request` | Invoke cloud-hosted models according to owner policy. |
| `task.execute` | Execute delegated / agent-directed tasks locally. |
| `device.sync` | Synchronize owner state across authorized devices. |

**Pairing hint:** `device.pair.request` carries **`requestedCapabilities`** as the **same enum** (`CapabilitySchema`), so satellites and primaries negotiate a bounded subset explicitly.

### B.2 Intent ↔ required device capabilities (bond engine)

For a **subset** of intents, **`@envoymesh/bonds`** defines **`evaluateCapability`**: sending that intent requires the acting device certificate to satisfy **at least one** of the listed capability sets (each set is AND; alternatives are OR). Example: `discovery.request` allows either `mesh.discovery` **or** `message.send`; `chat.message` requires `message.send`.

Implementations SHOULD keep this mapping in sync with EMP when adding intents. **Authoritative runtime table:** `capabilityRequirements` in `@envoymesh/bonds` (partial map — intents omitted there are not guarded by this layer today).

Matching requests (discovery, introductions) SHOULD still use **B.4** advertisement tags where the goal is peer fit, not device authorization.

### B.3 Agent credential `scope`

**Agent credentials** carry **`scope: string[]`** listing **EMP intent names** the agent is allowed to use (e.g. `chat.message`, `knowledge.query`, `bond.request`). These are **not** the same strings as **B.1** device capabilities: they label **which intents** are delegated to the agent, while the **device certificate** lists **what the device** may do.

- Use intent strings **exactly** as registered in **`EnvoyIntentSchema`** (`@envoymesh/protocol`).
- Receiving nodes SHOULD reject envelopes where **`senderRole=agent`** and the intent is not in the verified credential’s **`scope`** (see `@envoymesh/identity` verification rules).

### B.4 Discovery & rendezvous matching (`CapabilityUnion`)

**`HumanProfilePayload.capabilities`** (optional, max 20 entries) uses **`CapabilityUnion`**:

| Form | Use |
|------|-----|
| `{ "tag": "<string>" }` | Stable machine-readable label for matching (`rendezvous.register` / `rendezvous.query` use the same union). Prefer **stable, lowercase identifiers** (e.g. `coding-help`, `document-search`). Product-specific catalogs MAY use a prefixed convention (e.g. `topic:climate-policy`) once documented here. |
| `{ "type": "<string>", "params"? }` | Structured offers or needs (e.g. translation with `{ "from": "en", "to": "fr" }`). |
| `{ "descriptor": "<natural language>" }` | Experimental / human or model-generated blurbs; matchers SHOULD NOT rely on descriptors alone for security decisions. |

**Relay paths** (`relay.checkin`, **`RelayPeerCandidate`**, **`RelayLookupPayload`**) carry **`capabilities: string[]`**. Those strings are opaque at the relay but implementations SHOULD reuse **B.4 `tag`** identifiers (or **`B.1`** names when advertising mesh powers) where useful so lookups stay consistent across nodes.

### B.5 `AgentCard` capabilities

**`AgentCard.capabilities`** and **`AgentCardRequestPayload.requestedCapabilities`** are **free-form strings** in the schema. For interoperability:

- When describing **what the agent can do on the mesh**, prefer **B.1** capability names or a documented **B.4** tag vocabulary.
- When describing **tooling**, use stable short identifiers documented in release notes or this appendix.

<a id="appendix-c-actor-disclosure-and-owner-visibility"></a>

## Appendix C: Actor disclosure & owner visibility (Phase 13)

This appendix summarizes **honest actor roles** on the wire and **owner visibility surfaces** when agents work off-chat. Product narrative: [a2a-actor-visibility-plan.md](./a2a-actor-visibility-plan.md); backlog: [scenarios.md Epic AV](./scenarios.md#epic-av--actor-disclosure--owner-visibility).

### C.1 Wire roles (`senderRole` / `recipientRole`)

| Traffic | Typical `senderRole` | Typical `recipientRole` | Notes |
|---------|---------------------|-------------------------|-------|
| Human-typed chat | `human` | `human` or `agent` | Device key signs envelope. |
| AI auto-send / approved draft / bridge reply | `agent` | `human` | Agent key + **`agentCredential`** required; peers verify credential against owner. |
| Bilateral A2A (`task.*`, `knowledge.*`, `agent.card.*`) | `agent` | `agent` | Structured intents — not long agent↔agent chat threads. |
| Owner-facing report (local-only Option A) | — | — | **`emitOwnerReport`** writes Activity locally; no wire envelope to human. |

**UI rule:** `AiIdentityMode` (`invisible` / `transparent` / …) affects **display prefix only**; it MUST NOT downgrade wire `senderRole`.

Inbound peers SHOULD reject `chat.message` with `senderRole=agent` when **`agentCredential`** is missing or fails verification.

### C.2 Owner visibility surfaces

| Surface | Purpose |
|---------|---------|
| **Activity feed** | Local timeline of off-chat agent work (`AgentActivityStore` / mobile SQLite). |
| **Task journal + audit** | Correlation drill-down by `correlationId` / `taskId` (no raw payload dump by default). |
| **Approval queue** | AI-drafted `send_chat` held until owner approves → executes via `sendAgentChat`. |
| **Digest** | Aggregated A2A activity counts (Phase 9J extension). |
| **Optional chat system lines** | `NodeConfig.a2aChatNotifications`: `off` \| `milestones_only` \| `all_reports` — local UI rows only. |

### C.3 Per-domain notify policy

`NodeConfig.agentVisibility` maps each domain (`social`, `knowledge`, `home`, `research`) to:

| Mode | Activity push behavior |
|------|------------------------|
| `instant` | Push all rows to WS `agent:activity`. |
| `brief` | Milestones only (`task_completed`, `task_failed`, `report_received`, `approval_needed`). |
| `silent` | Store locally; no push. |
| `approval` | Push `report_received` and `approval_needed` only. |

Rows are **always retained** in the local store regardless of push mode. **`autonomousKillSwitch`** still gates autonomous actions.

## Appendix D: H2A product channel & wire semantics (Phase 15C)

Product narrative: [emp-h2a-channel-adr.md](./emp-h2a-channel-adr.md), [h2a-wire-semantics.md](./h2a-wire-semantics.md).

### D.1 Product lanes

| Lane | Social surface | Wire |
|------|----------------|------|
| **Peer human chat** | Chat → contact thread | `chat.message` on `/envoymesh/chat` |
| **Owner ↔ home agent (H2A)** | **Assistant** view | Local RPC (`runDocumentAgentTurn`, `knowledgeQuery`); Activity rows |
| **A2A orchestration** | Activity + task journal | `task.*`, `agent.card.*` on `/message`, roles agent↔agent |

Optional envelope field **`channel`** is **not required** in v0.1 — see ADR.

### D.2 Intent → protocol path

| Path | Intents |
|------|---------|
| `/envoymesh/chat/0.1.0` | `chat.message` only |
| `/envoymesh/message/0.1.0` | `knowledge.query`, `discovery.*`, `task.*`, `system.*`, … |
| `/envoymesh/data/0.1.0` | `share.chunk`, transfer bodies |

Code: `packages/api/src/h2a-wire-semantics.ts` + `packages/network` protocol validation.

### D.3 H2A Activity

Local owner turns append **`AgentActivityRecord`** rows (`knowledge_answered`, `task_progress`, `share_proposed`) with domain `knowledge` or `home` — visible in Assistant rail and Activity feed.

<a id="appendix-e-envoyai-standing-delegation-profile"></a>

## Appendix E: EnvoyAI quick reference (part of emp/0.1)

Normative detail: [EnvoyAI section](#envoyai-ai-mediated-social-mesh) above. Implementation: [Phase 16](./implementation-plan.md#phase-16-envoyai-standing-delegation--autonomous-postures).

| Topic | EMP location |
|-------|----------------|
| Standing mandates | [Mandates → Standing mandates](#standing-mandates-and-postures) |
| Postures | [`social_proxy`, `document_acquisition`](#postures) |
| Disclosure | [Three disclosure planes](#three-disclosure-planes) |
| Intent matrices | [social_proxy](#posture-social_proxy), [document_acquisition](#posture-document_acquisition) |
| Capability advertisement | `supportedCapabilities` on Agent Card / `system.signal` |

**There is no `envoyai/0.1` version line.** EnvoyAI ships as optional capabilities within `emp/0.1`.

## Envelope Requirements

Every EMP message must include:

- Protocol version.
- Message ID.
- Creation timestamp.
- Owner ID.
- Device ID.
- Device certificate reference or inline certificate.
- Sender public key.
- Recipient owner ID or recipient device ID when known.
- Intent.
- Payload.
- Mandate reference or Proof of Intent when delegated work is involved.
- Signature.

Normative role requirements in current implementation:

- Envelope fields **`senderRole`** and **`recipientRole`** are required.
- **`chat.message`** allows human↔human, human↔agent, agent↔human, and agent↔agent (with `agentCredential` required when `senderRole=agent`).
- **`task.*`** and **`report.create`** require `senderRole=agent` and `recipientRole=agent`.
- **`social.intro.sync`** requires `senderRole=agent` and `recipientRole=agent`.
- **`social.intro.propose`** requires `senderRole=agent` and `recipientRole=human`.
- **`social.intro.owner-ready`** requires `senderRole=human` and `recipientRole` ∈ {`agent`, `human`}.
- Violations are rejected during schema validation and are also rejected at runtime if received.

Protocol/channel split (hard enforcement):

- **`/envoymesh/chat/0.1.0`** accepts only `chat.message`.
- **`/envoymesh/message/0.1.0`** rejects `chat.message` and carries system/task/control intents.
- **`/envoymesh/data/0.1.0`** carries voucher + chunked transfer bodies only.
- Sending on the wrong channel is rejected before send; inbound violations are rejected with audit `message.rejected` records.

## Discovery

Discovery should be privacy-aware.

Discovery modes:

- mDNS for local network development.
- Direct known multiaddr for pairing and debugging.
- Private discovery key for owner devices.
- DHT/rendezvous for wider mesh discovery.
- Relay/hole punching for NAT traversal.

Unknown peers should not learn the full owner graph. Public discovery should reveal only minimal presence metadata.

## Pairing Workflows

### Pair Owner Device (Mobile as Full Node)

The mobile app is a **full EnvoyMesh node**, not a satellite or thin client. It bonds with the home node like any other peer.

1. Primary Envoy (home node) generates a QR code with its peer ID and reachable multiaddr.
2. Mobile app scans the QR code and initiates a `bond.hello` to the Primary Envoy.
3. Primary Envoy verifies the request and accepts the bond (or prompts owner for approval).
4. Both nodes now have a direct P2P bond.
5. The AI agent running on the home node has its own peer ID — the mobile app sees it as a contact.
6. Owner communicates with the AI agent via standard `chat.message` to the agent's peer ID.

### Pair Trusted Friend

1. Two owners exchange owner IDs and public keys, usually by QR code or invite link.
2. Each side stores a bond record.
3. Future device messages are accepted only if the device is authorized by the trusted owner.

## Revocation

Revocation is required for real-world safety.

Revocable records:

- Device certificates.
- Friend bonds.
- Referral credentials.
- Model delegation permissions.

Revocation records should be signed by the owner identity and synced to all authorized devices.

## Capability Model

Capabilities describe **what a device may do** (owner-signed **`CapabilitySchema`**), **which intents an agent may use** (credential **`scope`**), and **what a human/agent advertises for discovery** (`HumanProfilePayload` **`CapabilityUnion`**, relay strings — see **[Appendix B: Canonical capability vocabularies](#appendix-b-canonical-capability-vocabularies)**).

Device authorization SHOULD require both **trust level** (bonds) and **device capabilities** where `evaluateCapability` applies; agents additionally require **`scope`** checks for delegated intents.

## Versioning

EMP uses semantic protocol versions. **EnvoyAI is part of emp/0.1** — not a separate version.

The current draft version is:

```text
emp/0.1
```

Optional **capability flags** (advertised in Agent Card / `system.signal`, ignored by nodes that do not implement them):

```text
standing-delegation
social-proxy
document-acquisition
```

Rules:

- Unknown intents are rejected by default.
- Unknown optional fields are ignored only when schema permits them.
- Breaking envelope changes require a new major protocol version (`emp/0.2`, not a forked AI protocol).
- Nodes should advertise supported EMP versions in `system.signal`.
- Nodes that support EnvoyAI postures SHOULD list relevant entries in `supportedCapabilities`.

## Implementation Guidance

Version 0.1 should implement EMP in this order:

1. Keep current Ed25519 device identity.
2. Add owner identity as a separate root key.
3. Add device certificates.
4. Add `system.signal`.
5. Add device capability checks.
6. Add owner-device pairing.
7. Add Agent Card schemas.
8. Add mandate schemas.
9. Add task lifecycle and report schemas.
10. Add mobile thin UI channel.
11. Defer mobile full-node mode until Primary/Satellite sync is stable.
12. Add DIDs after the Ed25519 owner/device model is stable.
