# EnvoyMesh user stories (requirements narrative)

This document captures **narrative user stories and requirements** for EnvoyMesh: how real people and agents should behave, what “good” looks like, and which protocol or product gaps each story exposes.

Use it alongside:

- [Alignment review](./alignment-review.md) — design vs implementation snapshot (update after major milestones).
- [EnvoyMesh scenarios](./scenarios.md) — structured epic/story backlog with acceptance and status.
- [Implementation plan](./implementation-plan.md) — phased delivery.
- [Agentic next step](./next-step.md) — design rationale for LLM and agentic normal nodes.
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
| 6 Communication roles | **Planned** | Single message stream today; roles + `/chat` `/agent` `/data` split is design target. |

### Narrative journeys (this document)

| Story | Status | Notes |
|-------|--------|--------|
| A Trusted collaborator | **Partial** | P2P + vault + tasks; device **pairing** workflow still largely planned. |
| B Shadow recruiter | **Partial** | Tasks/audits/approvals; scoped discovery broadcast + morning-report **UX** not productized. |
| C Privacy-preserving researcher | **Partial** | Policy + approvals + audit; H2A as distinct channel not modeled on wire. |
| D Multi-hop talent scout | **Planned** | Recursive / anonymous forwarding not implemented. |
| E Deal-maker | **Planned** | Payments / atomic swap / receipts not implemented. |
| F Crisis Envoy | **Partial** | mDNS + local TCP work; DID-targeted “find peer on LAN” not a dedicated feature. |
| G Personal knowledge proxy | **Planned** | `knowledge.query` exists as mock; Phase 8A turns it into policy-gated vault + model response. |
| H Agent-assisted chat | **Planned** | Chat exists; LLM draft/suggestion path is not built. |
| I Capability matchmaker | **Planned** | `discovery.request/response` exists; owner-approved manifest + match-to-share workflow not built. |
| J Agent capability extender | **Planned** | OpenClaw/HomeClaw adapter boundary not built. |
| K Public expert with safe preview | **Planned** | Anonymous discovery toggle, fast path, and public preview not built. |
| L Bounded autonomous representative | **Planned** | Sandbox, reputation, official credentials, autonomy policy, digest, and kill switch not built. |

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

### Scenario 6 — Communication roles (who talks to whom)

After a connection exists, traffic is not all “chat.” Modes (with **sender role** and **receiver role** on each message):

| Mode | Flow | Use case | Visibility / priority |
|------|------|----------|-------------------------|
| **Direct (H2H)** | Human → Human | Messenger-like; Envoy encrypts and delivers. | High, low latency. |
| **Proxy (H2A)** | Human → Agent | Query a friend’s Envoy for allowed data. | Policy + mandate gates. |
| **Negotiation (A2A)** | Agent → Agent | Background negotiation, sync, filtering. | **Activity feed** + digest + `report.create` — not chat spam ([Phase 13](./a2a-actor-visibility-plan.md)). |
| **Synthesis (A2H)** | Agent → Human | Results, prompts, approvals. | Activity / Inbox / morning brief. |

**Reality:** Even “H2H” is often **agent-mediated** (AMC): the other side’s Envoy may summarize, filter, or draft replies.

**Suggested libp2p protocol split (directional):**

- `/envoymesh/chat/1.0.0` — human-priority messaging.
- `/envoymesh/agent/1.0.0` — A2A control / negotiation.
- `/envoymesh/data/1.0.0` — chunked transfers.

**Product gap / protocol:** Role fields on envelopes shipped; **Phase 13** adds honest AI wire role, chat badges, Activity feed for off-chat A2A ([a2a-actor-visibility-plan.md](./a2a-actor-visibility-plan.md), Epic AV **US-AV1–AV8**).

---

## “Standard rules” summary (requirements table)

| Event | Protocol rule (target) | Agent / owner decision |
|-------|-------------------------|-------------------------|
| **Broadcasting** | `correlationId` + expiry (+ hop/TTL when fan-out exists). | Is cost worth the task? |
| **A2A messaging** | Encrypted transport (e.g. Noise via libp2p) + signed payloads. | Human-in-the-loop or autonomous? |
| **Friend / bond** | Proof of context + policy path. | Auto-accept vs hold for review. |
| **Response** | Signed structured response (directionally JWS-style). | Best match for owner vs discard. |

**Principle:** The Envoy **buffers chaos** and surfaces **verified, explainable** outcomes (Activity feed, reports, audits, approvals) — A2A packets stay off the human chat thread unless explicitly configured.

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

## Agentic normal node stories

These stories describe the next product step: relays stay lean, while normal nodes become policy-gated LLM/agent hosts. Implementation tracking lives in [Phase 8](./implementation-plan.md#phase-8-agentic-normal-node-llm-first).

### Story G — Personal knowledge proxy (first real Brain)

**Persona:** Bob, engineer with a local vault of notes; **goal:** let a trusted contact ask his Envoy a question while Bob is busy.

**Journey:**

1. Alice, a bonded contact, sends Bob's Envoy a signed `knowledge.query`.
2. Bob's Envoy verifies the envelope, checks trust, applies sensitivity policy, and searches only the approved vault.
3. The LLM receives only the allowed snippets, not Bob's full filesystem.
4. Bob's Envoy returns a signed `knowledge.response` with a concise answer or a refusal.
5. Bob can later inspect audit rows showing policy, vault, model, and response decisions.

**Features implied:** Phase 8A; policy-gated vault RAG, model router in the node runtime, signed response, audit trail.

---

### Story H — Agent-assisted chat (draft before impersonation)

**Persona:** Bob; **goal:** reply faster without letting the LLM secretly speak as him.

**Journey:**

1. Alice sends a normal `chat.message`.
2. Bob's Envoy optionally asks the local model for a suggested reply.
3. The suggestion is shown as a draft in the UI, separate from the real chat log.
4. Bob edits, sends, ignores, or disables suggestions.

**Features implied:** Phase 8C; draft storage, user setting, audit of model usage, no default auto-send.

---

### Story I — Capability matchmaker (selective exposure)

**Persona:** Sarah, looking for someone who knows a niche topic; **goal:** discover helpful Envoys without everyone publishing private biographies.

**Journey:**

1. Bob configures an owner-approved capability manifest such as "can answer public EnvoyMesh/libp2p questions."
2. Sarah's Envoy sends a contact-scoped `discovery.request`.
3. Bob's Envoy checks the manifest and replies only if there is a match.
4. If Sarah accepts the preview, the two Envoys move to direct sharing under policy.

**Features implied:** Phase 8D-8E; capability manifest, cheap matching before LLM, safe preview, accept/share workflow.

---

### Story J — Agent capability extender (OpenClaw/HomeClaw through Envoy)

**Persona:** Bob using HomeClaw or OpenClaw; **goal:** let a local specialist agent ask the mesh for help without giving it raw network access.

**Journey:**

1. Bob asks HomeClaw/OpenClaw to complete a task.
2. The local agent realizes it needs external knowledge or a peer capability.
3. It calls a constrained Envoy tool such as `mesh.requestKnowledge()` or `mesh.findCapability()`.
4. Envoy applies owner policy, signs EMP messages, talks to peers, filters results, and returns only approved data to the local agent.

**Features implied:** Phase 8F-8G; local tool registry, adapter boundary, no direct libp2p access for external agents.

---

### Story K — Public expert with safe preview (anonymous discovery)

**Persona:** A stranger looking for help; **goal:** ask the mesh whether anyone can help without becoming a contact first.

**Journey:**

1. Bob enables anonymous discovery in a conservative mode such as `public-preview`.
2. A stranger sends a public-sensitivity query.
3. Bob's Envoy checks configuration, rate limits, capability manifest, and egress rules before any LLM call.
4. If there is a match, Bob's Envoy returns a safe preview or asks the stranger to start a `bond.request`.
5. Raw data and private context remain unavailable.

**Features implied:** Phase 8H-8I; sandbox/egress first, anonymous toggle, fast path, low-priority queue, public preview.

---

### Story L — Bounded autonomous representative

**Persona:** Bob; **goal:** let his Envoy stand for him in low-risk domains while preserving final control.

**Journey:**

1. Bob defines autonomy policies by domain: social, knowledge, home, research.
2. Bob's Envoy automatically handles explicitly low-risk requests.
3. Higher-risk actions create approval prompts, not silent execution.
4. The Envoy summarizes autonomous decisions in a digest.
5. Bob can pause autonomy immediately with a kill switch.

**Features implied:** Phase 8K-8L; local reputation, official credentials, autonomy policy, approval thresholds, digest, kill switch.

---

## Advanced stories → protocol features (traceability)

| Story | Feature pressure | Why it matters |
|-------|------------------|----------------|
| Talent scout | Recursive gossip / forwarded discovery | Reach beyond first hop safely. |
| Deal-maker | Conditional mandates, receipts | Autonomous commerce under caps. |
| Crisis Envoy | Local discovery (mDNS), LAN-first | Mesh works when the internet does not. |
| Personal knowledge proxy | `knowledge.query` → vault → model → signed response | First real LLM workflow for normal nodes. |
| Agent capability extender | Local tool registry + constrained external-agent adapter | Lets OpenClaw/HomeClaw use the mesh without bypassing Envoy policy. |
| Public expert | Anonymous mode + fast match + safe preview | Allows public discovery without waking the LLM for every stranger request. |
| Autonomous representative | Sandbox, reputation, approvals, digest, kill switch | Lets the Envoy stand for the owner without becoming unbounded. |

---

## Technical pillars (requirements framing)

1. **Identity first** — DIDs / long-lived keys; no central account authority for verification.
2. **Local-first / distributed** — libp2p direct paths; optional CID-style verifiability for data.
3. **Security by isolation** — agent logic constrained (process today; Wasm directionally).
4. **Semantic consistency** — **intents** agents can reason about, not only opaque bytes.
5. **Observability** — audit JSONL with **correlation** to stitch multi-peer flows.
6. **Lean core, intelligent edge** — relay nodes route and match; normal nodes run LLMs, tools, vault access, and owner policy.

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
| 2026-05-05 | Added agentic normal node stories G-L aligned with Phase 8 and `next-step.md`. |
