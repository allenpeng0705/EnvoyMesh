/**
 * Unit tests for the discovery clusterer runtime module.
 *
 * The inner `discovery-clusterer.ts` already has its own tests
 * (`discovery-clusterer.test.ts`). These tests focus on the runtime
 * wrapper — the context-adaptation logic, the empty-input guard, and
 * the way the broadcast deps are wired from the higher-level context.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Hoisted mock registry: factories passed to `vi.mock` run before the
// module under test imports, so the functions they call must be defined
// inside `vi.hoisted` (which is itself hoisted above the imports).
const mocks = vi.hoisted(() => ({
  generateDiscoveryClusters: vi.fn(async (_deps: unknown, _opts: unknown) => [] as unknown[]),
  formatDiscoverySuggestions: vi.fn((_clusters: unknown) => "formatted-suggestions"),
  broadcastDocumentDiscovery: vi.fn(async (_deps: unknown, _opts: unknown) => [] as unknown[]),
  broadcastCapabilityDiscovery: vi.fn(async (_deps: unknown, _opts: unknown) => [] as unknown[]),
}));

vi.mock("../src/discovery-clusterer.js", () => ({
  generateDiscoveryClusters: mocks.generateDiscoveryClusters,
  formatDiscoverySuggestions: mocks.formatDiscoverySuggestions,
}));

vi.mock("../src/document-discovery-broadcast.js", () => ({
  broadcastDocumentDiscovery: mocks.broadcastDocumentDiscovery,
}));

vi.mock("../src/capability-discovery-broadcast.js", () => ({
  broadcastCapabilityDiscovery: mocks.broadcastCapabilityDiscovery,
}));

import {
  discoverAndClusterViaRuntime,
  type DiscoveryClustererContext,
} from "../src/node-service-discovery-clusterer.js";
import type { BondRecord, NodeProfile } from "@envoymesh/api";

function makeProfile(): NodeProfile {
  return {
    owner: { ownerId: "owner-1" },
    device: {
      deviceId: "device-1",
      publicKeyPem: "-----BEGIN PUBLIC KEY-----\nfake\n-----END PUBLIC KEY-----",
      privateKeyPem: "-----BEGIN PRIVATE KEY-----\nfake\n-----END PRIVATE KEY-----",
    },
  } as unknown as NodeProfile;
}

function makeBond(peerOwnerId: string): BondRecord {
  return {
    peerOwnerId,
    displayName: peerOwnerId,
    level: "direct",
  } as unknown as BondRecord;
}

function makeContext(
  overrides: Partial<DiscoveryClustererContext> = {},
): DiscoveryClustererContext {
  return {
    profile: makeProfile(),
    bonds: [],
    ...overrides,
  };
}

describe("node-service-discovery-clusterer", () => {
  beforeEach(() => {
    mocks.generateDiscoveryClusters.mockReset();
    mocks.generateDiscoveryClusters.mockResolvedValue([]);
    mocks.formatDiscoverySuggestions.mockReset();
    mocks.formatDiscoverySuggestions.mockReturnValue("formatted-suggestions");
    mocks.broadcastDocumentDiscovery.mockReset();
    mocks.broadcastDocumentDiscovery.mockResolvedValue([]);
    mocks.broadcastCapabilityDiscovery.mockReset();
    mocks.broadcastCapabilityDiscovery.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns the guidance message when both seeds are empty/undefined", async () => {
    const ctx = makeContext();
    const result = await discoverAndClusterViaRuntime(ctx, {});
    expect(result).toBe(
      "No seed topics or capabilities provided. Tell me what you're interested in discovering.",
    );
    expect(mocks.generateDiscoveryClusters).not.toHaveBeenCalled();
    expect(mocks.formatDiscoverySuggestions).not.toHaveBeenCalled();
  });

  it("returns the guidance message when topics are empty and capabilities are empty array", async () => {
    const ctx = makeContext();
    const result = await discoverAndClusterViaRuntime(ctx, {
      seedTopics: [],
      seedCapabilities: [],
    });
    expect(result).toContain("No seed topics or capabilities");
    expect(mocks.generateDiscoveryClusters).not.toHaveBeenCalled();
  });

  it("forwards seed topics and capabilities to the inner clusterer", async () => {
    const ctx = makeContext();
    await discoverAndClusterViaRuntime(ctx, {
      seedTopics: ["wasm", "rust"],
      seedCapabilities: ["translate", "summarize"],
    });
    expect(mocks.generateDiscoveryClusters).toHaveBeenCalledTimes(1);
    const opts = mocks.generateDiscoveryClusters.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(opts).toEqual({
      seedTopics: ["wasm", "rust"],
      seedCapabilities: ["translate", "summarize"],
    });
  });

  it("flattens bonds into bondedIds via getBondedOwnerIds", async () => {
    const ctx = makeContext({ bonds: [makeBond("a"), makeBond("b")] });
    await discoverAndClusterViaRuntime(ctx, { seedTopics: ["x"] });
    const deps = mocks.generateDiscoveryClusters.mock.calls[0]?.[0] as {
      getBondedOwnerIds: () => Promise<Set<string>>;
    };
    const ids = await deps.getBondedOwnerIds();
    expect(ids).toEqual(new Set(["a", "b"]));
  });

  it("returns whatever formatDiscoverySuggestions produces", async () => {
    mocks.formatDiscoverySuggestions.mockReturnValueOnce(
      "SUGGESTED: join the wasm cluster",
    );
    const ctx = makeContext();
    const result = await discoverAndClusterViaRuntime(ctx, { seedTopics: ["wasm"] });
    expect(result).toBe("SUGGESTED: join the wasm cluster");
  });

  it("broadcast deps pass through to the document / capability broadcast modules", async () => {
    const ctx = makeContext({
      bonds: [makeBond("a")],
      profile: {
        owner: { ownerId: "owner-xyz" },
        device: {
          deviceId: "device-xyz",
          publicKeyPem: "PK",
          privateKeyPem: "PRIV",
        },
      } as unknown as NodeProfile,
    });
    await discoverAndClusterViaRuntime(ctx, { seedTopics: ["x"], seedCapabilities: ["y"] });

    const deps = mocks.generateDiscoveryClusters.mock.calls[0]?.[0] as {
      broadcastDocumentDiscovery: (q: string) => Promise<unknown>;
      broadcastCapabilityDiscovery: (caps: string[]) => Promise<unknown>;
    };

    await deps.broadcastDocumentDiscovery("hello");
    expect(mocks.broadcastDocumentDiscovery).toHaveBeenCalledTimes(1);
    const bdOpts = mocks.broadcastDocumentDiscovery.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(bdOpts).toMatchObject({
      query: "hello",
      maxHops: 2,
      maxResults: 20,
      timeoutMs: 15000,
    });
    const bdDeps = mocks.broadcastDocumentDiscovery.mock.calls[0]?.[0] as {
      profile: { owner: { ownerId: string } };
    };
    expect(bdDeps.profile.owner.ownerId).toBe("owner-xyz");

    await deps.broadcastCapabilityDiscovery(["cap1"]);
    expect(mocks.broadcastCapabilityDiscovery).toHaveBeenCalledTimes(1);
    const bcdOpts = mocks.broadcastCapabilityDiscovery.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(bcdOpts).toMatchObject({ capabilityTags: ["cap1"], maxHops: 2, maxResults: 20 });
  });

  it("normalises result shape from document broadcast into DiscoveryPeer", async () => {
    mocks.broadcastDocumentDiscovery.mockResolvedValueOnce([
      { ownerId: "x", metadata: { title: "Doc X", topics: ["wasm"] } },
      { ownerId: "y" },
    ]);
    const ctx = makeContext({ bonds: [makeBond("x")] });
    await discoverAndClusterViaRuntime(ctx, { seedTopics: ["wasm"] });
    const deps = mocks.generateDiscoveryClusters.mock.calls[0]?.[0] as {
      broadcastDocumentDiscovery: (q: string) => Promise<Array<Record<string, unknown>>>;
    };
    const peers = await deps.broadcastDocumentDiscovery("wasm");
    expect(peers).toEqual([
      { ownerId: "x", displayName: "Doc X", topics: ["wasm"], capabilities: [], isBonded: true },
      { ownerId: "y", displayName: undefined, topics: [], capabilities: [], isBonded: false },
    ]);
  });
});