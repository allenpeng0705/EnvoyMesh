/**
 * Pricing catalog + computeCallCost tests.
 *
 * Verifies the three-tier fallback:
 *   1. provider-reported cost wins when present
 *   2. catalog-based computation from token counts
 *   3. unknown → 0 with pricingSource flag
 * Plus mock provider handling and prefix normalization.
 */

import { describe, expect, it } from "vitest";

import { computeCallCost, lookupPricing, PRICING_CATALOG } from "@envoymesh/models";

describe("PRICING_CATALOG", () => {
  it("includes the OpenAI default model with non-zero pricing", () => {
    const gpt4oMini = PRICING_CATALOG["gpt-4o-mini"];
    expect(gpt4oMini).toBeDefined();
    expect(gpt4oMini.inputPer1k).toBeGreaterThan(0);
    expect(gpt4oMini.outputPer1k).toBeGreaterThan(gpt4oMini.inputPer1k);
  });

  it("includes the Anthropic default model with non-zero pricing", () => {
    const sonnet = PRICING_CATALOG["claude-sonnet-4-20250514"];
    expect(sonnet).toBeDefined();
    expect(sonnet.inputPer1k).toBeGreaterThan(0);
    expect(sonnet.outputPer1k).toBeGreaterThan(sonnet.inputPer1k);
  });

  it("lists local Ollama models as $0", () => {
    const llama = PRICING_CATALOG["llama3.1"];
    expect(llama).toEqual({ inputPer1k: 0, outputPer1k: 0 });
  });
});

describe("lookupPricing", () => {
  it("finds by exact model name", () => {
    expect(lookupPricing("gpt-4o-mini")?.inputPer1k).toBe(0.00015);
  });

  it("strips provider/ prefix (LiteLLM convention)", () => {
    expect(lookupPricing("ollama/llama3.1")?.inputPer1k).toBe(0);
    expect(lookupPricing("anthropic/claude-sonnet-4-20250514")?.inputPer1k).toBe(0.003);
  });

  it("returns undefined for unknown models", () => {
    expect(lookupPricing("totally-made-up-model")).toBeUndefined();
  });

  it("returns undefined for empty input", () => {
    expect(lookupPricing("")).toBeUndefined();
  });
});

describe("computeCallCost", () => {
  it("forces mock providers to $0 (token counts are actually character lengths)", () => {
    const result = computeCallCost({
      providerId: "local.mock",
      modelName: "gpt-4o-mini", // would normally be priced
      inputTokens: 99999,
      outputTokens: 99999,
      providerReportedCost: 99,
    });
    expect(result).toEqual({ costUsd: 0, pricingSource: "mock" });
  });

  it("uses provider-reported cost when present (tier 1)", () => {
    const result = computeCallCost({
      providerId: "cloud.litellm",
      modelName: "gpt-4o-mini",
      inputTokens: 100,
      outputTokens: 50,
      providerReportedCost: 0.0123,
    });
    expect(result).toEqual({ costUsd: 0.0123, pricingSource: "provider" });
  });

  it("computes from catalog when no provider-reported cost (tier 2)", () => {
    const result = computeCallCost({
      providerId: "cloud.openai",
      modelName: "gpt-4o-mini",
      inputTokens: 1000,
      outputTokens: 500,
    });
    // 1000/1000 * 0.00015 + 500/1000 * 0.0006 = 0.00015 + 0.0003 = 0.00045
    expect(result.costUsd).toBeCloseTo(0.00045, 6);
    expect(result.pricingSource).toBe("catalog");
  });

  it("returns $0 from catalog for free local models", () => {
    const result = computeCallCost({
      providerId: "local.ollama.llama3.1",
      modelName: "llama3.1",
      inputTokens: 1000,
      outputTokens: 500,
    });
    expect(result).toEqual({ costUsd: 0, pricingSource: "catalog" });
  });

  it("returns unknown source when model is not in catalog", () => {
    const result = computeCallCost({
      providerId: "cloud.custom",
      modelName: "future-model-2027",
      inputTokens: 1000,
      outputTokens: 500,
    });
    expect(result).toEqual({ costUsd: 0, pricingSource: "unknown" });
  });

  it("returns unknown when token counts are missing", () => {
    const result = computeCallCost({
      providerId: "cloud.openai",
      modelName: "gpt-4o-mini",
      inputTokens: undefined,
      outputTokens: undefined,
    });
    expect(result.pricingSource).toBe("unknown");
  });

  it("ignores zero-valued provider-reported cost (falls through to catalog)", () => {
    // Some proxies report total_cost=0 when pricing wasn't configured.
    const result = computeCallCost({
      providerId: "cloud.litellm",
      modelName: "gpt-4o-mini",
      inputTokens: 1000,
      outputTokens: 500,
      providerReportedCost: 0,
    });
    expect(result.pricingSource).toBe("catalog");
    expect(result.costUsd).toBeCloseTo(0.00045, 6);
  });

  it("handles provider/ model prefix in tier 2", () => {
    const result = computeCallCost({
      providerId: "cloud.litellm",
      modelName: "anthropic/claude-sonnet-4-20250514",
      inputTokens: 1000,
      outputTokens: 1000,
    });
    // 1000/1000 * 0.003 + 1000/1000 * 0.015 = 0.018
    expect(result.costUsd).toBeCloseTo(0.018, 6);
    expect(result.pricingSource).toBe("catalog");
  });
});
