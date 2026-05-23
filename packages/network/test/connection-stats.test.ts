import { describe, expect, it } from "vitest";
import {
  scanLibp2pConnectionStats,
  scanLibp2pConnectionsFlat,
  scanLibp2pConnectionsMap,
} from "../src/connection-stats.js";

describe("scanLibp2pConnectionStats", () => {
  it("returns empty stats when connection map is missing", () => {
    expect(scanLibp2pConnectionStats(undefined)).toEqual({
      totalPeerIds: 0,
      totalConnections: 0,
      circuitPeerIds: [],
      circuitConnections: 0,
    });
  });

  it("counts only open connections and separates circuit peers (legacy iterable)", () => {
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

describe("scanLibp2pConnectionsFlat", () => {
  it("groups libp2p getConnections() output by remotePeer", () => {
    const stats = scanLibp2pConnectionsFlat([
      {
        status: "open",
        remotePeer: { toString: () => "12D3KooWRelay" },
        remoteAddr: { toString: () => "/ip4/1.2.3.4/tcp/4001/p2p-circuit/p2p/12D3KooWClient" },
      },
      {
        status: "open",
        remotePeer: { toString: () => "12D3KooWDht" },
        remoteAddr: { toString: () => "/ip4/8.8.8.8/tcp/4001/p2p/12D3KooWDht" },
      },
    ]);

    expect(stats).toEqual({
      totalPeerIds: 2,
      totalConnections: 2,
      circuitPeerIds: ["12D3KooWRelay"],
      circuitConnections: 1,
    });
  });
});

describe("scanLibp2pConnectionsMap", () => {
  it("matches legacy map scanning", () => {
    const map = new Map([
      [
        "12D3KooWPeer",
        [{ status: "open", remoteAddr: { toString: () => "/ip4/10.0.0.1/tcp/4001/p2p/12D3KooWPeer" } }],
      ],
    ]);
    expect(scanLibp2pConnectionsMap(map)).toEqual({
      totalPeerIds: 1,
      totalConnections: 1,
      circuitPeerIds: [],
      circuitConnections: 0,
    });
  });
});
