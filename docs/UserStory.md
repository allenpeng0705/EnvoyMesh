# EnvoyMesh user stories (requirements narrative)

This document captures **narrative user stories and requirements** for EnvoyMesh: how real people and agents should behave, what “good” looks like, and which protocol or product gaps each story exposes.

Use it alongside:

- [Alignment review](./alignment-review.md) — design vs implementation snapshot (update after major milestones).
- [EnvoyMesh scenarios](./scenarios.md) — structured epic/story backlog with acceptance and status.
- [Implementation plan](./implementation-plan.md) — phased delivery.
- [EnvoyMesh Protocol](./protocol-standard.md) (EMP) — normative contracts.

When a story becomes buildable, add or refine a matching entry in `scenarios.md` with testable acceptance criteria.

---

## Implementation snapshot vs repo

Legend: **Aligned** = behavior matches the story in a meaningful way today. **Partial** = some building blocks exist; gaps remain. **Planned** = not meaningfully in code yet.

### Core scenarios (this document)

| Scenario | Status | Notes |
|----------|--------|--------|
| 1 Identity birth | **Aligned** (partial) | Ed25519 owner/device split, certs, signed envelopes; DID *document* still directional. |
| 2 Blind discovery | **Partial** | libp2p discovery plumbing + agent card **types**; not gossip/hashed-topic **product** discovery. |
| 3 Broadcast & kill | **Partial** | Local expiry, cancel / satisfied / first completed result, `correlationId` + audits; no hop TTL / gossip cancel / collect-N. |
| 4 Social handshake | **Partial** | Trust store, approvals, policy; full bond + proof-of-context **flow** not first-class. |
| 5 Intent-based file share | **Partial** | Shared vault + search + audit; no voucher + verified P2P chunk **protocol**. |
| 6 Communication matrix | **Planned** | Single message stream today; roles + `/chat` `/agent` `/data` split is design target. |

### Narrative journeys (this document)

| Story | Status | Notes |
|-------|--------|--------|
| A Trusted collaborator | **Partial** | P2P + vault + tasks; device **pairing** workflow still largely planned. |
| B Shadow recruiter | **Partial** | Tasks/audits/approvals; scoped discovery broadcast + morning-report **UX** not productized. |
| C Privacy-preserving researcher | **Partial** | Policy + approvals + audit; H2A as distinct channel not modeled on wire. |
| D Multi-hop talent scout | **Planned** | Recursive / anonymous forwarding not implemented. |
| E Deal-maker | **Planned** | Payments / atomic swap / receipts not implemented. |
| F Crisis Envoy | **Partial** | mDNS + local TCP work; DID-targeted “find peer on LAN” not a dedicated feature. |

For a longer narrative of gaps and strengths, see [alignment-review.md](./alignment-review.md).

---

## Why user stories matter here

EnvoyMesh nodes are often **invisible** and agents are **autonomous**. User stories are the bridge between **human life** and **code**: they define what an agent may do **without** asking the owner every time, and where it must **stop**, **escalate**, or **audit**.

---

## Core entities (roles)

| Entity | Role |
|--------|------|
| **Owner** | Ultimate authority: keys, mandates, approvals, trust policy. |
| **Envoy** | Autonomous representative: negotiates, filters, executes within policy (long term: isolated execution, e.g. Wasm). |
| **Node** | Device/runtime hosting an Envoy (laptop, phone, server); **ephemeral**. |
| **Identity** | Long-lived cryptographic identity (today: Ed25519; directionally: DID). |
| **Peer** | Another mesh participant; trust tiers include **stranger**, **known**, **bonded**. |

---

## Core mesh scenarios (Envoy Mesh “standard” shape)

These scenarios define how EnvoyMesh differs from a generic P2P stack.

### Scenario 1 — Identity birth (self-definition)

**Story:** You start a new node on your laptop.

**Requirement:** The node establishes a keypair and a stable identity (directionally a DID such as `did:envoy:…`). **Every** outbound application message is **signed**; other nodes verify **without** a central account server.

**Product gap / protocol:** Owner vs device keys, device certificates, signed EMP envelopes.

---

### Scenario 2 — Blind discovery (finding peers)

**Story:** Your agent must find someone who knows “Distributed Python frameworks” (or a product tag like “HomeClaw”) **without** publishing your full biography.

**Requirement:** Discovery uses **minimal or hashed signals** (e.g. topic / capability tag). Responders self-select using **Agent Card** (or equivalent) metadata.

**Product gap / protocol:** Gossipsub or DHT topic records, privacy-preserving discovery payloads, signed discovery responses.

---

### Scenario 3 — Broadcast and kill (task termination)

**Story:** You broadcast a task (“find X under $50”). In P2P, work could **never** stop unless the protocol says how it ends.

**Requirement (rules):**

| Mechanism | Intent |
|-----------|--------|
| **TTL / hop limit** | Cap how far a request propagates (e.g. max hops). |
| **Expiry** | Wall-clock deadline on the request / mandate. |
| **Satisfied / cancel** | A **cancellation** (or completion) signal keyed by **`correlationId`** tells participants to stop. |
| **Threshold** | e.g. “stop after 3 valid responses” or “stop after 1 hour.” |

**Agent decision:** Is the bandwidth / fan-out cost worth the task?

**Product gap / protocol:** Correlation-scoped termination, hop budgets, collect-N policies; partial local enforcement exists today — see `scenarios.md` / implementation plan Phase 4D.

---

### Scenario 4 — Social handshake (friend / bond requests)

**Story:** You want to **bond** with another human’s agent.

**Requirement:** Bond request carries **proof of context** (“how do I know you?”). Receiver runs **policy**: auto-accept (e.g. friends-of-friends + referral proof), reject, or **hold for owner** (e.g. morning brief / approval queue).

**Product gap / protocol:** Bond intents, referral proofs, trust store, owner approvals (partially implemented locally).

---

### Scenario 5 — Intent-based file and data sharing

**Story:** You do not “upload to a cloud”; you **grant** access to a local resource.

**Requirement:**

- **Resource voucher** — signed metadata (e.g. CID + scope + expiry) before raw bytes flow.
- **Selective disclosure** — virtual view over a vault (e.g. only `#billiards`), not the whole disk.
- **Chunked, verifiable transfer** — chunks with content ids / hashes; receiver verifies while streaming.

**Product gap / protocol:** Dedicated data sub-protocol, chunk hashing, mandate-bound file actions (today: shared vault + policy directionally).

---

### Scenario 6 — Communication matrix (who talks to whom)

After a connection exists, traffic is not all “chat.” Modes (with **sender role** and **receiver role** on each message):

| Mode | Flow | Use case | Visibility / priority |
|------|------|----------|-------------------------|
| **Direct (H2H)** | Human → Human | Messenger-like; Envoy encrypts and delivers. | High, low latency. |
| **Proxy (H2A)** | Human → Agent | Query a friend’s Envoy for allowed data. | Policy + mandate gates. |
| **Negotiation (A2A)** | Agent → Agent | Background negotiation, sync, filtering. | Often audit-only / deferred UI. |
| **Synthesis (A2H)** | Agent → Human | Results, prompts, approvals. | Morning brief / approvals. |

**Reality:** Even “H2H” is often **agent-mediated** (AMC): the other side’s Envoy may summarize, filter, or draft replies.

**Suggested libp2p protocol split (directional):**

- `/envoymesh/chat/1.0.0` — human-priority messaging.
- `/envoymesh/agent/1.0.0` — A2A control / negotiation.
- `/envoymesh/data/1.0.0` — chunked transfers.

**Product gap / protocol:** Role fields on envelopes (or parallel streams), chat intents, semantic firewall before LLM/tool use, smart inbox UI.

---

## “Standard rules” summary (requirements table)

| Event | Protocol rule (target) | Agent / owner decision |
|-------|-------------------------|-------------------------|
| **Broadcasting** | `correlationId` + expiry (+ hop/TTL when fan-out exists). | Is cost worth the task? |
| **A2A messaging** | Encrypted transport (e.g. Noise via libp2p) + signed payloads. | Human-in-the-loop or autonomous? |
| **Friend / bond** | Proof of context + policy path. | Auto-accept vs hold for review. |
| **Response** | Signed structured response (directionally JWS-style). | Best match for owner vs discard. |

**Principle:** The Envoy **buffers chaos** and surfaces **verified, explainable** outcomes (reports, audits, approvals).

---

## Example message header (directional; not necessarily current EMP)

Illustrates **role-based** routing discussions; EMP may evolve to match:

```typescript
interface EnvoyMessage {
  id: string;
  correlationId?: string;
  sender: { did: string; role: "HUMAN" | "AGENT" };
  target: { did: string; role: "HUMAN" | "AGENT" };
  payload: Uint8Array; // often encrypted application payload
  intent: "CHAT" | "QUERY" | "FILE_OFFER" | "BOND_REQ" /* illustrative */;
}
```

---

## Semantic firewall (H2A and untrusted text)

**Story:** A human (or stranger) talks to an Envoy; **prompt injection** must not exfiltrate vault data.

**Requirement:**

- **Deterministic middleware** — schema + non-LLM filters before model / tools.
- **Identity pinning** — answer only if sender is cryptographically in **trust list** (or mandate allows).

**Product gap:** Pipeline from inbound guard → policy → optional LLM; audit denials.

---

## Smart inbox (product)

**Story:** The dashboard is not only a chat transcript; it is an **action feed**.

- Human messages — clear visual lane.
- Agent suggestions — accept / ignore (e.g. file offers).
- System tasks — progress (e.g. “negotiating file access with peer X”).

---

## Narrative user stories (journeys)

### Story A — Trusted collaborator (multi-device P2P)

**Persona:** Allen, engineer; **goal:** read technical notes on his phone at a café **without** uploading to a cloud.

**Journey (requirements):**

1. **Primary Envoy** on a workstation with `shared_vault` as knowledge base.
2. **Satellite Envoy** on phone; **pairing** (e.g. QR / owner-approved handshake) links devices under one owner identity.
3. Phone issues a **natural-language task**; phone Envoy **dials** home Envoy over the mesh.
4. Home Envoy runs **policy-bound** LLM / retrieval on **local** files; returns summary to phone.
5. If primary is **offline**, phone Envoy **defers**: queue + notify when primary returns (morning report / notification).

**Features implied:** Multi-device identity, secure pairing, remote task over P2P, offline behavior, vault-backed RAG with policy.

---

### Story B — Shadow recruiter (A2A discovery)

**Persona:** Sarah, PM; **goal:** find a specialist **without** a public job post or spam.

**Journey:**

1. Sarah asks her Envoy to find talent matching narrow skills.
2. Envoy broadcasts a **discovery signal** within **trusted circle** (not the whole internet).
3. Matched peer Envoy checks **mandate** (e.g. “open to short contracts”) before replying with **portfolio / availability**.
4. Sarah gets a **morning report**: ranked options, optional H2H chat CTA.

**Features implied:** Scoped discovery, mandates, A2A negotiation, morning report UX, anti-spam defaults.

---

### Story C — Privacy-preserving researcher (H2A sharing)

**Persona:** Student without a bond; **goal:** latency benchmarks from Allen’s framework.

**Journey:**

1. Student messages Allen’s DID (H2A).
2. Envoy classifies sender as **stranger**; policy: **public whitepaper** OK, **raw data** → owner approval.
3. Envoy replies with what is allowed immediately and queues the rest.
4. Allen approves later from **audit / dashboard**; student receives data **without** manual email threading.

**Features implied:** Trust tiers, policy engine, approval queue, audit trail, selective disclosure.

---

### Story D — Multi-hop talent scout (recursive discovery)

**Persona:** Allen; **goal:** rare skill (“Ed25519 + Flutter”) via **friends of friends**.

**Journey:** Hop 1 — direct bonds; Hop 2 — forwarded request with **anonymity / safety** rules for middle peers; match at second degree; optional formal H2A introduction.

**Features implied:** Recursive routing, referral proofs, rate limits, privacy for intermediaries.

---

### Story E — Autonomous deal-maker (A2A micro-transactions)

**Persona:** Buyer of a digital good; **goal:** purchase while asleep.

**Journey:** Discover listing → A2A price negotiation under **mandate limits** → **voucher** + **conditional payment** / proof of receipt → verified chunk transfer → owner sees receipt in report.

**Features implied:** Payment mandates, receipts, atomic-ish swap story, CID-verified file transfer.

---

### Story F — Crisis Envoy (LAN resilience)

**Persona:** Conference with bad WAN but good Wi‑Fi; **goal:** ship a bugfix to a teammate **without** Slack/cloud.

**Journey:** Save fix locally → Envoy **mDNS** discovers teammate’s Envoy for a **target DID** → direct TCP path; optional future: BLE / local transports.

**Features implied:** mDNS as first-class path, DID-targeted local discovery, offline-first UX messaging.

---

## Advanced stories → protocol features (traceability)

| Story | Feature pressure | Why it matters |
|-------|------------------|----------------|
| Talent scout | Recursive gossip / forwarded discovery | Reach beyond first hop safely. |
| Deal-maker | Conditional mandates, receipts | Autonomous commerce under caps. |
| Crisis Envoy | Local discovery (mDNS), LAN-first | Mesh works when the internet does not. |

---

## Technical pillars (requirements framing)

1. **Identity first** — DIDs / long-lived keys; no central account authority for verification.
2. **Local-first / distributed** — libp2p direct paths; optional CID-style verifiability for data.
3. **Security by isolation** — agent logic constrained (process today; Wasm directionally).
4. **Semantic consistency** — **intents** agents can reason about, not only opaque bytes.
5. **Observability** — audit JSONL with **correlation** to stitch multi-peer flows.

---

## Next step for the “legal document” envelope (requirements)

Target EMP envelope (directional):

- **Header** — sender/receiver roles, DIDs / keys, `correlationId`, intent, deadlines / hop budget when fan-out exists.
- **Body** — encrypted payload where required.
- **Mandate proof** — evidence the owner authorized this action class.

Track concrete fields in `protocol-standard.md`; track delivery in `implementation-plan.md` and `scenarios.md`.

---

## Changelog

| Date | Change |
|------|--------|
| 2026-04-26 | Initial `UserStory.md` from product narrative and journey-style stories. |
| 2026-04-26 | Added implementation snapshot table; linked `alignment-review.md`. |
