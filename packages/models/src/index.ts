import type { ModelProviderConfig } from "@envoymesh/api";
import type { Sensitivity } from "@envoymesh/protocol";
import {
  evaluateSemanticFirewall,
  evaluateEgressContent,
  MAX_MODEL_PROMPT_CHARS,
  type SemanticFirewallResult,
  type EgressScanResult,
  type EgressSecretMatch,
} from "./semantic-firewall.js";

function modelAuditRandomId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c?.randomUUID) return c.randomUUID();
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 11)}`;
}

export {
  evaluateSemanticFirewall,
  evaluateEgressContent,
  MAX_MODEL_PROMPT_CHARS,
  type SemanticFirewallResult,
  type EgressScanResult,
  type EgressSecretMatch,
};

export type ModelProviderType = "local" | "cloud" | "peer";
export type ModelRouteDecision =
  | { action: "allow"; provider: ModelProviderPolicy }
  | { action: "deny"; reason: string }
  | { action: "approval_required"; reason: string; provider: ModelProviderPolicy };

export interface ModelProviderPolicy {
  providerId: string;
  providerType: ModelProviderType;
  enabled: boolean;
  allowedSensitivity: Sensitivity[];
  allowedTaskTypes: string[];
  requiresOwnerApproval: boolean;
  maxCostPerRequest?: number;
}

export interface ModelRequest {
  taskType: string;
  prompt: string;
  sensitivity: Sensitivity;
  estimatedCost?: number;
  preferredProviderTypes?: ModelProviderType[];
  ownerApproved?: boolean;
  requesterPeerId?: string;
}

export interface ModelResponse {
  providerId: string;
  modelName: string;
  text: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    estimatedCost?: number;
  };
}

export interface ModelProvider {
  readonly policy: ModelProviderPolicy;
  complete(request: ModelRequest): Promise<ModelResponse>;
}

export interface ModelRoutingAuditEvent {
  version: "0.1";
  eventId: string;
  createdAt: string;
  providerId?: string;
  providerType?: ModelProviderType;
  taskType: string;
  sensitivity: Sensitivity;
  requesterPeerId?: string;
  outcome: "allow" | "deny" | "approval_required";
  reason?: string;
  estimatedCost?: number;
  ownerApproved: boolean;
}

export interface ModelRouterResult {
  decision: ModelRouteDecision;
  auditEvent: ModelRoutingAuditEvent;
  response?: ModelResponse;
}

export interface CreateMockModelProviderInput {
  providerId?: string;
  providerType?: ModelProviderType;
  modelName?: string;
  responseText?: string;
  policy?: Partial<ModelProviderPolicy>;
}

export interface CreateLiteLlmProviderInput {
  providerId: string;
  providerType: ModelProviderType;
  modelName: string;
  endpoint: string;
  apiKey?: string;
  policy?: Partial<ModelProviderPolicy>;
  fetchImplementation?: typeof fetch;
}

export interface CreateOllamaLiteLlmProviderInput {
  modelName?: string;
  endpoint?: string;
  providerId?: string;
  fetchImplementation?: typeof fetch;
  policy?: Partial<ModelProviderPolicy>;
}

export interface CreateOpenAiProviderInput {
  providerId?: string;
  modelName?: string;
  apiKey?: string;
  endpoint?: string;
  policy?: Partial<ModelProviderPolicy>;
  fetchImplementation?: typeof fetch;
}

export interface CreateAnthropicProviderInput {
  providerId?: string;
  modelName?: string;
  apiKey?: string;
  endpoint?: string;
  policy?: Partial<ModelProviderPolicy>;
  fetchImplementation?: typeof fetch;
}

interface LiteLlmChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_cost?: number;
  };
}

const sensitivityRank: Record<Sensitivity, number> = {
  public: 0,
  friends: 1,
  trusted: 2,
  private: 3,
};

export function createDefaultModelProviderPolicies(): ModelProviderPolicy[] {
  return [
    {
      providerId: "local.mock",
      providerType: "local",
      enabled: true,
      allowedSensitivity: ["public", "friends", "trusted", "private"],
      allowedTaskTypes: ["*"],
      requiresOwnerApproval: false,
    },
    {
      providerId: "cloud.mock",
      providerType: "cloud",
      enabled: false,
      allowedSensitivity: ["public"],
      allowedTaskTypes: ["*"],
      requiresOwnerApproval: true,
    },
    {
      providerId: "peer.mock",
      providerType: "peer",
      enabled: false,
      allowedSensitivity: ["public", "friends"],
      allowedTaskTypes: ["*"],
      requiresOwnerApproval: true,
    },
  ];
}

export function createMockModelProvider(input: CreateMockModelProviderInput = {}): ModelProvider {
  const providerId = input.providerId ?? "local.mock";
  const providerType = input.providerType ?? "local";
  const policy: ModelProviderPolicy = {
    providerId,
    providerType,
    enabled: true,
    allowedSensitivity: providerType === "local" ? ["public", "friends", "trusted", "private"] : ["public"],
    allowedTaskTypes: ["*"],
    requiresOwnerApproval: providerType !== "local",
    ...input.policy,
  };
  const modelName = input.modelName ?? `${providerType}-mock-model`;
  const responseText = input.responseText ?? "Mock model response.";

  return {
    policy,
    async complete(request) {
      return {
        providerId: policy.providerId,
        modelName,
        text: responseText,
        usage: {
          inputTokens: request.prompt.length,
          outputTokens: responseText.length,
          estimatedCost: request.estimatedCost ?? 0,
        },
      };
    },
  };
}

export function createLiteLlmProvider(input: CreateLiteLlmProviderInput): ModelProvider {
  const policy: ModelProviderPolicy = {
    providerId: input.providerId,
    providerType: input.providerType,
    enabled: true,
    allowedSensitivity: input.providerType === "local" ? ["public", "friends", "trusted", "private"] : ["public"],
    allowedTaskTypes: ["*"],
    requiresOwnerApproval: input.providerType !== "local",
    ...input.policy,
  };
  const fetchImplementation = input.fetchImplementation ?? fetch;

  return {
    policy,
    async complete(request) {
      const response = await fetchImplementation(`${input.endpoint.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(input.apiKey ? { authorization: `Bearer ${input.apiKey}` } : {}),
        },
        body: JSON.stringify({
          model: input.modelName,
          messages: [{ role: "user", content: request.prompt }],
        }),
      });

      if (!response.ok) {
        throw new Error(`LiteLLM provider ${policy.providerId} failed with HTTP ${response.status}`);
      }

      const body = (await response.json()) as LiteLlmChatCompletionResponse;
      const text = body.choices?.[0]?.message?.content;
      if (!text) {
        throw new Error(`LiteLLM provider ${policy.providerId} returned no text`);
      }

      return {
        providerId: policy.providerId,
        modelName: input.modelName,
        text,
        usage: {
          inputTokens: body.usage?.prompt_tokens,
          outputTokens: body.usage?.completion_tokens,
          estimatedCost: request.estimatedCost ?? body.usage?.total_cost,
        },
      };
    },
  };
}

export function createOllamaLiteLlmProvider(
  input: CreateOllamaLiteLlmProviderInput = {},
): ModelProvider {
  const modelName = input.modelName ?? "ollama/llama3.1";

  return createLiteLlmProvider({
    providerId: input.providerId ?? `local.${modelName}`,
    providerType: "local",
    modelName,
    endpoint: input.endpoint ?? "http://127.0.0.1:11434/v1",
    fetchImplementation: input.fetchImplementation,
    policy: {
      enabled: true,
      allowedSensitivity: ["public", "friends", "trusted", "private"],
      allowedTaskTypes: ["*"],
      requiresOwnerApproval: false,
      ...input.policy,
    },
  });
}

export function createOpenAiProvider(input: CreateOpenAiProviderInput = {}): ModelProvider {
  const providerId = input.providerId ?? "cloud.openai";
  const modelName = input.modelName ?? "gpt-4o-mini";
  const endpoint = input.endpoint ?? "https://api.openai.com/v1";

  const policy: ModelProviderPolicy = {
    providerId,
    providerType: "cloud",
    enabled: true,
    allowedSensitivity: ["public"],
    allowedTaskTypes: ["*"],
    requiresOwnerApproval: true,
    ...input.policy,
  };

  const fetchImpl = input.fetchImplementation ?? fetch;

  return {
    policy,
    async complete(request) {
      const response = await fetchImpl(`${endpoint.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(input.apiKey ? { authorization: `Bearer ${input.apiKey}` } : {}),
        },
        body: JSON.stringify({
          model: modelName,
          messages: [{ role: "user", content: request.prompt }],
        }),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        throw new Error(`OpenAI provider ${providerId} failed: HTTP ${response.status} ${errorText}`);
      }

      const body = (await response.json()) as LiteLlmChatCompletionResponse;
      const text = body.choices?.[0]?.message?.content;
      if (!text) {
        throw new Error(`OpenAI provider ${providerId} returned no text`);
      }

      return {
        providerId,
        modelName,
        text,
        usage: {
          inputTokens: body.usage?.prompt_tokens,
          outputTokens: body.usage?.completion_tokens,
          estimatedCost: request.estimatedCost ?? body.usage?.total_cost,
        },
      };
    },
  };
}

export function createAnthropicProvider(input: CreateAnthropicProviderInput = {}): ModelProvider {
  const providerId = input.providerId ?? "cloud.anthropic";
  const modelName = input.modelName ?? "claude-sonnet-4-20250514";
  const endpoint = input.endpoint ?? "https://api.anthropic.com";

  const policy: ModelProviderPolicy = {
    providerId,
    providerType: "cloud",
    enabled: true,
    allowedSensitivity: ["public"],
    allowedTaskTypes: ["*"],
    requiresOwnerApproval: true,
    ...input.policy,
  };

  const fetchImpl = input.fetchImplementation ?? fetch;

  return {
    policy,
    async complete(request) {
      const response = await fetchImpl(`${endpoint.replace(/\/$/, "")}/v1/messages`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "anthropic-version": "2023-06-01",
          ...(input.apiKey ? { "x-api-key": input.apiKey } : {}),
        },
        body: JSON.stringify({
          model: modelName,
          messages: [{ role: "user", content: request.prompt }],
          max_tokens: 1024,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        throw new Error(`Anthropic provider ${providerId} failed: HTTP ${response.status} ${errorText}`);
      }

      const body = (await response.json()) as { content?: Array<{ text?: string }>; usage?: { input_tokens?: number; output_tokens?: number } };
      const text = body.content?.[0]?.text;
      if (!text) {
        throw new Error(`Anthropic provider ${providerId} returned no text`);
      }

      return {
        providerId,
        modelName,
        text,
        usage: {
          inputTokens: body.usage?.input_tokens,
          outputTokens: body.usage?.output_tokens,
        },
      };
    },
  };
}

function readEnvoyModelEnv(key: string): string | undefined {
  try {
    const env = typeof process !== "undefined" ? process.env : undefined;
    const v = env?.[key];
    return typeof v === "string" && v.length > 0 ? v : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Normalizes bases for providers that POST `${base}/chat/completions` (OpenAI-compatible API).
 * Legacy configs often omit `/v1`; Ollama exposes compat at `http://host:11434/v1`.
 */
export function normalizeOpenAiCompatibleBaseUrl(endpoint: string): string {
  let trimmed = endpoint.trim().replace(/\/+$/, "");
  if (!trimmed) return trimmed;
  // MiniMax China API lives on api.minimaxi.com; api.minimax.com is a common typo (ENOTFOUND).
  trimmed = trimmed.replace(/^(https?:\/\/)api\.minimax\.com(?=[:/]|$)/i, "$1api.minimaxi.com");
  if (/\/v1$/i.test(trimmed)) return trimmed;
  return `${trimmed}/v1`;
}

export interface BuildModelProvidersOptions {
  /**
   * Chat-assist / trusted-node paths: relax cloud provider policies so drafts work without per-call owner approval.
   */
  trustedLocalAssist?: boolean;
}

/**
 * Build model providers from node UI config.
 * Environment variables override config when set (desktop/dev):
 * ENVOY_MODEL_MODE, ENVOY_MODEL_ENDPOINT, ENVOY_MODEL_API_KEY, ENVOY_MODEL_NAME
 *
 * @param ownerApproved — When true, cloud OpenAI-compatible provider allows higher sensitivity for local owner queries.
 */
export function buildModelProviders(
  config: ModelProviderConfig,
  ownerApproved: boolean = false,
  options?: BuildModelProvidersOptions,
): ModelProvider[] {
  const effectiveConfig: ModelProviderConfig = {
    ...config,
    mode: (readEnvoyModelEnv("ENVOY_MODEL_MODE") as ModelProviderConfig["mode"]) ?? config.mode,
    endpoint: readEnvoyModelEnv("ENVOY_MODEL_ENDPOINT") ?? config.endpoint,
    apiKey: readEnvoyModelEnv("ENVOY_MODEL_API_KEY") ?? config.apiKey,
    modelName: readEnvoyModelEnv("ENVOY_MODEL_NAME") ?? config.modelName,
  };

  const relaxedCloudPolicy: Partial<ModelProviderPolicy> | undefined =
    ownerApproved || options?.trustedLocalAssist
      ? {
          allowedSensitivity: ["public", "friends", "trusted", "private"],
          requiresOwnerApproval: false,
        }
      : undefined;

  switch (effectiveConfig.mode) {
    case "disabled":
      return [];
    case "mock":
      return [
        createMockModelProvider({
          providerId: "local.mock",
          providerType: "local",
        }),
      ];
    case "ollama": {
      const base =
        normalizeOpenAiCompatibleBaseUrl(
          effectiveConfig.endpoint ?? "http://127.0.0.1:11434/v1",
        );
      return [
        createOllamaLiteLlmProvider({
          providerId: `local.ollama.${effectiveConfig.modelName ?? "llama3.1"}`,
          modelName: effectiveConfig.modelName ?? "llama3.1",
          endpoint: base,
        }),
      ];
    }
    case "litellm": {
      const base = normalizeOpenAiCompatibleBaseUrl(
        effectiveConfig.endpoint ?? "http://127.0.0.1:4000/v1",
      );
      return [
        createLiteLlmProvider({
          providerId: `cloud.${effectiveConfig.modelName ?? "litellm-model"}`,
          providerType: effectiveConfig.requireApprovalForCloud !== false ? "cloud" : "local",
          modelName: effectiveConfig.modelName ?? "gpt-4o-mini",
          endpoint: base,
          apiKey: effectiveConfig.apiKey,
        }),
      ];
    }
    case "openai-compatible": {
      const rawEndpoint = effectiveConfig.endpoint ?? "https://api.openai.com/v1";
      const base = normalizeOpenAiCompatibleBaseUrl(rawEndpoint);
      return [
        createOpenAiProvider({
          providerId: "cloud.openai-compatible",
          modelName: effectiveConfig.modelName ?? "gpt-4o-mini",
          apiKey: effectiveConfig.apiKey,
          endpoint: base,
          policy: relaxedCloudPolicy,
        }),
      ];
    }
    case "anthropic-compatible":
      return [
        createAnthropicProvider({
          providerId: "cloud.anthropic-compatible",
          modelName: effectiveConfig.modelName ?? "claude-sonnet-4-20250514",
          apiKey: effectiveConfig.apiKey,
          endpoint: effectiveConfig.endpoint ?? "https://api.anthropic.com",
          policy: relaxedCloudPolicy,
        }),
      ];
    default:
      return [createMockModelProvider({ providerId: "local.mock" })];
  }
}

/**
 * Owner-initiated knowledge query (AI tab / local ask): same prompt + routing shape as desktop
 * inbound handler with vault empty and bond level self — no vault snippets or audit trail.
 */
export async function runOwnerApprovedKnowledgeQuery(input: {
  query: string;
  requesterPeerId: string;
  modelProviders: ModelProviderConfig;
}): Promise<string> {
  const { query, requesterPeerId, modelProviders } = input;
  const ownerApproved = true;
  /** Matches bondLevel `"self"` policy (`evaluatePolicy`) max sensitivity */
  const allowedSensitivity = "private" satisfies Sensitivity;

  if (modelProviders.mode === "disabled") {
    return "The model provider is currently disabled. Please enable a model provider to answer knowledge queries.";
  }

  const promptContext = "(No vault documents found — answering from general knowledge)";
  const injectedContext = "";
  const prompt = `You are answering a knowledge query from a contact on the EnvoyMesh P2P network.\n\
Answer only based on the provided context. If the context does not contain relevant information, say so.\n\
Do not make up information. Keep the answer concise (2-4 sentences).\n\
Sensitivity level of this answer: ${allowedSensitivity}.\n\n\
Context:\n${promptContext}\n${injectedContext}\n\
Query: ${query}`;

  const effectiveSensitivity: Sensitivity =
    modelProviders.mode === "openai-compatible" || modelProviders.mode === "anthropic-compatible"
      ? ownerApproved ? "friends" : "public"
      : allowedSensitivity;

  const providers = buildModelProviders(modelProviders, ownerApproved);
  const modelResult = await routeModelRequest(
    {
      taskType: "knowledge.query",
      prompt,
      sensitivity: effectiveSensitivity,
      requesterPeerId,
      ownerApproved,
    },
    providers,
  );

  return modelResult.response?.text ?? "Model unavailable.";
}

export function evaluateModelProvider(
  request: ModelRequest,
  policy: ModelProviderPolicy,
): ModelRouteDecision {
  if (!policy.enabled) {
    return { action: "deny", reason: `${policy.providerId} is disabled` };
  }

  if (
    request.preferredProviderTypes &&
    !request.preferredProviderTypes.includes(policy.providerType)
  ) {
    return { action: "deny", reason: `${policy.providerType} provider was not requested` };
  }

  if (!policy.allowedTaskTypes.includes("*") && !policy.allowedTaskTypes.includes(request.taskType)) {
    return { action: "deny", reason: `${request.taskType} is not allowed for ${policy.providerId}` };
  }

  if (!sensitivityAllowed(request.sensitivity, policy.allowedSensitivity)) {
    return {
      action: "approval_required",
      reason: `${request.sensitivity} context exceeds ${policy.providerId} policy`,
      provider: policy,
    };
  }

  if (
    policy.maxCostPerRequest !== undefined &&
    request.estimatedCost !== undefined &&
    request.estimatedCost > policy.maxCostPerRequest
  ) {
    return {
      action: "approval_required",
      reason: `estimated cost exceeds ${policy.maxCostPerRequest}`,
      provider: policy,
    };
  }

  if (policy.requiresOwnerApproval && !request.ownerApproved) {
    return {
      action: "approval_required",
      reason: `${policy.providerId} requires owner approval`,
      provider: policy,
    };
  }

  return { action: "allow", provider: policy };
}

export function selectModelProvider(
  request: ModelRequest,
  providers: readonly ModelProvider[],
): ModelRouteDecision {
  let approvalDecision: Extract<ModelRouteDecision, { action: "approval_required" }> | undefined;
  let denyReason = "no model providers available";

  for (const provider of providers) {
    const decision = evaluateModelProvider(request, provider.policy);

    if (decision.action === "allow") {
      return decision;
    }

    if (decision.action === "approval_required" && !approvalDecision) {
      approvalDecision = decision;
    }

    if (decision.action === "deny") {
      denyReason = decision.reason;
    }
  }

  return approvalDecision ?? { action: "deny", reason: denyReason };
}

export async function routeModelRequest(
  request: ModelRequest,
  providers: readonly ModelProvider[],
): Promise<ModelRouterResult> {
  const firewall = evaluateSemanticFirewall({ text: request.prompt });
  if (!firewall.ok) {
    const decision = {
      action: "deny" as const,
      reason: `semantic_firewall: ${firewall.reason}`,
    };
    return {
      decision,
      auditEvent: createModelRoutingAuditEvent(request, decision),
    };
  }

  const sanitizedRequest: ModelRequest = { ...request, prompt: firewall.text };
  const decision = selectModelProvider(sanitizedRequest, providers);
  const auditEvent = createModelRoutingAuditEvent(sanitizedRequest, decision);

  if (decision.action !== "allow") {
    return { decision, auditEvent };
  }

  const provider = providers.find(
    (candidate) => candidate.policy.providerId === decision.provider.providerId,
  );

  if (!provider) {
    return {
      decision: { action: "deny", reason: `provider ${decision.provider.providerId} not found` },
      auditEvent: createModelRoutingAuditEvent(sanitizedRequest, {
        action: "deny",
        reason: `provider ${decision.provider.providerId} not found`,
      }),
    };
  }

  return {
    decision,
    auditEvent,
    response: await provider.complete(sanitizedRequest),
  };
}

export function createModelRoutingAuditEvent(
  request: ModelRequest,
  decision: ModelRouteDecision,
  input: { eventId?: string; createdAt?: string } = {},
): ModelRoutingAuditEvent {
  const provider = "provider" in decision ? decision.provider : undefined;

  return {
    version: "0.1",
    eventId: input.eventId ?? `model_audit_${modelAuditRandomId()}`,
    createdAt: input.createdAt ?? new Date().toISOString(),
    providerId: provider?.providerId,
    providerType: provider?.providerType,
    taskType: request.taskType,
    sensitivity: request.sensitivity,
    requesterPeerId: request.requesterPeerId,
    outcome: decision.action,
    reason: decision.action === "allow" ? undefined : decision.reason,
    estimatedCost: request.estimatedCost,
    ownerApproved: request.ownerApproved ?? false,
  };
}

function sensitivityAllowed(
  requested: Sensitivity,
  allowedSensitivity: readonly Sensitivity[],
): boolean {
  return allowedSensitivity.some(
    (allowed) => sensitivityRank[requested] <= sensitivityRank[allowed],
  );
}

// ─── Local tool registry exports ───────────────────────────────────────────────

export {
  evaluateToolPolicy,
  LocalToolRegistry,
  VAULT_SEARCH_TOOL,
  PEER_LOOKUP_TOOL,
  TASK_SUMMARY_TOOL,
  MESH_FIND_CAPABILITY_TOOL,
  MESH_REQUEST_KNOWLEDGE_TOOL,
  MESH_SEND_CHAT_TOOL,
  MESH_LIST_CONTACTS_TOOL,
} from "./tools.js";

export type {
  LocalToolDescriptor,
  ToolParamDescriptor,
  ToolCallRequest,
  ToolCallResult,
  ToolCallPolicyDecision,
  ToolCallAuditEvent,
  ToolImplementation,
} from "./tools.js";
