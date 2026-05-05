# Redesign Strategy (Early Product Stage)

EnvoyMesh is an **early-stage product**. When a clearer architecture serves the vision better than incremental patches, **we may redesign and reimplement deliberately** rather than preserving every prior choice. This document sets **authority**, **north star**, and **documentation hygiene** so changes stay coherent.

**Canonical delivery detail** remains the [implementation plan](./implementation-plan.md) (phases, checklists, traceability).

---

## 1. Charter

| Principle | Implication |
| --- | --- |
| **North star over nostalgia** | APIs, package layout, CLI flags, and persistence formats may **break** across minor versions if the new design is documented and migration path is stated (or explicitly “fresh start” for alpha users). |
| **Libp2p-first mesh** | EnvoyMesh uses libp2p + Noise + EMP for transport, cryptographic intent, discovery, relay lookup, DHT/provider hints, and direct data exchange. Relay nodes stay lean; normal nodes own LLM/agent behavior. |
| **No mandatory big-company backend** | A **homeserver or relay** is **not** “the product”—it is **replaceable infrastructure** for operators who opt in. Core story: direct peer traffic when possible; **no** single vendor as the sole identity or message authority. |
| **LLM-native, owner-supervised** | Envoys negotiate and report; humans retain interrupt, policy, approval, and the kill switch. Agentic design details live in [Agentic next step](./next-step.md). |

**Explicit non-goals for this charter:** freezing the current repository layout forever; pretending `wan-default` alone solves every WAN scenario; adding an external signaling network as a product dependency.

---

## 2. What may change without guilt

- **Networking stack wiring** — dial ordering, seed merge rules, QUIC defaults, bootstrap preset strategy.
- **Discovery surfaces** — CLI/dashboard commands, audit `p2p.trace` shapes, seed file format **with migration** or one-time wipe for alpha cohorts.
- **Documentation** — supersede contradictory pages; archive or replace “stable” wording in high-level docs that block honest iteration.

**What stays semantically stable unless EMP version bumps:** envelope signing, owner/device separation, bond levels as a *concept*, vault as owner-scoped boundary (implementation may still change).

---

## 3. Documentation map and cleanup

Use this table to **prioritize rewrites**. Status is **intent** until a PR flips it.

| Document | Role | Status / action |
| --- | --- | --- |
| [implementation-plan.md](./implementation-plan.md) | Phases, traceability | **Source of truth** — keep updated each scope change |
| [redesign-strategy.md](./redesign-strategy.md) (this file) | Early-stage charter | **Active** |
| [p2p-discovery.md](./p2p-discovery.md) | Native WAN/LAN discovery | **Keep**; canonical discovery and relay posture |
| [poc-discovery-connectivity.md](./poc-discovery-connectivity.md) | Stages A–D POC (single doc) | **Active** — canonical transport proof entry |
| [vision.md](./vision.md) | Product vision | **Partial refresh** — keep aligned with libp2p-first, agentic normal-node direction |
| [high-level-design.md](./high-level-design.md) | Architecture overview | **Partial refresh** — living-doc stance |
| [detailed-design.md](./detailed-design.md) | EMP, packages | **Living** — update when protocol refactors |
| [protocol-standard.md](./protocol-standard.md) | EMP normative | **Version** with breaking changes explicitly |
| [scenarios.md](./scenarios.md), [UserStory.md](./UserStory.md) | Backlog narratives | **Reconcile** with agent stories periodically |
| [alignment-review.md](./alignment-review.md) | Code vs doc | **Update** after each major redesign wave |
| [roadmap.md](./roadmap.md) | Historical phases | **Banner** → point to implementation-plan (avoid duplicate truth) |
| [live-connectivity-testing.md](./live-connectivity-testing.md) | Smoke runbook | **Living** — extended proofs; POC ordering in [poc-discovery-connectivity](./poc-discovery-connectivity.md) |
| [developer-cli.md](./developer-cli.md), [desktop-dashboard.md](./desktop-dashboard.md) | UX | **Update** when CLI/dashboard change |
| [security.md](./security.md), [model-strategy.md](./model-strategy.md) | Policies | **Refresh** when LLM routing, sandboxing, or egress rules shift |
| Root [README](../README.md) | First impression | **Align** opening principles with libp2p-first + agentic normal node direction |

**Delete policy:** Prefer **replacing** content in place with a short “Historical note” subsection over deleting files (preserves links). True removal only when nothing references the path—track in git.

---

## 4. Implementation order (recommended)

1. **Lock native WAN + observability** — bootstrap, relay, seeds, relay lookup, DHT/provider hints, `connectivity-status`.
2. **Implement Phase 8A** — real `knowledge.query` through policy, vault, model router, signed response, and audit.
3. **Add agentic normal-node slices** — chat assist, capability manifest, tool registry, anonymous discovery toggle, broadcast, sandbox, and reputation in that order.
4. **Reconcile scenarios and UserStory** with the Phase 8 roadmap; cut or defer stories that require economics/regulated domains until scoped.
5. **Broad doc pass** — work through the table above in order of reader impact (README → vision → high-level-design → alignment-review).

---

## 5. How to propose a breaking change

1. Describe the **user-visible or operator-visible** delta.
2. Link to **north star** section in this doc or the Phase 8 agentic design.
3. Add migration notes (script, one-time migration, or “alpha wipe”).
4. Update **implementation plan** changelog + **alignment review** after merge.

---

## Related

- [Implementation plan](./implementation-plan.md) — phase tracking and prioritization
- [Agentic next step](./next-step.md) — LLM/agent normal-node design
- [POC: discovery + connectivity](./poc-discovery-connectivity.md) — ordered smoke proofs
- [P2P discovery](./p2p-discovery.md) — native WAN/LAN discovery posture
