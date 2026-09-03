import { describe, expect, it } from "vitest";
import {
  computeUserFirstSwarmBudget,
  createInitialRelayCapacityRuntimeState,
  relayCapacityPruneTargetPeers,
  relayCapacityPruneTriggerPeers,
  reservationUtilization,
  tickRelayCapacityController,
} from "../src/relay-capacity-controller.js";

function sample(overrides: Partial<Parameters<typeof tickRelayCapacityController>[1]> = {}) {
  return {
    eventLoopLagMs: 10,
    dialQueueLength: 0,
    totalPeerIds: 200,
    reservationCount: 1,
    maxConnections: 973,
    connectionBudgetFloor: 600,
    adaptiveConnectionBudget: 600,
    maxReservations: 800,
    reservationBudgetFloor: 400,
    adaptiveReservationBudget: 400,
    ...overrides,
  };
}

describe("relay capacity runtime controller (adaptive feedback)", () => {
  it("shrinks swarm budget as reservations grow", () => {
    const low = computeUserFirstSwarmBudget(sample({ reservationCount: 1 }));
    const high = computeUserFirstSwarmBudget(sample({ reservationCount: 200 }));
    expect(high).toBeLessThan(low);
  });

  it("requires 5 healthy ticks before grow (no double-count)", () => {
    let state = createInitialRelayCapacityRuntimeState({
      initialEffectiveMaxPeers: 300,
      initialAdaptiveConnectionBudget: 600,
      initialAdaptiveReservationBudget: 400,
    });
    const healthy = sample({
      eventLoopLagMs: 80,
      dialQueueLength: 2,
      maxConnections: 973,
      maxReservations: 800,
    });
    for (let i = 0; i < 4; i++) {
      state = tickRelayCapacityController(state, {
        ...healthy,
        adaptiveConnectionBudget: state.adaptiveConnectionBudget,
        adaptiveReservationBudget: state.adaptiveReservationBudget,
      }).state;
      expect(state.lastAction).not.toBe("grow-healthy");
    }
    const fifth = tickRelayCapacityController(state, {
      ...healthy,
      adaptiveConnectionBudget: state.adaptiveConnectionBudget,
      adaptiveReservationBudget: state.adaptiveReservationBudget,
    });
    expect(fifth.state.lastAction).toBe("grow-healthy");
  });

  it("emergency shrink requires 2 critical ticks", () => {
    let state = createInitialRelayCapacityRuntimeState({
      initialEffectiveMaxPeers: 400,
      initialAdaptiveConnectionBudget: 700,
      initialAdaptiveReservationBudget: 500,
    });
    const bad = sample({ eventLoopLagMs: 1300 });
    let r = tickRelayCapacityController(state, bad);
    expect(r.state.lastAction).not.toBe("emergency-shrink");
    r = tickRelayCapacityController(r.state, {
      ...bad,
      adaptiveConnectionBudget: r.state.adaptiveConnectionBudget,
      adaptiveReservationBudget: r.state.adaptiveReservationBudget,
    });
    expect(r.state.lastAction).toBe("emergency-shrink");
    expect(r.state.adaptiveConnectionBudget).toBeLessThan(700);
    expect(r.state.adaptiveReservationBudget).toBeLessThan(500);
  });

  it("grows connection and reservation budgets after sustained health", () => {
    let state = createInitialRelayCapacityRuntimeState({
      initialEffectiveMaxPeers: 300,
      initialAdaptiveConnectionBudget: 600,
      initialAdaptiveReservationBudget: 400,
    });
    const healthy = sample({
      eventLoopLagMs: 80,
      dialQueueLength: 2,
      maxConnections: 973,
      maxReservations: 800,
    });
    let grewConn = false;
    let grewRes = false;
    for (let i = 0; i < 6; i++) {
      const r = tickRelayCapacityController(state, {
        ...healthy,
        adaptiveConnectionBudget: state.adaptiveConnectionBudget,
        adaptiveReservationBudget: state.adaptiveReservationBudget,
      });
      state = r.state;
      if (state.adaptiveConnectionBudget > 600) grewConn = true;
      if (state.adaptiveReservationBudget > 400) grewRes = true;
    }
    expect(grewConn).toBe(true);
    expect(grewRes).toBe(true);
  });

  it("reservation utilization uses adaptive budget", () => {
    expect(reservationUtilization(200, 400)).toBe(0.5);
  });

  it("derive prune thresholds from effective budget", () => {
    expect(relayCapacityPruneTriggerPeers(400, 512)).toBe(400);
    expect(relayCapacityPruneTargetPeers(400)).toBe(368);
  });
});
