import { describe, expect, it } from "vitest";
import { createInitialNodeHealthState, evaluateNodeHealth } from "../src/node-health.js";

const now = Date.parse("2026-05-12T12:00:00.000Z");
const startedAtMs = now - 120_000;

describe("node health", () => {
  it("reports healthy node state without repair actions", () => {
    const result = evaluateNodeHealth({
      now: () => now,
      startedAtMs,
      meshStarted: true,
      listenAddrs: ["/ip4/127.0.0.1/tcp/4001/p2p/node-a"],
      relayPeerCount: 1,
      eventLoopLagMs: 5,
      rssBytes: 256 * 1024 * 1024,
      recentFatalErrors: [],
      previous: createInitialNodeHealthState(),
    });

    expect(result.snapshot.status).toBe("healthy");
    expect(result.snapshot.actions).toEqual(["none"]);
    expect(result.snapshot.uptimeMs).toBe(120_000);
    expect(result.state.counters.healthChecks).toBe(1);
  });

  it("requests libp2p restart when mesh is stopped", () => {
    const result = evaluateNodeHealth({
      now: () => now,
      startedAtMs,
      meshStarted: false,
      listenAddrs: [],
      relayPeerCount: 0,
      recentFatalErrors: [],
      previous: createInitialNodeHealthState(),
    });

    expect(result.snapshot.status).toBe("unhealthy");
    expect(result.snapshot.actions).toContain("restart-libp2p");
    expect(result.state.counters.restartRequested).toBe(1);
  });

  it("requests libp2p restart when listeners are missing", () => {
    const result = evaluateNodeHealth({
      now: () => now,
      startedAtMs,
      meshStarted: true,
      listenAddrs: [],
      relayPeerCount: 0,
      recentFatalErrors: [],
      previous: createInitialNodeHealthState(),
    });

    expect(result.snapshot.status).toBe("unhealthy");
    expect(result.snapshot.actions).toContain("restart-libp2p");
  });

  it("degrades without libp2p restart when event-loop lag is too high", () => {
    const result = evaluateNodeHealth({
      now: () => now,
      startedAtMs,
      meshStarted: true,
      listenAddrs: ["/ip4/127.0.0.1/tcp/4001/p2p/node-a"],
      relayPeerCount: 0,
      eventLoopLagMs: 2_500,
      recentFatalErrors: [],
      previous: createInitialNodeHealthState(),
    });

    expect(result.snapshot.status).toBe("degraded");
    expect(result.snapshot.actions).not.toContain("restart-libp2p");
    expect(result.snapshot.actions).toEqual(["none"]);
    expect(result.snapshot.reasons.some((r) => r.includes("event loop lag"))).toBe(true);
  });

  it("exits for supervisor when memory is too high", () => {
    const result = evaluateNodeHealth({
      now: () => now,
      startedAtMs,
      meshStarted: true,
      listenAddrs: ["/ip4/127.0.0.1/tcp/4001/p2p/node-a"],
      relayPeerCount: 0,
      rssBytes: 2_500 * 1024 * 1024,
      maxRssBytesOverride: 1, // set threshold to 1 byte so 2.5 GB triggers critical
      recentFatalErrors: [],
      previous: createInitialNodeHealthState(),
    });

    expect(result.snapshot.status).toBe("critical");
    expect(result.snapshot.actions).toContain("exit-for-supervisor");
    expect(result.state.counters.exitRequested).toBe(1);
  });

  it("exits for supervisor after repeated fatal errors", () => {
    const result = evaluateNodeHealth({
      now: () => now,
      startedAtMs,
      meshStarted: true,
      listenAddrs: ["/ip4/127.0.0.1/tcp/4001/p2p/node-a"],
      relayPeerCount: 0,
      recentFatalErrors: [
        { at: now - 1_000, message: "uncaughtException: one" },
        { at: now - 2_000, message: "unhandledRejection: two" },
        { at: now - 3_000, message: "uncaughtException: three" },
      ],
      previous: createInitialNodeHealthState(),
    });

    expect(result.snapshot.status).toBe("critical");
    expect(result.snapshot.actions).toContain("exit-for-supervisor");
    expect(result.snapshot.recentFatalErrorCount).toBe(3);
  });

  it("escalates repeated restart requests to supervisor exit", () => {
    const previous = {
      ...createInitialNodeHealthState(),
      consecutiveRestartRequests: 2,
    };
    const result = evaluateNodeHealth({
      now: () => now,
      startedAtMs,
      meshStarted: true,
      listenAddrs: [],
      relayPeerCount: 0,
      recentFatalErrors: [],
      previous,
    });

    expect(result.snapshot.status).toBe("critical");
    expect(result.snapshot.actions).toContain("restart-libp2p");
    expect(result.snapshot.actions).toContain("exit-for-supervisor");
  });

  it("keeps relay clients up after repeated libp2p restart requests", () => {
    const previous = {
      ...createInitialNodeHealthState(),
      consecutiveRestartRequests: 2,
    };
    const result = evaluateNodeHealth({
      now: () => now,
      startedAtMs,
      meshStarted: true,
      listenAddrs: [],
      relayPeerCount: 0,
      recentFatalErrors: [],
      previous,
      relayClientOnly: true,
    });

    expect(result.snapshot.status).toBe("unhealthy");
    expect(result.snapshot.actions).toContain("restart-libp2p");
    expect(result.snapshot.actions).not.toContain("exit-for-supervisor");
  });
});