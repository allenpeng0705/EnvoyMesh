/**
 * Phase 22C — Federated RAG tests.
 */
import { describe, expect, it, vi } from "vitest";
import {
  executeFederatedRagQuery,
  synthesizeFederatedResult,
  type FederatedRagDeps,
} from "../src/federated-rag.js";
import type { FederatedRagConfig } from "@envoymesh/protocol";

function makeConfig(overrides?: Partial<FederatedRagConfig>): FederatedRagConfig {
  return {
    enabled: true,
    maxPeers: 5,
    queryTimeoutMs: 15000,
    maxSensitivity: "public",
    includeUnbondedPeers: false,
    maxPeerResults: 10,
    ...overrides,
  };
}

function makeDeps(overrides?: Partial<FederatedRagDeps>): FederatedRagDeps {
  return {
    config: makeConfig(),
    getBondedPeers: vi.fn().mockResolvedValue([
      { ownerId: "envoy:owner:b1", peerId: "peer-b1" },
      { ownerId: "envoy:owner:b2", peerId: "peer-b2" },
      { ownerId: "envoy:owner:b3", peerId: "peer-b3" },
    ]),
    queryPeer: vi.fn().mockResolvedValue({ ok: true, answerText: "Answer from peer" }),
    ...overrides,
  };
}

describe("executeFederatedRagQuery", () => {
  it("returns empty when RAG is disabled", async () => {
    const deps = makeDeps({ config: makeConfig({ enabled: false }) });
    const result = await executeFederatedRagQuery(deps, "test query");
    expect(result.peersQueried).toBe(0);
    expect(result.peersResponded).toBe(0);
    expect(result.peerAnswers).toHaveLength(0);
  });

  it("returns empty when no bonded peers", async () => {
    const deps = makeDeps({
      getBondedPeers: vi.fn().mockResolvedValue([]),
    });
    const result = await executeFederatedRagQuery(deps, "test query");
    expect(result.peersQueried).toBe(0);
  });

  it("queries bonded peers in parallel", async () => {
    const querySpy = vi.fn().mockResolvedValue({ ok: true, answerText: "Found it" });
    const deps = makeDeps({ queryPeer: querySpy });
    const result = await executeFederatedRagQuery(deps, "distributed systems");
    expect(result.peersQueried).toBe(3);
    expect(result.peersResponded).toBe(3);
    expect(querySpy).toHaveBeenCalledTimes(3);
    expect(result.peerAnswers).toHaveLength(3);
  });

  it("respects maxPeers limit", async () => {
    const querySpy = vi.fn().mockResolvedValue({ ok: true, answerText: "ok" });
    const deps = makeDeps({
      config: makeConfig({ maxPeers: 2 }),
      queryPeer: querySpy,
    });
    const result = await executeFederatedRagQuery(deps, "query");
    expect(result.peersQueried).toBe(2);
    expect(querySpy).toHaveBeenCalledTimes(2);
  });

  it("handles failed peer queries", async () => {
    const querySpy = vi.fn()
      .mockResolvedValueOnce({ ok: true, answerText: "Good" })
      .mockRejectedValueOnce(new Error("timeout"))
      .mockResolvedValueOnce({ ok: false });
    const deps = makeDeps({ queryPeer: querySpy });
    const result = await executeFederatedRagQuery(deps, "query");
    expect(result.peersQueried).toBe(3);
    expect(result.peersResponded).toBe(1);
    expect(result.peerAnswers).toHaveLength(1);
    expect(result.peerAnswers[0].answerText).toBe("Good");
  });

  it("skips peers with empty answers", async () => {
    const querySpy = vi.fn().mockResolvedValue({ ok: true, answerText: "" });
    const deps = makeDeps({ queryPeer: querySpy });
    const result = await executeFederatedRagQuery(deps, "query");
    expect(result.peersResponded).toBe(0);
    expect(result.peerAnswers).toHaveLength(0);
  });
});

describe("synthesizeFederatedResult", () => {
  it("returns local-only when no peer answers", () => {
    const result = synthesizeFederatedResult("Local result", []);
    // Use toContain to stay robust to small format changes (separator, trailing newline, etc.)
    expect(result).toContain("[Local vault]:");
    expect(result).toContain("Local result");
  });

  it("merges local + peer answers", () => {
    const result = synthesizeFederatedResult("Local vault hit", [
      { ownerId: "envoy:owner:b1", answerText: "Peer 1 answer" },
      { ownerId: "envoy:owner:b2", answerText: "Peer 2 answer" },
    ]);
    expect(result).toContain("[Local vault]: Local vault hit");
    expect(result).toContain("[envoy:owner:b1]: Peer 1 answer");
    expect(result).toContain("[envoy:owner:b2]: Peer 2 answer");
  });

  it("returns peer-only when no local answer", () => {
    const result = synthesizeFederatedResult(undefined, [
      { ownerId: "envoy:owner:b1", answerText: "Only peer answer" },
    ]);
    expect(result).toContain("[envoy:owner:b1]: Only peer answer");
    expect(result).not.toContain("[Local vault]");
  });

  it("returns fallback when no answers", () => {
    const result = synthesizeFederatedResult(undefined, []);
    expect(result).toContain("No results found");
  });
});
