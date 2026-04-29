import { describe, expect, it } from "vitest";
import { analyzeConnectivityStageD } from "../src/connectivity-stage-d.js";

describe("analyzeConnectivityStageD", () => {
  it("returns unknown badge when no connectivity.profile trace exists", () => {
    const result = analyzeConnectivityStageD([]);
    expect(result.badge).toBe("unknown");
    expect(result.discoveryProfile).toBe("unknown");
  });

  it("marks warn when connectivity warnings exist", () => {
    const result = analyzeConnectivityStageD([
      {
        type: "p2p.trace",
        protocol: "connectivity.profile",
        summary: "profile=wan-default bootstrap=2",
        createdAt: "2026-04-27T10:00:00.000Z",
      },
      {
        type: "p2p.trace",
        protocol: "connectivity.warning",
        summary: "connectivity degraded",
        createdAt: "2026-04-27T10:00:01.000Z",
      },
    ]);
    expect(result.badge).toBe("warn");
    expect(result.warningCount).toBe(1);
  });

  it("marks ok when peers discovered and no warnings", () => {
    const result = analyzeConnectivityStageD([
      {
        type: "p2p.trace",
        protocol: "connectivity.profile",
        summary: "profile=wan-default bootstrap=2",
        createdAt: "2026-04-27T10:00:00.000Z",
      },
      {
        type: "p2p.trace",
        protocol: "peer.discovery",
        summary: "discovery peer=12D3KooWPeer source=unknown addrs=1",
        createdAt: "2026-04-27T10:00:01.000Z",
      },
    ]);
    expect(result.badge).toBe("ok");
    expect(result.discoveredPeerCount).toBe(1);
  });
});
