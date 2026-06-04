import { describe, expect, it } from "vitest";
import { generateMeshIntelligenceReport, type MeshDiscoveryPeer } from "../src/mesh-intelligence.js";

function makeBondedPeers(): MeshDiscoveryPeer[] {
  return [
    { ownerId: "a", displayName: "Alice", topics: ["wasm", "rust"], capabilities: ["rust_reviewer"], bondLevel: "direct" },
    { ownerId: "b", displayName: "Bob", topics: ["wasm", "python"], capabilities: [], bondLevel: "direct" },
    { ownerId: "c", displayName: "Charlie", topics: ["rust", "p2p"], capabilities: ["p2p_builder"], bondLevel: "referred" },
    { ownerId: "d", displayName: "Dana", topics: ["wasm"], capabilities: [], bondLevel: "direct", lastInteractionAt: "2025-01-01T00:00:00.000Z" },
  ];
}

function makeDeps(overrides?: Partial<Parameters<typeof generateMeshIntelligenceReport>[0]>) {
  return {
    scanBondedPeers: async () => makeBondedPeers(),
    scanDiscovery: async () => [] as MeshDiscoveryPeer[],
    getReputationScores: async () => new Map([["a", 0.9], ["b", 0.7], ["c", 0.5]]),
    findDormantBonds: async () => [makeBondedPeers()[3]], // Dana is dormant
    findSecondDegreeConnections: async () => [] as MeshDiscoveryPeer[],
    generateNarrative: async () => "Your mesh is active with 4 contacts. WASM is trending. Dana has been quiet for a while — consider reaching out.",
    ...overrides,
  };
}

describe("mesh-intelligence", () => {
  it("generates a complete report", async () => {
    const deps = makeDeps();
    const report = await generateMeshIntelligenceReport(deps, {
      ownerTopics: ["wasm", "p2p"],
      ownerCapabilities: [],
    });
    expect(report.title).toBe("Mesh Intelligence Report");
    expect(report.sections.length).toBeGreaterThanOrEqual(4);
    expect(report.peersAnalyzed).toBe(4);
  });

  it("includes network health section", async () => {
    const deps = makeDeps();
    const report = await generateMeshIntelligenceReport(deps, {
      ownerTopics: ["wasm"],
      ownerCapabilities: [],
    });
    const health = report.sections.find((s) => s.heading === "Network Health");
    expect(health).toBeDefined();
    expect(health!.content).toContain("4 bonded contacts");
    expect(health!.content).toContain("3 active");
    expect(health!.content).toContain("1 dormant");
  });

  it("identifies trending topics", async () => {
    const deps = makeDeps();
    const report = await generateMeshIntelligenceReport(deps, {
      ownerTopics: ["wasm"],
      ownerCapabilities: [],
    });
    const trending = report.sections.find((s) => s.heading === "Trending Topics in Your Mesh");
    expect(trending).toBeDefined();
    expect(trending!.content).toContain("wasm");
    expect(trending!.content).toContain("rust");
  });

  it("detects dormant bonds", async () => {
    const deps = makeDeps();
    const report = await generateMeshIntelligenceReport(deps, {
      ownerTopics: [],
      ownerCapabilities: [],
    }, { dormantBondThresholdDays: 30 });
    const dormant = report.sections.find((s) => s.heading.includes("Dormant Bonds"));
    expect(dormant).toBeDefined();
    expect(dormant!.content).toContain("Dana");
  });

  it("ranks by reputation", async () => {
    const deps = makeDeps();
    const report = await generateMeshIntelligenceReport(deps, {
      ownerTopics: [],
      ownerCapabilities: [],
    });
    const rep = report.sections.find((s) => s.heading === "Most Trusted Contacts");
    expect(rep).toBeDefined();
    const content = rep!.content;
    const aliceIdx = content.indexOf("Alice");
    const bobIdx = content.indexOf("Bob");
    const charlieIdx = content.indexOf("Charlie");
    // Alice (0.9) should appear before Bob (0.7) and Charlie (0.5)
    expect(aliceIdx).toBeLessThan(bobIdx);
    expect(aliceIdx).toBeLessThan(charlieIdx);
  });

  it("includes growth opportunities from discovery", async () => {
    const deps = makeDeps({
      scanDiscovery: async () => [
        { ownerId: "e", displayName: "Eve", topics: ["wasm"], capabilities: [], bondLevel: "public" },
      ],
    });
    const report = await generateMeshIntelligenceReport(deps, {
      ownerTopics: ["wasm"],
      ownerCapabilities: [],
    });
    const growth = report.sections.find((s) => s.heading === "Growth Opportunities");
    expect(growth).toBeDefined();
    expect(growth!.content).toContain("Eve");
  });

  it("generates LLM narrative summary", async () => {
    const deps = makeDeps({
      generateNarrative: async () => "Your network is healthy. WASM community is growing.",
    });
    const report = await generateMeshIntelligenceReport(deps, {
      ownerTopics: ["wasm"],
      ownerCapabilities: [],
    });
    expect(report.summary).toContain("healthy");
    const overview = report.sections.find((s) => s.heading === "Your Mesh at a Glance");
    expect(overview).toBeDefined();
  });

  it("sorts sections by priority", async () => {
    const deps = makeDeps();
    const report = await generateMeshIntelligenceReport(deps, {
      ownerTopics: [],
      ownerCapabilities: [],
    });
    for (let i = 1; i < report.sections.length; i++) {
      expect(report.sections[i - 1].priority).toBeGreaterThanOrEqual(report.sections[i].priority);
    }
  });
});
