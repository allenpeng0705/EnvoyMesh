import { randomUUID } from "node:crypto";
import { evaluateSemanticFirewall, MAX_MODEL_PROMPT_CHARS, } from "./semantic-firewall.js";
export { evaluateSemanticFirewall, MAX_MODEL_PROMPT_CHARS };
const sensitivityRank = {
    public: 0,
    friends: 1,
    trusted: 2,
    private: 3,
};
export function createDefaultModelProviderPolicies() {
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
export function createMockModelProvider(input = {}) {
    const providerId = input.providerId ?? "local.mock";
    const providerType = input.providerType ?? "local";
    const policy = {
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
export function createLiteLlmProvider(input) {
    const policy = {
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
            const body = (await response.json());
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
export function createOllamaLiteLlmProvider(input = {}) {
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
export function evaluateModelProvider(request, policy) {
    if (!policy.enabled) {
        return { action: "deny", reason: `${policy.providerId} is disabled` };
    }
    if (request.preferredProviderTypes &&
        !request.preferredProviderTypes.includes(policy.providerType)) {
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
    if (policy.maxCostPerRequest !== undefined &&
        request.estimatedCost !== undefined &&
        request.estimatedCost > policy.maxCostPerRequest) {
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
export function selectModelProvider(request, providers) {
    let approvalDecision;
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
export async function routeModelRequest(request, providers) {
    const firewall = evaluateSemanticFirewall({ text: request.prompt });
    if (!firewall.ok) {
        const decision = {
            action: "deny",
            reason: `semantic_firewall: ${firewall.reason}`,
        };
        return {
            decision,
            auditEvent: createModelRoutingAuditEvent(request, decision),
        };
    }
    const sanitizedRequest = { ...request, prompt: firewall.text };
    const decision = selectModelProvider(sanitizedRequest, providers);
    const auditEvent = createModelRoutingAuditEvent(sanitizedRequest, decision);
    if (decision.action !== "allow") {
        return { decision, auditEvent };
    }
    const provider = providers.find((candidate) => candidate.policy.providerId === decision.provider.providerId);
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
export function createModelRoutingAuditEvent(request, decision, input = {}) {
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
function sensitivityAllowed(requested, allowedSensitivity) {
    return allowedSensitivity.some((allowed) => sensitivityRank[requested] <= sensitivityRank[allowed]);
}
//# sourceMappingURL=index.js.map