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
          totalPeerIds: 42,
          totalConnections: 55,
          circuitPeerIds: ["12D3KooWRelay"],
          circuitConnections: 2,
        }),
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
    expect(line).toContain("totalPeers=42");
    expect(line).toContain("totalConns=55");
    expect(line).toContain("relayRoster=7");
    expect(line).toContain("memoryRss=");
    expect(line).toContain("heapUsed=");
    expect(warnSpy).not.toHaveBeenCalled();

    logSpy.mockRestore();
    warnSpy.mockRestore();
  });
});
