/**
 * Round 3 — federation: peer scoreboard records merge into the mesh
 * arbitration store (idempotent).
 */

import { describe, expect, it } from "vitest";

import { PeerScoreboard } from "@envoymesh/envoy-harness-peer";
import type { VerdictEntry } from "@envoymesh/protocol";

import { createArbitrationStore } from "../src/chain-arbitration.js";
import { federatePeerScoreboard } from "../src/agent-runtime-envoy/federate.js";

function entry(subtaskId: string): VerdictEntry {
  return {
    chainId: "chain_1",
    subtaskId,
    workerPeerId: "w1",
    workerRuntime: "envoy-harness",
    skillId: "research",
    verdict: { kind: "pass", score: 1, confidence: "high" },
    source: "llm",
    verifierModel: "claude-instant",
    issuedBy: "orch",
    issuedAt: new Date().toISOString(),
    signature: "",
  };
}

describe("federatePeerScoreboard (Round 3)", () => {
  it("merges peer verdict records into the mesh arbitration store", () => {
    const scoreboard = new PeerScoreboard();
    scoreboard.record(entry("s1"));
    scoreboard.record(entry("s2"));

    const store = createArbitrationStore();
    const merged = federatePeerScoreboard(store, scoreboard.list());
    expect(merged.size).toBe(2);

    // Idempotent: re-federating the same records adds nothing.
    const again = federatePeerScoreboard(merged, scoreboard.list());
    expect(again.size).toBe(2);
  });
});
