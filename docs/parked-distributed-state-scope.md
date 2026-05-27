# Parked scope — Distributed state (loro / yjs)

**Status:** Scoping (Phase 15E) — **yjs Assistant draft spike shipped**; wire sync not scheduled.

**Key decision:** [implementation-plan.md — Distributed state direction](./implementation-plan.md) — evaluate `loro` and `yjs` when shared social/task state is ready.

---

## Current persistence model

| Surface | Model | Multi-writer |
|---------|-------|--------------|
| Audit / Activity | Append-only JSONL (+ index) | Single node process |
| Chat logs | JSONL per thread | Last-write via single owner devices sequentially |
| Task journal | JSONL | Single writer |
| Trust / peer directory | Atomic JSON | Single writer |
| Mobile | SQLite (`@envoymesh/mobile-storage`) | Single device DB |
| Vault content | Files + index | Owner-controlled; share via vouchers |

Cross-device sync today: **P2P intents** (chat.message, share.*, knowledge.*) — not CRDT merge of local files.

---

## Candidate CRDT surfaces

| Surface | CRDT fit | Complexity | Priority if un-parked |
|---------|----------|------------|------------------------|
| Chat draft / compose buffer | yjs text | Low | Medium |
| Shared task checklist (owner + agent) | loro map | Medium | Medium |
| Contact notes / tags | loro map | Low | Low |
| Vault metadata overlay | High conflict risk | High | **Defer** |
| Full chat history merge | yjs + ordering vs signed envelopes | Very high | **Defer** |

**Constraint:** EMP envelopes are **signed immutable facts**. CRDTs apply to **local projections** and **draft state**, not to rewriting signed wire history.

---

## loro vs yjs (draft preference)

| Library | Strength | EnvoyMesh fit |
|---------|----------|---------------|
| **yjs** | Mature text CRDT, ProseMirror/CodeMirror ecosystem | Chat drafts, collaborative doc agent editing |
| **loro** | Rich structured CRDT, Rust/JS, movable tree | Task state machines, structured owner/agent shared lists |

Recommendation when un-parked: **yjs** for H2A document agent buffer; **loro** for structured task/session overlays — behind feature flags, single profile dir export.

---

## Sync transport (when needed)

Prefer **existing P2P** paths:

- Owner devices paired under same `ownerId` sync via direct bond or home-node hub
- No new relay protocol; optional `sync.state` EMP intent for snapshot deltas (future)

---

## First slice (when un-parked)

1. ~~Spike: yjs-backed draft sync between desktop + mobile for **Assistant** document agent only~~ **Shipped (local + wire):** [assistant-draft-crdt.ts](../apps/social/src/lib/assistant-draft-crdt.ts) — localStorage + `sync.state` / `crdt:sync` for paired owner devices.
2. Conflict policy: signed outbound chat still wins; CRDT is pre-send buffer
3. Gate: must not block offline-first single-device use
4. **Next:** P2P delta sync between paired owner devices

---

## Decision

**Partially un-parked (local + wire sync slice).** JSONL + P2P intents remain canonical for sent messages. Un-park US-MH2+ / richer CRDT surfaces when product prioritizes.
