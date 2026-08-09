import { describe, expect, it } from "vitest"
import {
  hasUsableModelProvider,
  hasUsableNonEnvoyLocalModelProvider,
  inferModelProviderPreset,
  listModelProviderPresets,
  resolveOpenClawModelConfig,
} from "../src/model-provider-presets.js"

describe("model-provider-presets", () => {
  it("lists cloud presets without local when includeLocal=false", () => {
    const ids = listModelProviderPresets({ includeLocal: false }).map((p) => p.id)
    expect(ids).toContain("minimax-cn")
    expect(ids).toContain("anthropic")
    expect(ids).not.toContain("ollama")
    expect(ids).not.toContain("litellm")
  })

  it("uses presetId when endpoint host is unrecognized", () => {
    expect(
      inferModelProviderPreset({
        mode: "openai-compatible",
        presetId: "deepseek",
        endpoint: "https://llm.example.com/v1",
      }).id,
    ).toBe("deepseek")
  })

  it("endpoint host wins over a stale presetId", () => {
    expect(
      inferModelProviderPreset({
        mode: "openai-compatible",
        presetId: "openai",
        endpoint: "https://open.bigmodel.cn/api/paas/v4",
      }).id,
    ).toBe("glm")
  })

  it("infers GLM / Qwen / Grok from endpoint hosts", () => {
    expect(
      inferModelProviderPreset({
        mode: "openai-compatible",
        endpoint: "https://open.bigmodel.cn/api/paas/v4",
      }).id,
    ).toBe("glm")
    expect(
      inferModelProviderPreset({
        mode: "openai-compatible",
        endpoint: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      }).id,
    ).toBe("qwen")
    expect(
      inferModelProviderPreset({
        mode: "openai-compatible",
        endpoint: "https://api.x.ai/v1",
      }).id,
    ).toBe("xai")
  })

  it("infers openai-compatible generic when host is unknown", () => {
    expect(
      inferModelProviderPreset({
        mode: "openai-compatible",
        endpoint: "https://llm.example.com/v1",
      }).id,
    ).toBe("openai-compatible")
  })

  it("resolveOpenClawModelConfig fills default endpoint from preset", () => {
    const resolved = resolveOpenClawModelConfig({
      mode: "openai-compatible",
      presetId: "deepseek",
      modelName: "deepseek-chat",
      apiKey: "k",
    })!
    expect(resolved.providerId).toBe("deepseek")
    expect(resolved.baseUrl).toBe("https://api.deepseek.com/v1")
  })

  it("hasUsableModelProvider rejects disabled/mock/empty modelName", () => {
    expect(hasUsableModelProvider(undefined)).toBe(false)
    expect(hasUsableModelProvider({ mode: "disabled" })).toBe(false)
    expect(hasUsableModelProvider({ mode: "mock" })).toBe(false)
    expect(
      hasUsableModelProvider({ mode: "openai-compatible", presetId: "openai" }),
    ).toBe(false)
  })

  it("hasUsableModelProvider accepts cloud, ollama, and envoy-local", () => {
    expect(
      hasUsableModelProvider({
        mode: "openai-compatible",
        presetId: "openai",
        modelName: "gpt-4o-mini",
        apiKey: "k",
      }),
    ).toBe(true)
    expect(
      hasUsableModelProvider({
        mode: "ollama",
        presetId: "ollama",
        modelName: "llama3.2",
      }),
    ).toBe(true)
    expect(
      hasUsableModelProvider({
        mode: "openai-compatible",
        presetId: "envoy-local",
        modelName: "default.gguf",
        endpoint: "http://127.0.0.1:18790/v1",
      }),
    ).toBe(true)
  })

  it("hasUsableNonEnvoyLocalModelProvider treats envoy-local as non-external", () => {
    expect(
      hasUsableNonEnvoyLocalModelProvider({
        mode: "openai-compatible",
        presetId: "openai",
        modelName: "gpt-4o-mini",
        apiKey: "k",
      }),
    ).toBe(true)
    expect(
      hasUsableNonEnvoyLocalModelProvider({
        mode: "ollama",
        presetId: "ollama",
        modelName: "llama3.2",
      }),
    ).toBe(true)
    expect(
      hasUsableNonEnvoyLocalModelProvider({
        mode: "openai-compatible",
        presetId: "envoy-local",
        modelName: "default.gguf",
        endpoint: "http://127.0.0.1:18790/v1",
      }),
    ).toBe(false)
    expect(hasUsableNonEnvoyLocalModelProvider({ mode: "mock" })).toBe(false)
  })

  it("lists envoy-local as a local-only preset", () => {
    expect(listModelProviderPresets().map((p) => p.id)).toContain("envoy-local")
    expect(listModelProviderPresets({ includeLocal: false }).map((p) => p.id)).not.toContain(
      "envoy-local",
    )
  })
})
