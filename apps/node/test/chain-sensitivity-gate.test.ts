/**
 * Phase 43G — sensitivity gate for chain worker awards.
 */

import { describe, expect, it } from "vitest";

import {
  bondMaxSensitivity,
  requiresChainAwardApproval,
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
