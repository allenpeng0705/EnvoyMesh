import { describe, expect, it, beforeEach } from "vitest";
import {
  canStartBondWarm,
  markBondWarmFinished,
  markBondWarmStarted,
  resetBondWarmCoordinatorForTests,
  BOND_WARM_COOLDOWN_MS,
} from "../../src/lib/bond-warm-coordinator.js";

describe("bond-warm-coordinator (social)", () => {
  beforeEach(() => {
    resetBondWarmCoordinatorForTests();
  });

  it("allows warm when idle and blocks until cooldown elapses", () => {
    expect(canStartBondWarm("envoy:owner:a")).toBe(true);
    markBondWarmStarted("envoy:owner:a");
    expect(canStartBondWarm("envoy:owner:a")).toBe(false);
    markBondWarmFinished("envoy:owner:a", 1_000);
    expect(canStartBondWarm("envoy:owner:a", 1_000 + BOND_WARM_COOLDOWN_MS - 1)).toBe(false);
    expect(canStartBondWarm("envoy:owner:a", 1_000 + BOND_WARM_COOLDOWN_MS)).toBe(true);
  });
});
