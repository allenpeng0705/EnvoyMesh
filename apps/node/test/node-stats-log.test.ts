/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import { logNodeRuntimeStats } from "../src/node-stats-log.js";

describe("logNodeRuntimeStats", () => {
  it("logs circuit and total connection counts with memory fields", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    logNodeRuntimeStats(
      {
        getConnectionStats: () => ({
          totalPeerIds: 12,
          totalConnections: 15,
          circuitPeerIds: ["12D3KooWRelay"],
          circuitConnections: 2,
        }),
        hasLiveRelayReservation: () => true,
        getRelayReservationStatus: () => ({ state: "reserved", failureStreak: 0 }),
        getRelayAdvertisedMultiaddrs: () => [
          "/ip4/1.2.3.4/tcp/4001/p2p/12D3KooWRelay/p2p-circuit/p2p/12D3KooWHome",
        ],
        pruneExcessSwarmConnections: vi.fn(async () => ({ closedPeers: 0 })),
      } as never,
      {
        processStartedAtMs: Date.now() - 30_000,
        relayRosterSize: () => 7,
      },
    );

    expect(logSpy).toHaveBeenCalledOnce();
    const line = String(logSpy.mock.calls[0]?.[0]);
    expect(line).toContain("circuitPeers=1");
    expect(line).toContain("circuitConns=2");
    expect(line).toContain("liveReservation=1");
    expect(line).toContain("advCircuits=1");
    expect(line).toContain("totalPeers=12");
    expect(line).toContain("totalConns=15");
    expect(line).toContain("relayRoster=7");
    expect(line).toContain("memoryRss=");
    expect(line).toContain("heapUsed=");
    expect(warnSpy).not.toHaveBeenCalled();

    logSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it("warns when dialQueue stays above storm threshold", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    logNodeRuntimeStats(
      {
        getConnectionStats: () => ({
          totalPeerIds: 10,
          totalConnections: 12,
          circuitPeerIds: [],
          circuitConnections: 0,
          dialQueueLength: 51,
        }),
        hasLiveRelayReservation: () => false,
        getRelayReservationStatus: () => ({ state: "pending", failureStreak: 1 }),
        getRelayAdvertisedMultiaddrs: () => [],
        pruneExcessSwarmConnections: vi.fn(async () => ({ closedPeers: 0 })),
      } as never,
      { processStartedAtMs: Date.now() - 30_000 },
    );

    expect(
      warnSpy.mock.calls.some((c) => String(c[0]).includes("dialQueue=51")),
    ).toBe(true);

    logSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it("warns when event-loop lag is elevated", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    logNodeRuntimeStats(
      {
        getConnectionStats: () => ({
          totalPeerIds: 4,
          totalConnections: 4,
          circuitPeerIds: [],
          circuitConnections: 0,
          dialQueueLength: 0,
        }),
        hasLiveRelayReservation: () => false,
        getRelayReservationStatus: () => ({ state: "none", failureStreak: 0 }),
        getRelayAdvertisedMultiaddrs: () => [],
        pruneExcessSwarmConnections: vi.fn(async () => ({ closedPeers: 0 })),
      } as never,
      {
        processStartedAtMs: Date.now() - 30_000,
        getEventLoopLagMs: () => 1200,
      },
    );

    expect(
      warnSpy.mock.calls.some((c) => String(c[0]).includes("eventLoopLag=1200ms")),
    ).toBe(true);

    logSpy.mockRestore();
    warnSpy.mockRestore();
  });
});
