import { describe, expect, it } from "vitest";
import {
  capRelayClientConsecutiveFailures,
  LIBP2P_RESTART_MIN_INTERVAL_MS,
  MAX_RELAY_CLIENT_CONSECUTIVE_FAILURES,
  shouldRunThrottledRepair,
} from "../src/libp2p-repair-policy.js";

describe("libp2p repair policy", () => {
  it("allows first repair immediately", () => {
    expect(shouldRunThrottledRepair(1_000, 0, LIBP2P_RESTART_MIN_INTERVAL_MS)).toBe(true);
  });

  it("blocks repair inside cooldown window", () => {
    expect(shouldRunThrottledRepair(100_000, 50_000, LIBP2P_RESTART_MIN_INTERVAL_MS)).toBe(false);
  });

  it("allows repair after cooldown", () => {
    expect(shouldRunThrottledRepair(200_000, 50_000, LIBP2P_RESTART_MIN_INTERVAL_MS)).toBe(true);
  });

  it("caps relay client consecutive failures", () => {
    expect(capRelayClientConsecutiveFailures(MAX_RELAY_CLIENT_CONSECUTIVE_FAILURES + 10)).toBe(
      MAX_RELAY_CLIENT_CONSECUTIVE_FAILURES,
    );
  });
});
