# User Stories vs Hybrid Design (Matrix Control Plane + libp2p Data Plane)

This document **stress-tests** the dual-plane architecture against representative **real-world agent stories**. It separates:

- What **HTTPS signaling + mesh pipes** materially improve (coordination, hints, buffering).
- What depends on **policy, bonds, vault boundaries, LLM governance**, and **explicit product scope** — not solved by wiring Matrix alone.

Matrix improves **reachability of coordination events**; libp2p improves **private throughput**. Neither replaces **trust semantics**, **content moderation**, or **regulated-domain liability** without additional layers.

---

## Evaluation principles

| Principle | Meaning |
| --- | --- |
| **Dual-plane fit** | Story benefits from persistent hints / offline-visible signals **plus** large direct transfers. |
| **Native Envoy fit** | Story can progress with **bonds + EMP + vault + tasks** without Matrix if hints propagate another way. |
| **Gap** | Requires **explicit design** not implied by Matrix + libp2p (spam limits, clinical regs, payments, etc.). |

---

## Story clusters

### A · Interest / semantic discovery (“blues + guitar + travel”)

| Aspect | Dual-plane helps | Gaps |
| --- | --- | --- |
| Finding **compatible strangers** | Matrix (or similar) can publish **intent manifests** and invite flows; libp2p carries verification chats/media **after** consent. | **Global semantic discovery** ⇒ abuse, Sybil, spam. Needs **rate limits**, **trust tiers**, **invite-only rooms**, possibly **human approval** before dial (your “human-in-the-loop”). |
| LLM filtering peers | Negotiation messages can ride Matrix pre-connection; richer dialogue over mesh once connected. | **LLM↔LLM trust** is application policy — must align with bonds and **owner mandates**. |

**Verdict:** **Partial fit.** Hybrid supports **signal → approve → dial → stream**. **Does not** alone solve fair global discovery or intent spam without governance.

---

### B · Distributed resource search (“find a rare book”)

| Aspect | Dual-plane helps | Gaps |
| --- | --- | --- |
| Query survives offline peer | Matrix timeline persistence fits **queued asks** to bonded circles. | **Recursive trust crawl** (“who knows who has X”) needs **explicit graph policy**, not automatic room hopping. |
| Transfer integrity | libp2p + vouchers + hashing addresses **tamper-evident** delivery **when implemented**. | **CID/resume pipeline** for huge files is **not fully specified** in-repo today — document as roadmap. |

**Verdict:** **Strong fit for persistence + bulk transfer path** once bonded; **weak on automated federated search** without curated directories or incentives.

---

### C · Incoming friend/task requests from strangers

| Aspect | Dual-plane helps | Gaps |
| --- | --- | --- |
| Reach stranger Matrix-first | Control plane receives request when mesh path unknown. | **Firewall**: bonds/policy engine must reject or challenge — LLM “filter” must be **bounded** (cost limits, escalation rules). |
| Interrupt owner | Notifications independent of plane choice. | **Auditability** of autonomous replies — correlate with owner policy snapshots. |

**Verdict:** **Fit for delivery channel**; **policy + LLM guardrails** are the critical path, not Matrix vs libp2p.

---

### D · Personal curator (news, weather, morning briefing)

| Aspect | Dual-plane helps | Gaps |
| --- | --- | --- |
| Subscribe to feeds/agents | Matrix rooms as **subscription channels** for hints/metadata. | **Most content fetching** is Internet/API — orthogonal to EnvoyMesh transport. Dual-plane adds little unless peers **exchange digests** over mesh. |
| Learning tastes locally | Local logs + vault — **local-first**. | Privacy/compliance for behavioral modeling — **product choice**. |

**Verdict:** **Loosely coupled** to hybrid mesh — mainly **local agent + optional peer digests**. Matrix optional for **coordination**, not mandatory for “daily briefing.”

---

### E · Digital mentor / teaching (“stand in for me”)

| Aspect | Dual-plane helps | Gaps |
| --- | --- | --- |
| Session negotiation | Matrix for scheduling/handshake; libp2p for large artifacts. | **Copyright / consent** for teaching materials pulled from owner vault — policy gates. |
| A2A pedagogy | EMP intents + streaming — aligned with Envoy direction. | **Quality/safety** of generated teaching — LLM governance. |

**Verdict:** **Good fit** for **signal → encrypted lesson artifacts**. Requires **mandates + vault scopes** (partially aligned with existing mandate/task concepts).

---

### F · “Doctor” / medical-style expertise

| Aspect | Dual-plane helps | Gaps |
| --- | --- | --- |
| Private pipe between agents | libp2p avoids cloud bulk exfil — **transport privacy**. | **Medical advice liability**, jurisdictional regulation, emergency escalation — **not** solved by protocols. **Human clinician oversight** typically required for anything resembling diagnosis. |
| Zero-knowledge style queries | Cryptographic ZK is **separate stack** — do not conflate with “HTTPS signaling.” |

**Verdict:** **Transport fits sensitive payloads**; **clinical story needs explicit non-goals / disclaimers / regulatory posture** beyond EnvoyMesh scope unless partnering with certified pathways.

---

### G · Economic / GPU trading

| Aspect | Dual-plane helps | Gaps |
| --- | --- | --- |
| Bid broadcast | Matrix rooms or capability signals — coordination. | **Payment/settlement**, reputation, dispute resolution — **economic layer** not in dual-plane spec. |
| Large tensor moves | libp2p suited for bulk **when policy allows**. | **Sandboxed execution** on neighbor GPU — isolation story (Wasm/K8s) separate from networking. |

**Verdict:** **Coordination channel adequate**; **market mechanics** need separate design.

---

## Aggregate verdict

| Question | Answer |
| --- | --- |
| Does hybrid **solve WAN hint exchange / offline signaling pain** you described earlier? | **Yes**, as an adjunct — validated via thin PoC (bond room → merge hints → dial). |
| Does it **solve every user story end-to-end**? | **No.** Stories assume **trust graphs**, **policy**, **human gates**, **vault partitioning**, **LLM budgets**, and sometimes **regulated domains**. Those are **EnvoyMesh product + governance**, not inherent to Matrix + libp2p. |
| Is dual-plane **directionally aligned** with agentic narratives (signal → negotiate → transfer → report)? | **Yes** — matches **Identity → Signal → Transfer** loop when scoped to **technical coordination**. |

---

## Recommended next steps for traceability

1. Tag each story as **MVP / Phase 2 / Research-only** (especially medical & economics).
2. For **each story**, list **acceptance criteria** that touch **only** transport/signaling vs **policy/LLM**.
3. Run the **thin PoC** (single bond room → dial uplift measurement) **before** expanding Matrix surface area.

---

## Related

- [Redesign strategy](./redesign-strategy.md) — early-stage authority to refactor and doc cleanup.
- [Implementation plan](./implementation-plan.md) — **Phase 4G** tracks hybrid PoC vs shipped WAN work.
- [Hybrid planes architecture](./architecture-hybrid-planes.md) — four workflows (Map → Handshake → Intent → Cargo).
- [P2P discovery](./p2p-discovery.md) — native WAN posture without Matrix.
