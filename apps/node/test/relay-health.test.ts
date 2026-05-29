import { describe, expect, it } from "vitest";
import { createInitialRelayHealthState, evaluateRelayHealth, isRelayClientNode } from "../src/relay-health.js";
import type { RelayBookEntry, RelayRosterEntry } from "../src/relay-roster.js";
import type { RelaySummaryEntry } from "../src/relay-lookup-router.js";

const now = Date.parse("2026-04-27T10:00:00.000Z");
const baseRouting = {
  forwardedLookupCount: 0,
  duplicateQueryDropCount: 0,
  negativeCacheSize: 0,
  selectedForwardTargetCount: 0,
  failedForwardCount: 0,
  collectedForwardResponseCount: 0,
};

describe("relay health", () => {
  it("reports healthy relay state without repair actions", () => {
    const result = evaluateRelayHealth({
      now: () => now,
      relayEnabled: true,
      relayServerEnabled: true,
      listenAddrs: ["/ip4/127.0.0.1/tcp/4001/p2p/relay-a"],
      bootstrapProbeResults: [{ ok: true }],
      relayBook: [relay("relay-b", 0)],
      rosterEntries: [rosterEntry()],
      summaries: [summary("relay-b")],
      routing: baseRouting,
      previous: createInitialRelayHealthState(),
    });

    expect(result.snapshot.status).toBe("healthy");
    expect(result.snapshot.actions).toEqual(["none"]);
    expect(result.state.counters.healthChecks).toBe(1);
  });

  it("degrades for failed neighbors and schedules soft repair", () => {
    const result = evaluateRelayHealth({
      now: () => now,
      relayEnabled: true,
      relayServerEnabled: true,
      listenAddrs: ["/ip4/127.0.0.1/tcp/4001/p2p/relay-a"],
      bootstrapProbeResults: [{ ok: false }, { ok: false }],
      relayBook: [relay("relay-b", 3)],
      rosterEntries: [],
      summaries: [],
      routing: { ...baseRouting, forwardedLookupCount: 10, failedForwardCount: 8 },
      previous: createInitialRelayHealthState(),
    });

    expect(result.snapshot.status).toBe("degraded");
    expect(result.snapshot.actions).toContain("reprobe-neighbors");
    expect(result.state.counters.softRepair).toBe(1);
  });

  it("requests libp2p restart when listeners are missing", () => {
    const result = evaluateRelayHealth({
      now: () => now,
      relayEnabled: true,
      relayServerEnabled: true,
      listenAddrs: [],
      bootstrapProbeResults: [],
      relayBook: [],
      rosterEntries: [],
      summaries: [],
      routing: baseRouting,
      previous: createInitialRelayHealthState(),
    });

    expect(result.snapshot.status).toBe("unhealthy");
    expect(result.snapshot.actions).toContain("restart-libp2p");
    expect(result.state.counters.restartRequested).toBe(1);
  });

  it("requests libp2p restart when event-loop lag is too high", () => {
    const result = evaluateRelayHealth({
      now: () => now,
      relayEnabled: true,
      relayServerEnabled: true,
      listenAddrs: ["/ip4/127.0.0.1/tcp/4001/p2p/relay-a"],
      bootstrapProbeResults: [],
      relayBook: [],
      rosterEntries: [],
      summaries: [],
      routing: baseRouting,
      eventLoopLagMs: 2_500,
      previous: createInitialRelayHealthState(),
    });

    expect(result.snapshot.status).toBe("unhealthy");
    expect(result.snapshot.actions).toContain("restart-libp2p");
    expect(result.state.counters.restartRequested).toBe(1);
  });

  it("requests supervisor exit when memory is too high", () => {
    const result = evaluateRelayHealth({
      now: () => now,
      relayEnabled: true,
      relayServerEnabled: true,
      listenAddrs: ["/ip4/127.0.0.1/tcp/4001/p2p/relay-a"],
      bootstrapProbeResults: [],
      relayBook: [],
      rosterEntries: [],
      summaries: [],
      routing: baseRouting,
      rssBytes: 2_000 * 1024 * 1024,
      maxRssBytesOverride: 1, // set threshold to 1 byte so 2 GB triggers critical
      previous: createInitialRelayHealthState(),
    });

    expect(result.snapshot.status).toBe("critical");
    expect(result.snapshot.actions).toContain("exit-for-supervisor");
    expect(result.state.counters.exitRequested).toBe(1);
  });

  it("escalates repeated failures to critical supervisor exit", () => {
    const previous = {
      ...createInitialRelayHealthState(),
      consecutiveFailures: 4,
    };
    const result = evaluateRelayHealth({
      now: () => now,
      relayEnabled: true,
      relayServerEnabled: true,
      listenAddrs: ["/ip4/127.0.0.1/tcp/4001/p2p/relay-a"],
      bootstrapProbeResults: [{ ok: false }],
      relayBook: [relay("relay-b", 3)],
      rosterEntries: [],
      summaries: [],
      routing: baseRouting,
      previous,
    });

    expect(result.snapshot.status).toBe("critical");
    expect(result.snapshot.actions).toContain("exit-for-supervisor");
    expect(result.state.counters.critical).toBe(1);
  });

  it("keeps relay clients degraded when bootstrap relay is down (no supervisor exit)", () => {
    const previous = {
      ...createInitialRelayHealthState(),
      consecutiveFailures: 4,
    };
    const result = evaluateRelayHealth({
      now: () => now,
      relayEnabled: true,
      relayServerEnabled: false,
      listenAddrs: ["/ip4/192.168.1.10/tcp/50254/p2p/client-a"],
      bootstrapProbeResults: [{ ok: false }, { ok: false }],
      relayBook: [],
      rosterEntries: [],
      summaries: [],
      routing: baseRouting,
      previous,
    });

    expect(result.snapshot.status).toBe("degraded");
    expect(result.snapshot.actions).toContain("reprobe-neighbors");
    expect(result.snapshot.actions).not.toContain("exit-for-supervisor");
    expect(result.state.counters.critical).toBe(0);
  });

  it("keeps relay clients unhealthy (not critical) when libp2p restart keeps failing", () => {
    const previous = {
      ...createInitialRelayHealthState(),
      consecutiveFailures: 8,
    };
    const result = evaluateRelayHealth({
      now: () => now,
      relayEnabled: true,
      relayServerEnabled: false,
      listenAddrs: [],
      bootstrapProbeResults: [],
      relayBook: [],
      rosterEntries: [],
      summaries: [],
      routing: baseRouting,
      previous,
    });

    expect(result.snapshot.status).toBe("unhealthy");
    expect(result.snapshot.actions).toContain("restart-libp2p");
    expect(result.snapshot.actions).not.toContain("exit-for-supervisor");
  });

  it("still exits relay clients when memory is too high", () => {
    const result = evaluateRelayHealth({
      now: () => now,
      relayEnabled: true,
      relayServerEnabled: false,
      listenAddrs: ["/ip4/192.168.1.10/tcp/50254/p2p/client-a"],
      bootstrapProbeResults: [],
      relayBook: [],
      rosterEntries: [],
      summaries: [],
      routing: baseRouting,
      rssBytes: 2_000 * 1024 * 1024,
      maxRssBytesOverride: 1,
      previous: createInitialRelayHealthState(),
    });

    expect(result.snapshot.status).toBe("critical");
    expect(result.snapshot.actions).toContain("exit-for-supervisor");
  });

  it("stays degraded across many bootstrap-failure cycles on relay clients", () => {
    let state = createInitialRelayHealthState();
    for (let cycle = 0; cycle < 12; cycle += 1) {
      const result = evaluateRelayHealth({
        now: () => now + cycle * 30_000,
        relayEnabled: true,
        relayServerEnabled: false,
        listenAddrs: ["/ip4/192.168.1.10/tcp/50254/p2p/client-a"],
        bootstrapProbeResults: Array.from({ length: 8 }, () => ({ ok: false })),
        relayBook: [],
        rosterEntries: [],
        summaries: [],
        routing: baseRouting,
        previous: state,
      });
      state = result.state;
      expect(result.snapshot.status).toBe("degraded");
      expect(result.snapshot.actions).not.toContain("exit-for-supervisor");
    }
    expect(state.consecutiveFailures).toBeGreaterThanOrEqual(12);
    expect(state.counters.critical).toBe(0);
  });

  it("caps relay client consecutiveFailures for long degraded outages", () => {
    let state = { ...createInitialRelayHealthState(), consecutiveFailures: 63 };
    const result = evaluateRelayHealth({
      now: () => now,
      relayEnabled: true,
      relayServerEnabled: false,
      listenAddrs: ["/ip4/192.168.1.10/tcp/50254/p2p/client-a"],
      bootstrapProbeResults: [{ ok: false }],
      relayBook: [],
      rosterEntries: [],
      summaries: [],
      routing: baseRouting,
      previous: state,
    });
    expect(result.state.consecutiveFailures).toBe(64);
  });

  it("identifies relay clients as any node without --relay-server", () => {
    expect(isRelayClientNode({ relayServerEnabled: false })).toBe(true);
    expect(isRelayClientNode({ relayServerEnabled: true })).toBe(false);
  });
});

function relay(relayId: string, failureCount: number): RelayBookEntry {
  return {
    relayId,
    relation: "sibling",
    state: "verified",
    addrs: [`/ip4/127.0.0.1/tcp/4001/p2p/${relayId}`],
    lastVerifiedAt: now,
    expiresAt: now + 60_000,
    failureCount,
  };
}

function rosterEntry(): RelayRosterEntry {
  return {
    peerId: "peer-a",
    relayReachableAddrs: [],
    capabilities: ["mesh.discovery"],
    advertisements: [{ capability: "mesh.discovery", visibility: "public" }],
    relayHints: [],
    lastSeenAt: now,
    expiresAt: now + 60_000,
    reservationFreshUntil: now + 60_000,
  };
}

function summary(relayId: string): RelaySummaryEntry {
  return {
    relayId,
    lastSeenAt: now,
    expiresAt: now + 60_000,
    summary: {
      relayId,
      level: 2,
      livePeerCount: 1,
      childRelayCount: 0,
      topicBuckets: ["capability:mesh.discovery"],
      expiresAt: "2026-04-27T10:01:00.000Z",
    },
  };
}
