# EnvoyMesh scenarios (user stories)

This document is the **scenario backlog** for EnvoyMesh: short, testable user stories that connect product intent to protocol and implementation. Use it like a living **epic → story** list: prioritize stories, derive acceptance criteria, and trace features to audits and mandates.

**Related docs**

- [Alignment review](./alignment-review.md): design vs implementation snapshot.
- [User stories (narrative requirements)](./UserStory.md): journeys, roles, and protocol pressure in prose.
- [EnvoyMesh Protocol](./protocol-standard.md) (EMP): envelopes, identity, mandates, tasks.
- [QuickStart](../QuickStart.md): run node, CLI, dashboard, probes.

**How to read each story**

- **As a / I want / So that** — classic user story framing.
- **Acceptance notes** — concrete behaviors we can verify (manual, integration test, or audit trail).
- **Status** — *Implemented (partial)* means something exists in-repo but may not cover every acceptance line yet.

---

## Personas (roles)

| Persona | Description |
|--------|-------------|
| **Owner** | Human with ultimate authority: trust policy, mandates, approvals. |
| **Envoy (agent)** | Software acting for the owner: signs messages, negotiates, filters inbound traffic. |
| **Node** | A running instance on a device (desktop, phone, server); ephemeral compared to identity. |
| **Peer** | Another owner’s Envoy on the network; trust may be *stranger*, *known*, or *bonded*. |

---

## Epic A — Identity and node birth

### US-A1: Stand up a first node

**As an** owner, **I want** my first Envoy node to create a stable identity and device credentials **so that** every message I send is attributable and verifiable without a central account server.

**Acceptance notes**

- A profile directory contains owner + device material suitable for signing envelopes.
- Outbound envelopes are signed; peers can reject unsigned or invalid signatures.

**Status:** *Implemented (partial)* — local profile and signed envelopes; DID document format may evolve per EMP.

### US-A2: Add a second device (future)

**As an** owner, **I want** to authorize a new device with my owner key **so that** my Envoy identity spans laptop and phone without sharing one private key everywhere.

**Acceptance notes**

- New device receives an explicit authorization record signed by the owner.
- Revocation removes network authority without deleting the owner identity.

**Status:** *Planned* — follow EMP device lifecycle.

---

## Epic B — Discovery and capability matching

### US-B1: Discover peers by capability (not biography)

**As an** Envoy, **I want** to announce and query **abstract capability tags** (e.g. topic hashes or registered labels) **so that** discovery stays privacy-preserving and responders self-select.

**Acceptance notes**

- Discovery payload does not require full owner biography.
- Only nodes that opted into a tag (e.g. via agent card metadata) engage.

**Status:** *Planned* — may use mDNS/DHT/gossipsub and agent cards; semantics TBD in EMP.

### US-B2: Know who answered (cryptographically)

**As an** Envoy, **I want** every discovery response to carry a verifiable sender identity **so that** I can apply trust policy before opening a data stream.

**Acceptance notes**

- Responses are signed; optional bond/referral proof per policy.

**Status:** *Partial* — signed envelopes; bond proofs as in EMP trust flows.

---

## Epic C — Tasks, broadcast, and termination

### US-C1: Broadcast a task with correlation

**As an** owner, **I want** to publish a task (e.g. “find X under budget Y”) with a **correlation id** **so that** all proposals, results, and cancellations line up in audit and UI.

**Acceptance notes**

- Task-related messages carry `correlationId` (or derived id) where applicable.
- Local audit can filter or group by that id across inbound/outbound events.

**Status:** *Implemented (partial)* — protocol + audit correlation fields; full fan-out semantics evolving.

### US-C2: Stop broadcasting (TTL, expiry, cancel)

**As an** Envoy, **I want** clear **termination rules** for any fan-out request **so that** the mesh does not amplify work forever.

**Acceptance notes**

- Every broadcast-style request defines at least one of: **max hops**, **wall-clock expiry**, **max responses**, or **explicit cancel** keyed by `correlationId`.
- After termination, nodes discard or ignore late duplicates per policy.

**Status:** *Implemented (partial)* — receiver enforces **mandate / propose wall-clock expiry**, **task.cancel** closure, and **satisfied** closure after first **completed** `task.result` when `closeOnFirstCompletedResult` is set on the mandate (see Phase 4D in `docs/implementation-plan.md`). **Hop TTL**, **maxResponses**, and **network-wide cancel propagation** are still planned.

### US-C3: First good answer vs N answers

**As an** owner, **I want** to configure whether the task stops after **one** valid result or **k** results **so that** I control cost vs redundancy.

**Acceptance notes**

- Policy is explicit in mandate or task envelope metadata.
- Envoy emits cancellation or “closed” state when threshold met.

**Status:** *Implemented (partial)* for the **“first completed result closes the task”** case via mandate `closeOnFirstCompletedResult`. **Collect-N** (`k > 1`) and automatic cancel broadcasts are still planned.

---

## Epic D — Social handshake and trust

### US-D1: Send a bond / friend request with context

**As a** human, **I want** my Envoy to send a bond request that includes **how we know each other** (referral, event, prior channel) **so that** the receiver’s policy can auto-accept or queue for review.

**Acceptance notes**

- Receiver evaluates trust tier + proof; outcome is auditable.
- High-risk paths surface in owner UI (dashboard / morning brief) instead of silent accept.

**Status:** *Partial* — trust records and approvals exist locally; full bond proof protocol per EMP.

### US-D2: Stranger traffic is safe by default

**As an** Envoy, **I want** to **reject or sandbox** traffic from untrusted peers **so that** owners are not exposed to spam or malicious payloads.

**Acceptance notes**

- Inbound guard: malformed, oversized, replayed, or invalid-signature messages are rejected with audit rows.
- Optional probes (e.g. social challenge script) validate reject paths.

**Status:** *Implemented (partial)* — inbound guard + audits; semantic firewall for LLM-bound content *planned*.

---

## Epic E — File and data sharing

### US-E1: Share only a slice of my vault

**As an** owner, **I want** grants to expose **tagged or named documents** (not the whole disk) **so that** friends get data under least privilege.

**Acceptance notes**

- Access is described by mandate / policy, not “read entire home directory.”
- Shared vault or virtual views are consistent with local-first storage.

**Status:** *Partial* — shared vault indexing/search exists; fine-grained vouchers *planned*.

### US-E2: Verifiable chunked transfer

**As an** Envoy, **I want** large files transferred in **chunks with content ids** **so that** recipients detect tampering without trusting every hop blindly.

**Acceptance notes**

- Chunks verify against declared digests; audit records transfer lifecycle.

**Status:** *Planned* — dedicated data sub-protocol (e.g. chunked stream) per architecture discussions.

---

## Epic F — Communication roles (human ↔ agent)

Stories use **sender role** and **receiver role** to avoid ambiguous “chat.”

### US-F1: Human-to-human (H2H) channel

**As a** human, **I want** low-latency messages to another human **so that** conversation feels like a messenger, while still encrypted on the wire.

**Acceptance notes**

- Dedicated chat intent or sub-protocol; high priority in the runtime.
- Envoy may log metadata only; content handling per privacy settings.

**Status:** *Planned* — distinct from A2A task stream.

### US-F2: Agent-to-agent (A2A) shadow negotiation

**As an** Envoy, **I want** to negotiate tasks, sync state, and filter noise **without** spamming the owner **so that** humans see summaries, not every packet.

**Acceptance notes**

- Structured intents; journal + audit for traceability.
- Owner notified only on policy thresholds (approval, failure, completion).

**Status:** *Partial* — task journal and audits; LLM integration out of band.

### US-F3: Human-to-agent on a peer (H2A)

**As a** human, **I want** to ask **my friend’s Envoy** for allowed information (e.g. public notes) **so that** I get answers when policy permits.

**Acceptance notes**

- Receiver checks mandate + trust before answering or deferring.
- Sensitive asks require owner approval.

**Status:** *Partial* — mandates and approvals locally; cross-peer H2A routing *planned*.

### US-F4: Agent-to-human (A2H) nudge

**As an** Envoy, **I want** to surface results and permission prompts to my owner **so that** autonomous work pauses at the right moral/legal boundary.

**Acceptance notes**

- Dashboard / CLI shows pending approvals linked to task id and correlation.
- Owner action is signed or recorded per EMP.

**Status:** *Partial* — dashboard approvals; richer “morning report” *planned*.

### US-F5: Semantic firewall (injection resistance)

**As an** Envoy, **I want** inbound human-originated text to pass **deterministic checks** before model or tool use **so that** prompt injection cannot exfiltrate vault data.

**Acceptance notes**

- Pipeline: verify identity/trust → schema → non-LLM filters → optional LLM.
- Failed checks are auditable (`rejected` / `deny`) without storing raw payloads unnecessarily.

**Status:** *Planned.*

---

## Epic G — Observability and operations

### US-G1: Correlate a negotiation across two nodes

**As an** operator, **I want** audit events keyed by **correlation id** and direction **so that** I can line up outbound sends with inbound verifies/rejects.

**Acceptance notes**

- Optional `correlationId` on envelopes; audit rows include correlation, latency, verification status where applicable.

**Status:** *Implemented (partial).*

### US-G2: Debug P2P without leaking payloads

**As an** operator, **I want** optional stream/connection lifecycle traces **so that** I can debug connectivity without logging message bodies.

**Acceptance notes**

- Toggle enables `p2p.trace`-style audit events; no payload dump.

**Status:** *Implemented (partial).*

---

## Prioritization hint (for QuickStart and milestones)

Order should stay consistent with the [implementation plan](./implementation-plan.md) **User story traceability** table and **Next planning pulls** (e.g. Phase 4E discovery after tightening 4D gaps on the wire).

| Priority | Stories | Rationale |
|----------|---------|-----------|
| **P0** | US-A1, US-C1, US-G1, US-D2 | Identity, correlated tasks, auditability, safe defaults. |
| **P1** | US-C2, US-D1, US-F2 | Bounded broadcasts and trust UX unlock real multi-peer use. |
| **P2** | US-E1–E2, US-F1, US-F3–F4 | Data plane + human-facing channels. |
| **P3** | US-B1–B2, US-F5, US-A2 | Scale discovery and harden AI-mediated paths. |

---

## Changelog (document meta)

| Date | Change |
|------|--------|
| 2026-04-26 | Initial scenarios backlog derived from architecture discussions. |

When a story ships, add a short **Implementation** subsection under it (file paths, flags, protocol version) or link to the PR — keep this file the **narrative source of truth** for *why* features exist.
