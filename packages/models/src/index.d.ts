import type { Sensitivity } from "@envoymesh/protocol";
import { evaluateSemanticFirewall, MAX_MODEL_PROMPT_CHARS, type SemanticFirewallResult } from "./semantic-firewall.js";
export { evaluateSemanticFirewall, MAX_MODEL_PROMPT_CHARS, type SemanticFirewallResult };
export type ModelProviderType = "local" | "cloud" | "peer";
export type ModelRouteDecision = {
    action: "allow";
    provider: ModelProviderPolicy;
} | {
    action: "deny";
    reason: string;
} | {
    action: "approval_required";
    reason: string;
    provider: ModelProviderPolicy;
};
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
export declare function createDefaultModelProviderPolicies(): ModelProviderPolicy[];
export declare function createMockModelProvider(input?: CreateMockModelProviderInput): ModelProvider;
export declare function createLiteLlmProvider(input: CreateLiteLlmProviderInput): ModelProvider;
export declare function createOllamaLiteLlmProvider(input?: CreateOllamaLiteLlmProviderInput): ModelProvider;
export declare function evaluateModelProvider(request: ModelRequest, policy: ModelProviderPolicy): ModelRouteDecision;
export declare function selectModelProvider(request: ModelRequest, providers: readonly ModelProvider[]): ModelRouteDecision;
export declare function routeModelRequest(request: ModelRequest, providers: readonly ModelProvider[]): Promise<ModelRouterResult>;
export declare function createModelRoutingAuditEvent(request: ModelRequest, decision: ModelRouteDecision, input?: {
    eventId?: string;
    createdAt?: string;
}): ModelRoutingAuditEvent;
//# sourceMappingURL=index.d.ts.map