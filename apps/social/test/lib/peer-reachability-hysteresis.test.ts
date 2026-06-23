import { describe, expect, it } from "vitest";
import {
  applyReachabilityHysteresis,
  createReachabilityHysteresisState,
  REACHABILITY_OFFLINE_GRACE_MS,
  REACHABILITY_STABLE_OFFLINE_POLLS,
} from "../../src/lib/peer-reachability-hysteresis.js";

describe("peer-reachability-hysteresis", () => {
  it("holds Online through brief disconnect blips inside grace window", () => {
    let state = createReachabilityHysteresisState();
    const t0 = 1_000_000;
    let r = applyReachabilityHysteresis(state, { connected: true, direct: true }, t0);
    state = r.state;
    expect(r.shouldUpdate).toBe(true);

    for (let i = 0; i < REACHABILITY_STABLE_OFFLINE_POLLS; i++) {
      r = applyReachabilityHysteresis(
        state,
        { connected: false, direct: false },
        t0 + 10_000 + i * 1000,
      );
      state = r.state;
    }
    expect(r.shouldUpdate).toBe(false);

    r = applyReachabilityHysteresis(
      state,
      { connected: false, direct: false },
      t0 + REACHABILITY_OFFLINE_GRACE_MS + 1,
    );
    expect(r.shouldUpdate).toBe(true);
    expect(r.info?.connected).toBe(false);
  });

  it("shows Online immediately after reconnect from Offline", () => {
    let state = createReachabilityHysteresisState();
    const t0 = 2_000_000;
    for (let i = 0; i < REACHABILITY_STABLE_OFFLINE_POLLS; i++) {
      const r = applyReachabilityHysteresis(
        state,
        { connected: false, direct: false },
        t0 + i * 1000,
      );
      state = r.state;
    }
    const offline = applyReachabilityHysteresis(
      state,
      { connected: false, direct: false },
      t0 + REACHABILITY_OFFLINE_GRACE_MS,
    );
    state = offline.state;
    expect(offline.info?.connected).toBe(false);

    let r = applyReachabilityHysteresis(state, { connected: true, direct: true }, t0 + 5000);
    expect(r.shouldUpdate).toBe(true);
    expect(r.info?.connected).toBe(true);
  });
});
