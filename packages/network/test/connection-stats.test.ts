import { describe, expect, it } from "vitest";
import { scanLibp2pConnectionStats } from "../src/connection-stats.js";

describe("scanLibp2pConnectionStats", () => {
  it("returns empty stats when connection map is missing", () => {
    expect(scanLibp2pConnectionStats(undefined)).toEqual({
      totalPeerIds: 0,
      totalConnections: 0,
      circuitPeerIds: [],
      circuitConnections: 0,
    });
  });

  it("counts only open connections and separates circuit peers", () => {
    const connections = new Map<string, unknown[]>([
      [
        "12D3KooWRelay",
        [
          {
            status: "open",
            remoteAddr: { toString: () => "/ip4/1.2.3.4/tcp/4001/p2p-circuit/p2p/12D3KooWClient" },
          },
        ],
      ],
      [
        "12D3KooWDht",
        [
          {
            status: "open",
            remoteAddr: { toString: () => "/ip4/8.8.8.8/tcp/4001/p2p/12D3KooWDht" },
          },
        ],
      ],
      [
        "12D3KooWClosed",
        [{ status: "closed", remoteAddr: { toString: () => "/ip4/9.9.9.9/tcp/4001/p2p/12D3KooWClosed" } }],
      ],
    ]);

    expect(scanLibp2pConnectionStats(connections)).toEqual({
      totalPeerIds: 2,
      totalConnections: 2,
      circuitPeerIds: ["12D3KooWRelay"],
      circuitConnections: 1,
    });
  });
});
