/**
 * Phase 65A — mandate depth resolution unit tests.
 */
import { describe, expect, it } from "vitest";
import { CHAIN_MAX_DEPTH } from "@envoymesh/protocol";
import {
  CHAIN_DEFAULT_MAX_DEPTH,
  clampChainDepth,
  isChainDepthAllowed,
  resolveAllowedChainDepth,
  verifySubChainMandate,
  verifySubChainSelfConsistency,
} from "../src/chain-depth-mandate.js";

describe("chain-depth-mandate (Phase 65A)", () => {
  it("defaults to depth-2 when flags are off", () => {
    expect(resolveAllowedChainDepth({})).toBe(CHAIN_DEFAULT_MAX_DEPTH);
    expect(resolveAllowedChainDepth({ allowDepth3: false, allowDepth4: false })).toBe(2);
  });

  it("allowDepth3 raises the cap to 3", () => {
    expect(resolveAllowedChainDepth({ allowDepth3: true })).toBe(3);
  });

  it("allowDepth4 raises the cap to 4 (implies depth-3)", () => {
    expect(resolveAllowedChainDepth({ allowDepth4: true })).toBe(4);
    expect(resolveAllowedChainDepth({ allowDepth3: true, allowDepth4: true })).toBe(4);
  });

  it("omitted allowDepth4 keeps depth-3 when only allowDepth3 is set", () => {
    expect(resolveAllowedChainDepth({ allowDepth3: true })).toBe(3);
  });

  it("never exceeds protocol CHAIN_MAX_DEPTH", () => {
    expect(CHAIN_MAX_DEPTH).toBe(4);
    expect(resolveAllowedChainDepth({ allowDepth4: true })).toBeLessThanOrEqual(CHAIN_MAX_DEPTH);
  });

  it("clampChainDepth respects mandate and floors at 1", () => {
    expect(clampChainDepth(0, {})).toBe(1);
    expect(clampChainDepth(9, {})).toBe(2);
    expect(clampChainDepth(9, { allowDepth3: true })).toBe(3);
    expect(clampChainDepth(9, { allowDepth4: true })).toBe(4);
    expect(clampChainDepth(3, { allowDepth4: true })).toBe(3);
  });

  it("isChainDepthAllowed gates depth-3/4", () => {
    expect(isChainDepthAllowed(2, {})).toBe(true);
    expect(isChainDepthAllowed(3, {})).toBe(false);
    expect(isChainDepthAllowed(3, { allowDepth3: true })).toBe(true);
    expect(isChainDepthAllowed(4, { allowDepth3: true })).toBe(false);
    expect(isChainDepthAllowed(4, { allowDepth4: true })).toBe(true);
    expect(isChainDepthAllowed(5, { allowDepth4: true })).toBe(false);
  });

  const parent = {
    allowDepth3: true,
    allowDepth4: true,
    maxChainCostUsd: 20,
    costCeilingUsd: 5,
    deadlineAt: "2026-09-05T12:00:00.000Z",
  };

  it("verifySubChainMandate accepts a nested budget inside the parent", () => {
    expect(
      verifySubChainMandate({
        parent,
        child: {
          allowDepth3: true,
          allowDepth4: false,
          maxChainCostUsd: 10,
          costCeilingUsd: 4,
          deadlineAt: "2026-09-05T11:00:00.000Z",
        },
        estimatedCostUsd: 8,
      }),
    ).toEqual({ ok: true });
  });

  it("verifySubChainMandate rejects depth / cost / deadline escapes", () => {
    expect(
      verifySubChainMandate({
        parent: { ...parent, allowDepth4: false },
        child: {
          allowDepth4: true,
          maxChainCostUsd: 10,
          costCeilingUsd: 4,
          deadlineAt: "2026-09-05T11:00:00.000Z",
        },
      }).ok,
    ).toBe(false);
    expect(
      verifySubChainMandate({
        parent,
        child: {
          maxChainCostUsd: 25,
          costCeilingUsd: 4,
          deadlineAt: "2026-09-05T11:00:00.000Z",
        },
      }),
    ).toEqual({ ok: false, reason: "cost_exceeds_parent" });
    expect(
      verifySubChainMandate({
        parent,
        child: {
          maxChainCostUsd: 10,
          costCeilingUsd: 4,
          deadlineAt: "2026-09-05T13:00:00.000Z",
        },
      }),
    ).toEqual({ ok: false, reason: "deadline_after_parent" });
  });

  it("verifySubChainSelfConsistency gates estimate vs child budget", () => {
    expect(
      verifySubChainSelfConsistency({ child: { maxChainCostUsd: 5 }, estimatedCostUsd: 5 }),
    ).toEqual({ ok: true });
    expect(
      verifySubChainSelfConsistency({ child: { maxChainCostUsd: 5 }, estimatedCostUsd: 6 }),
    ).toEqual({ ok: false, reason: "estimate_exceeds_sub_budget" });
  });
});
