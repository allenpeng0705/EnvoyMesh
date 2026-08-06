/**
 * Phase 8 (M2) — surface sustained relay-down in connectivity diagnostics.
 *
 * Verifies that buildConnectivityDiagnostics produces a clear "Relay
 * unreachable" hint when the reservation health loop has been failing
 * repeatedly (failureStreak >= threshold), so the UI can warn operators that
 * WAN discovery and cross-NAT reachability are degraded.
 *
 * See docs/connectivity-internals-and-design.md Part VIII (M2).
 */
import { describe, expect, it } from "vitest";
import { buildConnectivityDiagnostics } from "../src/connectivity-diagnostics.js";

function makeMeshStub(opts: {
  failureStreak: number;
  state: "failed" | "pending" | "reserved";
  live?: boolean;
  totalPeerIds?: number;
  dialQueueLength?: number;
}) {
  return {
    getRelayReservationStatus: () => ({
      state: opts.state,
      live: opts.live ?? false,
      everReserved: false,
      relayPeerIds: ["12D3KooWFakeRelay"],
      liveRelayPeerIds: [] as string[],
      lastError: "dial timeout",
      failureStreak: opts.failureStreak,
      checkedAt: new Date().toISOString(),
    }),
    getConnectionStats: () => ({
      totalPeerIds: opts.totalPeerIds ?? 0,
      totalConnections: opts.totalPeerIds ?? 0,
      circuitPeerIds: [],
      circuitConnections: 0,
      connectedPeerIds: [],
      ...(opts.dialQueueLength != null ? { dialQueueLength: opts.dialQueueLength } : {}),
    }),
  } as never;
}

const baseInput = {
  nodeOnline: true,
  config: { discoveryProfile: "wan-default" } as never,
  auditEvents: [],
};

describe("buildConnectivityDiagnostics — sustained relay failure hint (M2)", () => {
  it("surfaces 'Relay unreachable' when failureStreak >= 4", () => {
    const diag = buildConnectivityDiagnostics({
      ...baseInput,
      mesh: makeMeshStub({ failureStreak: 5, state: "failed" }),
    });
    const relayHint = diag.hints.find((h) => h.startsWith("Relay unreachable"));
    expect(relayHint, "should surface a clear Relay unreachable warning").toBeTruthy();
    expect(relayHint).toContain("5 consecutive reservation failures");
    expect(relayHint).toContain("Add a backup relay");
  });

  it("does NOT surface 'Relay unreachable' for a transient blip (failureStreak < 4)", () => {
    const diag = buildConnectivityDiagnostics({
      ...baseInput,
      mesh: makeMeshStub({ failureStreak: 2, state: "failed" }),
    });
    const sustainedHint = diag.hints.find((h) => h.startsWith("Relay unreachable"));
    expect(sustainedHint, "transient failures should not trigger the sustained warning").toBeUndefined();
    // But the regular circuit-reservation hint should still be present.
    const circuitHint = diag.hints.find((h) => h.startsWith("Circuit reservation"));
    expect(circuitHint).toBeTruthy();
  });

  it("includes failureStreak in the surfaced circuitReservation snapshot", () => {
    const diag = buildConnectivityDiagnostics({
      ...baseInput,
      mesh: makeMeshStub({ failureStreak: 7, state: "failed" }),
    });
    expect(diag.circuitReservation?.failureStreak).toBe(7);
  });

  it("does not warn when reservation is healthy (reserved state)", () => {
    const diag = buildConnectivityDiagnostics({
      ...baseInput,
      mesh: makeMeshStub({ failureStreak: 0, state: "reserved", live: true }),
    });
    const relayHint = diag.hints.find((h) => h.startsWith("Relay unreachable"));
    expect(relayHint).toBeUndefined();
  });

  it("treats missing failureStreak (older mesh) as 0 — no false positive", () => {
    // Backward compat: a mesh that doesn't expose failureStreak must not
    // falsely trigger the sustained warning.
    const mesh = {
      getRelayReservationStatus: () => ({
        state: "failed",
        live: false,
        everReserved: false,
        relayPeerIds: ["12D3KooWFakeRelay"],
        liveRelayPeerIds: [],
        lastError: "dial timeout",
        // failureStreak omitted
        checkedAt: new Date().toISOString(),
      }),
      getConnectionStats: () => ({
        totalPeerIds: 0,
        totalConnections: 0,
        circuitPeerIds: [],
        circuitConnections: 0,
        connectedPeerIds: [],
      }),
    } as never;
    const diag = buildConnectivityDiagnostics({ ...baseInput, mesh });
    const relayHint = diag.hints.find((h) => h.startsWith("Relay unreachable"));
    expect(relayHint).toBeUndefined();
  });
});

describe("buildConnectivityDiagnostics — CGNAT quietWan suggestion", () => {
  // Audit events that produce a failing bootstrap axis (probe failures with
  // no successes → bootstrapReachability.state === "fail"). The profile event
  // must include `bootstrap=N` so bootstrapPeerCount > 0 (otherwise the axis
  // reports "disabled" instead of "fail").
  const failingBootstrapEvents = [
    { type: "p2p.trace", protocol: "connectivity.profile", summary: "profile=wan-default bootstrap=23 relay=true dht=true", direction: "outbound", outcome: "record", createdAt: "2026-08-06T10:00:00.000Z" },
    { type: "p2p.trace", protocol: "connectivity.bootstrap.fail", summary: "47.93.11.212:4001 unreachable", direction: "outbound", outcome: "record", createdAt: "2026-08-06T10:00:01.000Z" },
    { type: "p2p.trace", protocol: "connectivity.bootstrap.fail", summary: "104.131.5.41:4001 unreachable", direction: "outbound", outcome: "record", createdAt: "2026-08-06T10:00:02.000Z" },
  ] as never;

  it("suggests quietWan when DHT-on + bootstrap failing + high churn", () => {
    const diag = buildConnectivityDiagnostics({
      nodeOnline: true,
      config: { discoveryProfile: "wan-default", connectivityMode: "optimized" } as never,
      auditEvents: failingBootstrapEvents,
      mesh: makeMeshStub({ failureStreak: 0, state: "pending", totalPeerIds: 80, dialQueueLength: 200 }),
    });
    const suggestion = diag.hints.find((h) => h.includes("Quiet WAN"));
    expect(suggestion, "should suggest Quiet WAN when churn + unreachable DHT on a DHT-enabled mode").toBeTruthy();
    expect(suggestion).toContain("CGNAT");
  });

  it("does NOT suggest quietWan when already on quietWan", () => {
    const diag = buildConnectivityDiagnostics({
      nodeOnline: true,
      config: { discoveryProfile: "wan-default", connectivityMode: "quietWan" } as never,
      auditEvents: failingBootstrapEvents,
      mesh: makeMeshStub({ failureStreak: 0, state: "pending", totalPeerIds: 80, dialQueueLength: 200 }),
    });
    const suggestion = diag.hints.find((h) => h.includes("Quiet WAN"));
    expect(suggestion, "should not suggest quietWan when already on it").toBeUndefined();
  });

  it("does NOT suggest quietWan when there's no churn (peers low)", () => {
    const diag = buildConnectivityDiagnostics({
      nodeOnline: true,
      config: { discoveryProfile: "wan-default", connectivityMode: "optimized" } as never,
      auditEvents: failingBootstrapEvents,
      mesh: makeMeshStub({ failureStreak: 0, state: "pending", totalPeerIds: 5, dialQueueLength: 2 }),
    });
    const suggestion = diag.hints.find((h) => h.includes("Quiet WAN"));
    expect(suggestion, "no churn → no suggestion").toBeUndefined();
  });

  it("does NOT suggest quietWan when bootstrap is healthy", () => {
    // Healthy bootstrap: one success, no failures.
    const healthyEvents = [
      { type: "p2p.trace", protocol: "connectivity.profile", summary: "profile=wan-default bootstrap=23 relay=true dht=true", direction: "outbound", outcome: "record", createdAt: "2026-08-06T10:00:00.000Z" },
      { type: "p2p.trace", protocol: "connectivity.bootstrap.ok", summary: "47.93.11.212:4001 reachable", direction: "outbound", outcome: "record", createdAt: "2026-08-06T10:00:01.000Z" },
    ] as never;
    const diag = buildConnectivityDiagnostics({
      nodeOnline: true,
      config: { discoveryProfile: "wan-default", connectivityMode: "optimized" } as never,
      auditEvents: healthyEvents,
      mesh: makeMeshStub({ failureStreak: 0, state: "pending", totalPeerIds: 80, dialQueueLength: 200 }),
    });
    const suggestion = diag.hints.find((h) => h.includes("Quiet WAN"));
    expect(suggestion, "healthy bootstrap → no suggestion").toBeUndefined();
  });

  it("surfaces CGNAT auto-applied Quiet WAN notice", () => {
    const diag = buildConnectivityDiagnostics({
      nodeOnline: true,
      config: {
        discoveryProfile: "wan-default",
        connectivityMode: "quietWan",
        connectivityModeAutoAppliedReason: "cgnat",
      } as never,
      auditEvents: [],
      mesh: makeMeshStub({ failureStreak: 0, state: "reserved", totalPeerIds: 4, dialQueueLength: 0 }),
    });
    const notice = diag.hints.find((h) => h.includes("auto-applied"));
    expect(notice, "should explain CGNAT auto-apply").toBeTruthy();
  });
});
