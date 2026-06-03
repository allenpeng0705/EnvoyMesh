/**
 * Phase 20C — Document Discovery Broadcast tests.
 */
import { describe, expect, it, vi } from "vitest";
import {
  broadcastDocumentDiscovery,
  handleBroadcastDocumentRequest,
  type BroadcastDocumentDiscoveryDeps,
} from "../src/document-discovery-broadcast.js";

function makeDeps(overrides?: Partial<BroadcastDocumentDiscoveryDeps>): BroadcastDocumentDiscoveryDeps {
  return {
    sendToPeer: vi.fn().mockResolvedValue(42),
    getBondedPeers: vi.fn().mockResolvedValue([
      { ownerId: "envoy:owner:bonded1", peerId: "peer-bonded-1" },
      { ownerId: "envoy:owner:bonded2", peerId: "peer-bonded-2" },
    ]),
    getAllKnownPeers: vi.fn().mockResolvedValue([
      { ownerId: "envoy:owner:bonded1", peerId: "peer-bonded-1" },
      { ownerId: "envoy:owner:bonded2", peerId: "peer-bonded-2" },
      { ownerId: "envoy:owner:discovered1", peerId: "peer-disc-1" },
      { ownerId: "envoy:owner:discovered2", peerId: "peer-disc-2" },
    ]),
    signEnvelope: vi.fn().mockImplementation((unsigned: any, _key: string) => ({
      ...unsigned,
      signature: "mock-sig",
    })),
    profile: {
      owner: { ownerId: "envoy:owner:local" },
      device: {
        peerId: "envoy_device_local",
        publicKeyPem: "device-pub",
        privateKeyPem: "device-priv",
      },
    },
    ...overrides,
  };
}

describe("broadcastDocumentDiscovery", () => {
  it("sends to bonded peers only when maxHops <= 1", async () => {
    const sendSpy = vi.fn().mockResolvedValue(42);
    const deps = makeDeps({ sendToPeer: sendSpy });
    const results = await broadcastDocumentDiscovery(deps, {
      query: "distributed systems",
      maxHops: 1,
    });
    // Only bonded peers should receive (2 bonded)
    expect(sendSpy).toHaveBeenCalledTimes(2);
    expect(sendSpy).toHaveBeenCalledWith("peer-bonded-1", expect.anything());
    expect(sendSpy).toHaveBeenCalledWith("peer-bonded-2", expect.anything());
  });

  it("sends to all known peers when maxHops > 1", async () => {
    const sendSpy = vi.fn().mockResolvedValue(42);
    const deps = makeDeps({ sendToPeer: sendSpy });
    const results = await broadcastDocumentDiscovery(deps, {
      query: "TypeScript",
      maxHops: 3,
    });
    // 2 bonded + 2 discovered = 4 total (no duplicates)
    expect(sendSpy).toHaveBeenCalledTimes(4);
  });

  it("does not send duplicates when peer appears in both bonded and all", async () => {
    const sendSpy = vi.fn().mockResolvedValue(42);
    const deps = makeDeps({
      sendToPeer: sendSpy,
      getAllKnownPeers: vi.fn().mockResolvedValue([
        { ownerId: "envoy:owner:bonded1", peerId: "peer-bonded-1" }, // duplicate
        { ownerId: "envoy:owner:new", peerId: "peer-new-1" },
      ]),
    });
    await broadcastDocumentDiscovery(deps, { query: "rust", maxHops: 3 });
    // bonded-1, bonded-2, new-1 = 3 unique
    expect(sendSpy).toHaveBeenCalledTimes(3);
  });

  it("respects maxHops and maxResults params", async () => {
    const sendSpy = vi.fn().mockResolvedValue(42);
    const deps = makeDeps({
      sendToPeer: sendSpy,
      getAllKnownPeers: vi.fn().mockResolvedValue(
        Array.from({ length: 20 }, (_, i) => ({
          ownerId: `envoy:owner:peer${i}`,
          peerId: `peer-${i}`,
        })),
      ),
    });
    // Even with 20 discovered peers, maxResults=5 should limit fan-out
    await broadcastDocumentDiscovery(deps, {
      query: "blockchain",
      maxHops: 3,
      maxResults: 5,
    });
    // 2 bonded + 3 from all-known = 5 total (cap respected)
    expect(sendSpy).toHaveBeenCalledTimes(5);
  });
});

describe("handleBroadcastDocumentRequest", () => {
  it("returns matching documents from published library", async () => {
    const library = [
      { title: "Distributed Systems 101", topics: ["distributed", "systems"], sensitivity: "public" },
      { title: "Rust Programming Guide", topics: ["rust", "programming"], sensitivity: "public" },
      { title: "Private Notes", topics: ["private"], sensitivity: "private" },
    ];
    const results = await handleBroadcastDocumentRequest({
      query: "distributed",
      listPublishedLibrary: vi.fn().mockResolvedValue(library),
    });
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe("Distributed Systems 101");
  });

  it("filters private documents", async () => {
    const library = [
      { title: "Secret Doc", sensitivity: "private" },
    ];
    const results = await handleBroadcastDocumentRequest({
      query: "secret",
      listPublishedLibrary: vi.fn().mockResolvedValue(library),
    });
    expect(results).toHaveLength(0);
  });

  it("filters friends-only docs when requested sensitivity is public", async () => {
    const library = [
      { title: "Friends Only Doc", sensitivity: "friends" },
    ];
    const results = await handleBroadcastDocumentRequest({
      query: "friends",
      requestedSensitivity: "public",
      listPublishedLibrary: vi.fn().mockResolvedValue(library),
    });
    expect(results).toHaveLength(0);
  });

  it("returns friends docs when requested at friends sensitivity", async () => {
    const library = [
      { title: "Friends Only Doc", sensitivity: "friends" },
    ];
    const results = await handleBroadcastDocumentRequest({
      query: "friends",
      requestedSensitivity: "friends",
      listPublishedLibrary: vi.fn().mockResolvedValue(library),
    });
    expect(results).toHaveLength(1);
  });

  it("matches by topic tags", async () => {
    const library = [
      { title: "Some Doc", topics: ["machine-learning", "python"], sensitivity: "public" },
    ];
    const results = await handleBroadcastDocumentRequest({
      query: "machine learning",
      listPublishedLibrary: vi.fn().mockResolvedValue(library),
    });
    expect(results).toHaveLength(1);
    expect(results[0].topics).toContain("machine-learning");
  });

  it("returns empty when no matches", async () => {
    const library = [
      { title: "Rust Guide", topics: ["rust"], sensitivity: "public" },
    ];
    const results = await handleBroadcastDocumentRequest({
      query: "python",
      listPublishedLibrary: vi.fn().mockResolvedValue(library),
    });
    expect(results).toHaveLength(0);
  });
});
