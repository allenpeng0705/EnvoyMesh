/**
 * Phase 8 / v2.0 — AgentGraphStore types (the explicit
 * parent/child agent topology). Reference: Codex's
 * `codex-rs/agent-graph-store` — "Storage-neutral parent/child
 * topology for thread-spawned agents", with the edge lifecycle
 * as a state machine (`Open` / `Closed`), not a data field.
 *
 * **Why a graph store:** the chain is implicitly a graph —
 * the orchestrator spawns a worker for a subtask, the verifier
 * loop judges the worker, the scoreboard aggregates verdicts
 * per `(peer, runtime, skill)`. v2.0 makes the topology
 * explicit so the scoreboard is a derived view over closed
 * edges and future cross-node stores (DHT-backed) drop in
 * without touching the consumers.
 *
 * **Lifecycle:** `openEdge` when verification starts for a
 * subtask; `closeEdge` when a verdict is written. A closed
 * edge carries the verdict (the arbitration sub-store's entry),
 * so reputation = `f(closedEdges)` with no separate ledger read.
 */

import type { AgentRuntime, VerdictEntry } from "@envoymesh/protocol";

/** Edge lifecycle. `open` → `closed` is the only transition. */
export type AgentGraphEdgeStatus = "open" | "closed";

/** One parent/child edge in the agent graph. */
export interface AgentGraphEdge {
  /** Who spawned the child (the orchestrator / verifier initiator). */
  parentPeerId: string;
  /** The worker being verified. */
  childPeerId: string;
  /** The subtask the edge belongs to. */
  subtaskId: string;
  /** The worker's runtime (part of the 3-tuple reputation key). */
  workerRuntime: AgentRuntime;
  /** The skill being judged (part of the 3-tuple reputation key). */
  skillId: string;
  status: AgentGraphEdgeStatus;
  openedAt: number;
  /** Set when the edge closes (a verdict was written). */
  closedAt?: number;
  /** The verdict recorded on close (the arbitration sub-store entry). */
  verdict?: VerdictEntry;
}

/** Criteria for finding edges / verdicts. */
export interface AgentGraphCriteria {
  parentPeerId?: string;
  childPeerId?: string;
  subtaskId?: string;
  workerRuntime?: AgentRuntime;
  skillId?: string;
}

/**
 * The graph store. Storage-neutral: `LocalAgentGraphStore`
 * (in-memory) ships in chunk 1; a DHT-backed store can replace
 * it without changing the consumers.
 */
export interface AgentGraphStore {
  /** Open a parent/child edge. Idempotent for the same subtask. */
  openEdge(edge: Omit<AgentGraphEdge, "status" | "openedAt"> & { openedAt?: number }): void;
  /**
   * Close the open edge for (parentPeerId, subtaskId), attaching
   * the verdict. No-op when no open edge matches.
   */
  closeEdge(
    parentPeerId: string,
    subtaskId: string,
    verdict: VerdictEntry,
    closedAt: number,
  ): void;
  /** All edges matching the criteria (both open and closed). */
  findEdges(criteria: AgentGraphCriteria): ReadonlyArray<AgentGraphEdge>;
  /** The closed verdicts for a worker (any parent), for reputation. */
  closedVerdictsFor(childPeerId: string): ReadonlyArray<VerdictEntry>;
  /** All edges (for tests / debugging). */
  allEdges(): ReadonlyArray<AgentGraphEdge>;
}
