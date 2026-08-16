import { describe, expect, it } from "vitest";
import {
  LAN_DISCOVERY_SWEEP_FORCE_EVERY_N,
  LAN_DISCOVERY_SWEEP_INTERVAL_MS,
  shouldRunLanDiscoverySweep,
} from "../src/lan-discovery-sweep.js";

describe("lan-discovery-sweep", () => {
  it("runs for Office LAN auto-bond or lan-fast profile", () => {
    expect(shouldRunLanDiscoverySweep({ lanAutoBondEnabled: true })).toBe(true);
    expect(
      shouldRunLanDiscoverySweep({
        lanAutoBondEnabled: true,
        discoveryProfile: "lan-fast",
      }),
    ).toBe(true);
  });

  it("stays off for wan-default without LAN auto-bond, and for lan-fast alone", () => {
    expect(shouldRunLanDiscoverySweep(undefined)).toBe(false);
    expect(shouldRunLanDiscoverySweep({})).toBe(false);
    expect(
      shouldRunLanDiscoverySweep({
        lanAutoBondEnabled: false,
        discoveryProfile: "wan-default",
      }),
    ).toBe(false);
    // lan-fast profile alone must not start probes — only explicit auto-bond.
    expect(shouldRunLanDiscoverySweep({ discoveryProfile: "lan-fast" })).toBe(false);
  });

  it("keeps a ~20s soft / ~60s force cadence", () => {
    expect(LAN_DISCOVERY_SWEEP_INTERVAL_MS).toBe(20_000);
    expect(LAN_DISCOVERY_SWEEP_FORCE_EVERY_N * LAN_DISCOVERY_SWEEP_INTERVAL_MS).toBe(60_000);
  });
});
