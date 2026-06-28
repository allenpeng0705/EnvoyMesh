import { describe, expect, it, vi, beforeEach } from "vitest";
import { buildChatDiagnostics } from "../src/chat-diagnostics.js";
import { resetRelayDiagnosticsSnapshot, recordRelayCheckinCycle, recordRelayLookupResult } from "../src/relay-diagnostics-state.js";

describe("buildChatDiagnostics", () => {
  beforeEach(() => {
    resetRelayDiagnosticsSnapshot();
  });

  it("reports missing relay cycles and contact dial hints", async () => {
    recordRelayCheckinCycle({
      source: "node-service",
      targets: ["/ip4/47.93.11.212/tcp/4001/p2p/relay"],
      results: [{ target: "/ip4/47.93.11.212/tcp/4001/p2p/relay", ok: true }],
    });
    recordRelayLookupResult({
      source: "node-service",
      targets: ["/ip4/47.93.11.212/tcp/4001/p2p/relay"],
      ok: true,
      peerCount: 2,
      circuitAddrsStored: 3,
    });

    const mesh = {
      peerId: "12D3KooWLocal",
      multiaddrs: ["/ip4/127.0.0.1/tcp/0"],
      getConnectionStats: () => ({
        totalPeerIds: 4,
        totalConnections: 5,
        circuitPeerIds: ["12D3KooWRelayHop"],
        circuitConnections: 1,
      }),
      getPeerConnectionInfo: () => ({ connected: false, direct: false }),
    };

    const diagnostics = await buildChatDiagnostics({
      mesh: mesh as never,
      nodeOnline: true,
      localPeerId: mesh.peerId,
      profileDir: "/tmp/profile",
      config: {
        version: "0.1",
        profileDir: "/tmp/profile",
        discoveryProfile: "wan-default",
        relayEnabled: true,
        relayServerEnabled: false,
        advertiseAddrs: [],
        bootstrapPeers: ["/ip4/47.93.11.212/tcp/4001/p2p/relay"],
        bootstrapPresets: ["cn-relay"],
        configuredRelays: [],
        modelProviders: { mode: "mock" },
        chatAssistEnabled: false,
        contactAiPreferences: [],
        updatedAt: new Date().toISOString(),
      },
      relayEnabled: true,
      relayClientSchedulerActive: true,
      relayBootstrapPeers: ["/ip4/47.93.11.212/tcp/4001/p2p/relay"],
      configStore: {
        load: vi.fn().mockResolvedValue(undefined),
        save: vi.fn(),
        exists: vi.fn(),
      },
      peerDirectoryStore: {
        getPeerByOwnerId: vi.fn().mockResolvedValue({
          ownerId: "envoy:owner:abc",
          peerId: "12D3KooWRemote",
          listenAddrs: ["/ip4/192.168.1.5/tcp/4001/p2p/12D3KooWRemote"],
        }),
        listPeerRecords: vi.fn().mockResolvedValue([]),
      } as never,
      discoverySeedStore: {
        listSeedAddrs: vi.fn().mockResolvedValue([
          "/ip4/47.93.11.212/tcp/4001/p2p/relay/p2p-circuit/p2p/12D3KooWRemote",
        ]),
      } as never,
      peerOwnerId: "envoy:owner:abc",
    });

    expect(diagnostics.lastRelayLookup?.peerCount).toBe(2);
    expect(diagnostics.connectionStats.circuitPeers).toBe(1);
    expect(diagnostics.contact?.peerFound).toBe(true);
    expect(diagnostics.contact?.dialHintCount).toBeGreaterThan(0);
    expect(diagnostics.contact?.sampleDialHints.some((h) => h.includes("/tcp/"))).toBe(true);
    expect(diagnostics.hints.length).toBeGreaterThan(0);
  });
});
