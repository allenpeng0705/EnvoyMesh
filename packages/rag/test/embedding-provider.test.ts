import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createEmbeddingProvider,
  getCachedEmbeddingParser,
  inferEmbeddingProviderFromEndpoint,
  KNOWN_EMBEDDING_PROVIDERS,
  mockEmbedding,
  parseEmbeddingsResponse,
  resetEmbeddingParserCache,
  resolveEmbeddingConfig,
} from "../src/embedding-provider.js";

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
    // Hostname doesn't match any preset → responseShape stays `auto`.
    expect(config.responseShape).toBe("auto");
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

  it("defaults responseShape to 'auto' for unrecognized hosts (BYO-provider)", () => {
    // mode:inherit + no modelProviders → "mock" mode → mock://local endpoint,
    // which matches no preset, so responseShape falls through to "auto".
    const config = resolveEmbeddingConfig({
      embedding: { mode: "inherit" },
    });
    expect(config.responseShape).toBe("auto");
  });

  it("passes through explicit responseShape (minimax)", () => {
    const config = resolveEmbeddingConfig({
      embedding: {
        mode: "openai-compatible",
        modelName: "embo-01",
        endpoint: "https://api.minimaxi.com/v1",
        responseShape: "minimax",
      },
    });
    expect(config.responseShape).toBe("minimax");
    expect(config.endpoint).toBe("https://api.minimaxi.com/v1");
    expect(config.modelName).toBe("embo-01");
  });
});

// --- Response parsers ------------------------------------------------------
//
// The HTTP transport is identical across providers. What breaks interop
// is the JSON envelope. The MiniMax embo-01 endpoint returns the vector at
// the root (or in `vectors[]` for batch), not in OpenAI's `data[]`
// envelope. These tests pin both shapes.

describe("parseEmbeddingsResponse — openai shape", () => {
  const singleOpenAi = {
    object: "list",
    data: [{ object: "embedding", embedding: [0.1, 0.2, 0.3], index: 0 }],
    model: "text-embedding-3-small",
    usage: { prompt_tokens: 4, total_tokens: 4 },
  };
  const batchOpenAi = {
    object: "list",
    data: [
      { object: "embedding", embedding: [1, 1], index: 0 },
      { object: "embedding", embedding: [2, 2], index: 1 },
      { object: "embedding", embedding: [3, 3], index: 2 },
    ],
    model: "text-embedding-3-small",
    usage: { prompt_tokens: 12, total_tokens: 12 },
  };

  it("parses single-input { data: [{ embedding }] }", () => {
    const vectors = parseEmbeddingsResponse(singleOpenAi, 1, "openai");
    expect(vectors).toEqual([[0.1, 0.2, 0.3]]);
  });

  it("parses batch { data: [{ embedding, index }] } in declared order", () => {
    const vectors = parseEmbeddingsResponse(batchOpenAi, 3, "openai");
    expect(vectors).toEqual([[1, 1], [2, 2], [3, 3]]);
  });

  it("rejects openai-shape data[] when length mismatches expected count", () => {
    expect(() => parseEmbeddingsResponse(batchOpenAi, 2, "openai")).toThrow(/data\[\] length/);
  });

  it("rejects openai-shape missing data[] entirely", () => {
    expect(() => parseEmbeddingsResponse({}, 1, "openai")).toThrow(/missing data\[\]/);
  });
});

describe("parseEmbeddingsResponse — minimax shape (embo-01)", () => {
  const singleMinimax = { embedding: [0.1, 0.2, 0.3], total_tokens: 4 };
  const batchMinimax = { vectors: [[1, 1], [2, 2], [3, 3]], total_tokens: 12 };

  it("parses single-input { embedding } at root", () => {
    const vectors = parseEmbeddingsResponse(singleMinimax, 1, "minimax");
    expect(vectors).toEqual([[0.1, 0.2, 0.3]]);
  });

  it("parses batch { vectors } at root", () => {
    const vectors = parseEmbeddingsResponse(batchMinimax, 3, "minimax");
    expect(vectors).toEqual([[1, 1], [2, 2], [3, 3]]);
  });

  it("falls back to single-input OpenAI shape if MiniMax ever returns it", () => {
    const openAiUnderData = { data: [{ embedding: [9, 9] }] };
    const vectors = parseEmbeddingsResponse(openAiUnderData, 1, "minimax");
    expect(vectors).toEqual([[9, 9]]);
  });

  it("falls back to batch OpenAI shape if MiniMax ever returns it", () => {
    const openAiUnderData = {
      data: [
        { embedding: [9, 9], index: 0 },
        { embedding: [8, 8], index: 1 },
      ],
    };
    const vectors = parseEmbeddingsResponse(openAiUnderData, 2, "minimax");
    expect(vectors).toEqual([[9, 9], [8, 8]]);
  });

  it("rejects when neither root nor data[] fields are present", () => {
    expect(() => parseEmbeddingsResponse({ useless: true }, 1, "minimax")).toThrow(/missing embedding/);
  });

  it("rejects minimax batch when vectors[] length mismatches expected count", () => {
    expect(() => parseEmbeddingsResponse(batchMinimax, 2, "minimax")).toThrow(/missing vectors/);
  });
});

describe("parseEmbeddingsResponse — auto-detect", () => {
  it("uses openai shape when data[] is present", () => {
    const vectors = parseEmbeddingsResponse(
      { data: [{ embedding: [7, 7] }] },
      1,
      "auto",
    );
    expect(vectors).toEqual([[7, 7]]);
  });

  it("falls back to minimax shape when data[] is absent and embedding is at root", () => {
    const vectors = parseEmbeddingsResponse({ embedding: [4, 4] }, 1, "auto");
    expect(vectors).toEqual([[4, 4]]);
  });

  it("falls back to minimax batch (vectors[]) when data[] is absent", () => {
    const vectors = parseEmbeddingsResponse(
      { vectors: [[5, 5], [6, 6]] },
      2,
      "auto",
    );
    expect(vectors).toEqual([[5, 5], [6, 6]]);
  });

  it("throws a descriptive auto-detect error when neither shape matches", () => {
    expect(() => parseEmbeddingsResponse({ unrelated: true }, 1, "auto")).toThrow(
      /auto-detect tried/,
    );
  });
});

// --- Per-endpoint parser cache ---------------------------------------------
//
// The cache is the whole point of `auto` mode being a good default: the
// first call to a host pays the try-both cost, subsequent calls hit the
// cache and skip the fallback entirely. Cache is keyed per endpoint so
// multi-host setups learn independently.

describe("embedding parser cache (auto mode)", () => {
  beforeEach(() => {
    resetEmbeddingParserCache();
  });
  afterEach(() => {
    resetEmbeddingParserCache();
  });

  function makeFetchMock(responseMap: Map<string, unknown>) {
    return vi.fn(async (url: string) => {
      const payload = responseMap.get(url);
      if (!payload) {
        return new Response("not found", { status: 404 });
      }
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
  }

  it("caches 'openai' on first call to an unknown endpoint that returns an OpenAI-shape payload", async () => {
    // Use a host that doesn't match any preset so responseShape stays 'auto'
    // and the resolver's cache path is exercised.
    const url = "https://api.unknown-llm.example/v1/embeddings";
    const payload = { data: [{ embedding: [1, 2, 3] }] };
    const fetchMock = makeFetchMock(new Map([[url, payload]]));

    const provider = createEmbeddingProvider({
      embedding: { mode: "openai-compatible", endpoint: "https://api.unknown-llm.example/v1" },
      fetchImplementation: fetchMock as unknown as typeof fetch,
    });

    const first = await provider.embed("hello");
    expect(first).toEqual([1, 2, 3]);
    expect(getCachedEmbeddingParser("https://api.unknown-llm.example/v1")).toBe("openai");

    // Second call: same fetch mock returns same payload; we trust the cache
    // and don't sniff. The test only verifies the cache is consulted, not
    // that the fetch isn't called (the implementation does fetch again —
    // the cache avoids the *parse* fallback, not the HTTP request).
    const second = await provider.embed("hello");
    expect(second).toEqual([1, 2, 3]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("falls back to minimax on first call to an unknown endpoint, then caches 'minimax'", async () => {
    const url = "https://api.other-llm.example/v1/embeddings";
    const payload = { embedding: [0.1, 0.2, 0.3] };
    const fetchMock = makeFetchMock(new Map([[url, payload]]));

    const provider = createEmbeddingProvider({
      embedding: { mode: "openai-compatible", endpoint: "https://api.other-llm.example/v1" },
      fetchImplementation: fetchMock as unknown as typeof fetch,
    });

    // OpenAI-shape parser would throw on this payload; the cache miss
    // triggers a fallback to minimax, which succeeds, and we cache it.
    const vectors = await provider.embedBatch(["hello"]);
    expect(vectors).toEqual([[0.1, 0.2, 0.3]]);
    expect(getCachedEmbeddingParser("https://api.other-llm.example/v1")).toBe("minimax");
  });

  it("keys the cache per endpoint so different unknown hosts learn independently", async () => {
    const urlA = "https://api.unknown-a.example/v1/embeddings";
    const urlB = "https://api.unknown-b.example/v1/embeddings";
    const fetchMock = makeFetchMock(
      new Map([
        [urlA, { data: [{ embedding: [1, 1] }] }],
        [urlB, { embedding: [2, 2] }],
      ]),
    );

    const providerA = createEmbeddingProvider({
      embedding: { mode: "openai-compatible", endpoint: "https://api.unknown-a.example/v1" },
      fetchImplementation: fetchMock as unknown as typeof fetch,
    });
    const providerB = createEmbeddingProvider({
      embedding: { mode: "openai-compatible", endpoint: "https://api.unknown-b.example/v1" },
      fetchImplementation: fetchMock as unknown as typeof fetch,
    });

    await providerA.embed("hello");
    await providerB.embed("hello");

    expect(getCachedEmbeddingParser("https://api.unknown-a.example/v1")).toBe("openai");
    expect(getCachedEmbeddingParser("https://api.unknown-b.example/v1")).toBe("minimax");
  });

  it("treats endpoint URLs with/without trailing slash as the same cache key", async () => {
    const fetchMock = makeFetchMock(
      new Map([["https://api.unknown-trailing.example/v1/embeddings", { data: [{ embedding: [9, 9] }] }]]),
    );

    const provider = createEmbeddingProvider({
      embedding: { mode: "openai-compatible", endpoint: "https://api.unknown-trailing.example/v1/" },
      fetchImplementation: fetchMock as unknown as typeof fetch,
    });

    await provider.embed("hello");
    expect(getCachedEmbeddingParser("https://api.unknown-trailing.example/v1")).toBe("openai");
    expect(getCachedEmbeddingParser("https://api.unknown-trailing.example/v1/")).toBe("openai");
  });

  it("known hosts (preset-matched) skip the cache and go straight to the preset's shape", async () => {
    // MiniMax is in the preset table → responseShape resolves to "minimax"
    // before any embed call. The cache isn't touched on this path (and
    // shouldn't be — preset already knows the shape).
    const url = "https://api.minimaxi.com/v1/embeddings";
    const payload = { embedding: [3, 3] };
    const fetchMock = makeFetchMock(new Map([[url, payload]]));

    const provider = createEmbeddingProvider({
      embedding: { mode: "openai-compatible", endpoint: "https://api.minimaxi.com/v1" },
      fetchImplementation: fetchMock as unknown as typeof fetch,
    });

    const vectors = await provider.embed("hello");
    expect(vectors).toEqual([3, 3]);
    expect(getCachedEmbeddingParser("https://api.minimaxi.com/v1")).toBeUndefined();
  });

  it("Zhipu / DashScope hosts skip the cache and use the OpenAI-shape preset directly", async () => {
    // Zhipu and DashScope both expose the OpenAI envelope. Their presets
    // short-circuit responseShape to "openai", so the cache is not
    // consulted and the OpenAI parser is used straight away.
    const fetchMock = makeFetchMock(
      new Map([
        ["https://open.bigmodel.cn/api/paas/v4/embeddings", { data: [{ embedding: [5, 5] }] }],
        ["https://dashscope.aliyuncs.com/compatible-mode/v1/embeddings", { data: [{ embedding: [6, 6] }] }],
      ]),
    );

    const zhipu = createEmbeddingProvider({
      embedding: { mode: "openai-compatible", endpoint: "https://open.bigmodel.cn/api/paas/v4" },
      fetchImplementation: fetchMock as unknown as typeof fetch,
    });
    const dashscope = createEmbeddingProvider({
      embedding: { mode: "openai-compatible", endpoint: "https://dashscope.aliyuncs.com/compatible-mode/v1" },
      fetchImplementation: fetchMock as unknown as typeof fetch,
    });

    expect(await zhipu.embed("hello")).toEqual([5, 5]);
    expect(await dashscope.embed("hello")).toEqual([6, 6]);
    // Cache should never be touched on the preset-short-circuit path.
    expect(getCachedEmbeddingParser("https://open.bigmodel.cn/api/paas/v4")).toBeUndefined();
    expect(getCachedEmbeddingParser("https://dashscope.aliyuncs.com/compatible-mode/v1")).toBeUndefined();
  });

  it("explicit responseShape bypasses the cache (user choice wins)", async () => {
    const url = "https://api.example.com/v1/embeddings";
    // Payload is minimax-shape. If user pins "openai", we must NOT fall
    // back; we should error and not poison the cache.
    const payload = { embedding: [4, 4] };
    const fetchMock = makeFetchMock(new Map([[url, payload]]));

    const provider = createEmbeddingProvider({
      embedding: {
        mode: "openai-compatible",
        endpoint: "https://api.example.com/v1",
        responseShape: "openai",
      },
      fetchImplementation: fetchMock as unknown as typeof fetch,
    });

    await expect(provider.embed("hello")).rejects.toThrow(/missing data\[\]/);
    expect(getCachedEmbeddingParser("https://api.example.com/v1")).toBeUndefined();
  });

  it("throws a descriptive error when neither shape parses and the cache stays empty", async () => {
    const url = "https://api.broken.example/v1/embeddings";
    const fetchMock = makeFetchMock(
      new Map([[url, { totally: "wrong shape" }]]),
    );

    const provider = createEmbeddingProvider({
      embedding: { mode: "openai-compatible", endpoint: "https://api.broken.example/v1" },
      fetchImplementation: fetchMock as unknown as typeof fetch,
    });

    await expect(provider.embed("hello")).rejects.toThrow(/unparseable/);
    expect(getCachedEmbeddingParser("https://api.broken.example/v1")).toBeUndefined();
  });

  it("does not cache anything when the responseShape is mock / ollama", async () => {
    // mock mode: never goes through embedOpenAiCompatible → cache stays empty.
    const provider = createEmbeddingProvider({ embedding: { mode: "mock" } });
    await provider.embed("hello");
    expect(getCachedEmbeddingParser("anything")).toBeUndefined();
  });
});

// --- Provider preset inheritance (chat model → embedding defaults) --------
//
// The embedding settings follow the chat-model config when fields are
// blank. The matcher is hostname-based: api.minimaxi.com → embo-01 +
// minimax shape, api.openai.com → text-embedding-3-small + openai shape,
// anything else falls through to the existing per-mode defaults. Per-field
// overrides on the embedding settings win.

describe("inferEmbeddingProviderFromEndpoint", () => {
  it("recognizes api.minimaxi.com (international MiniMax)", () => {
    expect(inferEmbeddingProviderFromEndpoint("https://api.minimaxi.com/v1"))
      .toEqual({ defaultEmbeddingModel: "embo-01", defaultResponseShape: "minimax" });
  });

  it("recognizes api.openai.com", () => {
    expect(inferEmbeddingProviderFromEndpoint("https://api.openai.com/v1"))
      .toEqual({ defaultEmbeddingModel: "text-embedding-3-small", defaultResponseShape: "openai" });
  });

  it("recognizes open.bigmodel.cn (Zhipu / Z.AI)", () => {
    // Zhipu's OpenAI-compatible base is at open.bigmodel.cn; the
    // `/api/paas/v4` path is what their SDK points at. Either should
    // resolve to the Zhipu preset.
    expect(inferEmbeddingProviderFromEndpoint("https://open.bigmodel.cn/api/paas/v4"))
      .toEqual({ defaultEmbeddingModel: "embedding-2", defaultResponseShape: "openai" });
  });

  it("recognizes dashscope.aliyuncs.com (Alibaba Qwen DashScope)", () => {
    // DashScope exposes an OpenAI-compatible surface at
    // `/compatible-mode/v1`. Same envelope as OpenAI proper.
    expect(inferEmbeddingProviderFromEndpoint("https://dashscope.aliyuncs.com/compatible-mode/v1"))
      .toEqual({ defaultEmbeddingModel: "text-embedding-v3", defaultResponseShape: "openai" });
  });

  it("is tolerant of trailing paths and ports", () => {
    expect(inferEmbeddingProviderFromEndpoint("https://api.minimaxi.com:443/v1/embeddings"))
      .toEqual({ defaultEmbeddingModel: "embo-01", defaultResponseShape: "minimax" });
  });

  it("is tolerant of bare hostnames without protocol", () => {
    expect(inferEmbeddingProviderFromEndpoint("api.minimaxi.com/v1"))
      .toEqual({ defaultEmbeddingModel: "embo-01", defaultResponseShape: "minimax" });
  });

  it("case-insensitive host match", () => {
    expect(inferEmbeddingProviderFromEndpoint("https://API.MinimaxI.com/v1"))
      .toEqual({ defaultEmbeddingModel: "embo-01", defaultResponseShape: "minimax" });
  });

  it("returns undefined for unknown hosts", () => {
    expect(inferEmbeddingProviderFromEndpoint("https://api.custom-llm.example/v1")).toBeUndefined();
  });

  it("returns undefined for non-URL endpoints like mock://local", () => {
    expect(inferEmbeddingProviderFromEndpoint("mock://local")).toBeUndefined();
  });

  it("does not match subdomains of unknown providers (no false positives)", () => {
    expect(inferEmbeddingProviderFromEndpoint("https://api.minimaxi.com.evil.tld/v1")).toBeUndefined();
  });

  it("exports KNOWN_EMBEDDING_PROVIDERS as a non-empty readonly array", () => {
    expect(Array.isArray(KNOWN_EMBEDDING_PROVIDERS)).toBe(true);
    expect(KNOWN_EMBEDDING_PROVIDERS.length).toBeGreaterThan(0);
  });
});

describe("resolveEmbeddingConfig — chat-model inheritance", () => {
  it("inherits MiniMax defaults when chat points at api.minimaxi.com", () => {
    const config = resolveEmbeddingConfig({
      embedding: { mode: "inherit" },
      modelProviders: {
        mode: "openai-compatible",
        endpoint: "https://api.minimaxi.com/v1",
        modelName: "MiniMax-M3",
        apiKey: "test",
      },
    });
    expect(config.mode).toBe("openai-compatible");
    expect(config.endpoint).toBe("https://api.minimaxi.com/v1");
    expect(config.modelName).toBe("embo-01");             // inherited from preset
    expect(config.responseShape).toBe("minimax");         // inherited from preset
    expect(config.apiKey).toBe("test");                  // inherited from chat
  });

  it("inherits OpenAI defaults when chat points at api.openai.com", () => {
    const config = resolveEmbeddingConfig({
      embedding: { mode: "inherit" },
      modelProviders: {
        mode: "openai-compatible",
        endpoint: "https://api.openai.com/v1",
        modelName: "gpt-4o-mini",
        apiKey: "sk-test",
      },
    });
    expect(config.modelName).toBe("text-embedding-3-small");
    expect(config.responseShape).toBe("openai");
  });

  it("falls through to existing defaults for unknown hosts", () => {
    const config = resolveEmbeddingConfig({
      embedding: { mode: "inherit" },
      modelProviders: {
        mode: "openai-compatible",
        endpoint: "https://api.custom-llm.example/v1",
        modelName: "custom-model",
      },
    });
    // No preset matched — keep OpenAI-shape defaults (text-embedding-3-small).
    expect(config.modelName).toBe("text-embedding-3-small");
    expect(config.responseShape).toBe("auto");           // no preset → fall back to auto
  });

  it("honors explicit modelName override even when a preset matches", () => {
    const config = resolveEmbeddingConfig({
      embedding: {
        mode: "inherit",
        modelName: "custom-embed-v2",
      },
      modelProviders: {
        mode: "openai-compatible",
        endpoint: "https://api.minimaxi.com/v1",
        apiKey: "test",
      },
    });
    expect(config.modelName).toBe("custom-embed-v2");
    expect(config.responseShape).toBe("minimax");         // preset still applies for unset fields
  });

  it("honors explicit responseShape override even when a preset matches", () => {
    const config = resolveEmbeddingConfig({
      embedding: {
        mode: "inherit",
        responseShape: "openai",                        // user pinned OpenAI shape despite MiniMax host
      },
      modelProviders: {
        mode: "openai-compatible",
        endpoint: "https://api.minimaxi.com/v1",
        apiKey: "test",
      },
    });
    expect(config.responseShape).toBe("openai");
  });

  it("inherits Zhipu defaults when chat points at open.bigmodel.cn", () => {
    const config = resolveEmbeddingConfig({
      embedding: { mode: "inherit" },
      modelProviders: {
        mode: "openai-compatible",
        endpoint: "https://open.bigmodel.cn/api/paas/v4",
        modelName: "glm-4-plus",
        apiKey: "test",
      },
    });
    expect(config.mode).toBe("openai-compatible");
    expect(config.endpoint).toBe("https://open.bigmodel.cn/api/paas/v4");
    expect(config.modelName).toBe("embedding-2");        // Zhipu preset
    expect(config.responseShape).toBe("openai");         // Zhipu uses OpenAI envelope
    expect(config.apiKey).toBe("test");                  // inherited from chat
  });

  it("inherits DashScope defaults when chat points at dashscope.aliyuncs.com", () => {
    const config = resolveEmbeddingConfig({
      embedding: { mode: "inherit" },
      modelProviders: {
        mode: "openai-compatible",
        endpoint: "https://dashscope.aliyuncs.com/compatible-mode/v1",
        modelName: "qwen-max",
        apiKey: "test",
      },
    });
    expect(config.mode).toBe("openai-compatible");
    expect(config.endpoint).toBe("https://dashscope.aliyuncs.com/compatible-mode/v1");
    expect(config.modelName).toBe("text-embedding-v3");  // DashScope preset
    expect(config.responseShape).toBe("openai");         // OpenAI-compat envelope
  });

  it("preserves non-`/v1` API version roots (Zhipu /v4) without appending `/v1`", () => {
    // Regression: the resolver used to blindly append `/v1` to any root
    // that didn't end in `/v1`, breaking Zhipu's canonical
    // `/api/paas/v4` base. The fix recognizes any `/v\d+$` suffix as a
    // version marker and leaves the URL untouched.
    const config = resolveEmbeddingConfig({
      embedding: { mode: "openai-compatible" },
      modelProviders: {
        mode: "openai-compatible",
        endpoint: "https://open.bigmodel.cn/api/paas/v4",
        modelName: "glm-4-plus",
      },
    });
    expect(config.endpoint).toBe("https://open.bigmodel.cn/api/paas/v4");
  });

  it("still appends `/v1` to a bare OpenAI root (back-compat)", () => {
    // The fix above must not regress the OpenAI case where users paste
    // `https://api.openai.com` without the trailing `/v1`.
    const config = resolveEmbeddingConfig({
      embedding: { mode: "openai-compatible" },
      modelProviders: {
        mode: "openai-compatible",
        endpoint: "https://api.openai.com",
        modelName: "gpt-4o-mini",
      },
    });
    expect(config.endpoint).toBe("https://api.openai.com/v1");
  });

  it("honors explicit endpoint override and still applies the preset for that host", () => {
    // User typed the MiniMax host directly into the embedding endpoint.
    const config = resolveEmbeddingConfig({
      embedding: {
        mode: "openai-compatible",
        endpoint: "https://api.minimaxi.com/v1",
      },
      modelProviders: { mode: "anthropic-compatible", endpoint: "https://api.anthropic.com" },
    });
    // Even with mode explicit and endpoint explicit, the preset matches the host,
    // so modelName + responseShape inherit. Explicit modelName override still wins.
    expect(config.modelName).toBe("embo-01");
    expect(config.responseShape).toBe("minimax");
  });

  it("honors explicit modelName from a different host", () => {
    // User is on OpenAI but wants to use a custom embedding model.
    const config = resolveEmbeddingConfig({
      embedding: {
        mode: "openai-compatible",
        endpoint: "https://api.openai.com/v1",
        modelName: "my-custom-embed",
      },
      modelProviders: { mode: "openai-compatible", endpoint: "https://api.openai.com/v1" },
    });
    expect(config.modelName).toBe("my-custom-embed");
    expect(config.responseShape).toBe("openai");         // preset still applied for responseShape
  });

  it("falls back to Ollama defaults when chat is ollama (preset doesn't apply)", () => {
    const config = resolveEmbeddingConfig({
      embedding: { mode: "inherit" },
      modelProviders: {
        mode: "ollama",
        endpoint: "http://127.0.0.1:11434",
      },
    });
    expect(config.mode).toBe("ollama");
    expect(config.modelName).toBe("nomic-embed-text");
    expect(config.endpoint).toBe("http://127.0.0.1:11434");
  });

  it("falls back to mock default when chat is disabled", () => {
    const config = resolveEmbeddingConfig({
      embedding: { mode: "inherit" },
      modelProviders: { mode: "disabled" },
    });
    expect(config.mode).toBe("mock");
    expect(config.modelName).toBe("mock-embed");
  });
});
