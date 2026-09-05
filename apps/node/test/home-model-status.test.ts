/**
 * Unit tests for the EM-4 `getHomeModelStatus` pure helpers
 * (docs/envoy-home-side-plan.md §1.3, thin-client-protocol v0.3 §2.2):
 * mode mapping from the effective provider config and deterministic
 * capability resolution from live Envoy Local / embed facts.
 * (The full handler lives in NodeServiceImpl.getHomeModelStatus and is
 * covered by typecheck + the router owner-gate test.)
 */
import { describe, expect, it } from "vitest";
import {
  buildHomeModelStatus,
  homeModelProviderModeFromConfig,
  type HomeModelStatusInput,
} from "../src/home-model-status.js";
import type {
  GetHomeModelStatusResult,
  ModelProviderConfig,
} from "@envoymesh/api";

/** Effective config shape `resolveEffectiveModelProviders` emits for Envoy Local. */
function envoyLocalConfig(
  overrides: Partial<ModelProviderConfig> = {},
): ModelProviderConfig {
  return {
    mode: "openai-compatible",
    presetId: "envoy-local",
    endpoint: "http://127.0.0.1:18790/v1",
    modelName: "qwen3-8b-q4_k_m",
    requireApprovalForCloud: false,
    ...overrides,
  };
}

function cloudConfig(
  mode: ModelProviderConfig["mode"],
  overrides: Partial<ModelProviderConfig> = {},
): ModelProviderConfig {
  return {
    mode,
    presetId: mode === "anthropic-compatible" ? "anthropic" : "openai",
    endpoint:
      mode === "anthropic-compatible"
        ? "https://api.anthropic.com"
        : "https://api.openai.com/v1",
    modelName: mode === "anthropic-compatible" ? "claude-sonnet-4-5" : "gpt-4o",
    ...overrides,
  };
}

function expectResult(input: HomeModelStatusInput): GetHomeModelStatusResult {
  return buildHomeModelStatus(input);
}

describe("homeModelProviderModeFromConfig", () => {
  it("maps envoy-local preset to envoy-local", () => {
    expect(homeModelProviderModeFromConfig(envoyLocalConfig())).toBe("envoy-local");
  });

  it("maps chat modes to canonical status modes", () => {
    expect(homeModelProviderModeFromConfig(cloudConfig("openai-compatible"))).toBe(
      "openai-compatible",
    );
    expect(
      homeModelProviderModeFromConfig({
        mode: "ollama",
        endpoint: "http://127.0.0.1:11434/v1",
        modelName: "llama3.1",
      }),
    ).toBe("ollama");
    expect(homeModelProviderModeFromConfig(cloudConfig("anthropic-compatible"))).toBe(
      "cloud",
    );
    expect(
      homeModelProviderModeFromConfig({
        mode: "litellm",
        endpoint: "http://127.0.0.1:4000/v1",
        modelName: "gpt-4o-mini",
      }),
    ).toBe("cloud");
  });

  it("maps mock / disabled / absent configs to their own labels", () => {
    expect(homeModelProviderModeFromConfig({ mode: "mock" })).toBe("mock");
    expect(homeModelProviderModeFromConfig({ mode: "disabled" })).toBe("disabled");
    expect(homeModelProviderModeFromConfig({ mode: "disabled", presetId: "disabled" })).toBe(
      "disabled",
    );
    expect(homeModelProviderModeFromConfig(null)).toBe("disabled");
    expect(homeModelProviderModeFromConfig(undefined)).toBe("disabled");
  });
});

describe("buildHomeModelStatus — envoy-local", () => {
  it("running with a ctx size reports configured/reachable/text + contextWindow", () => {
    const result = expectResult({
      config: envoyLocalConfig(),
      envoyLocal: { running: true },
      contextWindow: 32768,
    });
    expect(result.mode).toBe("envoy-local");
    expect(result.configured).toBe(true);
    expect(result.reachable).toBe(true);
    expect(result.model).toBe("qwen3-8b-q4_k_m");
    expect(result.capabilities.text).toBe(true);
    expect(result.capabilities.vision).toBe("unknown");
    expect(result.capabilities.embedding).toBe("unknown");
    expect(result.capabilities.streaming).toBe(false);
    expect(result.contextWindow).toBe(32768);
    expect(result.maxTokens).toBeUndefined();
  });

  it("configured but sidecar stopped → reachable false, no ctx window", () => {
    const result = expectResult({
      config: envoyLocalConfig(),
      envoyLocal: { running: false },
    });
    expect(result.configured).toBe(true);
    expect(result.reachable).toBe(false);
    expect(result.model).toBe("qwen3-8b-q4_k_m");
    expect(result.capabilities.text).toBe(true);
    expect(result.contextWindow).toBeUndefined();
  });

  it("resolves vision true only from a deterministic signal (mmproj)", () => {
    const result = expectResult({
      config: envoyLocalConfig(),
      envoyLocal: { running: true },
      vision: true,
    });
    expect(result.capabilities.vision).toBe(true);
  });

  it("reports declared vision false (not unknown) when a signal says no-vision", () => {
    const result = expectResult({
      config: envoyLocalConfig(),
      envoyLocal: { running: true },
      vision: false,
    });
    expect(result.capabilities.vision).toBe(false);
  });
});

describe("buildHomeModelStatus — cloud / ollama / openai-compatible", () => {
  it("anthropic-compatible maps to cloud with text enabled", () => {
    const result = expectResult({
      config: cloudConfig("anthropic-compatible"),
      maxTokens: 4096,
    });
    expect(result.mode).toBe("cloud");
    expect(result.configured).toBe(true);
    expect(result.reachable).toBe(true);
    expect(result.model).toBe("claude-sonnet-4-5");
    expect(result.capabilities.text).toBe(true);
    expect(result.maxTokens).toBe(4096);
  });

  it("openai-compatible cloud maps to openai-compatible", () => {
    const result = expectResult({
      config: cloudConfig("openai-compatible", { presetId: "minimax" }),
    });
    expect(result.mode).toBe("openai-compatible");
    expect(result.configured).toBe(true);
    expect(result.reachable).toBe(true);
    expect(result.model).toBe("gpt-4o");
  });

  it("ollama maps to ollama and passes contextWindow/maxTokens through", () => {
    const result = expectResult({
      config: {
        mode: "ollama",
        endpoint: "http://127.0.0.1:11434/v1",
        modelName: "llama3.1",
      },
      contextWindow: 8192,
      maxTokens: 2048,
    });
    expect(result.mode).toBe("ollama");
    expect(result.configured).toBe(true);
    expect(result.reachable).toBe(true);
    expect(result.model).toBe("llama3.1");
    expect(result.contextWindow).toBe(8192);
    expect(result.maxTokens).toBe(2048);
  });

  it("missing modelName → not configured/unreachable even with a mode", () => {
    const result = expectResult({
      config: { mode: "openai-compatible", endpoint: "https://api.example.com/v1" },
    });
    expect(result.configured).toBe(false);
    expect(result.reachable).toBe(false);
    expect(result.model).toBeNull();
    expect(result.capabilities.text).toBe(false);
    expect(result.capabilities.vision).toBe("unknown");
  });
});

describe("buildHomeModelStatus — mock / disabled fallbacks", () => {
  it("mock: configured=false, text=false, model null, vision unknown", () => {
    const result = expectResult({
      config: { mode: "mock", modelName: "mock-model" },
      modelName: "ignored",
    });
    expect(result.mode).toBe("mock");
    expect(result.configured).toBe(false);
    expect(result.reachable).toBe(false);
    expect(result.model).toBeNull();
    expect(result.capabilities).toEqual({
      text: false,
      vision: "unknown",
      embedding: "unknown",
      streaming: false,
    });
  });

  it("disabled: configured=false, text=false, model null", () => {
    const result = expectResult({ config: { mode: "disabled" } });
    expect(result.mode).toBe("disabled");
    expect(result.configured).toBe(false);
    expect(result.reachable).toBe(false);
    expect(result.model).toBeNull();
    expect(result.capabilities.text).toBe(false);
    expect(result.contextWindow).toBeUndefined();
    expect(result.maxTokens).toBeUndefined();
  });

  it("absent config (error-tolerant handler fallback) reports disabled", () => {
    const result = expectResult({ config: null });
    expect(result.mode).toBe("disabled");
    expect(result.configured).toBe(false);
    expect(result.reachable).toBe(false);
    expect(result.model).toBeNull();
  });

  it("mock/disabled never inherit a vision override", () => {
    const mock = expectResult({ config: { mode: "mock" }, vision: true });
    expect(mock.capabilities.vision).toBe("unknown");
    const disabled = expectResult({
      config: { mode: "disabled" },
      vision: true,
    });
    expect(disabled.capabilities.vision).toBe("unknown");
  });
});

describe("buildHomeModelStatus — embedding capability", () => {
  it("true when the embed sidecar (:18791) is running — even with chat disabled", () => {
    const result = expectResult({
      config: { mode: "disabled" },
      embedding: { sidecarRunning: true, providerConfigured: false },
    });
    expect(result.capabilities.embedding).toBe(true);
  });

  it("true when an embedding provider is configured (no sidecar needed)", () => {
    const result = expectResult({
      config: envoyLocalConfig(),
      envoyLocal: { running: true },
      embedding: { sidecarRunning: false, providerConfigured: true },
    });
    expect(result.capabilities.embedding).toBe(true);
  });

  it("unknown when no sidecar and no configured embed provider", () => {
    const result = expectResult({
      config: envoyLocalConfig(),
      envoyLocal: { running: true },
      embedding: { sidecarRunning: false, providerConfigured: false },
    });
    expect(result.capabilities.embedding).toBe("unknown");
  });

  it("unknown when no embedding facts are provided at all", () => {
    const result = expectResult({ config: envoyLocalConfig() });
    expect(result.capabilities.embedding).toBe("unknown");
  });
});

describe("buildHomeModelStatus — contextWindow/maxTokens passthrough hygiene", () => {
  it("omits both keys when absent/zero/NaN", () => {
    const result = expectResult({
      config: cloudConfig("anthropic-compatible"),
      contextWindow: 0,
      maxTokens: Number.NaN,
    });
    expect("contextWindow" in result).toBe(false);
    expect("maxTokens" in result).toBe(false);
  });

  it("floors fractional finite positives", () => {
    const result = expectResult({
      config: envoyLocalConfig(),
      envoyLocal: { running: true },
      contextWindow: 8192.9,
    });
    expect(result.contextWindow).toBe(8192);
  });

  it("does not emit contextWindow/maxTokens for mock/disabled", () => {
    const result = expectResult({
      config: { mode: "disabled" },
      contextWindow: 8192,
      maxTokens: 4096,
    });
    expect(result.contextWindow).toBeUndefined();
    expect(result.maxTokens).toBeUndefined();
  });
});
