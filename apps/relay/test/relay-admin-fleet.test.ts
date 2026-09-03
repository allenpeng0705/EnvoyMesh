import { describe, expect, it } from "vitest";
import {
  DEFAULT_ENVOY_COMMUNITY_RELAY_BOOTSTRAP_ADDR,
  peerIdFromBootstrapMultiaddr,
} from "@envoymesh/api";
import { buildRelayAdminFleetSnapshot } from "../src/relay-admin-fleet.js";
import { createInitialStandaloneRelayHealthState } from "../src/relay-health.js";

const CN_PEER = peerIdFromBootstrapMultiaddr(DEFAULT_ENVOY_COMMUNITY_RELAY_BOOTSTRAP_ADDR)!;

describe("buildRelayAdminFleetSnapshot", () => {
  it("includes community presets, fleet document, and self", () => {
    const snap = buildRelayAdminFleetSnapshot({
      selfPeerId: "12D3KooWSelfRelay0000000000000000000",
      advertiseAddrs: ["/ip4/1.2.3.4/tcp/4001/p2p/12D3KooWSelfRelay0000000000000000000"],
      listenAddrs: [],
      publicMode: true,
      connectedPeerIds: [CN_PEER],
      fleetDocument: {
        v: 1,
        fleetId: "test-fleet",
        issuedAt: "2026-01-01T00:00:00.000Z",
        expiresAt: "2027-01-01T00:00:00.000Z",
        maxActiveTargets: 4,
        relays: [
          {
            id: "cn-relay",
            peerId: CN_PEER,
            multiaddrs: [DEFAULT_ENVOY_COMMUNITY_RELAY_BOOTSTRAP_ADDR],
            region: "cn",
            role: "hub",
            priority: 100,
            enabled: true,
          },
        ],
      },
      relayBook: [
        {
          relayId: "12D3KooWSibling00000000000000000000",
          addrs: ["/ip4/9.9.9.9/tcp/4001/p2p/12D3KooWSibling00000000000000000000"],
          relation: "sibling",
          state: "verified",
          lastVerifiedAt: Date.now(),
          expiresAt: Date.now() + 60_000,
          failureCount: 0,
        },
      ],
      rosterRegion: "test-region",
      health: {
        status: "healthy",
        checkedAt: new Date().toISOString(),
        uptimeMs: 1000,
        reasons: [],
        actions: ["none"],
        listenAddrCount: 1,
        connectedRelayPeerCount: 1,
        eventLoopLagMs: 2,
        consecutiveGossipFailures: 0,
        gossipStallRestartCount: 0,
        recentFatalErrorCount: 0,
        recoveryCounters: createInitialStandaloneRelayHealthState().counters,
      },
    });

    expect(snap.fleetDocument?.fleetId).toBe("test-fleet");
    expect(snap.relays.some((r) => r.isSelf)).toBe(true);
    expect(snap.relays.some((r) => r.peerId === CN_PEER && r.connected)).toBe(true);
    expect(snap.relays.some((r) => r.peerId === "12D3KooWSibling00000000000000000000")).toBe(true);
    const self = snap.relays.find((r) => r.isSelf);
    expect(self?.region).toBe("test-region");
  });
});
