import { describe, expect, it } from "vitest"
import {
  inferModelProviderPreset,
  resolveOpenClawModelConfig,
} from "@envoymesh/api"
import { buildOpenClawGatewayModelSection } from "../src/openclaw-gateway-config.js"

describe("inferModelProviderPreset", () => {
  it("endpoint host wins over a stale presetId", () => {
    expect(
      inferModelProviderPreset({
        mode: "openai-compatible",
        presetId: "deepseek",
        endpoint: "https://api.minimaxi.com/v1",
      }).id,
    ).toBe("minimax-cn")
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

  it("infers MiniMax CN from endpoint host", () => {
    expect(
      inferModelProviderPreset({
        mode: "openai-compatible",
        endpoint: "https://api.minimaxi.com/v1",
      }).id,
    ).toBe("minimax-cn")
  })

  it("infers Anthropic for anthropic-compatible without custom host", () => {
    expect(
      inferModelProviderPreset({
        mode: "anthropic-compatible",
        endpoint: "https://api.anthropic.com",
      }).id,
    ).toBe("anthropic")
  })
})

describe("resolveOpenClawModelConfig / buildOpenClawGatewayModelSection", () => {
  it("maps MiniMax CN to minimax-cn + openai-completions", () => {
    const resolved = resolveOpenClawModelConfig({
      mode: "openai-compatible",
      presetId: "minimax-cn",
      endpoint: "https://api.minimaxi.com/v1",
      modelName: "MiniMax-M3",
      apiKey: "sk-mm",
    })!
    expect(resolved.providerId).toBe("minimax-cn")
    expect(resolved.api).toBe("openai-completions")
    expect(resolved.model).toBe("MiniMax-M3")

    const section = buildOpenClawGatewayModelSection({
      mode: "openai-compatible",
      presetId: "minimax-cn",
      endpoint: "https://api.minimaxi.com/v1",
      modelName: "MiniMax-M3",
      apiKey: "sk-mm",
    })
    expect(section.defaultsModel).toBe("minimax-cn/MiniMax-M3")
    expect(section.models?.providers["minimax-cn"]?.api).toBe("openai-completions")
    expect(section.models?.providers["minimax-cn"]?.apiKey).toBe("sk-mm")
  })

  it("maps Anthropic to anthropic-messages (not openai-completions)", () => {
    const section = buildOpenClawGatewayModelSection({
      mode: "anthropic-compatible",
      presetId: "anthropic",
      endpoint: "https://api.anthropic.com",
      modelName: "claude-sonnet-4-6",
      apiKey: "sk-ant",
    })
    expect(section.defaultsModel).toBe("anthropic/claude-sonnet-4-6")
    expect(section.models?.providers.anthropic?.api).toBe("anthropic-messages")
  })

  it("returns empty for mock / disabled / missing model", () => {
    expect(buildOpenClawGatewayModelSection({ mode: "mock" })).toEqual({})
    expect(buildOpenClawGatewayModelSection({ mode: "disabled" })).toEqual({})
    expect(
      buildOpenClawGatewayModelSection({
        mode: "openai-compatible",
        presetId: "openai",
      }),
    ).toEqual({})
  })
})
