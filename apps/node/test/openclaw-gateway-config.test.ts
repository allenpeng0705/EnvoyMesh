import { describe, expect, it } from "vitest";
import {
  buildOpenClawGatewayAgentSection,
  buildOpenClawGatewayModelSection,
  buildOpenClawGatewaySearchEnv,
  buildOpenClawGatewayWebSearchSection,
  isOpenClawEnvoymeshWebhookReady,
  resolveActiveWebSearchProvider,
  resolveWebSearchProviderFromSkillSlug,
} from "../src/openclaw-gateway-config.js";
import { resolveAssistantAgentUrl } from "../src/bridge/config.js";

describe("openclaw-gateway-config web search", () => {
  it("maps tavily skill key to web search provider config", () => {
    const section = buildOpenClawGatewayWebSearchSection({
      webSearchEnabled: true,
      skillApiKeys: { tavily: "tvly-test-key" },
    });
    expect(section).toEqual({
      tools: {
        profile: "full",
        web: { search: { enabled: true, provider: "tavily" } },
      },
      plugins: {
        allow: ["envoymesh", "tavily"],
        entries: {
          envoymesh: { enabled: true },
          tavily: {
            enabled: true,
            config: { webSearch: { apiKey: "tvly-test-key" } },
          },
        },
      },
    });
  });

  it("sets tools.profile full and plugins.allow for duckduckgo fallback", () => {
    const section = buildOpenClawGatewayAgentSection({
      webSearchEnabled: true,
      skillApiKeys: {},
    });
    expect(section.tools).toEqual({
      profile: "full",
      web: { search: { enabled: true, provider: "duckduckgo" } },
    });
    expect(section.plugins).toEqual({
      allow: ["envoymesh"],
      entries: { envoymesh: { enabled: true } },
    });
  });

  it("resolveActiveWebSearchProvider reports tavily when configured", () => {
    expect(resolveActiveWebSearchProvider({
      webSearchEnabled: true,
      skillApiKeys: { tavily: "tvly-x" },
    })).toEqual({ enabled: true, provider: "tavily" });
  });

  it("uses duckduckgo when enabled and no provider keys", () => {
    const section = buildOpenClawGatewayWebSearchSection({
      webSearchEnabled: true,
      skillApiKeys: {},
    });
    expect(section).toEqual({
      tools: {
        profile: "full",
        web: { search: { enabled: true, provider: "duckduckgo" } },
      },
      plugins: {
        allow: ["envoymesh"],
        entries: { envoymesh: { enabled: true } },
      },
    });
  });

  it("disables search when toggle is off even with tavily key", () => {
    const section = buildOpenClawGatewayWebSearchSection({
      webSearchEnabled: false,
      skillApiKeys: { tavily: "tvly-test-key" },
    });
    expect(section).toEqual({
      tools: {
        profile: "full",
        web: { search: { enabled: false } },
      },
      plugins: {
        allow: ["envoymesh"],
        entries: { envoymesh: { enabled: true } },
      },
    });
  });

  it("prefers tavily over duckduckgo when both keys exist", () => {
    const section = buildOpenClawGatewayWebSearchSection({
      webSearchEnabled: true,
      skillApiKeys: { duckduckgo: "unused", tavily: "tvly-priority" },
    });
    expect((section as any).tools.web.search.provider).toBe("tavily");
  });

  it("exports TAVILY_API_KEY for gateway env", () => {
    expect(buildOpenClawGatewaySearchEnv({ tavily: "tvly-env" })).toEqual({
      TAVILY_API_KEY: "tvly-env",
    });
  });

  it("resolves google slug to gemini provider", () => {
    expect(resolveWebSearchProviderFromSkillSlug("google")).toEqual({
      providerId: "gemini",
      pluginId: "google",
      envVar: "GEMINI_API_KEY",
    });
  });

  it("treats 404 as webhook not ready and 400 as ready", () => {
    expect(isOpenClawEnvoymeshWebhookReady(404)).toBe(false);
    expect(isOpenClawEnvoymeshWebhookReady(400)).toBe(true);
    expect(isOpenClawEnvoymeshWebhookReady(200)).toBe(true);
  });

  it("resolveAssistantAgentUrl falls back to agentUrl when it targets envoymesh", () => {
    expect(resolveAssistantAgentUrl({
      agentUrl: "http://127.0.0.1:18789/webhook/envoymesh",
    })).toBe("http://127.0.0.1:18789/webhook/envoymesh");
    expect(resolveAssistantAgentUrl({
      agentUrl: "http://127.0.0.1:8080/webhook/homeclaw",
    })).toBe("http://127.0.0.1:18789/webhook/envoymesh");
  });
});

describe("buildOpenClawGatewayModelSection", () => {
  it("sets contextWindow for Envoy Local from llama -c", () => {
    const section = buildOpenClawGatewayModelSection(
      {
        mode: "openai-compatible",
        presetId: "envoy-local",
        endpoint: "http://127.0.0.1:18790/v1",
        modelName: "gemma-4-e4b-it-q4_k_m",
      },
      { contextWindow: 32768 },
    );
    expect(section.defaultsModel).toBe("openai-compatible/gemma-4-e4b-it-q4_k_m");
    const models = section.models?.providers["openai-compatible"]?.models;
    expect(models?.[0]?.contextWindow).toBe(32768);
  });

  it("does not set contextWindow for cloud providers even if passed", () => {
    const section = buildOpenClawGatewayModelSection(
      {
        mode: "openai-compatible",
        presetId: "minimax",
        endpoint: "https://api.minimaxi.com/v1",
        modelName: "MiniMax-M3",
        apiKey: "sk-test",
      },
      { contextWindow: 32768 },
    );
    const models = section.models?.providers?.["minimax"]?.models
      ?? section.models?.providers?.["openai-compatible"]?.models;
    expect(models?.[0]?.contextWindow).toBeUndefined();
  });
});
