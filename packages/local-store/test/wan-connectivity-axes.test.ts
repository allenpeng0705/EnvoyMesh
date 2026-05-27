import { describe, expect, it } from "vitest";
import { analyzeWanConnectivityAxes } from "../src/wan-connectivity-axes.js";

const profileWan = {
  type: "p2p.trace" as const,
  protocol: "connectivity.profile",
  summary:
    "connectivity profile=wan-default mdns=false dht=true relay=true autonat=true dcutr=true bootstrap=2",
  createdAt: "2026-05-20T10:00:00.000Z",
};

describe("analyzeWanConnectivityAxes", () => {
  it("marks bootstrap disabled when no bootstrap peers", () => {
    const result = analyzeWanConnectivityAxes([
      {
        ...profileWan,
        summary: profileWan.summary.replace("bootstrap=2", "bootstrap=0"),
      },
    ]);
    expect(result.bootstrapReachability.state).toBe("disabled");
  });

  it("marks relay ok when relay-sourced peer.discovery exists", () => {
    const result = analyzeWanConnectivityAxes([
      profileWan,
      {
        type: "p2p.trace",
        protocol: "connectivity.bootstrap.ok",
        summary: "bootstrap ok",
        createdAt: "2026-05-20T10:00:01.000Z",
      },
      {
        type: "p2p.trace",
        protocol: "peer.discovery",
        summary: "discovery peer=12D3KooWPeer source=relay addrs=2",
        createdAt: "2026-05-20T10:00:02.000Z",
      },
    ]);
    expect(result.bootstrapReachability.state).toBe("ok");
    expect(result.relayAvailability.state).toBe("ok");
  });

  it("marks policy block when discovery.request denies present", () => {
    const result = analyzeWanConnectivityAxes([
      profileWan,
      {
        type: "p2p.trace",
        protocol: "discovery.inbound",
        summary: "discovery.request denied: rate limit exceeded",
        createdAt: "2026-05-20T10:00:03.000Z",
      },
    ]);
    expect(result.policyBlock.state).toBe("degraded");
  });

  it("uses runtime relay lookup for relay axis", () => {
    const result = analyzeWanConnectivityAxes([profileWan], { relayLookupOk: true });
    expect(result.relayAvailability.state).toBe("ok");
  });
});
