# EnvoyMesh Protocol

EnvoyMesh Protocol, or EMP, is the standard contract that lets Envoys run across different devices and implementations.

EMP defines identity, device roles, message envelopes, trust workflows, and the minimum verbs every Envoy should understand. The goal is to let a desktop Envoy, mobile Envoy, home server Envoy, or future embedded Envoy interoperate without depending on a central backend.

For product-level narratives and user stories, see [EnvoyMesh scenarios](./scenarios.md), [narrative user stories](./UserStory.md), and [design ↔ implementation alignment](./alignment-review.md). For how EMP fields map to packages and the node runtime, see [detailed design](./detailed-design.md).

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

- Relay encrypted messages.
- Help offline delivery.
- Help peers behind NAT.

Recommended capabilities:

- `mesh.relay`
- `message.store_encrypted`

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
  "supportedProtocolVersions": ["emp/0.1"]
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

Purpose:

- Ask to become a direct friend or referred peer.
- Carry referral proof or public profile metadata.

### `bond.challenge`

Presents a challenge in the bond / trust flow.

Executable payload shape: **`BondChallengePayloadSchema`** in `@envoymesh/protocol` (e.g. **`targetOwnerId`**, optional **`message`**).

### `bond.challenge.response`

Responds to a bond challenge (nonces / proofs as designed).

Executable payload shape: **`BondChallengeResponsePayloadSchema`** in `@envoymesh/protocol` (e.g. optional **`message`**, optional **`signedProof`**, **`challengedByOwnerId`**).

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

Purpose:

- Send summaries, citations, or permitted snippets.
- Include sensitivity and audit metadata.

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
- **`chat.message`** requires `senderRole=human` and `recipientRole=human`.
- **`task.*`** and **`report.create`** require `senderRole=agent` and `recipientRole=agent`.
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

### Pair Owner Device

1. Primary Envoy displays a QR code with owner ID, pairing endpoint, and nonce.
2. Satellite device generates a device key.
3. Satellite sends a pairing request.
4. Owner approves on Primary Envoy.
5. Primary signs a device certificate.
6. Satellite stores the certificate and starts using its device key.

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

Capabilities describe what a device or peer can do.

Examples:

- `mesh.listen`
- `mesh.discovery`
- `mesh.relay`
- `ui.channel`
- `approval.prompt`
- `message.send`
- `vault.index`
- `vault.retrieve`
- `model.local`
- `model.cloud.request`
- `task.execute`
- `device.sync`

Every intent should declare required capabilities. Authorization requires both trust level and capability.

## Versioning

EMP uses semantic protocol versions.

The current draft version is:

```text
emp/0.1
```

Rules:

- Unknown intents are rejected by default.
- Unknown optional fields are ignored only when schema permits them.
- Breaking envelope changes require a new major protocol version.
- Nodes should advertise supported EMP versions in `system.signal`.

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
