import { describe, expect, it } from "vitest";
import { resolveNodeArgsTargetsByOwnerId } from "../src/owner-targeting.js";

describe("resolveNodeArgsTargetsByOwnerId", () => {
  it("resolves owner targets via peer directory mappings", async () => {
    const resolved = await resolveNodeArgsTargetsByOwnerId(
      {
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
      },
      {
        async listPeerRecords() {
          return [];
        },
        async getPeerByOwnerId(ownerId: string) {
          if (ownerId !== "envoy:owner:alice") {
            return undefined;
          }
          return {
            version: "0.1" as const,
            ownerId,
            peerId: "12D3KooWPeerAlice",
            deviceId: "envoy:device:desktop",
            lastSeenAt: "2026-04-27T00:00:00.000Z",
            listenAddrs: [],
          };
        },
        async mergeListenAddrsForPeerId() {},
        async ensurePeerFromInboundChat() {},
        async upsertPeerFromSignal() {
          throw new Error("not needed");
        },
      },
    );

    expect(resolved.pingTarget).toBe("12D3KooWPeerAlice");
    expect(resolved.discoveryRequestTarget).toBe("12D3KooWPeerAlice");
  });

  it("throws when owner mapping is missing", async () => {
    await expect(
      resolveNodeArgsTargetsByOwnerId(
        {
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
        },
        {
          async listPeerRecords() {
            return [];
          },
          async getPeerByOwnerId() {
            return undefined;
          },
          async mergeListenAddrsForPeerId() {},
          async ensurePeerFromInboundChat() {},
          async upsertPeerFromSignal() {
            throw new Error("not needed");
          },
        },
      ),
    ).rejects.toThrow("No LAN peer mapping found");
  });
});
