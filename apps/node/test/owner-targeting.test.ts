import { createLocalPeerDirectoryStore } from "@envoymesh/local-store";
import { describe, expect, it, vi } from "vitest";
import { parseNodeArgs } from "../src/args.js";
import { resolveNodeArgsTargetsByOwnerId } from "../src/owner-targeting.js";

/**
 * A complete `NodeArgs` from the parser, with this test's fields on top. The
 * old hand-written literal was frozen at an older field set.
 */
function nodeArgs(overrides: Partial<ReturnType<typeof parseNodeArgs>>): ReturnType<typeof parseNodeArgs> {
  return { ...parseNodeArgs([]), ...overrides };
}

describe("resolveNodeArgsTargetsByOwnerId", () => {
  it("resolves owner targets via peer directory mappings", async () => {
    // The real store, with only the lookup the resolver uses stubbed. A
    // hand-built `LocalPeerDirectoryStore` literal has to re-declare every
    // method the interface has grown, which is what made the old stub stale.
    const store = createLocalPeerDirectoryStore("./data/test");
    vi.spyOn(store, "getPeerByOwnerId").mockImplementation(async (ownerId) =>
      ownerId === "envoy:owner:alice"
        ? {
            version: "0.1",
            ownerId,
            peerId: "12D3KooWPeerAlice",
            deviceId: "envoy:device:desktop",
            lastSeenAt: "2026-04-27T00:00:00.000Z",
            listenAddrs: [],
          }
        : undefined,
    );

    const resolved = await resolveNodeArgsTargetsByOwnerId(
      nodeArgs({
        profileDir: "./data/test",
        listen: [],
        enableMdns: false,
        enableDht: false,
        bootstrapPeers: [],
        enableRelay: false,
        enableRelayServer: false,
        enableAutoNat: false,
        enableDcutr: false,
        p2pDebug: false,
        pingTarget: "envoy:owner:alice",
        discoveryRequestTarget: "envoy:owner:alice",
      }),
      store,
    );

    expect(resolved.pingTarget).toBe("12D3KooWPeerAlice");
    expect(resolved.discoveryRequestTarget).toBe("12D3KooWPeerAlice");
  });

  it("throws when owner mapping is missing", async () => {
    const store = createLocalPeerDirectoryStore("./data/test");
    vi.spyOn(store, "getPeerByOwnerId").mockResolvedValue(undefined);

    await expect(
      resolveNodeArgsTargetsByOwnerId(
        nodeArgs({
          profileDir: "./data/test",
          listen: [],
          enableMdns: false,
          enableDht: false,
          bootstrapPeers: [],
          enableRelay: false,
          enableRelayServer: false,
          enableAutoNat: false,
          enableDcutr: false,
          p2pDebug: false,
          pingTarget: "envoy:owner:unknown",
        }),
        store,
      ),
    ).rejects.toThrow("No LAN peer mapping found");
  });
});
