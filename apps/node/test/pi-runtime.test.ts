/**
 * Phase 49 — unit tests for Pi runtime model-config mapping.
 *
 * Tests buildPiSpawnConfig() — the function that converts EnvoyMesh's
 * ModelProviderConfig into the Pi CLI args + scoped env vars. This is the
 * security-critical piece: the API key must NEVER end up in CLI args or
 * the parent process env, only in the returned env object.
 *
 * The full PiRuntime class (spawn, JSONL protocol, readiness) is integration-
 * tested separately (gated on RUN_PI_TESTS=1 since it needs the real Pi binary).
 */
import { describe, it, expect } from "vitest"
import { buildPiSpawnConfig } from "../src/pi-runtime.js"
import type { ModelProviderConfig, PiModelOverride } from "@envoymesh/api"

describe("buildPiSpawnConfig", () => {
  describe("anthropic-compatible mode", () => {
    it("maps to anthropic provider + ANTHROPIC_API_KEY env var", () => {
      const cfg: ModelProviderConfig = {
        mode: "anthropic-compatible",
        apiKey: "sk-ant-test-123",
        modelName: "claude-sonnet-4-20250514",
      }
      const result = buildPiSpawnConfig(cfg)
      expect(result).not.toBeNull()
      expect(result!.provider).toBe("anthropic")
      expect(result!.model).toBe("claude-sonnet-4-20250514")
      expect(result!.modelSpec).toBe("anthropic/claude-sonnet-4-20250514")
      expect(result!.env.ANTHROPIC_API_KEY).toBe("sk-ant-test-123")
      expect(result!.inherited).toBe(true)
    })

    it("does NOT set OPENAI_API_KEY or other provider env vars", () => {
      const cfg: ModelProviderConfig = {
        mode: "anthropic-compatible",
        apiKey: "sk-ant-test",
        modelName: "claude-sonnet-4-20250514",
      }
      const result = buildPiSpawnConfig(cfg)!
      expect(result.env.OPENAI_API_KEY).toBeUndefined()
      expect(result.env.OPENAI_BASE_URL).toBeUndefined()
    })

    it("works without an API key (env-only auth, e.g. OAuth sidecar)", () => {
      const cfg: ModelProviderConfig = {
        mode: "anthropic-compatible",
        modelName: "claude-sonnet-4-20250514",
      }
      const result = buildPiSpawnConfig(cfg)!
      expect(result.env.ANTHROPIC_API_KEY).toBeUndefined()
      expect(result.provider).toBe("anthropic")
    })
  })

  describe("openai-compatible mode", () => {
    it("maps to openai provider + OPENAI_API_KEY + OPENAI_BASE_URL", () => {
      const cfg: ModelProviderConfig = {
        mode: "openai-compatible",
        apiKey: "sk-test-key",
        endpoint: "https://api.openai.com/v1",
        modelName: "gpt-4o-mini",
      }
      const result = buildPiSpawnConfig(cfg)!
      expect(result.provider).toBe("openai")
      expect(result.model).toBe("gpt-4o-mini")
      expect(result.modelSpec).toBe("openai/gpt-4o-mini")
      expect(result.env.OPENAI_API_KEY).toBe("sk-test-key")
      expect(result.env.OPENAI_BASE_URL).toBe("https://api.openai.com/v1")
    })

    it("omits OPENAI_BASE_URL when endpoint is unset (defaults to OpenAI's)", () => {
      const cfg: ModelProviderConfig = {
        mode: "openai-compatible",
        apiKey: "sk-test",
        modelName: "gpt-4o",
      }
      const result = buildPiSpawnConfig(cfg)!
      expect(result.env.OPENAI_BASE_URL).toBeUndefined()
    })
  })

  describe("ollama mode", () => {
    it("maps to ollama provider + OLLAMA_BASE_URL (default localhost:11434)", () => {
      const cfg: ModelProviderConfig = {
        mode: "ollama",
        modelName: "llama3.2",
      }
      const result = buildPiSpawnConfig(cfg)!
      expect(result.provider).toBe("ollama")
      expect(result.env.OLLAMA_BASE_URL).toBe("http://localhost:11434")
    })

    it("uses custom endpoint when provided", () => {
      const cfg: ModelProviderConfig = {
        mode: "ollama",
        endpoint: "http://my-host:11434",
        modelName: "llama3.2",
      }
      const result = buildPiSpawnConfig(cfg)!
      expect(result.env.OLLAMA_BASE_URL).toBe("http://my-host:11434")
    })
  })

  describe("litellm mode", () => {
    it("maps to litellm provider + LITELLM_API_KEY + LITELLM_BASE_URL", () => {
      const cfg: ModelProviderConfig = {
        mode: "litellm",
        apiKey: "litellm-key",
        endpoint: "http://localhost:4000",
        modelName: "gpt-4o",
      }
      const result = buildPiSpawnConfig(cfg)!
      expect(result.provider).toBe("litellm")
      expect(result.env.LITELLM_API_KEY).toBe("litellm-key")
      expect(result.env.LITELLM_BASE_URL).toBe("http://localhost:4000")
    })
  })

  describe("disabled / mock modes return null", () => {
    it("returns null for 'disabled'", () => {
      const result = buildPiSpawnConfig({ mode: "disabled" })
      expect(result).toBeNull()
    })

    it("returns null for 'mock'", () => {
      const result = buildPiSpawnConfig({ mode: "mock", mockResponseText: "hi" })
      expect(result).toBeNull()
    })

    it("returns null when modelName is missing", () => {
      const result = buildPiSpawnConfig({ mode: "anthropic-compatible", apiKey: "k" })
      expect(result).toBeNull()
    })
  })

  describe("per-session override takes precedence", () => {
    it("uses the override instead of the inherited config", () => {
      const cfg: ModelProviderConfig = {
        mode: "anthropic-compatible",
        apiKey: "inherited-key",
        modelName: "claude-sonnet-4-20250514",
      }
      const override: PiModelOverride = {
        provider: "openai",
        model: "gpt-4o",
        apiKey: "override-key",
        endpoint: "https://custom.openai.com/v1",
      }
      const result = buildPiSpawnConfig(cfg, override)!
      expect(result.provider).toBe("openai")
      expect(result.model).toBe("gpt-4o")
      expect(result.env.OPENAI_API_KEY).toBe("override-key")
      expect(result.env.OPENAI_BASE_URL).toBe("https://custom.openai.com/v1")
      // CRITICAL: override key must NOT pollute the inherited provider's env var.
      expect(result.env.ANTHROPIC_API_KEY).toBeUndefined()
      expect(result.inherited).toBe(false)
    })

    it("override works even when base config is disabled", () => {
      const result = buildPiSpawnConfig({ mode: "disabled" }, {
        provider: "anthropic",
        model: "claude-sonnet-4-20250514",
        apiKey: "k",
      })!
      expect(result.provider).toBe("anthropic")
      expect(result.env.ANTHROPIC_API_KEY).toBe("k")
    })
  })

  describe("security: API key never leaks into CLI-arg-shaped fields", () => {
    // The modelSpec, provider, and model fields end up as CLI args
    // (`pi --provider <p> --model <m>`). The API key must NEVER appear
    // in any of them — only in the env object.
    it("never puts the API key in modelSpec / provider / model fields", () => {
      const cfg: ModelProviderConfig = {
        mode: "openai-compatible",
        apiKey: "sk-super-secret-key",
        modelName: "gpt-4o",
      }
      const result = buildPiSpawnConfig(cfg)!
      const allCliFields = JSON.stringify([result.modelSpec, result.provider, result.model])
      expect(allCliFields).not.toContain("sk-super-secret-key")
      expect(result.env.OPENAI_API_KEY).toBe("sk-super-secret-key")
    })
  })
})
