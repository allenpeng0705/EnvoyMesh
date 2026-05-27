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

<a id="epic-tm-trust-mode"></a>

## Epic TM — Trust mode (agent-assisted intros)

Stories trace Phase **12** ([trust-mode-social-protocol.md](./trust-mode-social-protocol.md), [trust-mode-implementation-plan.md](./trust-mode-implementation-plan.md), EMP [Appendix A](./protocol-standard.md#appendix-a-trust-mode-social-mediation-socialintro)).

### US-TM1: Toggle Trust mode and persist friend-matching prefs

**As an** owner, **I want** Trust mode and optional friend-seeking notes stored in node config **so that** intros and matching tools only run when I opt in.

**Acceptance notes**

- **`trustModeEnabled`** and **`friendMatchingPreferencesText`** round-trip via **`getNodeConfig`** / **`updateNodeConfig`** (desktop + mobile parity where exposed).
- With Trust mode off, inbound **`social.intro.*`** does not establish policy-visible threads beyond deny/audit expectations defined in node tests.

**Status:** *Implemented (partial)* — `apps/node` persistence + Social Settings; verify `social-intro-inbound.test.ts` when Trust mode toggled.

### US-TM2: Surface inbound **`social.intro.propose`** to owner inbox

**As an** owner, **I want** agent-proposed intros to appear in Social **Inbox** with WebSocket **`social.intro:propose`** **so that** I can approve or decline without silent drops.

**Acceptance notes**

- **`listPendingSocialIntroProposals`** returns pending rows (`introCorrelationId`, candidate ids, fragment/ref summary).
- **`declineSocialIntroProposal`** clears or marks declined per RPC behavior; **`approveSocialIntroCommitment`** yields an **`ownerCommitmentRef`** for bonding.

**Status:** *Implemented (partial)* — `apps/social` Inbox + `apps/node` WS/RPC; audit expectations in `social-intro-inbound.test.ts`.

### US-TM3: **`sendHello`** carries intro linkage into **`bond.request`**

**As an** owner, **after** approving an intro, **I want** **`bond.request`** to include **`introCorrelationId`** and **`ownerCommitmentRef`** **so that** credential-bearing agents cannot bypass human commitment.

**Acceptance notes**

- **`sendHello(..., { introProposalMessageId })`** (or equivalent) attaches refs matching the approved pending row.
- Inbound rejects credential-bearing **`bond.request`** without **`ownerCommitmentRef`** (`bond-inbound.test.ts`).

**Status:** *Implemented (partial)* — `NodeServiceImpl`, **`MobileNode`**, JSON-RPC + **`DirectCallClient`** paths.

### US-TM4: Trust-mode **`mesh.intro.*`** tools gated on config

**As an** agent runtime author, **I want** **`mesh.intro.matching_context`**, **`mesh.intro.sync`**, and **`mesh.intro.broadcast_search`** listed only when **`trustModeEnabled`** **so that** matching cannot run accidentally.

**Acceptance notes**

- **`listAgentTools({ trustModeEnabled: false })`** omits intro tools; **`true`** includes them (`tool-registry.test.ts`).
- **`executeTool`** requires **`MeshToolContext.trustIntro`** population for matching-context payloads.

**Status:** *Implemented (partial)*.

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

**Status:** *Partial* — task journal and audits; LLM integration out of band. **Phase 13** adds Activity feed + `report.create` UX ([a2a-actor-visibility-plan.md](./a2a-actor-visibility-plan.md)).

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

## Epic AV — Actor disclosure & owner visibility

Stories for [Phase 13](./implementation-plan.md#phase-13-a2a-routing-actor-disclosure--owner-visibility) and [a2a-actor-visibility-plan.md](./a2a-actor-visibility-plan.md). Core question: **if A2A is not chat, how does the owner know what the agent did?**

### US-AV1: Verified sender role in chat

**As a** human chatting with a contact, **I want** each message to show whether it came from a **verified agent** or a **human** **so that** I am never misled by AI pretending to be a person.

**Acceptance notes**

- UI reads `senderRole` + credential verification result, not text prefix alone.
- Badge: “Alice’s agent (verified for Alice)” vs “Alice”.
- Unverified agent role → message rejected or marked blocked.

**Status:** *Implemented* — Phase **13A–13B** (`ChatMessageBubble` badges, credential verification).

### US-AV2: Honest wire role for AI outbound chat

**As an** owner, **I want** my node to send AI-generated chat with **`senderRole=agent`** and a valid **`agentCredential`** **so that** peers can cryptographically verify automation.

**Acceptance notes**

- Human-typed messages: `senderRole=human`, device key.
- Auto-send, approved drafts, bridge replies: `senderRole=agent`, agent key + credential.
- `invisible` identity mode does **not** downgrade wire role.

**Status:** *Implemented* — Phase **13A** (`sendAgentChat`, approval execute-on-approve).

### US-AV3: Activity feed for off-chat agent work

**As an** owner, **I want** an **Activity** timeline of agent actions (tasks, knowledge answers, intro syncs) **so that** I see what happened without reading A2A packets in chat.

**Acceptance notes**

- Local `AgentActivityStore`; WS event `agent:activity`.
- Rows: summary, domain, counterparty, `correlationId`, optional `taskId`.
- Distinct from contact chat threads.

**Status:** *Implemented* — Phase **13D** (desktop JSONL + mobile SQLite read; Activity nav).

### US-AV4: Drill-down from Activity to task and audit

**As an** owner, **I want** to open a task or audit trace from an Activity row **so that** I can verify *why* my agent acted.

**Acceptance notes**

- Link Activity → task journal state → audit filter by `correlationId`.
- Advanced view: no raw payload dump by default.

**Status:** *Implemented* — Activity trace panel loads audit events + task journal by `correlationId` / `taskId`.

### US-AV5: Agent Card handshake (both sides AI)

**As an** agent, **I want** to exchange **`agent.card.request/response`** with a peer agent **so that** both nodes know capabilities before negotiating work.

**Acceptance notes**

- Cache `AgentCard` per bonded owner.
- Activity row when card is learned or updated.

**Status:** *Implemented* — Phase **13C** (`agent.card` inbound, cache, tool registry, Activity on cache).

### US-AV6: Owner receives report after bilateral A2A

**As an** owner, **I want** my agent to send me **`report.create`** when bilateral work completes **so that** I get a plain-language summary and suggested next actions.

**Acceptance notes**

- Inbound `report.create` → Activity feed + optional approval items.
- Remote peer’s agent does the same for their human.

**Status:** *Implemented* — wire `report.create` inbound → `emitLocalOwnerReport` → Activity (+ local Option A for self-initiated reports).

### US-AV7: Configurable agent notify loudness

**As an** owner, **I want** to set per-domain visibility (**instant / brief / silent / approval**) **so that** I control interruptions vs digest-only review.

**Acceptance notes**

- `NodeConfig.agentVisibility` aligns with reporting modes in protocol-standard.
- Kill switch still overrides all autonomous notify.

**Status:** *Implemented* — Phase **13E** (`agentVisibility`, `a2aChatNotifications`, Settings UI).

### US-AV8: Trace agent↔agent work without envelope spam

**As an** owner, **I want** to answer “what did my agent do with Bob’s agent yesterday?” from Activity + audit **so that** I do not need packet captures or chat scrollback.

**Acceptance notes**

- Filter Activity by counterparty owner + date.
- Correlation stitches outbound/inbound audits on both intents.

**Status:** *Implemented* — Activity timeline + correlation refs + **contact/date filter UI** (US-AV8).

---

## Epic MH — Multi-hop discovery (Story D)

Scenario IDs use **US-MH** prefix to avoid collision with Epic D (social handshake).

### US-MH1: Hop-limited discovery request

**As an** owner, **I want** to forward a capability search to direct bonds with a **max hop count** **so that** I can reach second-degree peers without unbounded fan-out.

**Acceptance notes**

- `discovery.request` (or successor intent) carries `maxHops` and `currentHop`.
- Intermediaries increment hop count; nodes at limit do not forward.

**Status:** *Implemented* — `maxHops` / `currentHop` on `discovery.request`, `requestMultiHopDiscovery` RPC, forward approval queue.

### US-MH2: Intermediary privacy

**As a** forwarding bond, **I want** the original requester's identity hidden from downstream peers when policy requires **so that** intermediaries are not forced to leak social graph edges.

**Acceptance notes**

- Forward tier uses referral proof or anonymized envelope variant per Bond Engine decision.
- Audit rows record hop without storing full biography in relay payloads.

**Status:** *Implemented* — `forwardPrivacy: anonymous`, `referralOwnerId`, and audit-safe labels in `@envoymesh/api/discovery-privacy`.

### US-MH3: Owner approval per forward tier

**As an** owner, **I want** each forward hop beyond direct bonds to require explicit approval **so that** my Envoy never amplifies discovery without consent.

**Acceptance notes**

- Approval queue item references `correlationId` and hop index.
- Declined forwards emit deny audit; no silent drop.

**Status:** *Implemented* — `discovery_forward` approval queue with `correlationId` / hop metadata; deny audit on decline.

### US-MH4: Second-degree match in Search / morning report

**As an** owner, **I want** ranked 2nd-degree capability matches in Discover **so that** Story D talent-scout journeys have a UI surface.

**Acceptance notes**

- Morning report or Search shows match score, hop distance, and trust path summary.
- Say Hello / intro flow uses existing Trust-mode `social.intro.*` where appropriate.

**Status:** *Implemented (partial)* — Search multi-hop aggregation panel with trust path, hop distance, pending-forward count, and live session refresh via `getMultiHopDiscoverySession` / `discovery:multihop-update`. Morning report ranking for hop-2 remains future work.

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
| **P1** | US-C2, US-D1, US-F2, US-TM1–TM4, **US-AV1–AV3** | Bounded broadcasts and trust UX; Trust-mode + **Phase 13** actor disclosure & Activity feed. |
| **P2** | US-E1–E2, US-F1, US-F3–F4 | Data plane + human-facing channels. |
| **P3** | US-B1–B2, US-F5, US-A2 | Scale discovery and harden AI-mediated paths. |

---

## Changelog (document meta)

| Date | Change |
|------|--------|
| 2026-05-20 | **Epic MH:** Multi-hop discovery **US-MH1–US-MH4** (Story D) — acceptance criteria for parked commerce/multi-hop scope. |
| 2026-05-20 | **Epic AV:** Actor disclosure & owner visibility **US-AV1–AV8** for [Phase 13](./implementation-plan.md#phase-13-a2a-routing-actor-disclosure--owner-visibility); answers “how owner knows what AI did if A2A is not chat.” P1 hint adds US-AV1–AV3. |
| 2026-05-19 | **Epic TM:** Trust-mode scenario IDs **US-TM1–US-TM4** (config, inbox/WS/RPC, **`sendHello`** linkage, gated **`mesh.intro.*`** tools); P1 prioritization hint updated. EMP appendix: [protocol-standard.md § Appendix A](./protocol-standard.md#appendix-a-trust-mode-social-mediation-socialintro). |
| 2026-04-26 | Initial scenarios backlog derived from architecture discussions. |

When a story ships, add a short **Implementation** subsection under it (file paths, flags, protocol version) or link to the PR — keep this file the **narrative source of truth** for *why* features exist.
