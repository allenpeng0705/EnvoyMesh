import { describe, expect, it, vi } from "vitest";
import { reloadRelayControlTargets } from "../src/relay-targets-reload.js";
import type { RelayClientCycleDeps } from "../src/relay-client-cycle.js";

describe("reloadRelayControlTargets", () => {
  it("re-warms reservations and restarts the scheduler", async () => {
    const stop = vi.fn();
    const setDeps = vi.fn();
    const setStop = vi.fn();
    const startHealth = vi.fn(() => () => undefined);
    const mesh = {
      eagerConnectToRelays: vi.fn(async () => ({ attempted: 1, connected: 1, failed: 0, failures: [] })),
      requestRelayReservation: vi.fn(async () => ({
        attempted: 1,
        reserved: 1,
        failed: 0,
        skipped: 0,
        failures: [],
        skipReasons: [],
      })),
      startRelayReservationHealthLoop: startHealth,
      hasLiveRelayReservation: vi.fn(() => true),
      peerId: "12D3KooWLocal",
      getRelayAdvertisedMultiaddrs: vi.fn(() => []),
    };

    const deps = {
      mesh: mesh as never,
      profile: {
        owner: { ownerId: "envoy:owner:x" },
        device: { publicKeyPem: "pk", privateKeyPem: "sk", capabilities: [] },
      },
      bootstrapPeers: [],
      bootstrapPresets: ["cn-relay"],
      configuredRelays: [],
      inboundGuard: { inspect: vi.fn() },
      discoverySeedStore: { upsertMany: vi.fn(async () => undefined) },
    } as unknown as RelayClientCycleDeps;

    // Avoid real signed checkin in runRelayClientCycle by stubbing send — cycle may warn; OK.
    const result = await reloadRelayControlTargets({
      mesh: mesh as never,
      deps,
      activeRelayAddrs: [],
      stopScheduler: stop,
      setDeps,
      setStopScheduler: setStop,
      skipWaitForLive: true,
      log: () => undefined,
      warn: () => undefined,
    });

    expect(stop).toHaveBeenCalled();
    expect(setDeps).toHaveBeenCalled();
    expect(mesh.eagerConnectToRelays).toHaveBeenCalled();
    expect(startHealth).toHaveBeenCalled();
    expect(setStop).toHaveBeenCalled();
    expect(result.warmed).toBe(true);
    expect(result.addrs.length).toBeGreaterThan(0);
  });
});
