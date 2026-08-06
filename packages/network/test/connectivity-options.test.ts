import { describe, expect, it } from "vitest";
import { EnvoyMesh, pruneThresholdForMaxConnections, PRUNE_EXCESS_SWARM_MAX_PEERS } from "../src/index.js";

describe("EnvoyMesh connectivity options", () => {
  it("reports enabled local and wide-area connectivity features", () => {
    const mesh = new EnvoyMesh({
      enableMdns: true,
      enableDht: true,
      bootstrapPeers: ["/ip4/127.0.0.1/tcp/4001/p2p/peer-a"],
      enableRelay: true,
      enableRelayServer: true,
      enableAutoNat: true,
      enableDcutr: true,
      enableQuic: true,
      enableP2pDebug: true,
    });

    expect(mesh.enabledFeatures).toEqual([
      "mdns",
      "bootstrap",
      "dht",
      "relay-transport",
      "relay-server",
      "autonat",
      "dcutr",
      "quic",
      "p2p-debug",
    ]);
  });

  it("keeps mDNS disabled when requested", () => {
    const mesh = new EnvoyMesh({
      enableMdns: false,
      enableDht: true,
    });

    expect(mesh.enabledFeatures).toEqual(["dht"]);
  });

  it("getRoutingTableSize returns -1 before start() (no node yet)", () => {
    // -1 = "unknown / not introspectable". The capability-discovery cycle
    // treats -1 as "don't skip" (let the provide + its own timeout handle it);
    // only a definitive 0 triggers the early-exit. So the contract here is:
    // before start(), report -1, NOT 0, so we never falsely skip provides.
    const mesh = new EnvoyMesh({ enableDht: true });
    expect(mesh.getRoutingTableSize()).toBe(-1);
  });

  it("getRoutingTableSize returns -1 when DHT is disabled", () => {
    const mesh = new EnvoyMesh({ enableDht: false });
    expect(mesh.getRoutingTableSize()).toBe(-1);
  });

  it("lists reachability-log when dedicated reachability console logging is on", () => {
    const mesh = new EnvoyMesh({
      enableMdns: false,
      enableReachabilityLog: true,
      enableRelay: false,
      enableRelayServer: false,
      enableDht: false,
    });

    expect(mesh.enabledFeatures).toContain("reachability-log");
    expect(mesh.enabledFeatures).not.toContain("mdns");
  });
});

describe("pruneThresholdForMaxConnections (C1)", () => {
  it("tracks maxConnections minus an 8-slot headroom", () => {
    // quietWan = 24 → prune at 16 (don't over-prune legitimate LAN peers)
    expect(pruneThresholdForMaxConnections(24)).toBe(16);
    // optimized/normal = 48 → prune at 40
    expect(pruneThresholdForMaxConnections(48)).toBe(40);
    // smart = 40 → prune at 32
    expect(pruneThresholdForMaxConnections(40)).toBe(32);
  });

  it("floors at 8 so a very-low cap doesn't prune below viability", () => {
    expect(pruneThresholdForMaxConnections(10)).toBe(8);
    expect(pruneThresholdForMaxConnections(4)).toBe(8);
  });

  it("falls back to the fixed default when maxConnections is unknown", () => {
    expect(pruneThresholdForMaxConnections(undefined)).toBe(PRUNE_EXCESS_SWARM_MAX_PEERS);
    expect(pruneThresholdForMaxConnections(0)).toBe(PRUNE_EXCESS_SWARM_MAX_PEERS);
    expect(pruneThresholdForMaxConnections(-1)).toBe(PRUNE_EXCESS_SWARM_MAX_PEERS);
  });

  it("quietWan threshold (16) is lower than optimized threshold (40)", () => {
    // The point of C1: a quietWan node shouldn't prune at the same 32 threshold
    // as an optimized node — it has a smaller connection budget.
    expect(pruneThresholdForMaxConnections(24)).toBeLessThan(pruneThresholdForMaxConnections(48));
  });
});
