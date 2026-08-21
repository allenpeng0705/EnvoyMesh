# envoy-harness integration — v2.0 sub-plan (AgentGraphStore)

> **Status:** IN PROGRESS (2026-08-21). Chunk 1 (primitive +
> verify-loop wiring + scoreboard view) lands in this commit;
> Chunks 2–3 are follow-ups.
>
> **Reference:** Codex's `codex-rs/agent-graph-store/src/lib.rs` —
> "Storage-neutral parent/child topology for thread-spawned agents",
> with `ThreadSpawnEdgeStatus::{Open, Closed}` as the edge
> lifecycle (a state machine, not a data field).

## 1. Goal

The chain is implicitly a parent/child agent graph: the
orchestrator spawns a worker for a subtask, the verifier loop
judges the worker's result, and the scoreboard aggregates
verdicts per `(peer, runtime, skill)`. Today that topology is
**implicit** across five files:

- `chain-plan-assign.ts` — picks a worker for a subtask
- `chain-arbitration.ts` — the verdict ledger
- `chain-verify-loop.ts` — the verifier loop (opens no edges,
  writes verdicts directly)
- `chain-scoreboard.ts` — the reputation producer (reads the
  ledger)
- `node-service-chain-orchestration.ts` — the wiring

**v2.0 makes the graph explicit**: one `AgentGraphStore` is the
source of truth for "who spawned whom, and is the edge open or
closed". The scoreboard becomes a derived view over closed
edges; arbitration becomes a sub-store (each closed edge
references a verdict); the orchestrator picks children via the
graph.

## 2. Edge model

```ts
export type AgentGraphEdgeStatus = "open" | "closed";

export interface AgentGraphEdge {
  /** Who spawned the child (the orchestrator / verifier initiator). */
  parentPeerId: string;
  /** The worker being verified. */
  childPeerId: string;
  /** The subtask the edge belongs to. */
  subtaskId: string;
  /** The worker's runtime (for the 3-tuple reputation key). */
  workerRuntime: AgentRuntime;
  /** The skill being judged. */
  skillId: string;
  status: AgentGraphEdgeStatus;
  openedAt: number;
  /** Set when the edge closes (a verdict was written). */
  closedAt?: number;
  /** The verdict recorded on close (the arbitration sub-store's entry). */
  verdict?: VerdictEntry;
}
```

**Lifecycle (a state machine, not a data field):**
`openEdge` when the verifier loop starts judging a subtask;
`closeEdge` when a verdict is written (rule / llm / cross /
human). A closed edge carries the verdict so the scoreboard is
`f(closedEdges)` — no separate ledger read needed.

## 3. Chunks

### Chunk 1 (this commit) — primitive + verify-loop wiring + scoreboard view

- `apps/node/src/chain-graph/types.ts` — `AgentGraphEdge`,
  `AgentGraphEdgeStatus`, `AgentGraphStore` interface.
- `apps/node/src/chain-graph/local.ts` — `LocalAgentGraphStore`
  (in-memory; other backends drop in).
- `chain-verify-loop.ts` — optional `graphStore?: AgentGraphStore`
  dep; opens an edge at verification start, closes it on each
  verdict write (additive — absent store = today's behavior).
- `chain-scoreboard.ts` — `getReputationFromGraph(graph, criteria)`
  derived view over closed edges; reuses `reputationFromVerdicts`.
- Tests: store lifecycle, scoreboard-from-graph, verify-loop
  wiring (edge opens/closes with the verdict).

### Chunk 2 (follow-up) — arbitration as a sub-store

`chain-arbitration.ts` becomes a thin wrapper: verdicts are
keyed by the closed edge (the graph owns the topology; the
ledger owns the signed entries). `getVerdictsFor` reads through
the graph. **Deferred** — the ledger is stable and tested;
don't churn it while v1.x is shipping.

### Chunk 3 (follow-up) — orchestrator picks via the graph

`chain-plan-assign.ts` + `node-service-chain-orchestration.ts`
use `childrenOf(parentId)` instead of iterating stores directly.
**Deferred** — needs the chunk-2 ledger migration first.

## 4. Why this matters

- One source of truth for "who is responsible for what".
- The scoreboard is testable without spinning up orchestration.
- Future cross-node chains (federated scoreboard) plug a
  DHT-backed `AgentGraphStore` in without touching the
  scoreboard code.
- 1:1 alignment with Codex's pattern makes the architecture
  obvious to anyone who has read Codex.

## 5. Package vs module

Chunk 1 ships the store as an `apps/node/src/chain-graph/`
module (no lockfile churn). Promote to a `@envoymesh/chain-graph`
package when a second consumer appears (e.g. the federated
scoreboard).
