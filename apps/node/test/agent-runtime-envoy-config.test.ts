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
} from "../src/agent-runtime-envoy/index.js";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("loadEnvoyHarnessRuntimeConfig (Phase 8 / b3.live — model inheritance)", () => {
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
