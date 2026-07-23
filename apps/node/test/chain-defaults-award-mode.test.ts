import { describe, expect, it } from "vitest";
import {
  DEFAULT_CHAIN_DEFAULTS,
  mergeChainDefaults,
  resolveAwardMode,
  resolveShowCostUi,
} from "../src/chain-defaults.js";

describe("chain defaults — award mode", () => {
  it("defaults to direct assign with cost UI off", () => {
    expect(DEFAULT_CHAIN_DEFAULTS.awardMode).toBe("direct");
    expect(mergeChainDefaults().showCostUi).toBe(false);
    expect(resolveAwardMode(undefined)).toBe("direct");
    expect(resolveShowCostUi(undefined)).toBe(false);
  });

  it("competitive implies cost UI unless overridden", () => {
    const merged = mergeChainDefaults({ awardMode: "competitive" });
    expect(merged.awardMode).toBe("competitive");
    expect(merged.showCostUi).toBe(true);
    expect(resolveShowCostUi({ awardMode: "competitive", showCostUi: false })).toBe(false);
  });
});
