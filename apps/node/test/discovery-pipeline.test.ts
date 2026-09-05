/**
 * Unit tests for handleMeshPeerDiscoveredViaRuntime — the function that
 * runs when a peer is discovered via libp2p (mDNS, DHT, bootstrap).
 *
 * Validates:
 * - No pending peer:discovered placeholder (avoids Discover UI flash)
 * - Infrastructure filtering (bootstrap / relay peers excluded from UI)
 * - Self-peer exclusion
 * - Background bookkeeping (seed store, peer directory, dial hints)
 * - Probe dispatch for non-infrastructure peers
 */
import { describe, expect, it, vi } from "vitest";
import type { ReachabilityContext } from "../src/node-service-reachability.js";
import { handleMeshPeerDiscoveredViaRuntime } from "../src/node-service-reachability.js";
import { NON_ENVOY_PEER_SUPPRESS_AFTER_FAILURES, NON_ENVOY_PEER_SUPPRESS_COOLDOWN_MS } from "../src/node-service-reachability.js";
import { NEARBY_PROFILE_PROBE_COOLDOWN_MS } from "../src/node-service-identity.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockContext(overrides: Partial<ReachabilityContext> = {}): ReachabilityContext {
  return {
    getNodeStatus: () => "running",
    getReachableMesh: () => undefined,
    getInternalMesh: () => undefined,
    getProfile: () => undefined,
    peerDirectoryStore: {
      mergeListenAddrsForPeerId: vi.fn().mockResolvedValue(undefined),
    } as any,
    trustStore: {} as any,
    getDiscoverySeedStore: () => ({
      upsertMany: vi.fn().mockResolvedValue(undefined),
    }),
    loadConfig: vi.fn().mockResolvedValue({ discoveryProfile: "wan-default" }),
    getBonds: vi.fn().mockResolvedValue([]),
    resolveLibp2pPeerForBondOwner: vi.fn().mockResolvedValue(undefined),
    resolvePeerTransportForOwner: vi.fn().mockResolvedValue(undefined),
    warmContactConnection: vi.fn().mockResolvedValue({} as any),
    getPeerConnectionInfo: vi.fn().mockResolvedValue({} as any),
    probeNearbyPeerProfileAfterDiscovery: vi.fn().mockResolvedValue(undefined),
    maybeFireLanAutoBond: vi.fn().mockResolvedValue(undefined),
    emit: vi.fn(),
    getBondWarmTimer: () => undefined,
    setBondWarmTimer: vi.fn(),
    getLastBondWarmAt: () => new Map(),
    getBootstrapPeerIds: () => new Set<string>(),
    getNearbyProfileProbeLastAt: () => new Map(),
    getNearbyProfileProbeCooldownMs: () => NEARBY_PROFILE_PROBE_COOLDOWN_MS,
    isNonEnvoyPeerSuppressed: () => false,
    markNonEnvoyPeerFailed: vi.fn(),
    resetNonEnvoyPeerFailCount: vi.fn(),
    flushFeedNotifyOutbox: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

const LAN_MULTIADDRS = ["/ip4/192.168.1.5/tcp/4001/p2p/12D3KooWPeerA"];
const PUBLIC_MULTIADDRS = ["/ip4/203.0.113.1/tcp/4001/p2p/12D3KooWPeerB"];
const CIRCUIT_MULTIADDRS = [
  "/ip4/203.0.113.1/tcp/4001/p2p/12D3KooWRelay/p2p-circuit/p2p/12D3KooWPeerC",
];
const LOOPBACK_MULTIADDRS = ["/ip4/127.0.0.1/tcp/4001/p2p/12D3KooWSelf"];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("handleMeshPeerDiscoveredViaRuntime", () => {
  // ---- No pending placeholder (avoids Discover page flash) ----------------

  it("does not emit a pending peer:discovered placeholder", async () => {
    const ctx = mockContext();
    await handleMeshPeerDiscoveredViaRuntime(ctx, "12D3KooWPeerA", LAN_MULTIADDRS);

    expect(ctx.emit).not.toHaveBeenCalled();
    expect(ctx.probeNearbyPeerProfileAfterDiscovery).toHaveBeenCalledWith(
      "12D3KooWPeerA",
      LAN_MULTIADDRS,
    );
  });

  it("still dispatches probe for LAN peers (result emitted by probe)", async () => {
    const probe = vi.fn().mockResolvedValue(undefined);
    const ctx = mockContext({ probeNearbyPeerProfileAfterDiscovery: probe });
    await handleMeshPeerDiscoveredViaRuntime(ctx, "12D3KooWPeerA", LAN_MULTIADDRS);
    expect(probe).toHaveBeenCalledTimes(1);
  });

  // ---- Infrastructure filtering -------------------------------------------

  it("does NOT emit for bootstrap infrastructure peer", async () => {
    const ctx = mockContext({
      getBootstrapPeerIds: () => new Set(["12D3KooWBoot"]),
    });
    await handleMeshPeerDiscoveredViaRuntime(ctx, "12D3KooWBoot", PUBLIC_MULTIADDRS);

    expect(ctx.emit).not.toHaveBeenCalled();
  });

  it("does NOT emit for relay-sourced peer", async () => {
    const ctx = mockContext();
    await handleMeshPeerDiscoveredViaRuntime(ctx, "12D3KooWPeerC", CIRCUIT_MULTIADDRS);

    expect(ctx.emit).not.toHaveBeenCalled();
  });

  // ---- Self-peer exclusion ----------------------------------------------

  it("does NOT emit for self-peer", async () => {
    const ctx = mockContext({
      getReachableMesh: () =>
        ({ peerId: "12D3KooWSelf" }) as any,
      getProfile: () => ({ owner: {} }) as any,
    });
    await handleMeshPeerDiscoveredViaRuntime(ctx, "12D3KooWSelf", LOOPBACK_MULTIADDRS);

    expect(ctx.emit).not.toHaveBeenCalled();
  });

  // ---- Background bookkeeping (LAN / relay only; not anonymous DHT) ----

  it("does NOT persist seed store for bootstrap peer on public DHT addrs", async () => {
    const seedStore = { upsertMany: vi.fn().mockResolvedValue(undefined) };
    const ctx = mockContext({
      getDiscoverySeedStore: () => seedStore,
      getBootstrapPeerIds: () => new Set(["12D3KooWBoot"]),
    });
    await handleMeshPeerDiscoveredViaRuntime(ctx, "12D3KooWBoot", PUBLIC_MULTIADDRS);

    expect(seedStore.upsertMany).not.toHaveBeenCalled();
    expect(ctx.emit).not.toHaveBeenCalled();
  });

  it("still persists seed store for infrastructure relay-sourced peers", async () => {
    const seedStore = { upsertMany: vi.fn().mockResolvedValue(undefined) };
    const ctx = mockContext({
      getDiscoverySeedStore: () => seedStore,
      getBootstrapPeerIds: () => new Set(["12D3KooWRelay"]),
    });
    await handleMeshPeerDiscoveredViaRuntime(ctx, "12D3KooWPeerC", CIRCUIT_MULTIADDRS);

    expect(seedStore.upsertMany).toHaveBeenCalledTimes(1);
    expect(ctx.emit).not.toHaveBeenCalled();
  });

  it("does NOT merge peer directory for bootstrap peer on public DHT addrs", async () => {
    const mergeFn = vi.fn().mockResolvedValue(undefined);
    const ctx = mockContext({
      peerDirectoryStore: { mergeListenAddrsForPeerId: mergeFn } as any,
      getBootstrapPeerIds: () => new Set(["12D3KooWBoot"]),
    });
    await handleMeshPeerDiscoveredViaRuntime(ctx, "12D3KooWBoot", PUBLIC_MULTIADDRS);

    expect(mergeFn).not.toHaveBeenCalled();
    expect(ctx.emit).not.toHaveBeenCalled();
  });

  it("still merges peer directory listen addrs for relay-sourced peers", async () => {
    const mergeFn = vi.fn().mockResolvedValue(undefined);
    const ctx = mockContext({
      peerDirectoryStore: { mergeListenAddrsForPeerId: mergeFn } as any,
    });
    await handleMeshPeerDiscoveredViaRuntime(ctx, "12D3KooWPeerC", CIRCUIT_MULTIADDRS);

    expect(mergeFn).toHaveBeenCalledWith("12D3KooWPeerC", CIRCUIT_MULTIADDRS);
    expect(ctx.emit).not.toHaveBeenCalled();
  });

  it("merges dial hints via reachable mesh for non-infrastructure peers", async () => {
    const mergeHints = vi.fn().mockResolvedValue(undefined);
    const mesh = {
      mergePeerStoreDialHints: mergeHints,
    } as any;
    const ctx = mockContext({ getReachableMesh: () => mesh });
    await handleMeshPeerDiscoveredViaRuntime(ctx, "12D3KooWPeerA", LAN_MULTIADDRS);

    expect(mergeHints).toHaveBeenCalledWith("12D3KooWPeerA", expect.any(Array));
  });

  it("keeps same-subnet tcp/0 mDNS listen addrs in peerstore (Relay→Direct)", async () => {
    const mergeHints = vi.fn().mockResolvedValue(undefined);
    const ephemeralLan = ["/ip4/192.168.1.5/tcp/57944/p2p/12D3KooWPeerA"];
    const mesh = {
      multiaddrs: ["/ip4/192.168.1.10/tcp/4001"],
      mergePeerStoreDialHints: mergeHints,
    } as any;
    const ctx = mockContext({ getReachableMesh: () => mesh });
    await handleMeshPeerDiscoveredViaRuntime(ctx, "12D3KooWPeerA", ephemeralLan);

    expect(mergeHints).toHaveBeenCalledWith("12D3KooWPeerA", ephemeralLan);
  });

  // ---- Probe dispatch --------------------------------------------------

  it("calls probeNearbyPeerProfileAfterDiscovery for non-infrastructure peer", async () => {
    const probe = vi.fn().mockResolvedValue(undefined);
    const ctx = mockContext({ probeNearbyPeerProfileAfterDiscovery: probe });
    await handleMeshPeerDiscoveredViaRuntime(ctx, "12D3KooWPeerA", LAN_MULTIADDRS);

    expect(probe).toHaveBeenCalledTimes(1);
    expect(probe).toHaveBeenCalledWith("12D3KooWPeerA", LAN_MULTIADDRS);
  });

  it("does NOT call probeNearbyPeerProfileAfterDiscovery for infrastructure peer", async () => {
    const probe = vi.fn().mockResolvedValue(undefined);
    const ctx = mockContext({
      probeNearbyPeerProfileAfterDiscovery: probe,
      getBootstrapPeerIds: () => new Set(["12D3KooWBoot"]),
    });
    await handleMeshPeerDiscoveredViaRuntime(ctx, "12D3KooWBoot", PUBLIC_MULTIADDRS);

    expect(probe).not.toHaveBeenCalled();
  });

  it("does NOT call maybeFireLanAutoBond directly (moved to probe success path)", async () => {
    const autoBond = vi.fn().mockResolvedValue(undefined);
    const ctx = mockContext({ maybeFireLanAutoBond: autoBond });
    await handleMeshPeerDiscoveredViaRuntime(ctx, "12D3KooWPeerA", LAN_MULTIADDRS);

    // Auto-bond now fires inside _probeNearbyPeerProfileAfterDiscovery on
    // probe success — not from the discovery handler directly.
    expect(autoBond).not.toHaveBeenCalled();
  });

  // ---- Probe suppression --------------------------------------------

  it("skips probe when peer was recently probed (within cooldown)", async () => {
    const probeLastAt = new Map<string, number>();
    probeLastAt.set("12D3KooWPeerA", Date.now() - 5000); // 5s ago
    const probe = vi.fn().mockResolvedValue(undefined);
    const ctx = mockContext({
      getNearbyProfileProbeLastAt: () => probeLastAt,
      probeNearbyPeerProfileAfterDiscovery: probe,
    });

    await handleMeshPeerDiscoveredViaRuntime(ctx, "12D3KooWPeerA", LAN_MULTIADDRS);

    expect(ctx.emit).not.toHaveBeenCalled();
    expect(probe).not.toHaveBeenCalled();
  });

  it("force=true re-probes even within cooldown (Discover refresh)", async () => {
    const probeLastAt = new Map<string, number>();
    probeLastAt.set("12D3KooWPeerA", Date.now() - 5000);
    const probe = vi.fn().mockResolvedValue(undefined);
    const ctx = mockContext({
      getNearbyProfileProbeLastAt: () => probeLastAt,
      probeNearbyPeerProfileAfterDiscovery: probe,
    });

    await handleMeshPeerDiscoveredViaRuntime(ctx, "12D3KooWPeerA", LAN_MULTIADDRS, {
      force: true,
    });

    expect(probeLastAt.has("12D3KooWPeerA")).toBe(false);
    expect(probe).toHaveBeenCalledWith("12D3KooWPeerA", LAN_MULTIADDRS, { force: true });
  });

  it("force=true re-probes suppressed non-Envoy peers", async () => {
    const failCount = new Map<string, number>();
    failCount.set("12D3KooWPeerA", NON_ENVOY_PEER_SUPPRESS_AFTER_FAILURES);
    const lastFailed = new Map<string, number>();
    lastFailed.set("12D3KooWPeerA", Date.now() - 10_000);
    const probe = vi.fn().mockResolvedValue(undefined);
    const ctx = mockContext({
      isNonEnvoyPeerSuppressed: (peerId) => {
        const count = failCount.get(peerId) ?? 0;
        const at = lastFailed.get(peerId) ?? 0;
        return (
          count >= NON_ENVOY_PEER_SUPPRESS_AFTER_FAILURES &&
          Date.now() - at < NON_ENVOY_PEER_SUPPRESS_COOLDOWN_MS
        );
      },
      probeNearbyPeerProfileAfterDiscovery: probe,
    });

    await handleMeshPeerDiscoveredViaRuntime(ctx, "12D3KooWPeerA", LAN_MULTIADDRS, {
      force: true,
    });

    expect(probe).toHaveBeenCalledWith("12D3KooWPeerA", LAN_MULTIADDRS, { force: true });
  });

  it("allows probe after probe cooldown expires", async () => {
    const probeLastAt = new Map<string, number>();
    probeLastAt.set("12D3KooWPeerA", Date.now() - 40_000); // 40s ago (> 30s cooldown)
    const probe = vi.fn().mockResolvedValue(undefined);
    const ctx = mockContext({
      getNearbyProfileProbeLastAt: () => probeLastAt,
      probeNearbyPeerProfileAfterDiscovery: probe,
    });

    await handleMeshPeerDiscoveredViaRuntime(ctx, "12D3KooWPeerA", LAN_MULTIADDRS);

    expect(ctx.emit).not.toHaveBeenCalled();
    expect(probe).toHaveBeenCalledWith("12D3KooWPeerA", LAN_MULTIADDRS);
  });

  it("skips probe for suppressed non-Envoy peer (3+ failures, within suppress cooldown)", async () => {
    const failCount = new Map<string, number>();
    failCount.set("12D3KooWPeerA", NON_ENVOY_PEER_SUPPRESS_AFTER_FAILURES);
    const lastFailed = new Map<string, number>();
    lastFailed.set("12D3KooWPeerA", Date.now() - 10_000); // 10s ago (< 5min)
    const probe = vi.fn().mockResolvedValue(undefined);
    const ctx = mockContext({
      probeNearbyPeerProfileAfterDiscovery: probe,
      isNonEnvoyPeerSuppressed: (peerId) => {
        const count = failCount.get(peerId) ?? 0;
        if (count < NON_ENVOY_PEER_SUPPRESS_AFTER_FAILURES) return false;
        const last = lastFailed.get(peerId) ?? 0;
        return Date.now() - last < NON_ENVOY_PEER_SUPPRESS_COOLDOWN_MS;
      },
    });

    await handleMeshPeerDiscoveredViaRuntime(ctx, "12D3KooWPeerA", LAN_MULTIADDRS);

    expect(ctx.emit).not.toHaveBeenCalled();
    expect(probe).not.toHaveBeenCalled();
  });

  it("allows probe for suppressed peer after suppress cooldown expires", async () => {
    const failCount = new Map<string, number>();
    failCount.set("12D3KooWPeerA", NON_ENVOY_PEER_SUPPRESS_AFTER_FAILURES);
    const lastFailed = new Map<string, number>();
    lastFailed.set("12D3KooWPeerA", Date.now() - 400_000); // 400s ago (> 5min)
    const probe = vi.fn().mockResolvedValue(undefined);
    const ctx = mockContext({
      probeNearbyPeerProfileAfterDiscovery: probe,
      isNonEnvoyPeerSuppressed: (peerId) => {
        const count = failCount.get(peerId) ?? 0;
        if (count < NON_ENVOY_PEER_SUPPRESS_AFTER_FAILURES) return false;
        const last = lastFailed.get(peerId) ?? 0;
        return Date.now() - last < NON_ENVOY_PEER_SUPPRESS_COOLDOWN_MS;
      },
    });

    await handleMeshPeerDiscoveredViaRuntime(ctx, "12D3KooWPeerA", LAN_MULTIADDRS);

    expect(ctx.emit).not.toHaveBeenCalled();
    expect(probe).toHaveBeenCalledWith("12D3KooWPeerA", LAN_MULTIADDRS);
  });

  it("still does bookkeeping even when peer is suppressed", async () => {
    const mergeFn = vi.fn().mockResolvedValue(undefined);
    const seedStore = { upsertMany: vi.fn().mockResolvedValue(undefined) };
    const ctx = mockContext({
      peerDirectoryStore: { mergeListenAddrsForPeerId: mergeFn } as any,
      getDiscoverySeedStore: () => seedStore,
      isNonEnvoyPeerSuppressed: () => true,
    });

    await handleMeshPeerDiscoveredViaRuntime(ctx, "12D3KooWPeerA", LAN_MULTIADDRS);

    // Bookkeeping runs regardless of suppression
    expect(seedStore.upsertMany).toHaveBeenCalledTimes(1);
    expect(mergeFn).toHaveBeenCalledWith("12D3KooWPeerA", LAN_MULTIADDRS);
    // But no placeholder is emitted
    expect(ctx.emit).not.toHaveBeenCalled();
  });
});
