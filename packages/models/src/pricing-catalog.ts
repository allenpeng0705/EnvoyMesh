/**
 * Per-call cost computation for model usage tracking.
 *
 * Cost is resolved via a three-tier fallback:
 *   1. Provider-reported cost (LiteLLM proxy `usage.total_cost`) — most accurate.
 *   2. Static pricing catalog keyed by model name — covers direct API calls.
 *   3. Unknown — recorded as 0 with `pricingSource: "unknown"` so the dashboard
 *      can show "cost not tracked" rather than a misleading $0.00.
 *
 * Pricing is in USD per 1,000 tokens. Update PRICING_CATALOG when providers change
 * list prices. Date-stamped via CATALOG_AS_OF. Cache tokens and reasoning tokens
 * are intentionally excluded from v1; the schema is extensible for later.
 */

export interface ModelPricing {
  /** USD per 1,000 input (prompt) tokens. */
  inputPer1k: number;
  /** USD per 1,000 output (completion) tokens. */
  outputPer1k: number;
}

export type PricingSource = "provider" | "catalog" | "mock" | "unknown";

export interface ModelCallCost {
  costUsd: number;
  pricingSource: PricingSource;
}

/**
 * Static pricing table. Keyed by exact model identifier as returned by the API.
 * Local models (Ollama) are intentionally $0 — only electricity.
 *
 * Prices sourced from provider pricing pages as of CATALOG_AS_OF. These are
 * list prices; LiteLLM-proxy-reported costs (source: "provider") override these
 * when available because the proxy may apply negotiated discounts.
 */
export const CATALOG_AS_OF = "2026-07-07";

export const PRICING_CATALOG: Record<string, ModelPricing> = {
  // OpenAI — https://openai.com/api/pricing/
  "gpt-4o": { inputPer1k: 0.0025, outputPer1k: 0.01 },
  "gpt-4o-mini": { inputPer1k: 0.00015, outputPer1k: 0.0006 },
  "gpt-4o-2024-11-20": { inputPer1k: 0.0025, outputPer1k: 0.01 },
  "gpt-4o-mini-2024-07-18": { inputPer1k: 0.00015, outputPer1k: 0.0006 },
  "gpt-4.1": { inputPer1k: 0.002, outputPer1k: 0.008 },
  "gpt-4.1-mini": { inputPer1k: 0.0004, outputPer1k: 0.0016 },
  "gpt-4.1-nano": { inputPer1k: 0.0001, outputPer1k: 0.0004 },
  "o1": { inputPer1k: 0.015, outputPer1k: 0.06 },
  "o1-mini": { inputPer1k: 0.0011, outputPer1k: 0.0044 },
  "o3-mini": { inputPer1k: 0.0011, outputPer1k: 0.0044 },

  // Anthropic — https://www.anthropic.com/pricing
  "claude-sonnet-4-20250514": { inputPer1k: 0.003, outputPer1k: 0.015 },
  "claude-3-5-sonnet-20241022": { inputPer1k: 0.003, outputPer1k: 0.015 },
  "claude-3-5-haiku-20241022": { inputPer1k: 0.0008, outputPer1k: 0.004 },
  "claude-3-opus-20240229": { inputPer1k: 0.015, outputPer1k: 0.075 },

  // Google Gemini — https://ai.google.dev/pricing
  "gemini-1.5-pro": { inputPer1k: 0.00125, outputPer1k: 0.005 },
  "gemini-1.5-flash": { inputPer1k: 0.000075, outputPer1k: 0.0003 },
  "gemini-2.0-flash": { inputPer1k: 0.0001, outputPer1k: 0.0004 },

  // Mistral — https://mistral.ai/products/la-plateforme#pricing
  "mistral-large-latest": { inputPer1k: 0.002, outputPer1k: 0.006 },
  "mistral-small-latest": { inputPer1k: 0.0002, outputPer1k: 0.0006 },

  // DeepSeek
  "deepseek-chat": { inputPer1k: 0.00014, outputPer1k: 0.00028 },

  // Local models (Ollama / llama.cpp) — no per-token API cost.
  // Listed explicitly so pricingSource is "catalog" rather than "unknown".
  "llama3.1": { inputPer1k: 0, outputPer1k: 0 },
  "llama3.1:8b": { inputPer1k: 0, outputPer1k: 0 },
  "llama3.1:70b": { inputPer1k: 0, outputPer1k: 0 },
  "qwen2.5": { inputPer1k: 0, outputPer1k: 0 },
};

/**
 * Resolve pricing for a model name, handling `provider/model` prefixes
 * (LiteLLM convention, e.g. `ollama/llama3.1`, `anthropic/claude-...`).
 */
export function lookupPricing(modelName: string): ModelPricing | undefined {
  if (!modelName) return undefined;
  const stripped = modelName.includes("/")
    ? modelName.split("/").slice(1).join("/")
    : modelName;
  return PRICING_CATALOG[modelName] ?? PRICING_CATALOG[stripped];
}

/**
 * Compute cost for a single model call using the three-tier fallback.
 *
 * Mock providers (providerId starts with "local.mock") are forced to $0 because
 * their "token counts" are actually character lengths (see createMockModelProvider).
 */
export function computeCallCost(input: {
  providerId?: string;
  modelName?: string;
  inputTokens?: number;
  outputTokens?: number;
  providerReportedCost?: number;
}): ModelCallCost {
  const { providerId, modelName, inputTokens, outputTokens, providerReportedCost } = input;

  // Mock providers report character counts, not tokens — never bill them.
  if (providerId && providerId.startsWith("local.mock")) {
    return { costUsd: 0, pricingSource: "mock" };
  }

  // Tier 1: provider-reported cost (LiteLLM proxy).
  if (providerReportedCost !== undefined && providerReportedCost > 0) {
    return { costUsd: providerReportedCost, pricingSource: "provider" };
  }

  // Tier 2: compute from catalog.
  if (modelName) {
    const price = lookupPricing(modelName);
    if (
      price &&
      inputTokens !== undefined &&
      outputTokens !== undefined &&
      inputTokens >= 0 &&
      outputTokens >= 0
    ) {
      const cost =
        (inputTokens / 1000) * price.inputPer1k +
        (outputTokens / 1000) * price.outputPer1k;
      return { costUsd: cost, pricingSource: "catalog" };
    }
  }

  // Tier 3: unknown.
  return { costUsd: 0, pricingSource: "unknown" };
}
