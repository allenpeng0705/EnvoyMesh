/**
 * Phase 8 / v2.0 — `LocalAgentGraphStore` tests.
 *
 * Covers the edge lifecycle: open → close, the closed-edge
 * verdict payload, re-verification (replace), the no-op close
 * without an open edge, and the find/filter helpers.
 */

import { describe, expect, it } from "vitest";

import type { VerdictEntry } from "@envoymesh/protocol";

import { LocalAgentGraphStore } from "../src/chain-graph/local.js";
import type { AgentGraphStore } from "../src/chain-graph/types.js";

function makeVerdict(overrides: Partial<VerdictEntry> = {}): VerdictEntry {
  return {
    chainId: "chain-1",
    subtaskId: "subtask_a",
    workerPeerId: "worker-1",
    workerRuntime: "openclaw",
    skillId: "research",
    verdict: { kind: "pass", score: 1, confidence: "high" },
    source: "rule",
    issuedBy: "orch-1",
    issuedAt: "2026-08-21T00:00:00.000Z",
    signature: "sig",
    ...overrides,
  };
}

describe("LocalAgentGraphStore", () => {
  it("opens an edge and closes it with the verdict", () => {
    const graph: AgentGraphStore = new LocalAgentGraphStore();
    graph.openEdge({
      parentPeerId: "orch-1",
      childPeerId: "worker-1",
      subtaskId: "subtask_a",
      workerRuntime: "openclaw",
      skillId: "research",
      openedAt: 100,
    });
    expect(graph.findEdges({ subtaskId: "subtask_a" })[0]?.status).toBe("open");

    const verdict = makeVerdict();
    graph.closeEdge("orch-1", "subtask_a", verdict, 200);
    const edges = graph.allEdges();
    expect(edges).toHaveLength(1);
    expect(edges[0]?.status).toBe("closed");
    expect(edges[0]?.closedAt).toBe(200);
    expect(edges[0]?.verdict?.signature).toBe("sig");
    expect(graph.closedVerdictsFor("worker-1")).toHaveLength(1);
  });

  it("re-verification replaces the closed edge's verdict (ledger parity)", () => {
    const graph = new LocalAgentGraphStore();
    graph.openEdge({
      parentPeerId: "orch-1",
      childPeerId: "worker-1",
      subtaskId: "subtask_a",
      workerRuntime: "openclaw",
      skillId: "research",
    });
    graph.closeEdge(
      "orch-1",
      "subtask_a",
      makeVerdict({ source: "rule", signature: "rule-sig" }),
      100,
    );
    // Cross verdict arrives after the rule verdict (no open edge
    // — the closed edge's verdict is replaced, mirroring
    // recordVerdictEntry's "(subtask, runtime) slot replaces").
    graph.closeEdge(
      "orch-1",
      "subtask_a",
      makeVerdict({ source: "cross", signature: "cross-sig" }),
      200,
    );
    const edges = graph.allEdges();
    expect(edges).toHaveLength(1);
    expect(edges[0]?.status).toBe("closed");
    expect(edges[0]?.verdict?.signature).toBe("cross-sig");
    expect(edges[0]?.verdict?.source).toBe("cross");
    expect(graph.closedVerdictsFor("worker-1")).toHaveLength(1);
  });

  it("closeEdge without an open edge (and no closed edge) is a no-op", () => {
    const graph = new LocalAgentGraphStore();
    graph.closeEdge("orch-1", "subtask_ghost", makeVerdict(), 1);
    expect(graph.allEdges()).toHaveLength(0);
  });

  it("failEdge marks the open edge as 'failed' (no verdict payload)", () => {
    // The verify-loop calls failEdge when the rule
    // verify throws — a verdict can't be written
    // (the verify crashed) but the open edge must
    // not leak. The failed status is distinct from
    // 'closed' (no verdict), and `closedVerdictsFor`
    // filters it out (the scoreboard never sees it).
    const graph = new LocalAgentGraphStore();
    graph.openEdge({
      parentPeerId: "orch-1",
      childPeerId: "worker-1",
      subtaskId: "subtask_a",
      workerRuntime: "openclaw",
      skillId: "research",
      openedAt: 100,
    });
    graph.failEdge("orch-1", "subtask_a", 200);
    const edges = graph.allEdges();
    expect(edges).toHaveLength(1);
    expect(edges[0]?.status).toBe("failed");
    expect(edges[0]?.closedAt).toBe(200);
    expect(edges[0]?.verdict).toBeUndefined();
    // The scoreboard view filters by status === "closed" —
    // a failed edge is invisible to closedVerdictsFor so
    // the reputation formula never sees a fake entry.
    expect(graph.closedVerdictsFor("worker-1")).toHaveLength(0);
  });

  it("failEdge without an open edge is a no-op (no leaked row)", () => {
    const graph = new LocalAgentGraphStore();
    graph.failEdge("orch-1", "subtask_ghost", 1);
    expect(graph.allEdges()).toHaveLength(0);
  });

  it("findEdges filters by criteria; closedVerdictsFor is per worker", () => {
    const graph = new LocalAgentGraphStore();
    for (const [child, skill] of [
      ["worker-1", "research"],
      ["worker-1", "translate"],
      ["worker-2", "research"],
    ] as const) {
      graph.openEdge({
        parentPeerId: "orch-1",
        childPeerId: child,
        subtaskId: `subtask_${child}_${skill}`,
        workerRuntime: "openclaw",
        skillId: skill,
      });
    }
    expect(graph.findEdges({ childPeerId: "worker-1" })).toHaveLength(2);
    expect(graph.findEdges({ skillId: "research" })).toHaveLength(2);
    expect(graph.findEdges({ childPeerId: "worker-2", skillId: "research" })).toHaveLength(1);
    expect(graph.closedVerdictsFor("worker-1")).toHaveLength(0);
  });
});
