/**
 * Unit tests for the agent passes runtime module
 * (Phases 23B / 25A / 23D / 69C).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  recordConnectionSuggestion: vi.fn(async () => {}),
  recordMeshAwarenessInsight: vi.fn(async () => {}),
  matchPeerInterests: vi.fn(
    (_ownerTopics: string[], _peerTopics: string[], _peerCaps: string[]) => ({
      score: 0,
      matchedTopics: [] as string[],
    }),
  ),
  generateMeshInsights: vi.fn(
    async (_deps: unknown) => [] as Array<Record<string, unknown>>,
  ),
}));

vi.mock("../src/agent-activity-hooks.js", () => ({
  recordConnectionSuggestion: mocks.recordConnectionSuggestion,
  recordMeshAwarenessInsight: mocks.recordMeshAwarenessInsight,
}));

vi.mock("../src/connection-suggester.js", () => ({
  matchPeerInterests: mocks.matchPeerInterests,
}));

vi.mock("../src/mesh-awareness-worker.js", () => ({
  generateMeshInsights: mocks.generateMeshInsights,
}));

import {
  chatRagSearchViaRuntime,
  runConnectionSuggesterPassViaRuntime,
  runMeshAwarenessPassViaRuntime,
  type AgentPassesContext,
} from "../src/node-service-agent-passes.js";
import type { BondRecord, LocalAgentActivityStore } from "@envoymesh/api";

function makeBond(peerOwnerId: string, displayName?: string): BondRecord {
  return { peerOwnerId, displayName: displayName ?? peerOwnerId, level: "direct" } as unknown as BondRecord;
}

function makeActivityStore(): LocalAgentActivityStore {
  return { append: vi.fn() } as unknown as LocalAgentActivityStore;
}

function makeContext(overrides: Partial<AgentPassesContext> = {}): AgentPassesContext {
  return {
    getBonds: async () => [],
    getProfileOwnerId: () => "owner-1",
    hasTaskStore: () => true,
    loadConfig: async () => ({}),
    getAgentActivityStore: () => null,
    getContactTopicsFromLibrary: async () => [],
    getOwnerInterestTopics: async () => [],
    emit: () => {},
    ...overrides,
  };
}

describe("node-service-agent-passes — connection suggester", () => {
  beforeEach(() => {
    mocks.recordConnectionSuggestion.mockReset();
    mocks.recordConnectionSuggestion.mockResolvedValue(undefined);
    mocks.matchPeerInterests.mockReset();
    mocks.matchPeerInterests.mockReturnValue({ score: 0, matchedTopics: [] });
  });

  afterEach(() => vi.clearAllMocks());

  it("returns [] when hasTaskStore() is false", async () => {
    const ctx = makeContext({ hasTaskStore: () => false });
    const out = await runConnectionSuggesterPassViaRuntime(ctx);
    expect(out).toEqual([]);
    expect(mocks.matchPeerInterests).not.toHaveBeenCalled();
  });

  it("returns [] when owner interests are empty", async () => {
    const ctx = makeContext({ getBonds: async () => [makeBond("a"), makeBond("b")] });
    const out = await runConnectionSuggesterPassViaRuntime(ctx);
    expect(out).toEqual([]);
    expect(mocks.matchPeerInterests).not.toHaveBeenCalled();
  });

  it("matches bonded peers using owner interests + peer library topics", async () => {
    mocks.matchPeerInterests.mockReturnValue({ score: 0.8, matchedTopics: ["wasm"] });
    const store = makeActivityStore();
    const ctx = makeContext({
      getOwnerInterestTopics: async () => ["wasm"],
      getBonds: async () => [makeBond("a", "Alice")],
      getContactTopicsFromLibrary: async () => ["wasm", "rust"],
      getAgentActivityStore: () => store,
    });
    const out = await runConnectionSuggesterPassViaRuntime(ctx);
    expect(out).toHaveLength(1);
    expect(out[0]?.remoteDisplayName).toBe("Alice");
    expect(mocks.recordConnectionSuggestion).toHaveBeenCalledTimes(1);
  });

  it("loads config for parity with the pre-extraction code path", async () => {
    const loadConfig = vi.fn(async () => ({ dormantBondThresholdDays: 30 }));
    const ctx = makeContext({ loadConfig });
    await runConnectionSuggesterPassViaRuntime(ctx);
    expect(loadConfig).toHaveBeenCalledTimes(1);
  });
});

describe("node-service-agent-passes — mesh awareness", () => {
  beforeEach(() => {
    mocks.generateMeshInsights.mockReset();
    mocks.generateMeshInsights.mockResolvedValue([]);
    mocks.recordMeshAwarenessInsight.mockReset();
  });

  afterEach(() => vi.clearAllMocks());

  it("calls generateMeshInsights with owner interests + per-bond topic lookups", async () => {
    const ctx = makeContext({
      getBonds: async () => [makeBond("a"), makeBond("b")],
      getOwnerInterestTopics: async () => ["wasm", "rust"],
      getContactTopicsFromLibrary: async (ownerId) => (ownerId === "a" ? ["wasm"] : []),
    });
    await runMeshAwarenessPassViaRuntime(ctx);
    expect(mocks.generateMeshInsights).toHaveBeenCalledTimes(1);
    const deps = mocks.generateMeshInsights.mock.calls[0]?.[0] as {
      getOwnerInterestTopics: () => Promise<string[]>;
      getBondedPeerTopics: () => Promise<Array<{ ownerId: string; topics: string[] }>>;
    };
    expect(await deps.getOwnerInterestTopics()).toEqual(["wasm", "rust"]);
    expect(await deps.getBondedPeerTopics()).toEqual([{ ownerId: "a", topics: ["wasm"] }]);
  });

  it("emits awareness + records Activity for each insight", async () => {
    mocks.generateMeshInsights.mockResolvedValueOnce([
      { kind: "topic_match", summary: "a", matchedTopic: "wasm", peerCount: 1, createdAt: "2026-06-30T00:00:00.000Z" },
      { kind: "topic_match", summary: "b", matchedTopic: "rust", peerCount: 2, createdAt: "2026-06-30T00:00:00.000Z" },
    ]);
    const emit = vi.fn();
    const store = makeActivityStore();
    const ctx = makeContext({ emit, getAgentActivityStore: () => store });
    const out = await runMeshAwarenessPassViaRuntime(ctx);
    expect(emit).toHaveBeenCalledWith("agent:awareness", out[0]);
    expect(emit).toHaveBeenCalledWith("agent:awareness", out[1]);
    expect(mocks.recordMeshAwarenessInsight).toHaveBeenCalledTimes(2);
  });

  it("does not emit when insights is empty", async () => {
    const emit = vi.fn();
    const ctx = makeContext({ emit });
    await runMeshAwarenessPassViaRuntime(ctx);
    expect(emit).not.toHaveBeenCalled();
  });

  it("returns the insights verbatim", async () => {
    const insights = [
      { kind: "topic_match", summary: "x", matchedTopic: "y", peerCount: 1, createdAt: "2026-06-30T00:00:00.000Z" },
    ];
    mocks.generateMeshInsights.mockResolvedValueOnce(insights);
    const ctx = makeContext();
    expect(await runMeshAwarenessPassViaRuntime(ctx)).toEqual(insights);
  });
});

describe("node-service-agent-passes — chat RAG (stub)", () => {
  it("always returns [] (stub — chat log not wired yet)", async () => {
    const out = await chatRagSearchViaRuntime(makeContext(), "any query");
    expect(out).toEqual([]);
  });

  it("returns [] even with opts provided", async () => {
    const out = await chatRagSearchViaRuntime(makeContext(), "any query", {
      ownerId: "x",
      maxResults: 5,
    });
    expect(out).toEqual([]);
  });
});
