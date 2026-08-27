/**
 * Phase 8 / v2.0 — `LocalAgentGraphStore` (in-memory).
 * The chunk-1 default backend. Other backends (DHT-backed,
 * disk-backed) implement the same `AgentGraphStore` interface.
 */

import type { VerdictEntry } from "@envoymesh/protocol";

import type {
  AgentGraphCriteria,
  AgentGraphEdge,
  AgentGraphStore,
} from "./types.js";

/**
 * In-memory graph store. The edge list is append-only (a new
 * open for the same subtask replaces the previous edge, keeping
 * the latest lifecycle — mirroring `recordVerdictEntry`'s
 * re-verification semantics).
 */
export class LocalAgentGraphStore implements AgentGraphStore {
  private edges: AgentGraphEdge[] = [];

  openEdge(
    edge: Omit<AgentGraphEdge, "status" | "openedAt"> & { openedAt?: number },
  ): void {
    const full: AgentGraphEdge = {
      ...edge,
      status: "open",
      openedAt: edge.openedAt ?? Date.now(),
    };
    // Replace any existing edge for the same (parent, subtask) —
    // re-verification opens a fresh lifecycle.
    const idx = this.edges.findIndex(
      (e) => e.parentPeerId === full.parentPeerId && e.subtaskId === full.subtaskId,
    );
    if (idx !== -1) {
      this.edges = [...this.edges.slice(0, idx), full, ...this.edges.slice(idx + 1)];
    } else {
      this.edges = [...this.edges, full];
    }
  }

  closeEdge(
    parentPeerId: string,
    subtaskId: string,
    verdict: VerdictEntry,
    closedAt: number,
  ): void {
    const idx = this.edges.findIndex(
      (e) =>
        e.parentPeerId === parentPeerId &&
        e.subtaskId === subtaskId &&
        e.status === "open",
    );
    if (idx === -1) {
      // No open edge. If a CLOSED edge exists for the same
      // (parent, subtask), update its verdict — re-verification
      // replaces the old verdict (mirrors `recordVerdictEntry`'s
      // "(subtask, runtime) slot replaces" semantics, so the
      // cross verdict replaces the rule verdict).
      const closedIdx = this.edges.findIndex(
        (e) =>
          e.parentPeerId === parentPeerId &&
          e.subtaskId === subtaskId &&
          e.status === "closed",
      );
      if (closedIdx === -1) return;
      const closed = this.edges[closedIdx]!;
      const updated: AgentGraphEdge = { ...closed, verdict, closedAt };
      this.edges = [
        ...this.edges.slice(0, closedIdx),
        updated,
        ...this.edges.slice(closedIdx + 1),
      ];
      return;
    }
    const edge = this.edges[idx]!;
    const closed: AgentGraphEdge = {
      ...edge,
      status: "closed",
      closedAt,
      verdict,
    };
    this.edges = [...this.edges.slice(0, idx), closed, ...this.edges.slice(idx + 1)];
  }

  failEdge(
    parentPeerId: string,
    subtaskId: string,
    closedAt: number,
  ): void {
    // Mark the open edge as `failed` (no verdict payload).
    // No-op when no open edge matches — the edge may have
    // been already closed by a successful verdict write, or
    // never opened. The openEdge's replace-on-reopen logic
    // means a leaked open edge from a prior crash would
    // have been replaced by the next openEdge call, so by
    // the time failEdge runs we either find the new open
    // edge (and fail it) or find nothing (no-op).
    const idx = this.edges.findIndex(
      (e) =>
        e.parentPeerId === parentPeerId &&
        e.subtaskId === subtaskId &&
        e.status === "open",
    );
    if (idx === -1) return;
    const edge = this.edges[idx]!;
    const failed: AgentGraphEdge = {
      ...edge,
      status: "failed",
      closedAt,
    };
    this.edges = [...this.edges.slice(0, idx), failed, ...this.edges.slice(idx + 1)];
  }

  findEdges(criteria: AgentGraphCriteria): ReadonlyArray<AgentGraphEdge> {
    return this.edges.filter((e) => {
      if (criteria.parentPeerId !== undefined && e.parentPeerId !== criteria.parentPeerId) return false;
      if (criteria.childPeerId !== undefined && e.childPeerId !== criteria.childPeerId) return false;
      if (criteria.subtaskId !== undefined && e.subtaskId !== criteria.subtaskId) return false;
      if (criteria.workerRuntime !== undefined && e.workerRuntime !== criteria.workerRuntime) return false;
      if (criteria.skillId !== undefined && e.skillId !== criteria.skillId) return false;
      return true;
    });
  }

  closedVerdictsFor(childPeerId: string): ReadonlyArray<VerdictEntry> {
    const out: VerdictEntry[] = [];
    for (const e of this.edges) {
      if (e.childPeerId === childPeerId && e.status === "closed" && e.verdict) {
        out.push(e.verdict);
      }
    }
    return out;
  }

  allEdges(): ReadonlyArray<AgentGraphEdge> {
    return [...this.edges];
  }
}
