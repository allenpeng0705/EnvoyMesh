/**
 * Phase 40D — chain defaults RPC tests.
 *
 * Validates the schema-level validation on the `chainSetDefaults` RPC.
 * The full `NodeServiceImpl` integration is exercised by the wider
 * smoke suite; here we test the validation rules so they stay sharp.
 */

import { describe, expect, it } from "vitest";

import type { ChainDefaultsConfig } from "@envoymesh/api";

/**
 * Mirror of the validator inside `NodeServiceImpl.chainSetDefaults`. Kept
 * here so the test file doesn't need to instantiate the full service
 * (which requires a node-config store, profile store, etc.).
 */
function validateDefaults(d: ChainDefaultsConfig | undefined): string | null {
  if (!d) return null;
  if (d.stallTimeoutMs !== undefined && d.stallTimeoutMs <= 0) return "validation_failed";
  if (d.lowConfidenceThreshold !== undefined && (d.lowConfidenceThreshold < 0 || d.lowConfidenceThreshold > 1))
    return "validation_failed";
  if (d.maxAutoRebalances !== undefined && d.maxAutoRebalances < 0) return "validation_failed";
  if (d.autoRebalanceIncrementUsd !== undefined && d.autoRebalanceIncrementUsd < 0) return "validation_failed";
  if (
    d.rebalancePolicy !== undefined &&
    d.rebalancePolicy !== "manual" &&
    d.rebalancePolicy !== "auto" &&
    d.rebalancePolicy !== "never"
  )
    return "validation_failed";
  return null;
}

describe("chain defaults validator", () => {
  it("accepts an empty defaults object", () => {
    expect(validateDefaults({})).toBeNull();
  });

  it("accepts an undefined defaults object", () => {
    expect(validateDefaults(undefined)).toBeNull();
  });

  it("accepts a fully-specified defaults object", () => {
    expect(
      validateDefaults({
        rebalancePolicy: "auto",
        stallTimeoutMs: 60_000,
        lowConfidenceThreshold: 0.5,
        maxAutoRebalances: 3,
        autoRebalanceIncrementUsd: 5,
        allowLlmDecompose: true,
      }),
    ).toBeNull();
  });

  it("rejects negative stall timeout", () => {
    expect(validateDefaults({ stallTimeoutMs: -1 })).toBe("validation_failed");
  });

  it("rejects zero stall timeout", () => {
    expect(validateDefaults({ stallTimeoutMs: 0 })).toBe("validation_failed");
  });

  it("rejects lowConfidenceThreshold > 1", () => {
    expect(validateDefaults({ lowConfidenceThreshold: 1.5 })).toBe("validation_failed");
  });

  it("rejects lowConfidenceThreshold < 0", () => {
    expect(validateDefaults({ lowConfidenceThreshold: -0.1 })).toBe("validation_failed");
  });

  it("accepts lowConfidenceThreshold = 0 (strict quality gate)", () => {
    expect(validateDefaults({ lowConfidenceThreshold: 0 })).toBeNull();
  });

  it("rejects negative maxAutoRebalances", () => {
    expect(validateDefaults({ maxAutoRebalances: -1 })).toBe("validation_failed");
  });

  it("accepts maxAutoRebalances = 0 (auto-rebalance disabled but policy = auto)", () => {
    expect(validateDefaults({ maxAutoRebalances: 0 })).toBeNull();
  });

  it("rejects negative autoRebalanceIncrementUsd", () => {
    expect(validateDefaults({ autoRebalanceIncrementUsd: -1 })).toBe("validation_failed");
  });

  it("rejects an unknown rebalancePolicy string", () => {
    expect(
      validateDefaults({ rebalancePolicy: "sometimes" as unknown as "manual" }),
    ).toBe("validation_failed");
  });

  it("accepts all three valid rebalancePolicy values", () => {
    for (const policy of ["manual", "auto", "never"] as const) {
      expect(validateDefaults({ rebalancePolicy: policy })).toBeNull();
    }
  });
});