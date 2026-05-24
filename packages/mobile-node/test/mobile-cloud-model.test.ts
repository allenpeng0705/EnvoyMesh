/** @vitest-environment jsdom */

import { describe, expect, it, beforeEach } from "vitest";
import { MobileNode, createMobileNode } from "../src/index.js";
import type { MobileNodeConfig } from "../src/index.js";

function makeConfig(overrides: Partial<MobileNodeConfig> = {}): MobileNodeConfig {
  return {
    profileDir: "/test-profile",
    relayUrls: ["ws://relay.example.com:9000"],
    ...overrides,
  };
}

describe("MobileNode cloud model providers", () => {
  let node: MobileNode;

  beforeEach(async () => {
    node = createMobileNode(makeConfig());
    await node.initStandalone("/test-profile");
  });

  it("persists openai-compatible model provider config", async () => {
    await node.updateNodeConfig({
      modelProviders: {
        mode: "openai-compatible",
        endpoint: "https://api.openai.com/v1",
        modelName: "gpt-4o-mini",
        apiKey: "sk-test",
      },
      chatAssistEnabled: true,
    });
    const cfg = await node.getNodeConfig();
    expect(cfg.modelProviders.mode).toBe("openai-compatible");
    expect(cfg.modelProviders.modelName).toBe("gpt-4o-mini");
    expect(cfg.chatAssistEnabled).toBe(true);
  });

  it("persists anthropic-compatible model provider config", async () => {
    await node.updateNodeConfig({
      modelProviders: {
        mode: "anthropic-compatible",
        endpoint: "https://api.anthropic.com",
        modelName: "claude-sonnet-4-20250514",
        apiKey: "sk-ant-test",
      },
    });
    const cfg = await node.getNodeConfig();
    expect(cfg.modelProviders.mode).toBe("anthropic-compatible");
    expect(cfg.modelProviders.endpoint).toBe("https://api.anthropic.com");
  });

  it("rejects ollama model provider on mobile", async () => {
    await expect(
      node.updateNodeConfig({
        modelProviders: { mode: "ollama", endpoint: "http://127.0.0.1:11434/v1", modelName: "llama3.1" },
      }),
    ).rejects.toThrow(/OpenAI-compatible or Anthropic/);
  });

  it("rejects litellm model provider on mobile", async () => {
    await expect(
      node.updateNodeConfig({
        modelProviders: { mode: "litellm", endpoint: "http://127.0.0.1:4000/v1", modelName: "gpt-4o-mini" },
      }),
    ).rejects.toThrow(/OpenAI-compatible or Anthropic/);
  });
});
