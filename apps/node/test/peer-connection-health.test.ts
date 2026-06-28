import { describe, expect, it, beforeEach } from "vitest";
import { buildPeerConnectionHealth } from "../src/peer-connection-health.js";
import {
  recordWarmDialStarted,
  resetWarmCoordinatorForTests,
} from "../src/outbound-warm-coordinator.js";
import { markOutboundPeerVerified, resetOutboundPeerFreshnessForTests } from "../src/outbound-peer-freshness.js";

describe("buildPeerConnectionHealth", () => {
  beforeEach(() => {
    resetWarmCoordinatorForTests();
    resetOutboundPeerFreshnessForTests();
  });

  it("reports retry when disconnected and not cooldown-blocked", () => {
    const health = buildPeerConnectionHealth({
      peerOwnerId: "envoy:owner:abc",
      transportPeerId: "12D3KooWHealth",
      connection: { connected: false, direct: false },
    });
    expect(health.suggestedAction).toBe("retry");
    expect(health.warmInFlight).toBe(false);
  });

  it("reports wait when coordinator blocks warm", () => {
    const peer = "12D3KooWBlocked";
    recordWarmDialStarted({ transportPeerId: peer, kind: "disconnected_warm", now: Date.now() });
    const health = buildPeerConnectionHealth({
      peerOwnerId: "envoy:owner:abc",
      transportPeerId: peer,
      connection: { connected: false, direct: false },
      now: Date.now() + 1000,
    });
    expect(health.coordinatorBlocked).toBeTruthy();
    expect(health.suggestedAction).toBe("wait");
  });

  it("includes lastVerifiedAt when recently verified", () => {
    const peer = "12D3KooWVerified";
    markOutboundPeerVerified(peer);
    const health = buildPeerConnectionHealth({
      peerOwnerId: "envoy:owner:abc",
      transportPeerId: peer,
      connection: { connected: true, direct: true },
    });
    expect(health.lastVerifiedAt).toBeTruthy();
  });
});
