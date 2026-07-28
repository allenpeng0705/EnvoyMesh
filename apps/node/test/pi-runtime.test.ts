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
import {
  buildPiSpawnConfig,
  discoverPiCli,
  extractAssistantTextFromPiMessage,
  extractTextFromAssistantMessageEvent,
  materializePiSpawnEnv,
  PiRuntime,
  resolveMiniMaxPiProvider,
  withPiToolPath,
} from "../src/pi-runtime.js"
import type { ModelProviderConfig, PiModelOverride } from "@envoymesh/api"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

describe("discoverPiCli", () => {
  it("finds the staged Tauri resources Pi even when given a bad root hint", () => {
    const staged = join(
      process.cwd(),
      "apps/tauri/src-tauri/resources/pi/node_modules/@earendil-works/pi-coding-agent/dist/cli.js",
    );
    if (!existsSync(staged)) return; // skip when sidecar not fetched
    const found = discoverPiCli("/tmp/not-the-repo-root");
    expect(found).not.toBeNull();
    expect(found!.cliPath).toContain("pi-coding-agent");
    expect(existsSync(found!.cliPath)).toBe(true);
  });
});

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
      expect(result.openaiBaseUrlOverride).toBeUndefined()
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

    it("maps MiniMax CN endpoints to Pi's native minimax-cn provider", () => {
      const cfg: ModelProviderConfig = {
        mode: "openai-compatible",
        apiKey: "sk-mm",
        endpoint: "https://api.minimaxi.com/v1",
        modelName: "MiniMax-M3",
      }
      const result = buildPiSpawnConfig(cfg)!
      expect(result.provider).toBe("minimax-cn")
      expect(result.modelSpec).toBe("minimax-cn/MiniMax-M3")
      expect(result.env.MINIMAX_CN_API_KEY).toBe("sk-mm")
      expect(result.env.MINIMAX_API_KEY).toBe("sk-mm")
      expect(result.env.OPENAI_API_KEY).toBeUndefined()
      expect(result.openaiBaseUrlOverride).toBeUndefined()
    })

    it("maps MiniMax international endpoints to Pi's native minimax provider", () => {
      const cfg: ModelProviderConfig = {
        mode: "openai-compatible",
        apiKey: "sk-mm",
        endpoint: "https://api.minimax.io/v1",
        modelName: "MiniMax-M3",
      }
      const result = buildPiSpawnConfig(cfg)!
      expect(result.provider).toBe("minimax")
      expect(result.modelSpec).toBe("minimax/MiniMax-M3")
      expect(result.env.MINIMAX_API_KEY).toBe("sk-mm")
      expect(result.env.OPENAI_API_KEY).toBeUndefined()
    })

    it("sets openaiBaseUrlOverride for non-OpenAI compatible endpoints", () => {
      const cfg: ModelProviderConfig = {
        mode: "openai-compatible",
        apiKey: "sk-local",
        endpoint: "http://127.0.0.1:8080/v1",
        modelName: "local-model",
      }
      const result = buildPiSpawnConfig(cfg)!
      expect(result.provider).toBe("openai")
      expect(result.openaiBaseUrlOverride).toBe("http://127.0.0.1:8080/v1")
      expect(result.env.OPENAI_BASE_URL).toBe("http://127.0.0.1:8080/v1")
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
        endpoint: "https://api.example.com/v1",
      }
      const result = buildPiSpawnConfig(cfg, override)!
      expect(result.provider).toBe("openai")
      expect(result.model).toBe("gpt-4o")
      expect(result.env.OPENAI_API_KEY).toBe("override-key")
      expect(result.env.OPENAI_BASE_URL).toBe("https://api.example.com/v1")
      expect(result.openaiBaseUrlOverride).toBe("https://api.example.com/v1")
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
      expect(result.inherited).toBe(false)
    })

    it("mode-based override maps MiniMax like Settings → AI", () => {
      const result = buildPiSpawnConfig(
        { mode: "disabled" },
        {
          mode: "openai-compatible",
          model: "MiniMax-M3",
          endpoint: "https://api.minimaxi.com/v1",
          apiKey: "sk-mm",
        },
      )!
      expect(result.provider).toBe("minimax-cn")
      expect(result.env.MINIMAX_CN_API_KEY).toBe("sk-mm")
      expect(result.inherited).toBe(false)
    })

    it("Pi-native provider override wins over legacy mode", () => {
      const result = buildPiSpawnConfig(
        { mode: "openai-compatible", modelName: "gpt-4o", apiKey: "x" },
        {
          provider: "minimax-cn",
          mode: "openai-compatible",
          model: "MiniMax-M3",
          apiKey: "sk-mm",
        },
      )!
      expect(result.provider).toBe("minimax-cn")
      expect(result.model).toBe("MiniMax-M3")
      expect(result.env.MINIMAX_CN_API_KEY).toBe("sk-mm")
    })

    it("direct openai provider + MiniMax endpoint remaps to minimax-cn", () => {
      const result = buildPiSpawnConfig(
        { mode: "mock" },
        {
          provider: "openai",
          model: "MiniMax-M3",
          endpoint: "https://api.minimaxi.com/v1",
          apiKey: "sk-mm",
        },
      )!
      expect(result.provider).toBe("minimax-cn")
      expect(result.inherited).toBe(false)
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

describe("resolveMiniMaxPiProvider", () => {
  it("detects CN and international hosts", () => {
    expect(resolveMiniMaxPiProvider("https://api.minimaxi.com/v1")?.provider).toBe("minimax-cn")
    expect(resolveMiniMaxPiProvider("https://api.minimax.io/anthropic")?.provider).toBe("minimax")
    expect(resolveMiniMaxPiProvider("https://api.openai.com/v1")).toBeNull()
  })
})

describe("materializePiSpawnEnv", () => {
  it("writes PI_CODING_AGENT_DIR models.json for openaiBaseUrlOverride", () => {
    const env = materializePiSpawnEnv({
      modelSpec: "openai/local",
      provider: "openai",
      model: "local",
      env: { OPENAI_API_KEY: "k" },
      inherited: true,
      openaiBaseUrlOverride: "http://127.0.0.1:9000/v1",
    })
    expect(env.PI_CODING_AGENT_DIR).toBeTruthy()
    const modelsPath = join(env.PI_CODING_AGENT_DIR!, "models.json")
    expect(existsSync(modelsPath)).toBe(true)
    const models = JSON.parse(readFileSync(modelsPath, "utf8"))
    expect(models.providers.openai.baseUrl).toBe("http://127.0.0.1:9000/v1")
  })
})

describe("withPiToolPath", () => {
  it("preserves provider env and may add PATH for tool discovery", () => {
    const out = withPiToolPath({ OPENAI_API_KEY: "k" })
    expect(out.OPENAI_API_KEY).toBe("k")
    if (existsSync("/opt/homebrew/bin") || existsSync("/usr/local/bin")) {
      expect(out.PATH).toBeTruthy()
      expect(out.PATH).toMatch(/homebrew|\/usr\/local\/bin/)
    }
  })

  it("includes PATH on openai-compatible spawn config when brew dirs exist", () => {
    const cfg: ModelProviderConfig = {
      mode: "openai-compatible",
      apiKey: "k",
      modelName: "gpt-4o-mini",
      endpoint: "https://api.openai.com/v1",
    }
    const result = buildPiSpawnConfig(cfg)!
    expect(result.env.OPENAI_API_KEY).toBe("k")
    if (existsSync("/opt/homebrew/bin")) {
      expect(result.env.PATH).toContain("/opt/homebrew/bin")
    }
  })
})

describe("extractAssistantTextFromPiMessage", () => {
  it("reads string content", () => {
    expect(extractAssistantTextFromPiMessage({ role: "assistant", content: "hi" })).toBe("hi")
  })

  it("joins text parts", () => {
    expect(
      extractAssistantTextFromPiMessage({
        role: "assistant",
        content: [
          { type: "text", text: "hello " },
          { type: "text", text: "world" },
        ],
      }),
    ).toBe("hello world")
  })

  it("ignores non-assistant roles", () => {
    expect(extractAssistantTextFromPiMessage({ role: "user", content: "nope" })).toBe("")
  })

  it("surfaces errorMessage when content is empty", () => {
    expect(
      extractAssistantTextFromPiMessage({
        role: "assistant",
        content: [],
        errorMessage: "rate limited",
      }),
    ).toBe("⚠️ rate limited")
  })
})

describe("extractTextFromAssistantMessageEvent", () => {
  it("prefers partial snapshot over raw delta", () => {
    expect(
      extractTextFromAssistantMessageEvent({
        type: "text_delta",
        delta: "x",
        partial: { role: "assistant", content: [{ type: "text", text: "hello" }] },
      }),
    ).toBe("hello")
  })

  it("reads done.message", () => {
    expect(
      extractTextFromAssistantMessageEvent({
        type: "done",
        message: { role: "assistant", content: [{ type: "text", text: "done" }] },
      }),
    ).toBe("done")
  })
})

describe("PiRuntime event fan-out", () => {
  /** Minimal runtime — we only exercise handleLine emit paths (no spawn). */
  function bareRuntime(): PiRuntime {
    return new PiRuntime({
      cliPath: "/dev/null",
      version: "test",
      spawnConfig: {
        provider: "openai",
        model: "test",
        modelSpec: "openai/test",
        env: {},
        inherited: true,
      },
    })
  }

  it("emits agent_end by type so prompt() once() listeners can complete", () => {
    const rt = bareRuntime()
    let named = false
    let viaEvent = false
    rt.once("agent_end", () => {
      named = true
    })
    rt.once("event", (ev: { type?: string }) => {
      if (ev.type === "agent_end") viaEvent = true
    })
    // Private handleLine — same path as stdout JSONL from Pi.
    ;(rt as unknown as { handleLine: (line: string) => void }).handleLine(
      JSON.stringify({ type: "agent_end" }),
    )
    expect(viaEvent).toBe(true)
    expect(named).toBe(true)
  })

  it("emits turn_end by type", () => {
    const rt = bareRuntime()
    let named = false
    rt.once("turn_end", () => {
      named = true
    })
    ;(rt as unknown as { handleLine: (line: string) => void }).handleLine(
      JSON.stringify({ type: "turn_end" }),
    )
    expect(named).toBe(true)
  })
})
