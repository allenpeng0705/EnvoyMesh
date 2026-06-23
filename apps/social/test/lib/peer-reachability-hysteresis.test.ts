import { describe, expect, it } from "vitest";
import {
  applyReachabilityHysteresis,
  createReachabilityHysteresisState,
  REACHABILITY_OFFLINE_GRACE_MS,
  REACHABILITY_STABLE_OFFLINE_POLLS,
  REACHABILITY_STABLE_ONLINE_POLLS,
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

  it("requires consecutive connected polls before Offline → Online", () => {
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
    state = r.state;
    expect(r.shouldUpdate).toBe(false);

    r = applyReachabilityHysteresis(state, { connected: true, direct: true }, t0 + 10_000);
    expect(r.shouldUpdate).toBe(true);
    expect(r.info?.connected).toBe(true);
    expect(REACHABILITY_STABLE_ONLINE_POLLS).toBeGreaterThan(1);
  });

  it("never flips Online → Offline while holdOnline is set (open chat)", () => {
    let state = createReachabilityHysteresisState();
    const t0 = 3_000_000;
    let r = applyReachabilityHysteresis(state, { connected: true, direct: true }, t0);
    state = r.state;

    for (let i = 0; i < REACHABILITY_STABLE_OFFLINE_POLLS + 5; i++) {
      r = applyReachabilityHysteresis(
        state,
        { connected: false, direct: false },
        t0 + 60_000 + i * 60_000,
        { holdOnline: true },
      );
      state = r.state;
      expect(r.shouldUpdate).toBe(false);
    }

    r = applyReachabilityHysteresis(
      state,
      { connected: false, direct: false },
      t0 + 24 * 60 * 60_000,
      { holdOnline: true },
    );
    expect(r.shouldUpdate).toBe(false);
    expect(r.state.displayedLabel).toBe("direct");
  });
});
