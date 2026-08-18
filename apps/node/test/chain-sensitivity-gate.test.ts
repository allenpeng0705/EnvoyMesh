/**
 * Phase 43G — sensitivity gate for chain worker awards.
 */

import { describe, expect, it } from "vitest";

import {
  MIN_REP_FOR_SENSITIVITY,
  MIN_VERDICTS_FOR_PRIVATE,
  bondMaxSensitivity,
  requiresChainAwardApproval,
  requiresReputationApproval,
} from "../src/chain-sensitivity-gate.js";

const mandate = {
  maxSensitivity: "private" as const,
};

describe("chain-sensitivity-gate", () => {
  it("bondMaxSensitivity maps bond levels to data tiers", () => {
    expect(bondMaxSensitivity("direct")).toBe("private");
    expect(bondMaxSensitivity("referred")).toBe("friends");
    expect(bondMaxSensitivity("public")).toBe("public");
    expect(bondMaxSensitivity("blocked")).toBeNull();
  });

  it("allows award when mandate sensitivity fits bond trust", () => {
    expect(requiresChainAwardApproval({ ...mandate, maxSensitivity: "public" }, "public")).toEqual({
      required: false,
    });
    expect(requiresChainAwardApproval({ ...mandate, maxSensitivity: "friends" }, "referred")).toEqual({
      required: false,
    });
    expect(requiresChainAwardApproval(mandate, "direct")).toEqual({ required: false });
  });

  it("requires owner approval when mandate exceeds bond trust", () => {
    const gate = requiresChainAwardApproval(mandate, "public");
    expect(gate.required).toBe(true);
    expect(gate.reason).toContain("private");
    expect(gate.reason).toContain("public");
  });

  it("requires approval for blocked bonds", () => {
    expect(requiresChainAwardApproval(mandate, "blocked")).toEqual({
      required: true,
      reason: "worker bond is blocked",
    });
  });
});

describe("requiresReputationApproval (Phase 41 progressive trust)", () => {
  const friends = { ...mandate, maxSensitivity: "friends" as const };

  it("public never gates on reputation", () => {
    expect(
      requiresReputationApproval({ ...mandate, maxSensitivity: "public" as const }, "pi", 0, 0),
    ).toEqual({ required: false });
  });

  it("private requires ≥10 verdicts regardless of score", () => {
    const gate = requiresReputationApproval(mandate, "pi", 0.95, 5);
    expect(gate.required).toBe(true);
    expect(gate.reason).toContain("verdicts");
    expect(gate.reason).toContain(String(MIN_VERDICTS_FOR_PRIVATE));
  });

  it("friends requires 60%+ pass rate", () => {
    expect(requiresReputationApproval(friends, "openclaw", 0.5, 50)).toEqual({
      required: true,
      reason: expect.stringContaining("0.6"),
    });
    expect(requiresReputationApproval(friends, "openclaw", 0.6, 50)).toEqual({
      required: false,
    });
  });

  it("private requires 85%+ with ≥10 verdicts", () => {
    expect(requiresReputationApproval(mandate, "openclaw", 0.8, 12)).toEqual({
      required: true,
      reason: expect.stringContaining("0.85"),
    });
    expect(requiresReputationApproval(mandate, "openclaw", 0.85, 12)).toEqual({
      required: false,
    });
  });

  it("thresholds are exposed for tooling", () => {
    expect(MIN_REP_FOR_SENSITIVITY).toEqual({ public: 0, friends: 0.6, private: 0.85 });
  });
});
