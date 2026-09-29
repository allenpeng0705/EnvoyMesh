import { describe, expect, it } from "vitest";
import {
  evaluateWsProductGate,
  parseWsProductPolicy,
} from "../src/ws-product-policy.js";

describe("ws product policy (aiNotes compat)", () => {
  it("defaults to allowlist", () => {
    expect(parseWsProductPolicy(undefined)).toBe("allowlist");
    expect(parseWsProductPolicy("")).toBe("allowlist");
  });

  it("allowlist accepts missing product (pre-release Veda) and known products", () => {
    const missing = evaluateWsProductGate("", "allowlist");
    expect(missing.ok).toBe(true);
    if (missing.ok) {
      expect(missing.legacyMissingProduct).toBe(true);
    }
    expect(evaluateWsProductGate("veda", "allowlist")).toMatchObject({
      ok: true,
      product: "veda",
      legacyMissingProduct: false,
    });
    expect(evaluateWsProductGate("envoydev-mobile", "allowlist").ok).toBe(true);
  });

  it("allowlist rejects non-family product strings", () => {
    const bad = evaluateWsProductGate("kubo-phone", "allowlist");
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.reason).toBe("not-family");
  });

  it("require rejects missing product but accepts veda", () => {
    const missing = evaluateWsProductGate("", "require");
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.reason).toBe("missing");
    expect(evaluateWsProductGate("veda", "require").ok).toBe(true);
  });

  it("legacy never rejects on product", () => {
    expect(evaluateWsProductGate("", "legacy").ok).toBe(true);
    expect(evaluateWsProductGate("anything-goes", "legacy").ok).toBe(true);
  });
});
