/**
 * Unit tests for the mesh intelligence report runtime module.
 *
 * Covers the runtime's contract: deps wiring, the narrative fallback
 * when the model is unavailable, and the markdown formatting helper.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  generateMeshIntelligenceReport: vi.fn(
    async (_deps: unknown, _opts: unknown) => ({
      title: "Mock Mesh Report",
      generatedAt: "2026-06-30T00:00:00.000Z",
      peersAnalyzed: 0,
      sections: [],
    }),
  ),
  generateDiscoveryClusters: vi.fn(async (_deps: unknown, _opts: unknown) => [] as unknown[]),
  findDormantBonds: vi.fn(
    async (_deps: unknown, _thresholdDays: number) => ({
      dormantBonds: [],
      reactivatedBonds: [],
    }),
  ),
}));

vi.mock("../src/mesh-intelligence.js", () => ({
  generateMeshIntelligenceReport: mocks.generateMeshIntelligenceReport,
}));

vi.mock("../src/discovery-clusterer.js", () => ({
  generateDiscoveryClusters: mocks.generateDiscoveryClusters,
}));

vi.mock("../src/bond-steward.js", () => ({
  findDormantBonds: mocks.findDormantBonds,
}));

import {
  formatMeshIntelligenceReport,
  meshIntelligenceReportViaRuntime,
  type MeshIntelligenceContext,
} from "../src/node-service-mesh-intelligence.js";
import type { BondRecord, MeshIntelligenceReport } from "@envoymesh/api";

function makeBond(peerOwnerId: string, displayName?: string): BondRecord {
  return {
    peerOwnerId,
    displayName: displayName ?? peerOwnerId,
    level: "direct",
  } as unknown as BondRecord;
}

function makeContext(
  overrides: Partial<MeshIntelligenceContext> = {},
): MeshIntelligenceContext {
  return {
    getBonds: async () => [],
    generateNarrative: async () => "ok",
    ...overrides,
  };
}

describe("node-service-mesh-intelligence", () => {
  beforeEach(() => {
    mocks.generateMeshIntelligenceReport.mockReset();
    mocks.generateMeshIntelligenceReport.mockResolvedValue({
      title: "Mock Mesh Report",
      generatedAt: "2026-06-30T00:00:00.000Z",
      peersAnalyzed: 0,
      sections: [],
    });
    mocks.generateDiscoveryClusters.mockReset();
    mocks.generateDiscoveryClusters.mockResolvedValue([]);
    mocks.findDormantBonds.mockReset();
    mocks.findDormantBonds.mockResolvedValue({
      dormantBonds: [],
      reactivatedBonds: [],
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("forwards opts.ownerTopics/ownerCapabilities to the underlying report", async () => {
    const ctx = makeContext();
    await meshIntelligenceReportViaRuntime(ctx, {
      ownerTopics: ["wasm"],
      ownerCapabilities: ["translate"],
    });
    expect(mocks.generateMeshIntelligenceReport).toHaveBeenCalledTimes(1);
    const opts = mocks.generateMeshIntelligenceReport.mock.calls[0]?.[1] as Record<
      string,
      unknown
    >;
    expect(opts).toEqual({
      ownerTopics: ["wasm"],
      ownerCapabilities: ["translate"],
    });
  });

  it("defaults ownerTopics / ownerCapabilities to empty arrays when omitted", async () => {
    const ctx = makeContext();
    await meshIntelligenceReportViaRuntime(ctx, {});
    const opts = mocks.generateMeshIntelligenceReport.mock.calls[0]?.[1] as Record<
      string,
      unknown
    >;
    expect(opts).toEqual({ ownerTopics: [], ownerCapabilities: [] });
  });

  it("scanBondedPeers maps bonds to MeshDiscoveryPeer shape", async () => {
    const ctx = makeContext({
      getBonds: async () => [
        makeBond("a", "Alice"),
        makeBond("b"), // displayName fallback
      ],
    });
    await meshIntelligenceReportViaRuntime(ctx, {});
    const deps = mocks.generateMeshIntelligenceReport.mock.calls[0]?.[0] as {
      scanBondedPeers: () => Promise<Array<Record<string, unknown>>>;
    };
    const peers = await deps.scanBondedPeers();
    expect(peers).toEqual([
      {
        ownerId: "a",
        displayName: "Alice",
        topics: [],
        capabilities: [],
        bondLevel: "direct",
      },
      {
        ownerId: "b",
        displayName: "b",
        topics: [],
        capabilities: [],
        bondLevel: "direct",
      },
    ]);
  });

  it("scanDiscovery calls the clusterer and flattens cluster.peers into public-level peers", async () => {
    mocks.generateDiscoveryClusters.mockResolvedValueOnce([
      {
        topicTags: ["wasm"],
        peers: [
          { ownerId: "x", displayName: "X", topics: ["wasm"], capabilities: [], isBonded: false },
          { ownerId: "y", topics: [], capabilities: ["translate"], isBonded: false },
        ],
      },
    ]);
    const ctx = makeContext({ getBonds: async () => [makeBond("x")] });
    await meshIntelligenceReportViaRuntime(ctx, { ownerTopics: ["wasm"] });
    const deps = mocks.generateMeshIntelligenceReport.mock.calls[0]?.[0] as {
      scanDiscovery: (
        t: string[],
        c: string[],
      ) => Promise<Array<Record<string, unknown>>>;
    };
    const peers = await deps.scanDiscovery(["wasm"], ["translate"]);
    expect(peers).toEqual([
      {
        ownerId: "x",
        displayName: "X",
        topics: ["wasm"],
        capabilities: [],
        bondLevel: "public",
      },
      {
        ownerId: "y",
        displayName: undefined,
        topics: [],
        capabilities: ["translate"],
        bondLevel: "public",
      },
    ]);
  });

  it("scanDiscovery swallows errors and returns []", async () => {
    mocks.generateDiscoveryClusters.mockRejectedValueOnce(new Error("boom"));
    const ctx = makeContext();
    await meshIntelligenceReportViaRuntime(ctx, {});
    const deps = mocks.generateMeshIntelligenceReport.mock.calls[0]?.[0] as {
      scanDiscovery: (t: string[], c: string[]) => Promise<unknown[]>;
    };
    await expect(deps.scanDiscovery([], [])).resolves.toEqual([]);
  });

  it("findDormantBonds pulls from the steward and re-shapes the result", async () => {
    mocks.findDormantBonds.mockResolvedValueOnce({
      dormantBonds: [makeBond("a", "Alice")],
      reactivatedBonds: [],
    });
    const ctx = makeContext();
    await meshIntelligenceReportViaRuntime(ctx, {});
    const deps = mocks.generateMeshIntelligenceReport.mock.calls[0]?.[0] as {
      findDormantBonds: (n: number) => Promise<Array<Record<string, unknown>>>;
    };
    const dormant = await deps.findDormantBonds(30);
    expect(dormant).toEqual([
      { ownerId: "a", displayName: "Alice", topics: [], capabilities: [] },
    ]);
    expect(mocks.findDormantBonds).toHaveBeenCalledWith(expect.anything(), 30);
  });

  it("findSecondDegreeConnections returns [] (not yet wired)", async () => {
    const ctx = makeContext();
    await meshIntelligenceReportViaRuntime(ctx, {});
    const deps = mocks.generateMeshIntelligenceReport.mock.calls[0]?.[0] as {
      findSecondDegreeConnections: () => Promise<unknown[]>;
    };
    await expect(deps.findSecondDegreeConnections()).resolves.toEqual([]);
  });

  it("getReputationScores returns an empty Map (not yet wired)", async () => {
    const ctx = makeContext();
    await meshIntelligenceReportViaRuntime(ctx, {});
    const deps = mocks.generateMeshIntelligenceReport.mock.calls[0]?.[0] as {
      getReputationScores: () => Promise<Map<string, number>>;
    };
    const scores = await deps.getReputationScores();
    expect(scores).toBeInstanceOf(Map);
    expect(scores.size).toBe(0);
  });

  it("generateNarrative passes through on success", async () => {
    const ctx = makeContext({ generateNarrative: async () => "great narrative" });
    await meshIntelligenceReportViaRuntime(ctx, {});
    const deps = mocks.generateMeshIntelligenceReport.mock.calls[0]?.[0] as {
      generateNarrative: (p: string) => Promise<string>;
    };
    await expect(deps.generateNarrative("hello")).resolves.toBe("great narrative");
  });

  it("generateNarrative falls back to the placeholder when the model throws", async () => {
    const ctx = makeContext({
      generateNarrative: async () => {
        throw new Error("model offline");
      },
    });
    await meshIntelligenceReportViaRuntime(ctx, {});
    const deps = mocks.generateMeshIntelligenceReport.mock.calls[0]?.[0] as {
      generateNarrative: (p: string) => Promise<string>;
    };
    await expect(deps.generateNarrative("hello")).resolves.toBe(
      "Unable to generate narrative — model not available.",
    );
  });
});

describe("formatMeshIntelligenceReport", () => {
  it("renders title, generatedAt, peersAnalyzed, and sections", () => {
    const report = {
      title: "Weekly Mesh Health",
      generatedAt: "2026-06-30T12:00:00.000Z",
      peersAnalyzed: 7,
      sections: [
        { heading: "Trust", content: "all good", priority: 1 },
        { heading: "Activity", content: "quiet", priority: 2 },
      ],
    } as unknown as MeshIntelligenceReport;
    const out = formatMeshIntelligenceReport(report);
    expect(out).toBe(
      [
        "## Weekly Mesh Health",
        "Generated: 2026-06-30T12:00:00.000Z",
        "Analyzed: 7 peers",
        "",
        "### Trust\nall good",
        "### Activity\nquiet",
      ].join("\n"),
    );
  });

  it("renders without trailing section block when sections is empty", () => {
    const report = {
      title: "Empty",
      generatedAt: "2026-06-30T12:00:00.000Z",
      peersAnalyzed: 0,
      sections: [],
    } as unknown as MeshIntelligenceReport;
    const out = formatMeshIntelligenceReport(report);
    expect(out).toBe(
      ["## Empty", "Generated: 2026-06-30T12:00:00.000Z", "Analyzed: 0 peers", ""].join("\n"),
    );
  });
});