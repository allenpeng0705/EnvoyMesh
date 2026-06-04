/**
 * Phase 24–25 tests — Agent Marketplace + Ambient Mesh Awareness.
 * Covers: agent-negotiation-worker, reputation-router, mesh-awareness-worker, intent-predictor.
 */
import { describe, expect, it } from "vitest";
import { runAgentNegotiation, type AgentNegotiationDeps } from "../src/agent-negotiation-worker.js";
import { rankProviders, aggregateReputation, type ReputationProvider } from "../src/reputation-router.js";
import { generateMeshInsights, type MeshAwarenessDeps } from "../src/mesh-awareness-worker.js";
import { predictIntent } from "../src/intent-predictor.js";

// =========================================================================
// Agent Negotiation Worker
// =========================================================================
describe("agent-negotiation-worker", () => {
  function makeDeps(providers: Array<{ ownerId: string; peerId: string; capabilities: string[]; bondLevel: string; reputationScore: number }>, acceptedPeerId?: string): AgentNegotiationDeps {
    return {
      discoverCapabilityProviders: async () => providers,
      sendTaskPropose: async (peerId) => (acceptedPeerId && peerId === acceptedPeerId ? "msg-1" : null),
    };
  }

  it("returns error when no eligible providers", async () => {
    const deps = makeDeps([]);
    const result = await runAgentNegotiation(deps, "test objective", ["rust_reviewer"]);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("No eligible providers");
  });

  it("filters out unbonded providers when allowUnbonded is false", async () => {
    const deps = makeDeps([
      { ownerId: "envoy:owner:a", peerId: "peer-a", capabilities: ["rust_reviewer"], bondLevel: "public", reputationScore: 0.8 },
    ]);
    const result = await runAgentNegotiation(deps, "review my code", ["rust_reviewer"], { allowUnbonded: false });
    expect(result.providersContacted).toBe(0);
  });

  it("includes unbonded when allowUnbonded is true", async () => {
    const deps = makeDeps([
      { ownerId: "envoy:owner:a", peerId: "peer-a", capabilities: ["rust_reviewer"], bondLevel: "public", reputationScore: 0.8 },
    ], "peer-a");
    const result = await runAgentNegotiation(deps, "review my code", ["rust_reviewer"], { allowUnbonded: true });
    expect(result.ok).toBe(true);
    expect(result.providersContacted).toBe(1);
  });

  it("selects first accepting provider", async () => {
    const deps = makeDeps(
      [
        { ownerId: "envoy:owner:a", peerId: "peer-a", capabilities: ["rust_reviewer"], bondLevel: "direct", reputationScore: 0.5 },
        { ownerId: "envoy:owner:b", peerId: "peer-b", capabilities: ["rust_reviewer"], bondLevel: "direct", reputationScore: 0.8 },
      ],
      "peer-a", // Only peer-a accepts
    );
    const result = await runAgentNegotiation(deps, "review", ["rust_reviewer"]);
    expect(result.ok).toBe(true);
    expect(result.acceptedBy).toBe("envoy:owner:a");
  });

  it("ranks by reputation score", async () => {
    const deps = makeDeps(
      [
        { ownerId: "envoy:owner:low", peerId: "peer-low", capabilities: ["rust_reviewer"], bondLevel: "direct", reputationScore: 0.2 },
        { ownerId: "envoy:owner:high", peerId: "peer-high", capabilities: ["rust_reviewer"], bondLevel: "direct", reputationScore: 0.9 },
      ],
      "peer-low", // Only low accepts — but high should be tried first
    );
    const result = await runAgentNegotiation(deps, "review", ["rust_reviewer"]);
    // Higher reputation is tried first but doesn't accept; low is fallback
    expect(result.providersContacted).toBe(2);
  });
});

// =========================================================================
// Reputation Router
// =========================================================================
describe("reputation-router", () => {
  it("ranks bonded providers before unbonded", () => {
    const providers: ReputationProvider[] = [
      { ownerId: "a", peerId: "p1", bondLevel: "public", reputationScore: 0.9, completedTaskCount: 5 },
      { ownerId: "b", peerId: "p2", bondLevel: "direct", reputationScore: 0.5, completedTaskCount: 1 },
    ];
    const ranked = rankProviders(providers);
    expect(ranked[0].bondLevel).toBe("direct");
    expect(ranked[0].ownerId).toBe("b");
  });

  it("ranks by score within same bond level", () => {
    const providers: ReputationProvider[] = [
      { ownerId: "a", peerId: "p1", bondLevel: "direct", reputationScore: 0.3, completedTaskCount: 5 },
      { ownerId: "b", peerId: "p2", bondLevel: "direct", reputationScore: 0.8, completedTaskCount: 1 },
    ];
    const ranked = rankProviders(providers);
    expect(ranked[0].ownerId).toBe("b");
    expect(ranked[1].ownerId).toBe("a");
  });

  it("filters by minScore", () => {
    const providers: ReputationProvider[] = [
      { ownerId: "a", peerId: "p1", bondLevel: "direct", reputationScore: 0.2, completedTaskCount: 5 },
      { ownerId: "b", peerId: "p2", bondLevel: "direct", reputationScore: 0.8, completedTaskCount: 1 },
    ];
    const ranked = rankProviders(providers, { minScore: 0.5 });
    expect(ranked).toHaveLength(1);
    expect(ranked[0].ownerId).toBe("b");
  });

  it("aggregateReputation returns default for no scores", () => {
    const result = aggregateReputation([]);
    expect(result.reputationScore).toBe(0.5);
    expect(result.completedTaskCount).toBe(0);
  });

  it("aggregateReputation computes average", () => {
    const result = aggregateReputation([{ score: 0.8 }, { score: 0.6 }, { score: 1.0 }]);
    expect(result.reputationScore).toBe(0.8);
    expect(result.completedTaskCount).toBe(3);
  });

  it("aggregateReputation filters invalid scores", () => {
    const result = aggregateReputation([{ score: 1.5 }, { score: -0.5 }, { score: 0.5 }]);
    expect(result.reputationScore).toBe(0.5);
    expect(result.completedTaskCount).toBe(1);
  });
});

// =========================================================================
// Mesh Awareness Worker
// =========================================================================
describe("mesh-awareness-worker", () => {
  function makeDeps(ownerTopics: string[], peerTopics: Array<{ ownerId: string; topics: string[] }>): MeshAwarenessDeps {
    return {
      getOwnerInterestTopics: async () => ownerTopics,
      getBondedPeerTopics: async () => peerTopics,
    };
  }

  it("generates insight when peers match owner topic", async () => {
    const deps = makeDeps(
      ["wasm"],
      [
        { ownerId: "envoy:owner:a", topics: ["wasm", "rust"] },
        { ownerId: "envoy:owner:b", topics: ["wasm", "python"] },
        { ownerId: "envoy:owner:c", topics: ["typescript"] },
      ],
    );
    const insights = await generateMeshInsights(deps);
    expect(insights.length).toBe(1);
    expect(insights[0].matchedTopic).toBe("wasm");
    expect(insights[0].peerCount).toBe(2);
    expect(insights[0].summary).toContain("2 contacts");
  });

  it("returns empty when no owner topics", async () => {
    const deps = makeDeps([], [{ ownerId: "envoy:owner:a", topics: ["rust"] }]);
    const insights = await generateMeshInsights(deps);
    expect(insights).toHaveLength(0);
  });

  it("returns empty when no peer overlap", async () => {
    const deps = makeDeps(
      ["blockchain"],
      [{ ownerId: "envoy:owner:a", topics: ["rust", "python"] }],
    );
    const insights = await generateMeshInsights(deps);
    expect(insights).toHaveLength(0);
  });

  it("respects minOverlapScore", async () => {
    const deps = makeDeps(
      ["rust"],
      [
        { ownerId: "envoy:owner:a", topics: ["rust"] },
        { ownerId: "envoy:owner:b", topics: ["python"] },
        { ownerId: "envoy:owner:c", topics: ["python"] },
        { ownerId: "envoy:owner:d", topics: ["python"] },
      ],
    );
    // 1/4 = 0.25 < default 0.3
    const insights = await generateMeshInsights(deps);
    expect(insights).toHaveLength(0);
  });
});

// =========================================================================
// Intent Predictor
// =========================================================================
describe("intent-predictor", () => {
  const recentIntents = [
    { intent: "find_document", query: "find documents about distributed systems", timestamp: "2026-06-01T10:00:00.000Z" },
    { intent: "make_friends", query: "help me find friends interested in hiking", timestamp: "2026-06-01T11:00:00.000Z" },
    { intent: "knowledge_query", query: "what is the raft consensus algorithm", timestamp: "2026-06-02T10:00:00.000Z" },
    { intent: "find_document", query: "find documents about kubernetes operators", timestamp: "2026-06-02T11:00:00.000Z" },
  ];

  it("predicts intent from partial input", () => {
    const predictions = predictIntent(recentIntents, "find doc");
    expect(predictions.length).toBeGreaterThan(0);
    expect(predictions[0].intent).toBe("find_document");
  });

  it("gives bonus for prefix match", () => {
    const predictions = predictIntent(recentIntents, "find documents about");
    expect(predictions.length).toBeGreaterThan(0);
    // "find documents about distributed systems" should rank highest (exact prefix)
    expect(predictions[0].predictedQuery).toContain("distributed systems");
  });

  it("returns empty for blank input", () => {
    const predictions = predictIntent(recentIntents, "");
    expect(predictions).toHaveLength(0);
  });

  it("returns empty when no matches", () => {
    const predictions = predictIntent(recentIntents, "blockchain trading");
    expect(predictions).toHaveLength(0);
  });

  it("deduplicates by intent", () => {
    const predictions = predictIntent(recentIntents, "find");
    const findDocPredictions = predictions.filter((p) => p.intent === "find_document");
    expect(findDocPredictions.length).toBeLessThanOrEqual(1);
  });

  it("respects maxPredictions", () => {
    const predictions = predictIntent(recentIntents, "find", { maxPredictions: 1 });
    expect(predictions.length).toBeLessThanOrEqual(1);
  });
});
