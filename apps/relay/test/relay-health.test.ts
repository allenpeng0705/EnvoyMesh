import { describe, expect, it } from "vitest";
import {
  createInitialStandaloneRelayHealthState,
  evaluateStandaloneRelayHealth,
} from "../src/relay-health.js";

const now = Date.parse("2026-05-12T10:00:00.000Z");
const startedAtMs = now - 60_000;

describe("standalone relay health", () => {
  it("reports healthy state without repair actions", () => {
    const result = evaluateStandaloneRelayHealth({
      now: () => now,
      startedAtMs,
      listenAddrs: ["/ip4/127.0.0.1/tcp/4001/p2p/relay-a"],
      connectedRelayPeerCount: 2,
      httpEnabled: true,
      httpListening: true,
      eventLoopLagMs: 10,
      rssBytes: 128 * 1024 * 1024,
      recentFatalErrors: [],
      previous: createInitialStandaloneRelayHealthState(),
    });

    expect(result.snapshot.status).toBe("healthy");
    expect(result.snapshot.actions).toEqual(["none"]);
    expect(result.snapshot.uptimeMs).toBe(60_000);
    expect(result.state.counters.healthChecks).toBe(1);
  });

  it("requests libp2p restart when listeners are missing", () => {
    const result = evaluateStandaloneRelayHealth({
      now: () => now,
      startedAtMs,
      listenAddrs: [],
      connectedRelayPeerCount: 0,
      httpEnabled: true,
      httpListening: true,
      recentFatalErrors: [],
      previous: createInitialStandaloneRelayHealthState(),
    });

    expect(result.snapshot.status).toBe("unhealthy");
    expect(result.snapshot.actions).toContain("restart-libp2p");
    expect(result.state.counters.restartRequested).toBe(1);
  });

  it("degrades without libp2p restart when event-loop lag is briefly high", () => {
    const result = evaluateStandaloneRelayHealth({
      now: () => now,
      startedAtMs,
      listenAddrs: ["/ip4/127.0.0.1/tcp/4001/p2p/relay-a"],
      connectedRelayPeerCount: 0,
      httpEnabled: true,
      httpListening: true,
      eventLoopLagMs: 2_500,
      recentFatalErrors: [],
      previous: createInitialStandaloneRelayHealthState(),
    });

    expect(result.snapshot.status).toBe("degraded");
    expect(result.snapshot.actions).not.toContain("restart-libp2p");
    expect(result.snapshot.actions).toEqual(["none"]);
    expect(result.state.consecutiveHighLag).toBe(1);
  });

  it("exits for supervisor after sustained event-loop lag", () => {
    const previous = {
      ...createInitialStandaloneRelayHealthState(),
      consecutiveHighLag: 2,
    };
    const result = evaluateStandaloneRelayHealth({
      now: () => now,
      startedAtMs,
      listenAddrs: ["/ip4/127.0.0.1/tcp/4001/p2p/relay-a"],
      connectedRelayPeerCount: 0,
      httpEnabled: true,
      httpListening: true,
      eventLoopLagMs: 2_500,
      recentFatalErrors: [],
      previous,
    });

    expect(result.snapshot.status).toBe("critical");
    expect(result.snapshot.actions).toContain("exit-for-supervisor");
    expect(result.snapshot.actions).not.toContain("restart-libp2p");
    expect(result.state.consecutiveHighLag).toBe(3);
  });

  it("exits for supervisor when memory is too high", () => {
    const result = evaluateStandaloneRelayHealth({
      now: () => now,
      startedAtMs,
      listenAddrs: ["/ip4/127.0.0.1/tcp/4001/p2p/relay-a"],
      connectedRelayPeerCount: 0,
      httpEnabled: true,
      httpListening: true,
      rssBytes: 2_000 * 1024 * 1024,
      maxRssBytesOverride: 1, // set threshold to 1 byte so 2 GB triggers critical
      recentFatalErrors: [],
      previous: createInitialStandaloneRelayHealthState(),
    });

    expect(result.snapshot.status).toBe("critical");
    expect(result.snapshot.actions).toContain("exit-for-supervisor");
    expect(result.state.counters.exitRequested).toBe(1);
  });

  it("exits for supervisor after repeated fatal errors", () => {
    const result = evaluateStandaloneRelayHealth({
      now: () => now,
      startedAtMs,
      listenAddrs: ["/ip4/127.0.0.1/tcp/4001/p2p/relay-a"],
      connectedRelayPeerCount: 0,
      httpEnabled: true,
      httpListening: true,
      recentFatalErrors: [
        { at: now - 1_000, message: "uncaughtException: one" },
        { at: now - 2_000, message: "unhandledRejection: two" },
        { at: now - 3_000, message: "uncaughtException: three" },
      ],
      previous: createInitialStandaloneRelayHealthState(),
    });

    expect(result.snapshot.status).toBe("critical");
    expect(result.snapshot.actions).toContain("exit-for-supervisor");
    expect(result.snapshot.recentFatalErrorCount).toBe(3);
    expect(result.snapshot.lastFatalError).toBe("uncaughtException: three");
  });

  it("escalates repeated restart requests to supervisor exit", () => {
    const previous = {
      ...createInitialStandaloneRelayHealthState(),
      consecutiveRestartRequests: 2,
    };
    const result = evaluateStandaloneRelayHealth({
      now: () => now,
      startedAtMs,
      listenAddrs: [],
      connectedRelayPeerCount: 0,
      httpEnabled: true,
      httpListening: true,
      recentFatalErrors: [],
      previous,
    });

    expect(result.snapshot.status).toBe("critical");
    expect(result.snapshot.actions).toContain("restart-libp2p");
    expect(result.snapshot.actions).toContain("exit-for-supervisor");
  });
});