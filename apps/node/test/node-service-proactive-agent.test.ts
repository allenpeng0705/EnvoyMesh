/**
 * Unit tests for the proactive agent pass runtime module.
 *
 * Each sub-pass is isolated by a try/catch, so the tests cover the
 * "any sub-pass throws" path as well as the happy paths.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findDormantBonds: vi.fn(
    async (_deps: unknown, _thresholdDays: number) => ({
      dormantBonds: [],
      reactivatedBonds: [],
    }),
  ),
}));

vi.mock("../src/bond-steward.js", () => ({
  findDormantBonds: mocks.findDormantBonds,
}));

import {
  runProactiveAgentPassViaRuntime,
  type ProactiveAgentContext,
  type ProactiveInsight,
} from "../src/node-service-proactive-agent.js";
import type { BondRecord } from "@envoymesh/api";

function makeBond(peerOwnerId: string): BondRecord {
  return { peerOwnerId, displayName: peerOwnerId, level: "direct" } as unknown as BondRecord;
}

function makeContext(overrides: Partial<ProactiveAgentContext> = {}): ProactiveAgentContext {
  return {
    runMeshAwareness: async () => [],
    runConnectionSuggester: async () => [],
    getBonds: async () => [],
    getDormantThresholdDays: async () => 90,
    ...overrides,
  };
}

describe("node-service-proactive-agent", () => {
  beforeEach(() => {
    mocks.findDormantBonds.mockReset();
    mocks.findDormantBonds.mockResolvedValue({
      dormantBonds: [],
      reactivatedBonds: [],
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns an empty list when all sub-passes return nothing", async () => {
    const insights = await runProactiveAgentPassViaRuntime(makeContext());
    expect(insights).toEqual([]);
  });

  it("flattens mesh-awareness insights into mesh_activity rows", async () => {
    const ctx = makeContext({
      runMeshAwareness: async () => [
        {
          kind: "topic_match",
          summary: "Alice is into wasm",
          matchedTopic: "wasm",
          peerCount: 3,
          createdAt: "2026-06-30T00:00:00.000Z",
        },
        {
          kind: "topic_match",
          summary: "Bob is into rust",
          matchedTopic: "rust",
          peerCount: 1,
        },
      ],
    });
    const insights = await runProactiveAgentPassViaRuntime(ctx);
    expect(insights).toEqual<ProactiveInsight[]>([
      { kind: "mesh_activity", summary: "Alice is into wasm", matchedTopic: "wasm", peerCount: 3 },
      { kind: "mesh_activity", summary: "Bob is into rust", matchedTopic: "rust", peerCount: 1 },
    ]);
  });

  it("flattens connection suggestions into connection_suggested rows with peerCount: 1", async () => {
    const ctx = makeContext({
      runConnectionSuggester: async () => [
        {
          remoteOwnerId: "x",
          remoteDisplayName: "Xander",
          reason: "shares wasm interest",
          relevanceScore: 0.8,
        },
      ],
    });
    const insights = await runProactiveAgentPassViaRuntime(ctx);
    expect(insights).toEqual<ProactiveInsight[]>([
      {
        kind: "connection_suggested",
        summary: "Suggested connection: Xander — shares wasm interest",
        matchedTopic: "shares wasm interest",
        peerCount: 1,
      },
    ]);
  });

  it("emits a dormant_bonds insight only when the steward reports >0 dormant bonds", async () => {
    mocks.findDormantBonds.mockResolvedValueOnce({
      dormantBonds: [makeBond("a"), makeBond("b")],
      reactivatedBonds: [],
      summary: "2 dormant bonds",
    });
    const insights = await runProactiveAgentPassViaRuntime(makeContext());
    expect(insights).toEqual([
      {
        kind: "dormant_bonds",
        summary: "2 dormant bonds",
        matchedTopic: "social_graph_health",
        peerCount: 2,
      },
    ]);
  });

  it("skips the dormant_bonds insight when the steward returns 0 dormant bonds", async () => {
    const insights = await runProactiveAgentPassViaRuntime(makeContext());
    expect(insights).toEqual([]);
    expect(mocks.findDormantBonds).toHaveBeenCalledTimes(1);
  });

  it("passes the resolved threshold (not a hard-coded 90) to findDormantBonds", async () => {
    const ctx = makeContext({ getDormantThresholdDays: async () => 30 });
    await runProactiveAgentPassViaRuntime(ctx);
    expect(mocks.findDormantBonds).toHaveBeenCalledWith(expect.anything(), 30);
  });

  it("swallows a mesh-awareness error and still returns the other insights", async () => {
    const ctx = makeContext({
      runMeshAwareness: async () => {
        throw new Error("awareness down");
      },
      runConnectionSuggester: async () => [
        {
          remoteOwnerId: "x",
          remoteDisplayName: "X",
          reason: "match",
          relevanceScore: 1,
        },
      ],
    });
    const insights = await runProactiveAgentPassViaRuntime(ctx);
    expect(insights).toHaveLength(1);
    expect(insights[0]?.kind).toBe("connection_suggested");
  });

  it("swallows a connection-suggester error and still returns the other insights", async () => {
    const ctx = makeContext({
      runMeshAwareness: async () => [
        { kind: "topic_match", summary: "x", matchedTopic: "y", peerCount: 1 },
      ],
      runConnectionSuggester: async () => {
        throw new Error("suggester down");
      },
    });
    const insights = await runProactiveAgentPassViaRuntime(ctx);
    expect(insights).toHaveLength(1);
    expect(insights[0]?.kind).toBe("mesh_activity");
  });

  it("swallows a dormant-bond-check error and still returns the other insights", async () => {
    mocks.findDormantBonds.mockRejectedValueOnce(new Error("steward down"));
    const ctx = makeContext({
      runMeshAwareness: async () => [
        { kind: "topic_match", summary: "x", matchedTopic: "y", peerCount: 1 },
      ],
    });
    const insights = await runProactiveAgentPassViaRuntime(ctx);
    expect(insights).toHaveLength(1);
    expect(insights[0]?.kind).toBe("mesh_activity");
  });

  it("preserves the order: mesh → connections → dormant", async () => {
    mocks.findDormantBonds.mockResolvedValueOnce({
      dormantBonds: [makeBond("z")],
      reactivatedBonds: [],
      summary: "1 dormant",
    });
    const ctx = makeContext({
      runMeshAwareness: async () => [
        { kind: "topic_match", summary: "m1", matchedTopic: "m1", peerCount: 1 },
      ],
      runConnectionSuggester: async () => [
        {
          remoteOwnerId: "y",
          remoteDisplayName: "Y",
          reason: "r1",
          relevanceScore: 1,
        },
      ],
    });
    const insights = await runProactiveAgentPassViaRuntime(ctx);
    expect(insights.map((i) => i.kind)).toEqual([
      "mesh_activity",
      "connection_suggested",
      "dormant_bonds",
    ]);
  });
});