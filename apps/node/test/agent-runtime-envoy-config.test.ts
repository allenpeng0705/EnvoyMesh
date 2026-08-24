/**
 * Phase 8 Step 2 / b3.live — model inheritance tests.
 *
 * **Acceptance:**
 * 1. `loadEnvoyHarnessRuntimeConfig({ hostModel })` honors
 *    the `ENVOY_HARNESS_MODEL` env var first (explicit
 *    override).
 * 2. Falls back to the injected `hostModel` when the env
 *    var is unset.
 * 3. Falls back to the default `deepseek:deepseek-chat`
 *    when neither is set.
 * 4. `resolveEnvoyHarnessHostModel(modelProviders)` maps
 *    the host's `ModelProviderConfig` to a
 *    `<provider>:<model>` string per the table in
 *    `docs/agent-harness-integration-b2-b3.md` §4.1.
 * 5. Unsupported modes (`mock`, `disabled`) → `undefined`
 *    (not ready).
 * 6. `litellm` mode → `openai:<modelName>` (reuses the
 *    `openai` adapter).
 * 7. Empty `modelName` → `undefined` (user hasn't picked
 *    a model yet).
 *
 * **Why these tests are hermetic:** the test uses
 * `vi.stubEnv` to mask all relevant env vars. The
 * host-model function is pure (no I/O); it just maps
 * the input `ModelProviderConfig` to a string.
 */

import { describe, expect, it, vi } from "vitest";
import type { ModelProviderConfig } from "@envoymesh/api";

import {
  loadEnvoyHarnessRuntimeConfig,
  resolveEnvoyHarnessHostModel,
  resolveEnvoyHarnessHostConfig,
} from "../src/agent-runtime-envoy/index.js";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("loadEnvoyHarnessRuntimeConfig (Phase 8 / b3.live — model inheritance)", () => {
  it("carries the host endpoint into the runtime config", () => {
    const result = loadEnvoyHarnessRuntimeConfig({
      hostModel: "openai:MiniMax-M3",
      hostApiKey: "sk-123",
      hostEndpoint: "https://api.minimaxi.com/v1",
    });
    expect(result.ready).toBe(true);
    expect(result.endpoint).toBe("https://api.minimaxi.com/v1");
    expect(result.provider).toBe("openai");
  });

  it("allows a keyless local endpoint (Envoy Local) with a placeholder key", () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const result = loadEnvoyHarnessRuntimeConfig({
      hostModel: "openai:qwen2.5-coder-7b",
      hostEndpoint: "http://127.0.0.1:18790/v1",
    });
    vi.unstubAllEnvs();
    expect(result.ready).toBe(true);
    expect(result.apiKey).toBe("local");
    expect(result.endpoint).toBe("http://127.0.0.1:18790/v1");
  });

  it("still requires a key for non-local endpoints", () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const result = loadEnvoyHarnessRuntimeConfig({
      hostModel: "openai:gpt-4o",
      hostEndpoint: "https://api.openai.com/v1",
    });
    vi.unstubAllEnvs();
    expect(result.ready).toBe(false);
    expect(result.reason).toMatch(/api_key_missing/);
  });

  describe("model precedence (env var > hostModel > default)", () => {
    it("ENVOY_HARNESS_MODEL wins over hostModel (explicit override)", () => {
      vi.stubEnv("ENVOY_HARNESS_MODEL", "anthropic:claude-3-5-sonnet");
      vi.stubEnv("ENVOY_HARNESS_API_KEY", "");
      vi.stubEnv("DEEPSEEK_API_KEY", "sk-test-deepseek");
      vi.stubEnv("OPENAI_API_KEY", "");
      vi.stubEnv("ANTHROPIC_API_KEY", "sk-test-anthropic");
      vi.stubEnv("ENVOY_HARNESS_STUB_PHASE_8_STEP_1", "");
      try {
        const cfg = loadEnvoyHarnessRuntimeConfig({
          hostModel: "openai:gpt-4o-mini",
        });
        expect(cfg.model).toBe("anthropic:claude-3-5-sonnet");
        expect(cfg.provider).toBe("anthropic");
        expect(cfg.ready).toBe(true);
      } finally {
        vi.unstubAllEnvs();
      }
    });

    it("hostModel wins over the default (when no env override)", () => {
      // The host's model is e.g. the user's settings.json
      // `modelProviders` (openai + gpt-4o-mini). envoy-harness
      // should use it as the default when ENVOY_HARNESS_MODEL
      // is unset.
      vi.stubEnv("ENVOY_HARNESS_MODEL", "");
      vi.stubEnv("ENVOY_HARNESS_API_KEY", "");
      vi.stubEnv("DEEPSEEK_API_KEY", "");
      vi.stubEnv("OPENAI_API_KEY", "sk-test-openai");
      vi.stubEnv("ANTHROPIC_API_KEY", "");
      vi.stubEnv("ENVOY_HARNESS_STUB_PHASE_8_STEP_1", "");
      try {
        const cfg = loadEnvoyHarnessRuntimeConfig({
          hostModel: "openai:gpt-4o-mini",
        });
        expect(cfg.model).toBe("openai:gpt-4o-mini");
        expect(cfg.provider).toBe("openai");
        expect(cfg.ready).toBe(true);
      } finally {
        vi.unstubAllEnvs();
      }
    });

    it("falls back to deepseek:deepseek-chat when neither env nor hostModel is set", () => {
      vi.stubEnv("ENVOY_HARNESS_MODEL", "");
      vi.stubEnv("ENVOY_HARNESS_API_KEY", "");
      vi.stubEnv("DEEPSEEK_API_KEY", "sk-test-deepseek");
      vi.stubEnv("OPENAI_API_KEY", "");
      vi.stubEnv("ANTHROPIC_API_KEY", "");
      vi.stubEnv("ENVOY_HARNESS_STUB_PHASE_8_STEP_1", "");
      try {
        const cfg = loadEnvoyHarnessRuntimeConfig({ hostModel: undefined });
        expect(cfg.model).toBe("deepseek:deepseek-chat");
        expect(cfg.provider).toBe("deepseek");
        expect(cfg.ready).toBe(true);
      } finally {
        vi.unstubAllEnvs();
      }
    });

    it("falls back to the default when hostModel is not provided", () => {
      vi.stubEnv("ENVOY_HARNESS_MODEL", "");
      vi.stubEnv("ENVOY_HARNESS_API_KEY", "");
      vi.stubEnv("DEEPSEEK_API_KEY", "sk-test-deepseek");
      vi.stubEnv("OPENAI_API_KEY", "");
      vi.stubEnv("ANTHROPIC_API_KEY", "");
      vi.stubEnv("ENVOY_HARNESS_STUB_PHASE_8_STEP_1", "");
      try {
        // No opts at all → default.
        const cfg = loadEnvoyHarnessRuntimeConfig();
        expect(cfg.model).toBe("deepseek:deepseek-chat");
      } finally {
        vi.unstubAllEnvs();
      }
    });
  });

  describe("readiness with hostModel", () => {
    it("ready=true when the host's openai model + OPENAI_API_KEY are set", () => {
      vi.stubEnv("ENVOY_HARNESS_MODEL", "");
      vi.stubEnv("ENVOY_HARNESS_API_KEY", "");
      vi.stubEnv("DEEPSEEK_API_KEY", "");
      vi.stubEnv("OPENAI_API_KEY", "sk-test-openai");
      vi.stubEnv("ANTHROPIC_API_KEY", "");
      vi.stubEnv("ENVOY_HARNESS_STUB_PHASE_8_STEP_1", "");
      try {
        const cfg = loadEnvoyHarnessRuntimeConfig({
          hostModel: "openai:gpt-4o-mini",
        });
        expect(cfg.ready).toBe(true);
        expect(cfg.provider).toBe("openai");
      } finally {
        vi.unstubAllEnvs();
      }
    });

    it("ready=false with envoy_harness_api_key_missing when no key is set for the host's provider", () => {
      vi.stubEnv("ENVOY_HARNESS_MODEL", "");
      vi.stubEnv("ENVOY_HARNESS_API_KEY", "");
      vi.stubEnv("DEEPSEEK_API_KEY", "");
      vi.stubEnv("OPENAI_API_KEY", "");
      vi.stubEnv("ANTHROPIC_API_KEY", "");
      vi.stubEnv("ENVOY_HARNESS_STUB_PHASE_8_STEP_1", "");
      try {
        // hostModel is openai but no OPENAI_API_KEY set.
        const cfg = loadEnvoyHarnessRuntimeConfig({
          hostModel: "openai:gpt-4o-mini",
        });
        expect(cfg.ready).toBe(false);
        expect(cfg.reason).toMatch(/envoy_harness_api_key_missing/);
        expect(cfg.reason).toContain("OPENAI_API_KEY");
      } finally {
        vi.unstubAllEnvs();
      }
    });

    it("ENVOY_HARNESS_API_KEY (universal override) is honored with hostModel", () => {
      vi.stubEnv("ENVOY_HARNESS_MODEL", "");
      vi.stubEnv("ENVOY_HARNESS_API_KEY", "sk-test-universal");
      vi.stubEnv("DEEPSEEK_API_KEY", "");
      vi.stubEnv("OPENAI_API_KEY", "");
      vi.stubEnv("ANTHROPIC_API_KEY", "");
      vi.stubEnv("ENVOY_HARNESS_STUB_PHASE_8_STEP_1", "");
      try {
        const cfg = loadEnvoyHarnessRuntimeConfig({
          hostModel: "openai:gpt-4o-mini",
        });
        expect(cfg.ready).toBe(true);
        expect(cfg.provider).toBe("openai");
      } finally {
        vi.unstubAllEnvs();
      }
    });
  });
});

describe("resolveEnvoyHarnessHostModel (Phase 8 / b3.live — provider mapping)", () => {
  describe("production providers", () => {
    it("maps openai mode to openai:<modelName>", () => {
      const result = resolveEnvoyHarnessHostModel({
        mode: "openai",
        modelName: "gpt-4o-mini",
      } as ModelProviderConfig);
      expect(result).toBe("openai:gpt-4o-mini");
    });

    it("maps anthropic mode to anthropic:<modelName>", () => {
      const result = resolveEnvoyHarnessHostModel({
        mode: "anthropic",
        modelName: "claude-3-5-sonnet",
      } as ModelProviderConfig);
      expect(result).toBe("anthropic:claude-3-5-sonnet");
    });

    it("maps ollama mode to ollama:<modelName>", () => {
      const result = resolveEnvoyHarnessHostModel({
        mode: "ollama",
        modelName: "llama3.1",
      } as ModelProviderConfig);
      expect(result).toBe("ollama:llama3.1");
    });

    it("maps litellm mode to openai:<modelName> (reuses openai adapter)", () => {
      // LiteLLM is OpenAI-compatible; envoy-harness uses
      // the openai adapter with a custom baseUrl (future).
      const result = resolveEnvoyHarnessHostModel({
        mode: "litellm",
        modelName: "gpt-4o-mini",
      } as ModelProviderConfig);
      expect(result).toBe("openai:gpt-4o-mini");
    });

    it("maps deepseek mode (future Tauri setting) to deepseek:<modelName>", () => {
      const result = resolveEnvoyHarnessHostModel({
        mode: "deepseek",
        modelName: "deepseek-chat",
      } as unknown as ModelProviderConfig);
      expect(result).toBe("deepseek:deepseek-chat");
    });

    it("maps openai-compatible mode (MiniMax / Envoy Local) to openai:<modelName>", () => {
      const result = resolveEnvoyHarnessHostModel({
        mode: "openai-compatible",
        modelName: "MiniMax-M3",
        endpoint: "https://api.minimaxi.com/v1",
      } as unknown as ModelProviderConfig);
      expect(result).toBe("openai:MiniMax-M3");
    });

    it("maps anthropic-compatible mode to anthropic:<modelName>", () => {
      const result = resolveEnvoyHarnessHostModel({
        mode: "anthropic-compatible",
        modelName: "claude-3-5-sonnet",
      } as unknown as ModelProviderConfig);
      expect(result).toBe("anthropic:claude-3-5-sonnet");
    });

    it("carries the host endpoint through resolveEnvoyHarnessHostConfig", () => {
      const result = resolveEnvoyHarnessHostConfig({
        mode: "openai-compatible",
        modelName: "MiniMax-M3",
        endpoint: "https://api.minimaxi.com/v1",
        apiKey: "sk-123",
      } as unknown as ModelProviderConfig);
      expect(result).toEqual({
        model: "openai:MiniMax-M3",
        apiKey: "sk-123",
        endpoint: "https://api.minimaxi.com/v1",
      });
    });
  });

  describe("unsupported modes (return undefined → not ready)", () => {
    it("returns undefined for mode='mock' (no real model)", () => {
      const result = resolveEnvoyHarnessHostModel({
        mode: "mock",
        modelName: "mock-model",
      } as ModelProviderConfig);
      expect(result).toBeUndefined();
    });

    it("returns undefined for mode='disabled' (model calls disabled at host level)", () => {
      const result = resolveEnvoyHarnessHostModel({
        mode: "disabled",
        modelName: "any-model",
      } as ModelProviderConfig);
      expect(result).toBeUndefined();
    });

    it("returns undefined for empty mode (no provider configured)", () => {
      const result = resolveEnvoyHarnessHostModel({
        mode: "" as unknown as ModelProviderConfig["mode"],
        modelName: "any-model",
      } as ModelProviderConfig);
      expect(result).toBeUndefined();
    });
  });

  describe("missing modelName (return undefined → not ready)", () => {
    it("returns undefined when openai mode but modelName is empty (user hasn't picked a model)", () => {
      const result = resolveEnvoyHarnessHostModel({
        mode: "openai",
        modelName: "",
      } as ModelProviderConfig);
      expect(result).toBeUndefined();
    });

    it("returns undefined when anthropic mode but modelName is undefined", () => {
      const result = resolveEnvoyHarnessHostModel({
        mode: "anthropic",
      } as ModelProviderConfig);
      expect(result).toBeUndefined();
    });

    it("returns undefined when modelName is whitespace-only", () => {
      const result = resolveEnvoyHarnessHostModel({
        mode: "openai",
        modelName: "   ",
      } as ModelProviderConfig);
      expect(result).toBeUndefined();
    });
  });

  describe("edge cases", () => {
    it("falls back to deepseek:<modelName> for unknown modes (matches the openclaw default)", () => {
      const result = resolveEnvoyHarnessHostModel({
        mode: "mystery-mode" as unknown as ModelProviderConfig["mode"],
        modelName: "some-model",
      } as ModelProviderConfig);
      expect(result).toBe("deepseek:some-model");
    });
  });
});

// ---------------------------------------------------------------------------
// Phase 8 / b3.live — API key inheritance tests
//
// **Acceptance:**
// 1. `loadEnvoyHarnessRuntimeConfig({ hostApiKey })` honors
//    the `ENVOY_HARNESS_API_KEY` env var first (universal
//    override).
// 2. Falls back to the injected `hostApiKey` when the
//    universal env var is unset.
// 3. Falls back to the provider-specific env var
//    (`DEEPSEEK_API_KEY` / `OPENAI_API_KEY` /
//    `ANTHROPIC_API_KEY`) when neither is set.
// 4. Returns `apiKey: undefined` when none of the above
//    are set (the host's `ModelProviderConfig.apiKey`
//    may be `undefined` for keyless providers like
//    `ollama`).
// 5. `resolveEnvoyHarnessHostConfig(modelProviders)` maps
//    the host's `ModelProviderConfig` to the
//    `{ model, apiKey }` pair consumed by
//    `loadEnvoyHarnessRuntimeConfig`.
// ---------------------------------------------------------------------------

describe("loadEnvoyHarnessRuntimeConfig (Phase 8 / b3.live — API key inheritance)", () => {
  describe("API key precedence (universal env > hostApiKey > provider-specific env)", () => {
    it("ENVOY_HARNESS_API_KEY wins over hostApiKey (universal override)", () => {
      vi.stubEnv("ENVOY_HARNESS_MODEL", "openai:gpt-4o-mini");
      vi.stubEnv("ENVOY_HARNESS_API_KEY", "sk-test-universal");
      vi.stubEnv("DEEPSEEK_API_KEY", "");
      vi.stubEnv("OPENAI_API_KEY", "");
      vi.stubEnv("ANTHROPIC_API_KEY", "");
      vi.stubEnv("ENVOY_HARNESS_STUB_PHASE_8_STEP_1", "");
      try {
        const cfg = loadEnvoyHarnessRuntimeConfig({
          hostApiKey: "sk-test-host",
        });
        expect(cfg.ready).toBe(true);
        expect(cfg.apiKey).toBe("sk-test-universal");
      } finally {
        vi.unstubAllEnvs();
      }
    });

    it("hostApiKey wins over the provider-specific env var (DI is the production path)", () => {
      // This is the key path the user pointed at: the
      // host's `ModelProviderConfig.apiKey` is the
      // source of truth, NOT the env var. The user
      // enters the key in the Tauri settings UI; the
      // host may not have mirrored it to
      // `process.env`.
      vi.stubEnv("ENVOY_HARNESS_MODEL", "openai:gpt-4o-mini");
      vi.stubEnv("ENVOY_HARNESS_API_KEY", "");
      vi.stubEnv("DEEPSEEK_API_KEY", "");
      vi.stubEnv("OPENAI_API_KEY", "sk-test-env-openai");
      vi.stubEnv("ANTHROPIC_API_KEY", "");
      vi.stubEnv("ENVOY_HARNESS_STUB_PHASE_8_STEP_1", "");
      try {
        const cfg = loadEnvoyHarnessRuntimeConfig({
          hostApiKey: "sk-test-host",
        });
        expect(cfg.ready).toBe(true);
        expect(cfg.apiKey).toBe("sk-test-host");
      } finally {
        vi.unstubAllEnvs();
      }
    });

    it("falls back to the provider-specific env var when neither env var nor hostApiKey is set", () => {
      vi.stubEnv("ENVOY_HARNESS_MODEL", "openai:gpt-4o-mini");
      vi.stubEnv("ENVOY_HARNESS_API_KEY", "");
      vi.stubEnv("DEEPSEEK_API_KEY", "");
      vi.stubEnv("OPENAI_API_KEY", "sk-test-env-openai");
      vi.stubEnv("ANTHROPIC_API_KEY", "");
      vi.stubEnv("ENVOY_HARNESS_STUB_PHASE_8_STEP_1", "");
      try {
        const cfg = loadEnvoyHarnessRuntimeConfig({});
        expect(cfg.ready).toBe(true);
        expect(cfg.apiKey).toBe("sk-test-env-openai");
      } finally {
        vi.unstubAllEnvs();
      }
    });

    it("ready=false with envoy_harness_api_key_missing when no key is set anywhere", () => {
      vi.stubEnv("ENVOY_HARNESS_MODEL", "openai:gpt-4o-mini");
      vi.stubEnv("ENVOY_HARNESS_API_KEY", "");
      vi.stubEnv("DEEPSEEK_API_KEY", "");
      vi.stubEnv("OPENAI_API_KEY", "");
      vi.stubEnv("ANTHROPIC_API_KEY", "");
      vi.stubEnv("ENVOY_HARNESS_STUB_PHASE_8_STEP_1", "");
      try {
        const cfg = loadEnvoyHarnessRuntimeConfig({});
        expect(cfg.ready).toBe(false);
        expect(cfg.apiKey).toBeUndefined();
        expect(cfg.reason).toMatch(/envoy_harness_api_key_missing/);
        expect(cfg.reason).toContain("OPENAI_API_KEY");
      } finally {
        vi.unstubAllEnvs();
      }
    });

    it("ready=true for ollama (keyless) without any API key", () => {
      // ollama is keyless — `createProviderAdapter`
      // passes a placeholder key internally. The
      // readiness check should NOT block on missing
      // API key for ollama.
      vi.stubEnv("ENVOY_HARNESS_MODEL", "ollama:llama3.1");
      vi.stubEnv("ENVOY_HARNESS_API_KEY", "");
      vi.stubEnv("DEEPSEEK_API_KEY", "");
      vi.stubEnv("OPENAI_API_KEY", "");
      vi.stubEnv("ANTHROPIC_API_KEY", "");
      vi.stubEnv("ENVOY_HARNESS_STUB_PHASE_8_STEP_1", "");
      try {
        const cfg = loadEnvoyHarnessRuntimeConfig({});
        expect(cfg.ready).toBe(true);
        expect(cfg.provider).toBe("ollama");
        // The key may be `undefined` or any value; the
        // runtime doesn't pass it to the adapter.
        expect(cfg.apiKey).toBeUndefined();
      } finally {
        vi.unstubAllEnvs();
      }
    });

    it("empty string env var falls through (does not override hostApiKey)", () => {
      // The `vi.stubEnv` + explicit `length > 0` check
      // means an empty string env var does NOT
      // override a non-empty `hostApiKey`. (The
      // `??` operator alone would treat empty string
      // as a real value and short-circuit the DI.)
      vi.stubEnv("ENVOY_HARNESS_MODEL", "openai:gpt-4o-mini");
      vi.stubEnv("ENVOY_HARNESS_API_KEY", "");
      vi.stubEnv("DEEPSEEK_API_KEY", "");
      vi.stubEnv("OPENAI_API_KEY", "");
      vi.stubEnv("ANTHROPIC_API_KEY", "");
      vi.stubEnv("ENVOY_HARNESS_STUB_PHASE_8_STEP_1", "");
      try {
        const cfg = loadEnvoyHarnessRuntimeConfig({
          hostApiKey: "sk-test-host",
        });
        expect(cfg.ready).toBe(true);
        expect(cfg.apiKey).toBe("sk-test-host");
      } finally {
        vi.unstubAllEnvs();
      }
    });

    it("hostApiKey with empty string falls through to the provider-specific env var", () => {
      vi.stubEnv("ENVOY_HARNESS_MODEL", "openai:gpt-4o-mini");
      vi.stubEnv("ENVOY_HARNESS_API_KEY", "");
      vi.stubEnv("DEEPSEEK_API_KEY", "");
      vi.stubEnv("OPENAI_API_KEY", "sk-test-env-openai");
      vi.stubEnv("ANTHROPIC_API_KEY", "");
      vi.stubEnv("ENVOY_HARNESS_STUB_PHASE_8_STEP_1", "");
      try {
        const cfg = loadEnvoyHarnessRuntimeConfig({
          hostApiKey: "",
        });
        expect(cfg.ready).toBe(true);
        expect(cfg.apiKey).toBe("sk-test-env-openai");
      } finally {
        vi.unstubAllEnvs();
      }
    });
  });

  describe("stub escape hatch (backward compat)", () => {
    it("ENVOY_HARNESS_STUB_PHASE_8_STEP_1=1 forces ready=false even with hostApiKey set", () => {
      vi.stubEnv("ENVOY_HARNESS_MODEL", "openai:gpt-4o-mini");
      vi.stubEnv("ENVOY_HARNESS_API_KEY", "");
      vi.stubEnv("DEEPSEEK_API_KEY", "");
      vi.stubEnv("OPENAI_API_KEY", "");
      vi.stubEnv("ANTHROPIC_API_KEY", "");
      vi.stubEnv("ENVOY_HARNESS_STUB_PHASE_8_STEP_1", "1");
      try {
        const cfg = loadEnvoyHarnessRuntimeConfig({
          hostApiKey: "sk-test-host",
        });
        expect(cfg.ready).toBe(false);
        expect(cfg.reason).toBe("envoy_harness_stub_phase_8_step_1");
      } finally {
        vi.unstubAllEnvs();
      }
    });
  });
});

describe("resolveEnvoyHarnessHostConfig (Phase 8 / b3.live — host config mapping)", () => {
  describe("production providers with API key", () => {
    it("maps openai mode + apiKey to { model, apiKey }", () => {
      const result = resolveEnvoyHarnessHostConfig({
        mode: "openai",
        modelName: "gpt-4o-mini",
        apiKey: "sk-test-openai",
      } as ModelProviderConfig);
      expect(result).toEqual({
        model: "openai:gpt-4o-mini",
        apiKey: "sk-test-openai",
      });
    });

    it("maps anthropic mode + apiKey to { model, apiKey }", () => {
      const result = resolveEnvoyHarnessHostConfig({
        mode: "anthropic",
        modelName: "claude-3-5-sonnet",
        apiKey: "sk-test-anthropic",
      } as ModelProviderConfig);
      expect(result).toEqual({
        model: "anthropic:claude-3-5-sonnet",
        apiKey: "sk-test-anthropic",
      });
    });

    it("maps ollama mode (no apiKey required) to { model, apiKey: undefined }", () => {
      const result = resolveEnvoyHarnessHostConfig({
        mode: "ollama",
        modelName: "llama3.1",
      } as ModelProviderConfig);
      expect(result).toEqual({
        model: "ollama:llama3.1",
        apiKey: undefined,
      });
    });

    it("trims whitespace from the API key", () => {
      const result = resolveEnvoyHarnessHostConfig({
        mode: "openai",
        modelName: "gpt-4o-mini",
        apiKey: "  sk-test-openai  ",
      } as ModelProviderConfig);
      expect(result?.apiKey).toBe("sk-test-openai");
    });
  });

  describe("unsupported modes (return undefined → not ready)", () => {
    it("returns undefined for mode='mock' (no real model)", () => {
      const result = resolveEnvoyHarnessHostConfig({
        mode: "mock",
        modelName: "mock-model",
        apiKey: "sk-test-mock",
      } as ModelProviderConfig);
      expect(result).toBeUndefined();
    });

    it("returns undefined for mode='disabled'", () => {
      const result = resolveEnvoyHarnessHostConfig({
        mode: "disabled",
        modelName: "any-model",
        apiKey: "sk-test-disabled",
      } as ModelProviderConfig);
      expect(result).toBeUndefined();
    });
  });

  describe("empty API key (return apiKey: undefined)", () => {
    it("returns { model, apiKey: undefined } when apiKey is empty (ollama, or user hasn't entered a key yet)", () => {
      const result = resolveEnvoyHarnessHostConfig({
        mode: "openai",
        modelName: "gpt-4o-mini",
        apiKey: "",
      } as ModelProviderConfig);
      expect(result).toEqual({
        model: "openai:gpt-4o-mini",
        apiKey: undefined,
      });
    });

    it("returns { model, apiKey: undefined } when apiKey is whitespace-only", () => {
      const result = resolveEnvoyHarnessHostConfig({
        mode: "openai",
        modelName: "gpt-4o-mini",
        apiKey: "   ",
      } as ModelProviderConfig);
      expect(result).toEqual({
        model: "openai:gpt-4o-mini",
        apiKey: undefined,
      });
    });

    it("returns { model, apiKey: undefined } when apiKey is undefined (e.g. older config without the field)", () => {
      const result = resolveEnvoyHarnessHostConfig({
        mode: "openai",
        modelName: "gpt-4o-mini",
      } as ModelProviderConfig);
      expect(result).toEqual({
        model: "openai:gpt-4o-mini",
        apiKey: undefined,
      });
    });
  });
});
