import { describe, expect, it, beforeEach } from "vitest";
import {
  canStartOwnerWarm,
  markOwnerWarmFinished,
  markOwnerWarmStarted,
  resetOwnerWarmCoordinatorForTests,
  OWNER_WARM_COOLDOWN_MS,
} from "../src/bond-warm-coordinator.js";

describe("bond-warm-coordinator (node)", () => {
  beforeEach(() => {
    resetOwnerWarmCoordinatorForTests();
  });

  it("enforces single-warm-at-a-time plus cooldown before restart", () => {
    expect(canStartOwnerWarm("envoy:owner:b")).toBe(true);
    markOwnerWarmStarted("envoy:owner:b");
    expect(canStartOwnerWarm("envoy:owner:b")).toBe(false);
    markOwnerWarmFinished("envoy:owner:b", 5_000);
    expect(canStartOwnerWarm("envoy:owner:b", 5_000 + OWNER_WARM_COOLDOWN_MS)).toBe(true);
  });
});
