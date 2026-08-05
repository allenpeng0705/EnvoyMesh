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
    expect(line).toContain("totalPeers=12");
    expect(line).toContain("totalConns=15");
    expect(line).toContain("relayRoster=7");
    expect(line).toContain("memoryRss=");
    expect(line).toContain("heapUsed=");
    expect(warnSpy).not.toHaveBeenCalled();

    logSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it("warns when libp2p connection count is high", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    logNodeRuntimeStats(
      {
        getConnectionStats: () => ({
          totalPeerIds: 70,
          totalConnections: 89,
          circuitPeerIds: ["12D3KooWRelay"],
          circuitConnections: 12,
        }),
        pruneExcessSwarmConnections: vi.fn(async () => ({ closedPeers: 0 })),
      } as never,
      { processStartedAtMs: Date.now() - 30_000 },
    );

    expect(warnSpy).toHaveBeenCalled();
    const line = String(warnSpy.mock.calls.find((c) => String(c[0]).includes("89 open"))?.[0] ?? "");
    expect(line).toContain("89 open libp2p connections");

    logSpy.mockRestore();
    warnSpy.mockRestore();
  });
});
