import { describe, expect, it } from "vitest";
import { formatWanSignOffEvidenceReport, formatWanSignOffLedgerRow } from "../src/wan-signoff-evidence.js";

describe("wan-signoff-evidence", () => {
  it("formats physical two-NAT ledger row", () => {
    const row = formatWanSignOffLedgerRow({
      date: "2026-05-20",
      commitSha: "abc1234",
      physicalTwoNat: true,
      relaySignOff: "ok",
      operator: "@you",
      relayAddr: "/ip4/1.2.3.4/tcp/4001/p2p/12D3",
      peerId: "12D3KooWTest",
    });
    expect(row).toContain("NAT Client A + NAT Client B");
    expect(row).toContain("[x] circuit dial");
    expect(row).toContain("@you");
  });

  it("includes diagnostics in evidence report", () => {
    const report = formatWanSignOffEvidenceReport({
      commitSha: "deadbeef",
      diagnostics: {
        nodeOnline: true,
        stageD: {
          discoveryProfile: "wan-default",
          bootstrapPeerCount: 1,
          discoveredPeerCount: 2,
          relayDiscoveryCount: 1,
          bootstrapProbeSuccessCount: 1,
          bootstrapProbeFailureCount: 0,
          reprobeOkCount: 0,
          reprobeFailCount: 0,
          warningCount: 0,
          badge: "ok",
          badgeExplanation: "healthy",
        },
        axes: {
          bootstrapReachability: { state: "ok", explanation: "ok" },
          relayAvailability: { state: "ok", explanation: "ok" },
          holePunch: { state: "unknown", explanation: "n/a" },
          policyBlock: { state: "ok", explanation: "ok" },
          features: {},
        },
      },
    });
    expect(report).toContain("Ledger row");
    expect(report).toContain("bootstrap=ok");
  });
});
