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

function makeMeshStub(opts: { failureStreak: number; state: "failed" | "pending" | "reserved"; live?: boolean }) {
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
      totalPeerIds: 0,
      totalConnections: 0,
      circuitPeerIds: [],
      circuitConnections: 0,
      connectedPeerIds: [],
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
