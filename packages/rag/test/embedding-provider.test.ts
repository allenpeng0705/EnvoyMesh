import { describe, expect, it } from "vitest";
import { createEmbeddingProvider, mockEmbedding, resolveEmbeddingConfig } from "../src/embedding-provider.js";

describe("embedding-provider", () => {
  it("inherits openai-compatible mode from chat model config", () => {
    const config = resolveEmbeddingConfig({
      modelProviders: {
        mode: "openai-compatible",
        endpoint: "https://api.example.com/v1",
        modelName: "chat-model",
        apiKey: "test-key",
      },
    });
    expect(config.mode).toBe("openai-compatible");
    expect(config.endpoint).toBe("https://api.example.com/v1");
    expect(config.apiKey).toBe("test-key");
  });

  it("applies embo-01 token limit from model name", () => {
    const config = resolveEmbeddingConfig({
      embedding: { mode: "mock", modelName: "embo-01" },
    });
    expect(config.maxInputTokens).toBe(4096);
  });

  it("creates deterministic mock embeddings", async () => {
    const provider = createEmbeddingProvider({ embedding: { mode: "mock" } });
    const a = await provider.embed("EnvoyMesh relay deployment");
    const b = await provider.embed("EnvoyMesh relay deployment");
    const c = await provider.embed("unrelated cooking recipes");
    expect(a).toEqual(b);
    expect(mockEmbedding("EnvoyMesh relay deployment")).toEqual(a);
    expect(c.some((value, index) => value !== a[index])).toBe(true);
  });
});
