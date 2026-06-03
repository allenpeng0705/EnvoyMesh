/**
 * Discovery Clusterer tests.
 */
import { describe, expect, it } from "vitest";
import {
  generateDiscoveryClusters,
  formatDiscoverySuggestions,
  type DiscoveryPeer,
} from "../src/discovery-clusterer.js";

async function makeDeps(peers: DiscoveryPeer[]): Parameters<typeof generateDiscoveryClusters>[0] {
  return {
    broadcastDocumentDiscovery: async (query: string) =>
      peers.filter((p) =>
        p.topics.some((t) => t.toLowerCase() === query.toLowerCase()) ||
        p.capabilities.some((c) => c.toLowerCase() === query.toLowerCase()),
      ),
    broadcastCapabilityDiscovery: async (caps: string[]) =>
      peers.filter((p) =>
        p.capabilities.some((c) => caps.some((sc) => sc.toLowerCase() === c.toLowerCase())),
      ),
    getBondedOwnerIds: async () => new Set(),
  };
}

describe("discovery-clusterer", () => {
  it("returns clusters when enough peers share a topic", async () => {
    const deps = await makeDeps([
      { ownerId: "a", topics: ["wasm", "rust"], capabilities: [], isBonded: false },
      { ownerId: "b", topics: ["wasm", "python"], capabilities: [], isBonded: false },
      { ownerId: "c", topics: ["wasm", "typescript"], capabilities: [], isBonded: false },
      { ownerId: "d", topics: ["typescript"], capabilities: [], isBonded: false },
    ]);
    const clusters = await generateDiscoveryClusters(deps, {
      seedTopics: ["wasm", "typescript"],
      minClusterSize: 3,
    });
    expect(clusters.length).toBeGreaterThan(0);
    expect(clusters[0].topicTags[0]).toBe("wasm");
    expect(clusters[0].peers.length).toBe(3);
  });

  it("returns empty when no seed topics", async () => {
    const deps = await makeDeps([]);
    const clusters = await generateDiscoveryClusters(deps, { seedTopics: [] });
    expect(clusters).toHaveLength(0);
  });

  it("filters out bonded peers", async () => {
    const deps = await makeDeps([
      { ownerId: "a", topics: ["wasm"], capabilities: [], isBonded: false },
      { ownerId: "b", topics: ["wasm"], capabilities: [], isBonded: true },
      { ownerId: "c", topics: ["wasm"], capabilities: [], isBonded: false },
    ]);
    (deps as any).getBondedOwnerIds = async () => new Set(["b"]);
    const clusters = await generateDiscoveryClusters(deps, {
      seedTopics: ["wasm"],
      minClusterSize: 2,
    });
    expect(clusters.length).toBe(1);
    expect(clusters[0].peers.length).toBe(2);
    expect(clusters[0].peers.every((p: DiscoveryPeer) => p.ownerId !== "b")).toBe(true);
  });

  it("respects minClusterSize", async () => {
    const deps = await makeDeps([
      { ownerId: "a", topics: ["wasm"], capabilities: [], isBonded: false },
      { ownerId: "b", topics: ["wasm"], capabilities: [], isBonded: false },
    ]);
    const clusters = await generateDiscoveryClusters(deps, {
      seedTopics: ["wasm"],
      minClusterSize: 5,
    });
    expect(clusters).toHaveLength(0);
  });

  it("deduplicates overlapping clusters", async () => {
    const deps = await makeDeps([
      { ownerId: "a", topics: ["wasm"], capabilities: [], isBonded: false },
      { ownerId: "b", topics: ["wasm"], capabilities: [], isBonded: false },
      { ownerId: "c", topics: ["wasm"], capabilities: [], isBonded: false },
    ]);
    const clusters = await generateDiscoveryClusters(deps, {
      seedTopics: ["wasm"],
      minClusterSize: 3,
    });
    expect(clusters.length).toBe(1);
  });

  it("respects maxClusters", async () => {
    const deps = await makeDeps([
      { ownerId: "a", topics: ["wasm"], capabilities: [], isBonded: false },
      { ownerId: "b", topics: ["wasm", "rust"], capabilities: [], isBonded: false },
      { ownerId: "c", topics: ["wasm", "python"], capabilities: [], isBonded: false },
      { ownerId: "d", topics: ["rust"], capabilities: [], isBonded: false },
      { ownerId: "e", topics: ["rust"], capabilities: [], isBonded: false },
      { ownerId: "f", topics: ["rust"], capabilities: [], isBonded: false },
    ]);
    const clusters = await generateDiscoveryClusters(deps, {
      seedTopics: ["wasm", "rust"],
      minClusterSize: 3,
      maxClusters: 1,
    });
    expect(clusters.length).toBeLessThanOrEqual(1);
  });

  it("includes capabilities in topic matching", async () => {
    const deps = await makeDeps([
      { ownerId: "a", topics: [], capabilities: ["rust_reviewer"], isBonded: false },
      { ownerId: "b", topics: [], capabilities: ["rust_reviewer"], isBonded: false },
      { ownerId: "c", topics: [], capabilities: ["rust_reviewer"], isBonded: false },
    ]);
    const clusters = await generateDiscoveryClusters(deps, {
      seedCapabilities: ["rust_reviewer"],
      minClusterSize: 3,
    });
    expect(clusters.length).toBe(1);
    expect(clusters[0].topicTags[0]).toBe("rust_reviewer");
  });
});

describe("formatDiscoverySuggestions", () => {
  it("returns fallback for empty clusters", () => {
    const result = formatDiscoverySuggestions([]);
    expect(result).toContain("No affinity clusters found");
  });

  it("formats single cluster", () => {
    const result = formatDiscoverySuggestions([
      {
        label: "WASM Group",
        peers: [
          { ownerId: "a", displayName: "Alice", topics: ["wasm"], capabilities: [], isBonded: false },
          { ownerId: "b", displayName: "Bob", topics: ["wasm"], capabilities: [], isBonded: false },
          { ownerId: "c", topics: ["wasm"], capabilities: [], isBonded: false },
        ],
        topicTags: ["wasm"],
        score: 0.3,
        reason: "3 people discovered",
      },
    ]);
    expect(result).toContain("WASM Group");
    expect(result).toContain("Alice");
    expect(result).toContain("Want me to introduce you");
  });
});
