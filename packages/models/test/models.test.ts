import { describe, expect, it } from "vitest";
import {
  createDefaultModelProviderPolicies,
  createLiteLlmProvider,
  createMockModelProvider,
  createModelRoutingAuditEvent,
  createOllamaLiteLlmProvider,
  evaluateModelProvider,
  routeModelRequest,
  selectModelProvider,
} from "../src/index.js";

describe("model router", () => {
  it("defines conservative default provider policies", () => {
    const policies = createDefaultModelProviderPolicies();

    expect(policies).toMatchObject([
      {
        providerId: "local.mock",
        providerType: "local",
        enabled: true,
        allowedSensitivity: ["public", "friends", "trusted", "private"],
        requiresOwnerApproval: false,
      },
      {
        providerId: "cloud.mock",
        providerType: "cloud",
        enabled: false,
        allowedSensitivity: ["public"],
        requiresOwnerApproval: true,
      },
      {
        providerId: "peer.mock",
        providerType: "peer",
        enabled: false,
        requiresOwnerApproval: true,
      },
    ]);
  });

  it("routes private context to local providers by default", () => {
    const local = createMockModelProvider({ providerType: "local" });
    const cloud = createMockModelProvider({
      providerId: "cloud.mock",
      providerType: "cloud",
      policy: { enabled: true },
    });

    expect(
      selectModelProvider(
        {
          taskType: "knowledge.query",
          prompt: "Summarize private notes",
          sensitivity: "private",
        },
        [cloud, local],
      ),
    ).toMatchObject({
      action: "allow",
      provider: { providerId: "local.mock" },
    });
  });

  it("requires approval for cloud providers before use", () => {
    const cloud = createMockModelProvider({
      providerId: "cloud.mock",
      providerType: "cloud",
      policy: {
        enabled: true,
        allowedSensitivity: ["public"],
        requiresOwnerApproval: true,
      },
    });

    expect(
      evaluateModelProvider(
        {
          taskType: "coding",
          prompt: "Explain this public API",
          sensitivity: "public",
        },
        cloud.policy,
      ),
    ).toMatchObject({
      action: "approval_required",
      reason: "cloud.mock requires owner approval",
    });

    expect(
      evaluateModelProvider(
        {
          taskType: "coding",
          prompt: "Explain this public API",
          sensitivity: "public",
          ownerApproved: true,
        },
        cloud.policy,
      ),
    ).toMatchObject({
      action: "allow",
    });
  });

  it("requires approval when sensitivity or cost exceeds policy", () => {
    const cloud = createMockModelProvider({
      providerId: "cloud.mock",
      providerType: "cloud",
      policy: {
        enabled: true,
        allowedSensitivity: ["public"],
        requiresOwnerApproval: false,
        maxCostPerRequest: 0.05,
      },
    });

    expect(
      evaluateModelProvider(
        {
          taskType: "summary",
          prompt: "Summarize friend notes",
          sensitivity: "friends",
        },
        cloud.policy,
      ),
    ).toMatchObject({
      action: "approval_required",
      reason: "friends context exceeds cloud.mock policy",
    });

    expect(
      evaluateModelProvider(
        {
          taskType: "summary",
          prompt: "Summarize public notes",
          sensitivity: "public",
          estimatedCost: 0.25,
        },
        cloud.policy,
      ),
    ).toMatchObject({
      action: "approval_required",
      reason: "estimated cost exceeds 0.05",
    });
  });

  it("runs the selected mock provider and returns an audit event", async () => {
    const provider = createMockModelProvider({
      providerId: "local.mock",
      providerType: "local",
      responseText: "Local answer",
    });

    const result = await routeModelRequest(
      {
        taskType: "knowledge.query",
        prompt: "What is EnvoyMesh?",
        sensitivity: "private",
        requesterPeerId: "peer-a",
      },
      [provider],
    );

    expect(result.decision).toMatchObject({ action: "allow" });
    expect(result.response).toMatchObject({
      providerId: "local.mock",
      text: "Local answer",
    });
    expect(result.auditEvent).toMatchObject({
      providerId: "local.mock",
      providerType: "local",
      taskType: "knowledge.query",
      sensitivity: "private",
      requesterPeerId: "peer-a",
      outcome: "allow",
      ownerApproved: false,
    });
  });

  it("creates deny audit events without provider metadata", () => {
    const auditEvent = createModelRoutingAuditEvent(
      {
        taskType: "unknown",
        prompt: "Do work",
        sensitivity: "public",
      },
      {
        action: "deny",
        reason: "no providers",
      },
      {
        eventId: "model-audit-1",
        createdAt: "2026-04-27T10:00:00.000Z",
      },
    );

    expect(auditEvent).toEqual({
      version: "0.1",
      eventId: "model-audit-1",
      createdAt: "2026-04-27T10:00:00.000Z",
      providerId: undefined,
      providerType: undefined,
      taskType: "unknown",
      sensitivity: "public",
      requesterPeerId: undefined,
      outcome: "deny",
      reason: "no providers",
      estimatedCost: undefined,
      ownerApproved: false,
    });
  });

  it("calls LiteLLM-compatible chat completions endpoints", async () => {
    const requests: Array<{ url: string; init: RequestInit }> = [];
    const fetchImplementation = async (url: string | URL | Request, init?: RequestInit) => {
      requests.push({ url: url.toString(), init: init ?? {} });
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: "LiteLLM answer" } }],
          usage: {
            prompt_tokens: 10,
            completion_tokens: 3,
            total_cost: 0.01,
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    };
    const provider = createLiteLlmProvider({
      providerId: "cloud.litellm.openai",
      providerType: "cloud",
      modelName: "gpt-4o-mini",
      endpoint: "http://127.0.0.1:4000/v1/",
      apiKey: "test-key",
      fetchImplementation: fetchImplementation as typeof fetch,
      policy: {
        enabled: true,
        requiresOwnerApproval: false,
      },
    });

    const response = await provider.complete({
      taskType: "coding",
      prompt: "Explain EnvoyMesh",
      sensitivity: "public",
    });

    expect(response).toEqual({
      providerId: "cloud.litellm.openai",
      modelName: "gpt-4o-mini",
      text: "LiteLLM answer",
      usage: {
        inputTokens: 10,
        outputTokens: 3,
        estimatedCost: 0.01,
      },
    });
    expect(requests[0].url).toBe("http://127.0.0.1:4000/v1/chat/completions");
    expect(requests[0].init.headers).toMatchObject({
      "content-type": "application/json",
      authorization: "Bearer test-key",
    });
    expect(JSON.parse(requests[0].init.body as string)).toEqual({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: "Explain EnvoyMesh" }],
    });
  });

  it("creates an Ollama-through-LiteLLM local provider preset", async () => {
    const fetchImplementation = async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "Ollama answer" } }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    const provider = createOllamaLiteLlmProvider({
      modelName: "ollama/qwen2.5",
      fetchImplementation: fetchImplementation as typeof fetch,
    });
    const result = await routeModelRequest(
      {
        taskType: "knowledge.query",
        prompt: "Summarize private local context",
        sensitivity: "private",
      },
      [provider],
    );

    expect(provider.policy).toMatchObject({
      providerId: "local.ollama/qwen2.5",
      providerType: "local",
      allowedSensitivity: ["public", "friends", "trusted", "private"],
      requiresOwnerApproval: false,
    });
    expect(result.decision).toMatchObject({ action: "allow" });
    expect(result.response?.text).toBe("Ollama answer");
  });
});
