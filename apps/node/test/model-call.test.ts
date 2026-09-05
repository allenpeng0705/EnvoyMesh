/**
 * Focused tests for the shared model-call seam (spike-01 / EM-2).
 *
 * `runModelCall` builds providers from an effective provider config and routes
 * one ModelRequest through @envoymesh/models — optionally cost-tracked. These
 * tests pin the seam with a mock config, verify `messages` reach the wire
 * verbatim (captured via a stubbed global fetch on an openai-compatible
 * config), and exercise the taskStore cost-rollup branch.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { runModelCall } from "../src/model-call.js";

const chatMessages = [
  { role: "system" as const, content: "You are a helpful notes assistant." },
  { role: "user" as const, content: "Summarize my notes about Japan." },
  { role: "assistant" as const, content: "Here is a summary draft…" },
  { role: "user" as const, content: "Keep it shorter." },
];

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("runModelCall", () => {
  it("returns text/model/providerId + allow decision for a mock config", async () => {
    const result = await runModelCall({
      config: { mode: "mock", mockResponseText: "hi from mock" },
      taskType: "ai_bot.chat",
      prompt: "Hello there",
      sensitivity: "public",
      ownerApproved: true,
      requesterPeerId: "envoy_peer_test",
    });

    expect(result.decision).toMatchObject({ action: "allow" });
    expect(result.text).toBe("hi from mock");
    expect(result.model).toBe("local-mock-model");
    expect(result.providerId).toBe("local.mock");
    expect(result.auditEvent).toMatchObject({
      taskType: "ai_bot.chat",
      outcome: "allow",
      ownerApproved: true,
      providerId: "local.mock",
    });
  });

  it("forwards messages verbatim when present", async () => {
    const capturedBodies: Array<{ messages?: unknown }> = [];
    const fetchStub = (async (_url: unknown, init?: RequestInit) => {
      capturedBodies.push(JSON.parse(String(init?.body ?? "{}")) as { messages?: unknown });
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: "answer" } }],
          usage: { prompt_tokens: 7, completion_tokens: 2, total_cost: 0.01 },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any;
    vi.stubGlobal("fetch", fetchStub);

    const result = await runModelCall({
      config: {
        mode: "openai-compatible",
        endpoint: "http://127.0.0.1:9/v1",
        modelName: "probe-model",
      },
      taskType: "ai_bot.chat",
      prompt: "ignored-when-messages-present",
      messages: chatMessages,
      sensitivity: "public",
      ownerApproved: true,
    });

    expect(capturedBodies).toHaveLength(1);
    expect(capturedBodies[0]!.messages).toEqual(chatMessages);
    expect(result.decision).toMatchObject({ action: "allow" });
    expect(result.text).toBe("answer");
    expect(result.model).toBe("probe-model");
  });

  it("forwards temperature/maxTokens/stop sampling fields (EM-3)", async () => {
    const capturedBodies: Array<Record<string, unknown>> = [];
    const fetchStub = (async (_url: unknown, init?: RequestInit) => {
      capturedBodies.push(JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>);
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: "sampled answer" } }],
          usage: { prompt_tokens: 7, completion_tokens: 2, total_cost: 0.01 },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any;
    vi.stubGlobal("fetch", fetchStub);

    const result = await runModelCall({
      config: {
        mode: "openai-compatible",
        endpoint: "http://127.0.0.1:9/v1",
        modelName: "probe-model",
      },
      taskType: "home.ask",
      messages: [{ role: "user", content: "Be concise" }],
      temperature: 0.4,
      maxTokens: 512,
      stop: ["\n---", "END"],
      sensitivity: "private",
      ownerApproved: true,
    });

    expect(capturedBodies).toHaveLength(1);
    expect(capturedBodies[0]!.temperature).toBe(0.4);
    expect(capturedBodies[0]!.max_tokens).toBe(512);
    expect(capturedBodies[0]!.stop).toEqual(["\n---", "END"]);
    expect(result.decision).toMatchObject({ action: "allow" });
    expect(result.text).toBe("sampled answer");
  });

  it("keeps provider defaults when sampling fields are absent (EM-3)", async () => {
    const capturedBodies: Array<Record<string, unknown>> = [];
    const fetchStub = (async (_url: unknown, init?: RequestInit) => {
      capturedBodies.push(JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>);
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: "default answer" } }],
          usage: { prompt_tokens: 7, completion_tokens: 2, total_cost: 0.01 },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any;
    vi.stubGlobal("fetch", fetchStub);

    const result = await runModelCall({
      config: {
        mode: "openai-compatible",
        endpoint: "http://127.0.0.1:9/v1",
        modelName: "probe-model",
      },
      taskType: "home.ask",
      messages: [{ role: "user", content: "Use defaults" }],
      sensitivity: "private",
      ownerApproved: true,
    });

    expect(capturedBodies).toHaveLength(1);
    // JSON.stringify drops undefined members: temperature/stop absent → provider default.
    expect("temperature" in capturedBodies[0]!).toBe(false);
    expect("stop" in capturedBodies[0]!).toBe(false);
    expect(capturedBodies[0]!.max_tokens).toBe(4096); // provider's built-in default
    expect(result.decision).toMatchObject({ action: "allow" });
    expect(result.text).toBe("default answer");
  });

  it("falls back to the prompt as a single user turn when messages are absent", async () => {
    const capturedBodies: Array<{ messages?: unknown }> = [];
    const fetchStub = (async (_url: unknown, init?: RequestInit) => {
      capturedBodies.push(JSON.parse(String(init?.body ?? "{}")) as { messages?: unknown });
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: "answer" } }],
          usage: { prompt_tokens: 3, completion_tokens: 2, total_cost: 0.01 },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any;
    vi.stubGlobal("fetch", fetchStub);

    const result = await runModelCall({
      config: {
        mode: "openai-compatible",
        endpoint: "http://127.0.0.1:9/v1",
        modelName: "probe-model",
      },
      taskType: "ai_bot.chat",
      prompt: "Explain EnvoyMesh",
      sensitivity: "public",
      ownerApproved: true,
    });

    expect(capturedBodies).toHaveLength(1);
    expect(capturedBodies[0]!.messages).toEqual([{ role: "user", content: "Explain EnvoyMesh" }]);
    expect(result.decision).toMatchObject({ action: "allow" });
    expect(result.text).toBe("answer");
  });

  it("routes through cost tracking when a taskStore is provided", async () => {
    const recordModelCallCost = vi.fn(async () => {});
    const result = await runModelCall({
      config: { mode: "mock", mockResponseText: "costed reply" },
      taskType: "ai_bot.chat",
      prompt: "track me",
      sensitivity: "public",
      ownerApproved: true,
      taskStore: { recordModelCallCost },
    });

    expect(result.decision).toMatchObject({ action: "allow" });
    expect(result.text).toBe("costed reply");
    expect(recordModelCallCost).toHaveBeenCalledTimes(1);
    expect(recordModelCallCost).toHaveBeenCalledWith(
      expect.objectContaining({
        providerId: "local.mock",
        modelName: "local-mock-model",
        taskType: "ai_bot.chat",
      }),
    );
  });
});
