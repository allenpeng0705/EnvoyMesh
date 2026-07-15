/**
 * Unit tests for _probeNearbyPeerProfileAfterDiscovery — the background probe
 * that runs after a peer:discovered placeholder is emitted.
 *
 * Validates:
 * - peer:lost emitted when probe returns null (non-EnvoyMesh peer)
 * - peer:discovered emitted with real displayName when probe succeeds
 * - peer:lost emitted when probe throws exception
 * - Early returns when mesh / profile / stores unavailable
 * - Self-peer skip
 * - Cooldown skip (within 30s)
 * - Inflight dedup (concurrent probe skipped)
 * - mesh.dial when not already connected
 * - mesh.dial skipped when already connected
 * - profile:updated emitted before peer:discovered on success
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { IdentityContext } from "../src/node-service-identity.js";
import { _probeNearbyPeerProfileAfterDiscovery } from "../src/node-service-identity.js";

// ---------------------------------------------------------------------------
// Mocked probeNearbyPeerProfile — we override it via vi.mock
// ---------------------------------------------------------------------------
vi.mock("../src/nearby-profile-probe.js", () => ({
  probeNearbyPeerProfile: vi.fn(),
}));

import { probeNearbyPeerProfile } from "../src/nearby-profile-probe.js";
const mockedProbe = vi.mocked(probeNearbyPeerProfile);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PROBE_COOLDOWN_MS = 30_000;

function mockIdentityContext(overrides: Partial<IdentityContext> = {}): IdentityContext {
  const lastAtMap = new Map<string, number>();
  const inflight = new Set<string>();
  const peerDirStore = {
    ensurePeerFromInboundChat: vi.fn().mockResolvedValue(undefined),
  };
  return {
    getProfile: () =>
      ({
        owner: { ownerId: "envoy:owner:self" },
        device: { publicKeyPem: "pk-pem" },
      }) as any,
    requireProfile: () =>
      ({
        owner: { ownerId: "envoy:owner:self" },
        device: { publicKeyPem: "pk-pem" },
      }) as any,
    assertOnline: () => {},
    getMesh: () =>
      ({
        peerId: "12D3KooWSelf",
        getConnectedPeerIds: () => [],
        dial: vi.fn().mockResolvedValue(undefined),
      }) as any,
    getExternalMesh: () => undefined,
    reachableMesh: () =>
      ({
        peerId: "12D3KooWSelf",
        getConnectedPeerIds: () => [],
        dial: vi.fn().mockResolvedValue(undefined),
      }) as any,
    requireMesh: () =>
      ({
        peerId: "12D3KooWSelf",
        getConnectedPeerIds: () => [],
        dial: vi.fn().mockResolvedValue(undefined),
      }) as any,
    getRelayPublicWsUrl: () => undefined,
    getHumanProfileStore: {} as any,
    getPeerReputationStore: () => undefined,
    getReputationAnchorStore: () => undefined,
    getPeerProfileCacheStore: () => ({
      get: vi.fn().mockResolvedValue(undefined),
    }),
    getContactOwnerKeyStore: () => ({
      upsert: vi.fn().mockResolvedValue(undefined),
    }),
    getConfigStore: () => ({ load: vi.fn().mockResolvedValue(null) }),
    getCapabilityManifestStore: () => undefined,
    getVaultDir: () => "/tmp/vault",
    getPeerDirectoryStore: () => peerDirStore,
    getBonds: vi.fn().mockResolvedValue([]),
    requestPeerProfile: vi.fn().mockResolvedValue({ ok: true }),
    refreshCapabilityIndex: vi.fn().mockResolvedValue(undefined),
    emit: vi.fn(),
    dialHintsForChat: vi.fn().mockResolvedValue([]),
    rememberBondedPeerTransportFromInbound: vi.fn().mockResolvedValue(undefined),
    resolveLibp2pPeerForBondOwner: vi.fn().mockResolvedValue(undefined),
    getAgentIdentityStore: () => undefined,
    getAutoAdvertisedDiscoveryTopics: () => [],
    setAutoAdvertisedDiscoveryTopics: vi.fn(),
    getAdvertiseInterestsTimer: () => undefined,
    setAdvertiseInterestsTimer: vi.fn(),
    getNearbyProfileProbeLastAt: () => lastAtMap,
    getNearbyProfileProbeInflight: () => inflight,
    markNonEnvoyPeerFailed: vi.fn(),
    resetNonEnvoyPeerFailCount: vi.fn(),
    ...overrides,
  };
}

const LAN_MULTIADDRS = ["/ip4/192.168.1.5/tcp/4001/p2p/12D3KooWPeerA"];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("_probeNearbyPeerProfileAfterDiscovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedProbe.mockReset();
  });

  // ---- Probe result: success (non-null) --------------------------------

  it("emits profile:updated then peer:discovered when probe succeeds", async () => {
    const enriched = {
      nodeId: "12D3KooWPeerA",
      ownerId: "envoy:owner:alice",
      displayName: "Alice",
      interests: ["ai"],
      profileVisibility: "public" as const,
    };
    mockedProbe.mockResolvedValue(enriched);

    const emit = vi.fn();
    const ctx = mockIdentityContext({ emit });
    await _probeNearbyPeerProfileAfterDiscovery(ctx, "12D3KooWPeerA", LAN_MULTIADDRS);

    // profile:updated first, then peer:discovered
    expect(emit).toHaveBeenCalledTimes(2);
    expect(emit.mock.calls[0][0]).toBe("profile:updated");
    expect(emit.mock.calls[0][1]).toEqual({ ownerId: "envoy:owner:alice" });
    expect(emit.mock.calls[1][0]).toBe("peer:discovered");
    expect(emit.mock.calls[1][1]).toEqual(enriched);
    expect(ctx.resetNonEnvoyPeerFailCount).toHaveBeenCalledWith("12D3KooWPeerA");
    expect(ctx.markNonEnvoyPeerFailed).not.toHaveBeenCalled();
    // Verify the ownerId→peerId mapping is persisted for sendHello resolution.
    const peerDir = ctx.getPeerDirectoryStore();
    expect(peerDir.ensurePeerFromInboundChat).toHaveBeenCalledWith({
      ownerId: "envoy:owner:alice",
      peerId: "12D3KooWPeerA",
      listenAddrs: LAN_MULTIADDRS,
    });
  });

  // ---- Probe result: null (non-EnvoyMesh or unreachable) -----------------

  it("emits peer:lost when probe returns null", async () => {
    mockedProbe.mockResolvedValue(null);

    const emit = vi.fn();
    const ctx = mockIdentityContext({ emit });
    await _probeNearbyPeerProfileAfterDiscovery(ctx, "12D3KooWPeerA", LAN_MULTIADDRS);

    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith("peer:lost", { nodeId: "12D3KooWPeerA" });
    expect(ctx.markNonEnvoyPeerFailed).toHaveBeenCalledWith("12D3KooWPeerA");
    expect(ctx.resetNonEnvoyPeerFailCount).not.toHaveBeenCalled();
  });

  // ---- Probe throws exception -------------------------------------------

  it("emits peer:lost when probe throws exception", async () => {
    mockedProbe.mockRejectedValue(new Error("timeout"));

    const emit = vi.fn();
    const ctx = mockIdentityContext({ emit });
    await _probeNearbyPeerProfileAfterDiscovery(ctx, "12D3KooWPeerA", LAN_MULTIADDRS);

    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith("peer:lost", { nodeId: "12D3KooWPeerA" });
    expect(ctx.markNonEnvoyPeerFailed).toHaveBeenCalledWith("12D3KooWPeerA");
  });

  // ---- Early returns (guards) -------------------------------------------

  it("skips when mesh is not available", async () => {
    const emit = vi.fn();
    const ctx = mockIdentityContext({
      getMesh: () => null,
      emit,
    });
    await _probeNearbyPeerProfileAfterDiscovery(ctx, "12D3KooWPeerA", LAN_MULTIADDRS);

    expect(emit).not.toHaveBeenCalled();
    expect(mockedProbe).not.toHaveBeenCalled();
  });

  it("skips when peerId is self", async () => {
    const emit = vi.fn();
    const ctx = mockIdentityContext({ emit });
    await _probeNearbyPeerProfileAfterDiscovery(ctx, "12D3KooWSelf", LAN_MULTIADDRS);

    expect(emit).not.toHaveBeenCalled();
    expect(mockedProbe).not.toHaveBeenCalled();
  });

  it("skips when profile is null", async () => {
    const emit = vi.fn();
    const ctx = mockIdentityContext({
      getProfile: () => null,
      emit,
    });
    await _probeNearbyPeerProfileAfterDiscovery(ctx, "12D3KooWPeerA", LAN_MULTIADDRS);

    expect(emit).not.toHaveBeenCalled();
    expect(mockedProbe).not.toHaveBeenCalled();
  });

  it("skips when contactOwnerKeyStore is undefined", async () => {
    const emit = vi.fn();
    const ctx = mockIdentityContext({
      getContactOwnerKeyStore: () => undefined,
      emit,
    });
    await _probeNearbyPeerProfileAfterDiscovery(ctx, "12D3KooWPeerA", LAN_MULTIADDRS);

    expect(emit).not.toHaveBeenCalled();
    expect(mockedProbe).not.toHaveBeenCalled();
  });

  it("skips when peerProfileCacheStore is undefined", async () => {
    const emit = vi.fn();
    const ctx = mockIdentityContext({
      getPeerProfileCacheStore: () => undefined,
      emit,
    });
    await _probeNearbyPeerProfileAfterDiscovery(ctx, "12D3KooWPeerA", LAN_MULTIADDRS);

    expect(emit).not.toHaveBeenCalled();
    expect(mockedProbe).not.toHaveBeenCalled();
  });

  // ---- Cooldown ---------------------------------------------------------

  it("respects cooldown — skips second probe within 30s", async () => {
    mockedProbe.mockResolvedValue(null);

    const lastAtMap = new Map<string, number>();
    const now = Date.now();
    lastAtMap.set("12D3KooWPeerA", now - 5000); // 5 seconds ago — within cooldown

    const emit = vi.fn();
    const ctx = mockIdentityContext({
      getNearbyProfileProbeLastAt: () => lastAtMap,
      emit,
    });
    await _probeNearbyPeerProfileAfterDiscovery(ctx, "12D3KooWPeerA", LAN_MULTIADDRS);

    expect(mockedProbe).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });

  // ---- Inflight dedup ----------------------------------------------------

  it("deduplicates inflight probes — skips concurrent probe for same peer", async () => {
    // Make the probe hang so the inflight set still contains the peerId
    let resolveProbe!: (value: any) => void;
    mockedProbe.mockImplementation(() => new Promise((r) => { resolveProbe = r }));

    const inflight = new Set<string>();
    const emit = vi.fn();
    const ctx = mockIdentityContext({
      getNearbyProfileProbeInflight: () => inflight,
      emit,
    });

    // Fire first probe (will hang)
    const firstPromise = _probeNearbyPeerProfileAfterDiscovery(
      ctx,
      "12D3KooWPeerA",
      LAN_MULTIADDRS,
    );
    // Give the microtask queue a chance to add to inflight
    await new Promise((r) => setTimeout(r, 0));

    // Fire second probe — should be skipped because inflight has the peerId
    await _probeNearbyPeerProfileAfterDiscovery(
      ctx,
      "12D3KooWPeerA",
      LAN_MULTIADDRS,
    );
    expect(mockedProbe).toHaveBeenCalledTimes(1); // only called once

    // Clean up: resolve the hanging probe
    resolveProbe(null);
    await firstPromise;
  });

  // ---- Dial logic -------------------------------------------------------

  it("dials peer via mesh.dial when not already connected", async () => {
    mockedProbe.mockResolvedValue(null);
    const dialFn = vi.fn().mockResolvedValue(undefined);
    const mesh = {
      peerId: "12D3KooWSelf",
      getConnectedPeerIds: () => [],
      dial: dialFn,
    } as any;

    const ctx = mockIdentityContext({ getMesh: () => mesh });
    await _probeNearbyPeerProfileAfterDiscovery(ctx, "12D3KooWPeerA", LAN_MULTIADDRS);

    expect(dialFn).toHaveBeenCalledTimes(1);
    expect(dialFn).toHaveBeenCalledWith("/ip4/192.168.1.5/tcp/4001/p2p/12D3KooWPeerA");
  });

  it("skips mesh.dial when already connected", async () => {
    mockedProbe.mockResolvedValue(null);
    const dialFn = vi.fn().mockResolvedValue(undefined);
    const mesh = {
      peerId: "12D3KooWSelf",
      getConnectedPeerIds: () => ["12D3KooWPeerA"],
      dial: dialFn,
    } as any;

    const ctx = mockIdentityContext({ getMesh: () => mesh });
    await _probeNearbyPeerProfileAfterDiscovery(ctx, "12D3KooWPeerA", LAN_MULTIADDRS);

    expect(dialFn).not.toHaveBeenCalled();
  });

  it("falls back to /p2p/<peerId> when no TCP multiaddr found", async () => {
    mockedProbe.mockResolvedValue(null);
    const dialFn = vi.fn().mockResolvedValue(undefined);
    const mesh = {
      peerId: "12D3KooWSelf",
      getConnectedPeerIds: () => [],
      dial: dialFn,
    } as any;

    const wsOnlyAddrs = ["/ip4/192.168.1.5/tcp/4001/ws/p2p/12D3KooWPeerA"];
    const ctx = mockIdentityContext({ getMesh: () => mesh });
    await _probeNearbyPeerProfileAfterDiscovery(ctx, "12D3KooWPeerA", wsOnlyAddrs);

    expect(dialFn).toHaveBeenCalledWith("/p2p/12D3KooWPeerA");
  });
});
