import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  collectKnownRelayAddrs,
  collectRelayControlTargets,
  waitForUsableRelayReservation,
  warmAndWatchRelayReservations,
} from "../src/relay-reservation-health.js";
import { DEFAULT_ENVOY_COMMUNITY_RELAY_BOOTSTRAP_ADDR } from "@envoymesh/api";

describe("collectRelayControlTargets", () => {
  const RELAY_A =
    "/ip4/47.93.11.212/tcp/4001/p2p/12D3KooWLNR4WYWHBswe8ux5zWsy6cuGywnYPJbdbaAbbpmJMjbo";
  const RELAY_B =
    "/ip4/1.2.3.4/tcp/4001/p2p/12D3KooWBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";

  it("merges configuredRelays, cn-relay preset, and bootstrap peers", () => {
    const addrs = collectRelayControlTargets({
      configuredRelays: [{ enabled: true, addr: RELAY_B }],
      bootstrapPresets: ["cn-relay"],
      bootstrapPeers: [RELAY_A],
    });
    expect(addrs).toContain(RELAY_B);
    expect(addrs).toContain(DEFAULT_ENVOY_COMMUNITY_RELAY_BOOTSTRAP_ADDR);
    expect(addrs.length).toBeLessThanOrEqual(4);
  });

  it("caps at 4 and skips DHT bootstraps / circuits", () => {
    const addrs = collectRelayControlTargets({
      configuredRelays: [],
      bootstrapPeers: [
        "/dnsaddr/bootstrap.libp2p.io/p2p/12D3KooWBootstrap",
        RELAY_A,
        RELAY_B,
        "/ip4/9.9.9.9/tcp/4001/p2p/12D3KooWCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC",
        "/ip4/8.8.8.8/tcp/4001/p2p/12D3KooWDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD",
        "/ip4/7.7.7.7/tcp/4001/p2p/12D3KooWEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE",
      ],
    });
    expect(addrs.every((a) => !a.includes("/p2p-circuit/"))).toBe(true);
    expect(addrs.every((a) => !a.includes("bootstrap.libp2p.io"))).toBe(true);
    expect(addrs).toContain(RELAY_A);
    expect(addrs.length).toBe(4);
  });

  it("does not backfill polluted bootstrap peers when configuredRelays is set", () => {
    const addrs = collectRelayControlTargets({
      configuredRelays: [{ enabled: true, addr: RELAY_A }],
      bootstrapPeers: [
        "/ip4/192.168.3.85/tcp/64589/p2p/12D3KooWQsD3ougrAJjmKeevSiY2azE5CKqLjcijyYreS6fUFYCR",
        RELAY_B,
      ],
    });
    expect(addrs).toEqual([RELAY_A]);
  });

  it("skips private LAN multiaddrs as reservation targets", () => {
    const addrs = collectRelayControlTargets({
      configuredRelays: [],
      bootstrapPeers: [
        "/ip4/192.168.3.85/tcp/4001/p2p/12D3KooWLANRELAYXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
        RELAY_A,
      ],
    });
    expect(addrs).toEqual([RELAY_A]);
  });

  it("falls back to community cn-relay when filters leave no targets", () => {
    const addrs = collectRelayControlTargets({
      configuredRelays: [],
      bootstrapPeers: [
        "/ip4/192.168.3.85/tcp/4001/p2p/12D3KooWLANONLYXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
        "/dnsaddr/bootstrap.libp2p.io/p2p/12D3KooWBootstrap",
        "/ip4/1.2.3.4/tcp/4001/p2p/12D3KooWPeer/p2p-circuit/p2p/12D3KooWOther",
      ],
      bootstrapPresets: [],
    });
    expect(addrs).toEqual([DEFAULT_ENVOY_COMMUNITY_RELAY_BOOTSTRAP_ADDR]);
  });

  it("is used by collectKnownRelayAddrs (reserve parity)", () => {
    const config = {
      configuredRelays: [{ enabled: true, addr: RELAY_A }],
      bootstrapPresets: ["cn-relay"] as string[],
      bootstrapPeers: [] as string[],
    };
    expect(collectKnownRelayAddrs(config)).toEqual(collectRelayControlTargets(config));
  });
});

describe("collectKnownRelayAddrs", () => {
  const RELAY =
    "/ip4/47.93.11.212/tcp/4001/p2p/12D3KooWLNR4WYWHBswe8ux5zWsy6cuGywnYPJbdbaAbbpmJMjbo";

  it("prefers configuredRelays and adds cn-relay when preset/bootstrap present", () => {
    const addrs = collectKnownRelayAddrs({
      configuredRelays: [{ enabled: true, addr: RELAY }],
      bootstrapPresets: ["cn-relay"],
      bootstrapPeers: [],
    });
    expect(addrs).toContain(RELAY);
  });

  it("adds community relay from bootstrap peers when not configured", () => {
    const addrs = collectKnownRelayAddrs({
      configuredRelays: [],
      bootstrapPeers: [DEFAULT_ENVOY_COMMUNITY_RELAY_BOOTSTRAP_ADDR],
      bootstrapPresets: ["cn-relay"],
    });
    expect(addrs).toContain(DEFAULT_ENVOY_COMMUNITY_RELAY_BOOTSTRAP_ADDR);
  });

  it("skips circuit multiaddrs and public DHT bootstraps", () => {
    const addrs = collectKnownRelayAddrs({
      configuredRelays: [
        {
          enabled: true,
          addr: `${RELAY}/p2p-circuit/p2p/12D3KooWHome`,
        },
      ],
      bootstrapPeers: [
        "/dnsaddr/bootstrap.libp2p.io/p2p/12D3KooWBootstrap",
        RELAY,
      ],
    });
    expect(addrs.every((a) => !a.includes("/p2p-circuit/"))).toBe(true);
    expect(addrs.every((a) => !a.includes("bootstrap.libp2p.io"))).toBe(true);
    expect(addrs).toContain(RELAY);
  });
});
describe("warmAndWatchRelayReservations", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("skips when relay reservation disabled", async () => {
    const mesh = {
      eagerConnectToRelays: vi.fn(),
      requestRelayReservation: vi.fn(),
      startRelayReservationHealthLoop: vi.fn(),
    };
    const out = await warmAndWatchRelayReservations(mesh as never, {
      relayEnabled: true,
      relayReservationEnabled: false,
      configuredRelays: [{ enabled: true, addr: "/ip4/1.2.3.4/tcp/4001/p2p/12D3KooW" }],
    });
    expect(out.skipped).toBe(true);
    expect(mesh.eagerConnectToRelays).not.toHaveBeenCalled();
  });

  it("eager-dials, reserves, and starts health loop", async () => {
    const mesh = {
      eagerConnectToRelays: vi.fn(async () => ({
        attempted: 1,
        connected: 1,
        failed: 0,
        failures: [],
      })),
      requestRelayReservation: vi.fn(async () => ({
        attempted: 1,
        reserved: 1,
        failed: 0,
        skipped: 0,
        skipReasons: [],
        failures: [],
      })),
      startRelayReservationHealthLoop: vi.fn(() => () => undefined),
      hasLiveRelayReservation: vi.fn(() => true),
    };
    const addr = "/ip4/47.93.11.212/tcp/4001/p2p/12D3KooWLNR4WYWHBswe8ux5zWsy6cuGywnYPJbdbaAbbpmJMjbo";
    const out = await warmAndWatchRelayReservations(mesh as never, {
      relayEnabled: true,
      relayReservationEnabled: true,
      configuredRelays: [{ enabled: true, addr }],
    });
    expect(out.warmed).toBe(true);
    expect(out.reserved).toBe(1);
    expect(out.live).toBe(true);
    expect(mesh.eagerConnectToRelays).toHaveBeenCalled();
    expect(mesh.requestRelayReservation).toHaveBeenCalled();
    expect(mesh.startRelayReservationHealthLoop).toHaveBeenCalledWith(
      [addr],
      expect.objectContaining({
        intervalMs: expect.any(Number),
        pendingIntervalMs: expect.any(Number),
        lostIntervalMs: 15_000,
      }),
    );
  });

  it("waitForUsableRelayReservation polls until live", async () => {
    let live = false;
    const mesh = { hasLiveRelayReservation: () => live };
    const pending = waitForUsableRelayReservation(mesh as never, {
      timeoutMs: 2_000,
      pollMs: 50,
    });
    setTimeout(() => {
      live = true;
    }, 80);
    await expect(pending).resolves.toBe(true);
  });
});

describe("EnvoyMesh reservation status (unit via prototype stubs)", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("hasRelayReservation prefers live store over sticky flag", async () => {
    const { EnvoyMesh } = await import("@envoymesh/network");
    const mesh = new EnvoyMesh({ enableRelay: true });
    // Simulate sticky-only success without live store → still reports via sticky
    // until lastReservedRelayPeerIds + hasReservation fn are set.
    (mesh as unknown as { relayEverReserved: boolean }).relayEverReserved = true;
    expect(mesh.hasRelayReservation()).toBe(true);

    (mesh as unknown as { lastReservedRelayPeerIds: string[] }).lastReservedRelayPeerIds = [
      "12D3KooWRelayPeerIdxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    ];
    (mesh as unknown as { getClientHasReservationFn: () => ((id: unknown) => boolean) | undefined })
      .getClientHasReservationFn = () => () => false;
    // Live miss with known relay ids → not reserved
    expect(mesh.hasLiveRelayReservation()).toBe(false);
    expect(mesh.hasRelayReservation()).toBe(false);
    expect(mesh.getRelayReservationStatus().state).toBe("failed");
  });

  it("RESERVED status ignores AutoRelay slots outside preferred/configured relays", async () => {
    const { EnvoyMesh } = await import("@envoymesh/network");
    const mesh = new EnvoyMesh({ enableRelay: true });
    const configured = "12D3KooWLNR4WYWHBswe8ux5zWsy6cuGywnYPJbdbaAbbpmJMjbo";
    const opportunistic = "12D3KooWMH4hRLwnNMu6JDZCFRFqYBXEyo8bfYYoT4sqi2Nx48NS";
    (mesh as unknown as { preferredRelayPeerIds: string[] }).preferredRelayPeerIds = [configured];
    (mesh as unknown as { lastReservedRelayPeerIds: string[] }).lastReservedRelayPeerIds = [
      opportunistic,
    ];
    (mesh as unknown as { relayEverReserved: boolean }).relayEverReserved = true;
    (mesh as unknown as { getClientHasReservationFn: () => ((id: unknown) => boolean) | undefined })
      .getClientHasReservationFn = () => (pid: { toString(): string }) =>
        pid.toString() === opportunistic;
    (mesh as unknown as { getConnectedPeerIds: () => string[] }).getConnectedPeerIds = () => [
      opportunistic,
      configured,
    ];

    expect(mesh.hasLiveRelayReservation()).toBe(false);
    expect(mesh.getRelayReservationStatus().state).toBe("pending");
    expect(mesh.getRelayReservationStatus().liveRelayPeerIds).toEqual([]);

    (mesh as unknown as { getClientHasReservationFn: () => ((id: unknown) => boolean) | undefined })
      .getClientHasReservationFn = () => (pid: { toString(): string }) =>
        pid.toString() === configured;
    (mesh as unknown as { lastReservedRelayPeerIds: string[] }).lastReservedRelayPeerIds = [
      configured,
    ];
    expect(mesh.hasLiveRelayReservation()).toBe(true);
    expect(mesh.hasAllPreferredRelayReservations()).toBe(true);
    expect(mesh.getRelayReservationStatus().state).toBe("reserved");
    expect(mesh.getRelayReservationStatus().liveRelayPeerIds).toEqual([configured]);
  });

  it("hasLiveRelayReservation is false when store is live but relay TCP is down", async () => {
    const { EnvoyMesh } = await import("@envoymesh/network");
    const mesh = new EnvoyMesh({ enableRelay: true });
    const configured = "12D3KooWLNR4WYWHBswe8ux5zWsy6cuGywnYPJbdbaAbbpmJMjbo";
    (mesh as unknown as { preferredRelayPeerIds: string[] }).preferredRelayPeerIds = [configured];
    (mesh as unknown as { lastReservedRelayPeerIds: string[] }).lastReservedRelayPeerIds = [
      configured,
    ];
    (mesh as unknown as { getClientHasReservationFn: () => ((id: unknown) => boolean) | undefined })
      .getClientHasReservationFn = () => () => true;
    // Stale store: reserved=true, but no open connection → unusable.
    (mesh as unknown as { getConnectedPeerIds: () => string[] }).getConnectedPeerIds = () => [];

    expect(mesh.listLivePreferredRelayPeerIds()).toEqual([configured]);
    expect(mesh.listUsableRelayPeerIds()).toEqual([]);
    expect(mesh.hasLiveRelayReservation()).toBe(false);
    expect(mesh.getRelayReservationStatus().state).not.toBe("reserved");

    (mesh as unknown as { getConnectedPeerIds: () => string[] }).getConnectedPeerIds = () => [
      configured,
    ];
    expect(mesh.hasLiveRelayReservation()).toBe(true);
    expect(mesh.listUsableRelayPeerIds()).toEqual([configured]);
    expect(mesh.getRelayReservationStatus().state).toBe("reserved");
  });

  it("reports partial multi-relay reservation and missing hops", async () => {
    const { EnvoyMesh } = await import("@envoymesh/network");
    const mesh = new EnvoyMesh({ enableRelay: true });
    const a = "12D3KooWLNR4WYWHBswe8ux5zWsy6cuGywnYPJbdbaAbbpmJMjbo";
    const b = "12D3KooWBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";
    (mesh as unknown as { preferredRelayPeerIds: string[] }).preferredRelayPeerIds = [a, b];
    (mesh as unknown as { lastReservedRelayPeerIds: string[] }).lastReservedRelayPeerIds = [a];
    (mesh as unknown as { getClientHasReservationFn: () => ((id: unknown) => boolean) | undefined })
      .getClientHasReservationFn = () => (pid: { toString(): string }) => pid.toString() === a;
    (mesh as unknown as { getConnectedPeerIds: () => string[] }).getConnectedPeerIds = () => [a];

    expect(mesh.listLivePreferredRelayPeerIds()).toEqual([a]);
    expect(mesh.hasAllPreferredRelayReservations()).toBe(false);
    const status = mesh.getRelayReservationStatus();
    expect(status.state).toBe("reserved");
    expect(status.liveRelayPeerIds).toEqual([a]);
    expect(status.lastError).toMatch(/Partial reservation 1\/2/);
  });
});
