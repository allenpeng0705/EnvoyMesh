import { describe, expect, it } from "vitest";
import {
  buildModelProviders,
  normalizeOpenAiCompatibleBaseUrl,
  createDefaultModelProviderPolicies,
  createLiteLlmProvider,
  createMockModelProvider,
  createModelRoutingAuditEvent,
  createOllamaLiteLlmProvider,
  evaluateModelProvider,
  evaluateSemanticFirewall,
  routeModelRequest,
  runOwnerApprovedKnowledgeQuery,
  selectModelProvider,
} from "../src/index.js";

describe("semantic firewall", () => {
  it("rejects empty and disallowed control characters", () => {
    expect(evaluateSemanticFirewall({ text: "   " }).ok).toBe(false);
    expect(evaluateSemanticFirewall({ text: "hello\x00world" }).ok).toBe(false);
    expect(evaluateSemanticFirewall({ text: "ok" })).toEqual({ ok: true, text: "ok" });
  });

  it("collapses very long newline runs", () => {
    const long = "a" + "\n".repeat(55) + "b";
    const result = evaluateSemanticFirewall({ text: long });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.text.split("\n").length).toBeLessThanOrEqual(52);
    }
  });

  it("denies model routing before provider selection when prompt fails firewall", async () => {
    const provider = createMockModelProvider({ providerType: "local" });
    const result = await routeModelRequest(
      {
        taskType: "knowledge.query",
        prompt: "bad\x01",
        sensitivity: "private",
      },
      [provider],
    );

    expect(result.decision).toMatchObject({
      action: "deny",
      reason: expect.stringContaining("semantic_firewall"),
    });
    expect(result.response).toBeUndefined();
    expect(result.auditEvent.outcome).toBe("deny");
    expect(result.auditEvent.reason).toContain("semantic_firewall");
  });
});

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

  it("routeModelRequest populates actualUsage on the audit event when a real provider returns tokens", async () => {
    // Fake fetch returning an OpenAI-shaped response with token usage.
    const fakeFetch = async (_url: string | URL | Request, _init?: RequestInit) =>
      ({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content: "Hello world" } }],
          usage: { prompt_tokens: 1234, completion_tokens: 567, total_cost: undefined },
        }),
      }) as Response;

    const provider = createLiteLlmProvider({
      providerId: "cloud.openai-compatible",
      providerType: "cloud",
      modelName: "gpt-4o-mini",
      endpoint: "https://example.invalid/v1",
      apiKey: "fake",
      fetchImplementation: fakeFetch as typeof fetch,
      policy: {
        enabled: true,
        allowedSensitivity: ["public", "friends", "trusted", "private"],
        allowedTaskTypes: ["*"],
        requiresOwnerApproval: false,
      },
    });

    const result = await routeModelRequest(
      {
        taskType: "knowledge.query",
        prompt: "What is EnvoyMesh?",
        sensitivity: "public",
        ownerApproved: true,
      },
      [provider],
    );

    expect(result.decision.action).toBe("allow");
    expect(result.response?.usage).toMatchObject({
      inputTokens: 1234,
      outputTokens: 567,
    });
    // Cost computed from catalog (no provider-reported cost).
    expect(result.response?.usage?.actualCostUsd).toBeGreaterThan(0);
    expect(result.response?.usage?.pricingSource).toBe("catalog");
    // Audit event carries the resolved usage for rollup.
    expect(result.auditEvent.actualUsage).toMatchObject({
      inputTokens: 1234,
      outputTokens: 567,
      pricingSource: "catalog",
    });
    expect(result.auditEvent.actualUsage?.costUsd).toBeGreaterThan(0);
    expect(result.auditEvent.modelName).toBe("gpt-4o-mini");
  });

  it("routeModelRequest forces actualUsage to $0 with pricingSource=mock for the mock provider", async () => {
    const provider = createMockModelProvider({
      providerId: "local.mock",
      providerType: "local",
      responseText: "Local answer",
    });

    const result = await routeModelRequest(
      {
        taskType: "knowledge.query",
        prompt: "Hello",
        sensitivity: "private",
      },
      [provider],
    );

    expect(result.auditEvent.actualUsage).toMatchObject({
      pricingSource: "mock",
      costUsd: 0,
    });
  });

  it("routeModelRequest does NOT let request.estimatedCost leak as a provider-reported cost", async () => {
    // Regression: the caller's pre-flight estimate (request.estimatedCost) must
    // not be treated as the authoritative provider figure on the audit event,
    // otherwise the rollup would record a guess as if it were measured.
    const fakeFetch = async (_url: string | URL | Request, _init?: RequestInit) =>
      ({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content: "Hello world" } }],
          // No total_cost from provider — must fall through to catalog.
          usage: { prompt_tokens: 1000, completion_tokens: 500 },
        }),
      }) as Response;

    const provider = createLiteLlmProvider({
      providerId: "cloud.openai-compatible",
      providerType: "cloud",
      modelName: "gpt-4o-mini",
      endpoint: "https://example.invalid/v1",
      apiKey: "fake",
      fetchImplementation: fakeFetch as typeof fetch,
      policy: {
        enabled: true,
        allowedSensitivity: ["public", "friends", "trusted", "private"],
        allowedTaskTypes: ["*"],
        requiresOwnerApproval: false,
      },
    });

    // Caller supplies a wildly wrong estimate (would be ~222x too high if
    // treated as authoritative).
    const result = await routeModelRequest(
      {
        taskType: "knowledge.query",
        prompt: "What is EnvoyMesh?",
        sensitivity: "public",
        ownerApproved: true,
        estimatedCost: 0.1,
      },
      [provider],
    );

    expect(result.decision.action).toBe("allow");
    // Catalog computation: 1000/1000 * 0.00015 + 500/1000 * 0.0006 = 0.00045
    expect(result.auditEvent.actualUsage?.costUsd).toBeCloseTo(0.00045, 6);
    expect(result.auditEvent.actualUsage?.pricingSource).toBe("catalog");
    // The caller's estimate must NOT appear as the recorded actual cost.
    expect(result.auditEvent.actualUsage?.costUsd).not.toBe(0.1);
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

    // Provider-reported total_cost wins (tier 1) → actualCostUsd mirrors it.
    expect(response).toMatchObject({
      providerId: "cloud.litellm.openai",
      modelName: "gpt-4o-mini",
      text: "LiteLLM answer",
      usage: {
        inputTokens: 10,
        outputTokens: 3,
        estimatedCost: 0.01,
        actualCostUsd: 0.01,
        pricingSource: "provider",
      },
    });
    expect(requests[0].url).toBe("http://127.0.0.1:4000/v1/chat/completions");
    expect(requests[0].init.headers).toMatchObject({
      "content-type": "application/json",
      authorization: "Bearer test-key",
    });
    expect(JSON.parse(requests[0].init.body as string)).toEqual({
      model: "gpt-4o-mini",
      max_tokens: 4096,
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

describe("normalizeOpenAiCompatibleBaseUrl", () => {
  it("appends /v1 when missing", () => {
    expect(normalizeOpenAiCompatibleBaseUrl("http://127.0.0.1:11434")).toBe("http://127.0.0.1:11434/v1");
    expect(normalizeOpenAiCompatibleBaseUrl("http://192.168.1.10:4000/")).toBe("http://192.168.1.10:4000/v1");
  });

  it("does not double-append /v1", () => {
    expect(normalizeOpenAiCompatibleBaseUrl("http://127.0.0.1:11434/v1")).toBe("http://127.0.0.1:11434/v1");
    expect(normalizeOpenAiCompatibleBaseUrl("https://api.openai.com/v1")).toBe("https://api.openai.com/v1");
  });

  it("fixes common MiniMax China hostname typo", () => {
    expect(normalizeOpenAiCompatibleBaseUrl("https://api.minimax.com")).toBe("https://api.minimaxi.com/v1");
    expect(normalizeOpenAiCompatibleBaseUrl("https://api.minimax.com/v1")).toBe("https://api.minimaxi.com/v1");
  });
});

describe("buildModelProviders trustedLocalAssist", () => {
  it("relaxes anthropic policy for chat-assist-style callers", () => {
    const providers = buildModelProviders(
      {
        mode: "anthropic-compatible",
        apiKey: "test-key",
        modelName: "claude-sonnet-4-20250514",
      },
      false,
      { trustedLocalAssist: true },
    );
    expect(providers).toHaveLength(1);
    expect(providers[0]?.policy.requiresOwnerApproval).toBe(false);
    expect(providers[0]?.policy.allowedSensitivity).toContain("private");
  });

  it("applies modelNameOverride over config modelName", async () => {
    const providers = buildModelProviders(
      { mode: "mock", modelName: "default-model" },
      true,
      { modelNameOverride: "assist-model" },
    );
    const result = await providers[0]!.complete({
      taskType: "terminal.assist",
      prompt: "test",
      sensitivity: "private",
    });
    expect(result.modelName).toBe("assist-model");
  });
});

describe("owner knowledge query helpers", () => {
  it("buildModelProviders returns mock provider for mock mode", () => {
    const providers = buildModelProviders({ mode: "mock" }, false);
    expect(providers).toHaveLength(1);
    expect(providers[0]?.policy.providerId).toBe("local.mock");
  });

  it("runOwnerApprovedKnowledgeQuery uses mock provider", async () => {
    const text = await runOwnerApprovedKnowledgeQuery({
      query: "hello",
      requesterPeerId: "peer-a",
      modelProviders: { mode: "mock" },
    });
    expect(text).toBe("Mock model response.");
  });

  it("runOwnerApprovedKnowledgeQuery returns disabled message when models disabled", async () => {
    const text = await runOwnerApprovedKnowledgeQuery({
      query: "hello",
      requesterPeerId: "peer-a",
      modelProviders: { mode: "disabled" },
    });
    expect(text).toContain("disabled");
  });
});
