import { describe, expect, it } from "vitest";
import {
  createAnthropicProvider,
  createLiteLlmProvider,
  createMockModelProvider,
  routeModelRequest,
} from "../src/index.js";

type CapturedRequest = { url: string; body: Record<string, unknown> };

function captureProvider(
  create: (fetchImplementation: typeof fetch) => { complete(req: unknown): Promise<unknown> },
  responseBody?: Record<string, unknown>,
): { requests: CapturedRequest[]; complete: (req: unknown) => Promise<unknown> } {
  const requests: CapturedRequest[] = [];
  const body =
    responseBody ??
    ({
      choices: [{ message: { content: "answer" } }],
      usage: { prompt_tokens: 7, completion_tokens: 2, total_cost: 0.01 },
    } as Record<string, unknown>);
  const fetchImplementation = (async (url: string | URL | Request, init?: RequestInit) => {
    requests.push({
      url: url.toString(),
      body: JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>,
    });
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;
  return { requests, complete: (req) => create(fetchImplementation).complete(req) };
}

const chatMessages = [
  { role: "system" as const, content: "You are a helpful notes assistant." },
  { role: "user" as const, content: "Summarize my notes about Japan." },
  { role: "assistant" as const, content: "Here is a summary draft…" },
  { role: "user" as const, content: "Keep it shorter." },
];

describe("ModelRequest chat messages (EM-1)", () => {
  it("openai-compatible endpoint sends messages verbatim (system/user/assistant preserved)", async () => {
    const { requests, complete } = captureProvider((f) =>
      createLiteLlmProvider({
        providerId: "cloud.litellm.openai",
        providerType: "cloud",
        modelName: "gpt-4o-mini",
        endpoint: "http://127.0.0.1:4000/v1/",
        fetchImplementation: f,
      }),
    );
    await complete({
      taskType: "ai_bot.chat",
      prompt: "ignored-when-messages-present",
      messages: chatMessages,
      sensitivity: "public",
    });
    expect(requests[0].body.messages).toEqual(chatMessages);
    expect(requests[0].body.max_tokens).toBe(4096);
    expect(requests[0].body).not.toHaveProperty("temperature");
    expect(requests[0].body).not.toHaveProperty("stop");
  });

  it("passes sampling params when provided (temperature/maxTokens/stop)", async () => {
    const { requests, complete } = captureProvider((f) =>
      createLiteLlmProvider({
        providerId: "cloud.litellm.openai",
        providerType: "cloud",
        modelName: "gpt-4o-mini",
        endpoint: "http://127.0.0.1:4000/v1/",
        fetchImplementation: f,
      }),
    );
    await complete({
      taskType: "ai_bot.chat",
      prompt: "P",
      messages: [{ role: "user", content: "Hello" }],
      temperature: 0.3,
      maxTokens: 512,
      stop: ["END"],
      sensitivity: "public",
    });
    expect(requests[0].body).toMatchObject({
      messages: [{ role: "user", content: "Hello" }],
      temperature: 0.3,
      max_tokens: 512,
      stop: ["END"],
    });
  });

  it("falls back to a single user turn when no messages are provided", async () => {
    const { requests, complete } = captureProvider((f) =>
      createLiteLlmProvider({
        providerId: "cloud.litellm.openai",
        providerType: "cloud",
        modelName: "gpt-4o-mini",
        endpoint: "http://127.0.0.1:4000/v1/",
        fetchImplementation: f,
      }),
    );
    await complete({
      taskType: "coding",
      prompt: "Explain EnvoyMesh",
      sensitivity: "public",
    });
    expect(requests[0].body.messages).toEqual([{ role: "user", content: "Explain EnvoyMesh" }]);
    expect(requests[0].body.max_tokens).toBe(4096);
    expect(requests[0].body).not.toHaveProperty("temperature");
    expect(requests[0].body).not.toHaveProperty("stop");
  });

  it("mock provider counts and answers from joined message text", async () => {
    const provider = createMockModelProvider({ providerType: "local", modelName: "mock" });
    const joined = chatMessages.map((m) => m.content).join("\n");
    const response = await provider.complete({
      taskType: "ai_bot.chat",
      prompt: "",
      messages: chatMessages,
      sensitivity: "private",
    });
    expect(response.text).toBe("Mock model response.");
    expect(response.usage?.inputTokens).toBe(joined.length);
  });

  it("routeModelRequest allows messages and returns the model text (mock)", async () => {
    const provider = createMockModelProvider({ providerType: "local", modelName: "mock" });
    const result = await routeModelRequest(
      {
        taskType: "ai_bot.chat",
        prompt: "",
        messages: [{ role: "system", content: "s" }, { role: "user", content: "hi" }],
        sensitivity: "private",
      },
      [provider],
    );
    expect(result.decision.action).toBe("allow");
    expect(result.response?.text).toBe("Mock model response.");
  });

  it("semantic firewall gates the concatenated message text", async () => {
    const provider = createMockModelProvider({ providerType: "local" });
    const result = await routeModelRequest(
      {
        taskType: "ai_bot.chat",
        prompt: "fine",
        messages: [{ role: "user", content: "hello\x01world" }],
        sensitivity: "private",
      },
      [provider],
    );
    expect(result.decision).toMatchObject({
      action: "deny",
      reason: expect.stringContaining("semantic_firewall"),
    });
    expect(result.response).toBeUndefined();
  });

  it("anthropic lifts system to top level and maps user/assistant roles", async () => {
    const { requests, complete } = captureProvider(
      (f) =>
        createAnthropicProvider({
          modelName: "claude-sonnet-4-20250514",
          endpoint: "http://127.0.0.1:9999",
          fetchImplementation: f,
        }),
      { content: [{ text: "answer" }], usage: { input_tokens: 7, output_tokens: 2 } },
    );
    await complete({
      taskType: "ai_bot.chat",
      prompt: "ignored",
      messages: chatMessages,
      sensitivity: "public",
    });
    expect(requests[0].body).toMatchObject({
      model: "claude-sonnet-4-20250514",
      system: "You are a helpful notes assistant.",
      messages: [
        { role: "user", content: "Summarize my notes about Japan." },
        { role: "assistant", content: "Here is a summary draft…" },
        { role: "user", content: "Keep it shorter." },
      ],
      max_tokens: 1024,
    });
  });

  it("anthropic inserts a leading user turn when the first non-system message is assistant", async () => {
    const { requests, complete } = captureProvider(
      (f) =>
        createAnthropicProvider({
          modelName: "claude-sonnet-4-20250514",
          endpoint: "http://127.0.0.1:9999",
          fetchImplementation: f,
        }),
      { content: [{ text: "answer" }], usage: { input_tokens: 7, output_tokens: 2 } },
    );
    await complete({
      taskType: "ai_bot.chat",
      prompt: "ignored",
      messages: [{ role: "assistant", content: "Hi there" }],
      sensitivity: "public",
    });
    const msgs = requests[0].body.messages as Array<{ role: string; content: string }>;
    expect(msgs[0]).toEqual({ role: "user", content: "(continue)" });
    expect(msgs[1]).toEqual({ role: "assistant", content: "Hi there" });
  });

  it("anthropic honors sampling: temperature, stop→stop_sequences, maxTokens override", async () => {
    const { requests, complete } = captureProvider(
      (f) =>
        createAnthropicProvider({
          modelName: "claude-sonnet-4-20250514",
          endpoint: "http://127.0.0.1:9999",
          fetchImplementation: f,
        }),
      { content: [{ text: "answer" }], usage: { input_tokens: 7, output_tokens: 2 } },
    );
    await complete({
      taskType: "ai_bot.chat",
      prompt: "ignored",
      messages: [{ role: "user", content: "Hello" }],
      temperature: 0.2,
      maxTokens: 768,
      stop: ["<end>"],
      sensitivity: "public",
    });
    expect(requests[0].body).toMatchObject({
      max_tokens: 768,
      temperature: 0.2,
      stop_sequences: ["<end>"],
    });
  });

  it("routeModelRequest forwards messages through the openai-compatible provider", async () => {
    const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
    const fetchImplementation = (async (url: string | URL | Request, init?: RequestInit) => {
      requests.push({
        url: url.toString(),
        body: JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>,
      });
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: "answer" } }],
          usage: { prompt_tokens: 7, completion_tokens: 2, total_cost: 0.01 },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any;
    const routed = createLiteLlmProvider({
      providerId: "cloud.litellm.openai",
      providerType: "cloud",
      modelName: "gpt-4o-mini",
      endpoint: "http://127.0.0.1:4000/v1/",
      fetchImplementation,
      policy: { enabled: true, requiresOwnerApproval: false },
    });
    const result = await routeModelRequest(
      {
        taskType: "ai_bot.chat",
        prompt: "",
        messages: [{ role: "system", content: "s" }, { role: "user", content: "hi" }],
        sensitivity: "public",
        ownerApproved: true,
      },
      [routed],
    );
    expect(result.decision.action).toBe("allow");
    expect(result.response?.text).toBe("answer");
    expect(requests[0].body.messages).toEqual([
      { role: "system", content: "s" },
      { role: "user", content: "hi" },
    ]);
  });

  it("keeps existing prompt-only behavior intact at the router level", async () => {
    const provider = createMockModelProvider({ providerType: "local", modelName: "mock" });
    const result = await routeModelRequest(
      { taskType: "coding", prompt: "ping", sensitivity: "public" },
      [provider],
    );
    expect(result.decision.action).toBe("allow");
    expect(result.response?.text).toBe("Mock model response.");
  });
});
