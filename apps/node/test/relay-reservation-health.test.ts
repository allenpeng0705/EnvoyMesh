import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  collectKnownRelayAddrs,
  warmAndWatchRelayReservations,
} from "../src/relay-reservation-health.js";
import { DEFAULT_ENVOY_COMMUNITY_RELAY_BOOTSTRAP_ADDR } from "@envoymesh/api";

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
    };
    const addr = "/ip4/47.93.11.212/tcp/4001/p2p/12D3KooWLNR4WYWHBswe8ux5zWsy6cuGywnYPJbdbaAbbpmJMjbo";
    const out = await warmAndWatchRelayReservations(mesh as never, {
      relayEnabled: true,
      relayReservationEnabled: true,
      configuredRelays: [{ enabled: true, addr }],
    });
    expect(out.warmed).toBe(true);
    expect(out.reserved).toBe(1);
    expect(mesh.eagerConnectToRelays).toHaveBeenCalled();
    expect(mesh.requestRelayReservation).toHaveBeenCalled();
    expect(mesh.startRelayReservationHealthLoop).toHaveBeenCalledWith(
      [addr],
      expect.objectContaining({ intervalMs: expect.any(Number) }),
    );
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
});
