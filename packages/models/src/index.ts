import { randomUUID } from "node:crypto";
import type { Sensitivity } from "@envoymesh/protocol";

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
    endpoint: input.endpoint ?? "http://127.0.0.1:4000/v1",
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
  const decision = selectModelProvider(request, providers);
  const auditEvent = createModelRoutingAuditEvent(request, decision);

  if (decision.action !== "allow") {
    return { decision, auditEvent };
  }

  const provider = providers.find(
    (candidate) => candidate.policy.providerId === decision.provider.providerId,
  );

  if (!provider) {
    return {
      decision: { action: "deny", reason: `provider ${decision.provider.providerId} not found` },
      auditEvent: createModelRoutingAuditEvent(request, {
        action: "deny",
        reason: `provider ${decision.provider.providerId} not found`,
      }),
    };
  }

  return {
    decision,
    auditEvent,
    response: await provider.complete(request),
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
    eventId: input.eventId ?? `model_audit_${randomUUID()}`,
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
