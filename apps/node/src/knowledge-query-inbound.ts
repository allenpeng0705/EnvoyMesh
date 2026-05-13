import { createAuditEvent, type LocalTaskStore, type LocalTrustStore, type LocalPeerDirectoryStore, type NodeProfile, type LocalChatLogStore, type HumanProfileStore } from "@envoymesh/local-store";
import { buildContextInjection } from "./context-injector.js";
import {
  createKnowledgeResponsePayload,
  parseKnowledgeQueryPayload,
  type EnvoyEnvelope,
  type KnowledgeResponsePayload,
} from "@envoymesh/protocol";
import { evaluatePolicy } from "@envoymesh/bonds";
import { searchVaultWithAudit, type VaultIndex } from "@envoymesh/vault";
import {
  createMockModelProvider,
  createOllamaLiteLlmProvider,
  createLiteLlmProvider,
  createOpenAiProvider,
  createAnthropicProvider,
  routeModelRequest,
  type ModelProvider,
} from "@envoymesh/models";
import type { ModelProviderConfig } from "@envoymesh/api";
import { ZodError } from "zod";

export type KnowledgeQueryInboundResult =
  | { ok: true; responsePayload: KnowledgeResponsePayload }
  | { ok: false; reason: string };

/**
 * Build the list of model providers from the node's model provider configuration.
 * Environment variables can override config values:
 * - ENVOY_MODEL_MODE: overrides config.mode (e.g., "openai-compatible", "mock")
 * - ENVOY_MODEL_ENDPOINT: overrides config.endpoint
 * - ENVOY_MODEL_API_KEY: overrides config.apiKey
 * - ENVOY_MODEL_NAME: overrides config.modelName
 * @param ownerApproved - If true, cloud providers allow higher sensitivity for local owner queries
 */
function buildModelProviders(config: ModelProviderConfig, ownerApproved: boolean = false): ModelProvider[] {
  // Allow environment variables to override config
  console.log(`[buildModelProviders] ENVOY_MODEL_MODE=${process.env.ENVOY_MODEL_MODE}`);
  const effectiveConfig: ModelProviderConfig = {
    ...config,
    mode: (process.env.ENVOY_MODEL_MODE as ModelProviderConfig["mode"]) ?? config.mode,
    endpoint: process.env.ENVOY_MODEL_ENDPOINT ?? config.endpoint,
    apiKey: process.env.ENVOY_MODEL_API_KEY ?? config.apiKey,
    modelName: process.env.ENVOY_MODEL_NAME ?? config.modelName,
  };
  console.log(`[buildModelProviders] effectiveConfig.mode=${effectiveConfig.mode}, endpoint=${effectiveConfig.endpoint}, apiKey=${effectiveConfig.apiKey ? "***" : "undefined"}`);

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
    case "ollama":
      return [
        createOllamaLiteLlmProvider({
          providerId: `local.ollama.${effectiveConfig.modelName ?? "llama3.1"}`,
          modelName: effectiveConfig.modelName ?? "llama3.1",
          endpoint: effectiveConfig.endpoint ?? "http://127.0.0.1:11434",
        }),
      ];
    case "litellm":
      return [
        createLiteLlmProvider({
          providerId: `cloud.${effectiveConfig.modelName ?? "litellm-model"}`,
          providerType: effectiveConfig.requireApprovalForCloud !== false ? "cloud" : "local",
          modelName: effectiveConfig.modelName ?? "gpt-4o-mini",
          endpoint: effectiveConfig.endpoint ?? "http://127.0.0.1:4000/v1",
          apiKey: effectiveConfig.apiKey,
        }),
      ];
    case "openai-compatible":
      return [
        createOpenAiProvider({
          providerId: "cloud.openai-compatible",
          modelName: effectiveConfig.modelName ?? "gpt-4o-mini",
          apiKey: effectiveConfig.apiKey,
          endpoint: effectiveConfig.endpoint ?? "https://api.openai.com/v1",
          // For local self-queries, allow higher sensitivity since owner is approving
          policy: ownerApproved ? {
            allowedSensitivity: ["public", "friends", "trusted", "private"],
            requiresOwnerApproval: false,
          } : undefined,
        }),
      ];
    case "anthropic-compatible":
      return [
        createAnthropicProvider({
          providerId: "cloud.anthropic-compatible",
          modelName: effectiveConfig.modelName ?? "claude-sonnet-4-20250514",
          apiKey: effectiveConfig.apiKey,
          endpoint: effectiveConfig.endpoint ?? "https://api.anthropic.com",
        }),
      ];
    default:
      return [createMockModelProvider({ providerId: "local.mock" })];
  }
}

/**
 * Resolve the owner ID for a sender using the peer directory.
 * Returns undefined if the sender is not a known contact.
 */
async function resolveSenderOwnerId(
  senderPeerId: string,
  peerDirectoryStore: LocalPeerDirectoryStore,
): Promise<string | undefined> {
  const records = await peerDirectoryStore.listPeerRecords();
  const match = records.find((r) => r.peerId === senderPeerId);
  return match?.ownerId;
}

/**
 * Handle an inbound `knowledge.query` intent.
 *
 * Flow:
 * 1. Validate payload (Zod)
 * 2. Audit: message verified
 * 3. Resolve sender's owner ID via peer directory; look up bond level
 * 4. Evaluate bond policy via @envoymesh/bonds
 * 5. If denied/approval_required: audit and return rejection
 * 6. Search vault (within allowed sensitivity ceiling)
 * 7. Route prompt through model router (mock provider)
 * 8. Audit policy, vault, model routing decisions
 * 9. Return signed knowledge.response payload for the caller to send
 */
export async function handleInboundKnowledgeQuery(input: {
  envelope: EnvoyEnvelope;
  remotePeerId: string;
  receivedAt: number;
  correlationId: string | undefined;
  taskStore: Pick<LocalTaskStore, "appendAuditEvent">;
  trustStore: LocalTrustStore;
  peerDirectoryStore: LocalPeerDirectoryStore;
  profile: NodeProfile;
  vaultIndex: VaultIndex | null;
  modelProviders: ModelProviderConfig;
  /**
   * If true, this is a local self-query (e.g., from the AI tab via WebSocket).
   * Self-queries bypass public peer restrictions and get full access.
   */
  isLocalSelfQuery?: boolean;
  /**
   * If true, the owner has approved this request (skips owner approval check for cloud providers).
   */
  ownerApproved?: boolean;
  /** Chat log store for conversation context injection (Phase 9C). */
  chatLogStore?: LocalChatLogStore | null;
  /** Human profile store for owner profile context injection (Phase 9C). */
  humanProfileStore?: HumanProfileStore;
}): Promise<KnowledgeQueryInboundResult> {
  const { envelope, remotePeerId, receivedAt, correlationId, taskStore, trustStore, peerDirectoryStore, profile, vaultIndex, modelProviders, isLocalSelfQuery = false, ownerApproved = false, chatLogStore = null, humanProfileStore } = input;

  let payload: ReturnType<typeof parseKnowledgeQueryPayload>;
  try {
    payload = parseKnowledgeQueryPayload(envelope.payload);
  } catch (error) {
    const reason =
      error instanceof ZodError
        ? error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`).join("; ")
        : "invalid knowledge.query payload";
    return { ok: false, reason };
  }

  const preview = payload.query.length > 120 ? `${payload.query.slice(0, 117)}...` : payload.query;

  // 1. Audit: inbound message verified
  await taskStore.appendAuditEvent(
    createAuditEvent({
      type: "message.verified",
      intent: envelope.intent,
      messageId: envelope.messageId,
      correlationId,
      remotePeerId,
      direction: "inbound",
      verificationStatus: "verified",
      latencyMs: Date.now() - receivedAt,
      outcome: "allow",
      summary: `knowledge.query received: ${preview}`,
      createdAt: envelope.createdAt,
    }),
  );

  // 2. Policy check: resolve sender's owner ID, then look up bond level
  // For local self-queries (AI tab), use "self" bond level to bypass public restrictions
  let bondLevel: "self" | "direct" | "referred" | "public" | "blocked" = "public";
  let senderOwnerId: string | undefined;

  if (isLocalSelfQuery) {
    bondLevel = "self";
  } else {
    senderOwnerId = await resolveSenderOwnerId(envelope.senderPeerId, peerDirectoryStore);
    bondLevel = senderOwnerId
      ? (await trustStore.getTrustRecord(senderOwnerId))?.level ?? "public"
      : "public";
  }

  const policyDecision = evaluatePolicy({
    peerId: senderOwnerId ?? envelope.senderPeerId,
    bondLevel,
    intent: "knowledge.query",
    requestedSensitivity: payload.requestedSensitivity,
  });

  // 3. Audit: policy decision
  if (policyDecision.action === "deny") {
    await taskStore.appendAuditEvent(
      createAuditEvent({
        type: "policy.decided",
        intent: "knowledge.query",
        messageId: envelope.messageId,
        correlationId,
        remotePeerId,
        direction: "inbound",
        verificationStatus: "verified",
        latencyMs: Date.now() - receivedAt,
        outcome: "deny",
        summary: `knowledge.query denied: ${policyDecision.reason}`,
        createdAt: envelope.createdAt,
      }),
    );
    return { ok: false, reason: policyDecision.reason };
  }

  if (policyDecision.action === "approval_required") {
    await taskStore.appendAuditEvent(
      createAuditEvent({
        type: "policy.decided",
        intent: "knowledge.query",
        messageId: envelope.messageId,
        correlationId,
        remotePeerId,
        direction: "inbound",
        verificationStatus: "verified",
        latencyMs: Date.now() - receivedAt,
        outcome: "deny",
        summary: `knowledge.query requires approval: ${policyDecision.reason}`,
        createdAt: envelope.createdAt,
      }),
    );
    return { ok: false, reason: `approval required: ${policyDecision.reason}` };
  }

  // action === "allow": proceed with vault search + model routing
  const maxSens = policyDecision.action === "allow" ? policyDecision.maxSensitivity : "public";
  const allowedSensitivity = maxSens ?? "public";

  // 4. Search vault (best-effort; if vaultIndex is null, skip vault search)
  let vaultResults: { results: ReturnType<typeof searchVaultWithAudit>["results"]; audited: boolean } = { results: [], audited: false };
  if (vaultIndex) {
    const searchResult = searchVaultWithAudit(vaultIndex, payload.query, {
      requesterPeerId: remotePeerId,
      requesterOwnerId: senderOwnerId,
      createdAt: envelope.createdAt,
    });
    vaultResults = { results: searchResult.results, audited: true };
    // Audit vault search
    await taskStore.appendAuditEvent(
      createAuditEvent({
        type: "vault.searched",
        intent: "knowledge.query",
        messageId: envelope.messageId,
        correlationId,
        remotePeerId,
        direction: "inbound",
        verificationStatus: "verified",
        latencyMs: Date.now() - receivedAt,
        outcome: "record",
        summary: `vault search: ${searchResult.results.length} result(s) for query "${preview}"`,
        createdAt: envelope.createdAt,
      }),
    );
  }

  // 5. Build model prompt from vault snippets (if any)
  const snippets = vaultResults.results.slice(0, 5);
  const promptContext = snippets.length > 0
    ? snippets.map((r) => `[From ${r.document.title}]: ${r.chunk.text}`).join("\n\n")
    : "(No vault documents found — answering from general knowledge)";

  // Build rich context injection (Phase 9C): conversation history + relationship + profile
  const injectedContext = humanProfileStore && senderOwnerId
    ? await buildContextInjection(senderOwnerId, chatLogStore, trustStore, humanProfileStore)
    : "";

  const prompt = `You are answering a knowledge query from a contact on the EnvoyMesh P2P network.\n\
Answer only based on the provided context. If the context does not contain relevant information, say so.\n\
Do not make up information. Keep the answer concise (2-4 sentences).\n\
Sensitivity level of this answer: ${allowedSensitivity}.\n\n\
Context:\n${promptContext}\n${injectedContext}\n\
Query: ${payload.query}`;

  // Cap sensitivity for cloud providers (they only allow "public" by default)
  // For local self-queries with owner approval, we can use up to "friends" sensitivity
  const effectiveSensitivity = modelProviders.mode === "openai-compatible" || modelProviders.mode === "anthropic-compatible"
    ? (ownerApproved ? "friends" : "public")
    : allowedSensitivity;

  // 6. Route through model router with configured provider(s)
  if (modelProviders.mode === "disabled") {
    await taskStore.appendAuditEvent(
      createAuditEvent({
        type: "model.routed",
        intent: "knowledge.query",
        messageId: envelope.messageId,
        correlationId,
        remotePeerId,
        direction: "inbound",
        verificationStatus: "verified",
        latencyMs: Date.now() - receivedAt,
        outcome: "deny",
        summary: "model routing: denied (model provider is disabled)",
        createdAt: envelope.createdAt,
      }),
    );
    return {
      ok: true,
      responsePayload: createKnowledgeResponsePayload({
        inReplyTo: envelope.messageId,
        answer: "The model provider is currently disabled. Please enable a model provider to answer knowledge queries.",
        sensitivity: allowedSensitivity,
        matchScore: 0,
        refused: true,
        refusalReason: "model disabled",
      }),
    };
  }

  const providers = buildModelProviders(modelProviders, ownerApproved);
  console.log(`[knowledge-query] providers.length=${providers.length}`);

  const modelResult = await routeModelRequest(
    {
      taskType: "knowledge.query",
      prompt,
      sensitivity: effectiveSensitivity,
      requesterPeerId: remotePeerId,
      ownerApproved,
    },
    providers,
  );
  console.log(`[knowledge-query] modelResult:`, JSON.stringify(modelResult));

  // 7. Audit model routing decision
  const evt = modelResult.auditEvent;
  await taskStore.appendAuditEvent(
    createAuditEvent({
      type: "model.routed",
      intent: "knowledge.query",
      messageId: envelope.messageId,
      correlationId,
      remotePeerId,
      direction: "inbound",
      verificationStatus: "verified",
      latencyMs: Date.now() - receivedAt,
      outcome: modelResult.decision.action === "allow" ? "allow" : "deny",
      summary: `model routing: ${modelResult.decision.action} (${"reason" in modelResult.decision ? modelResult.decision.reason : "provider=" + (evt?.providerId ?? "unknown")})`,
      createdAt: envelope.createdAt,
    }),
  );

  // 8. Build and return response payload
  const answer = modelResult.response?.text ?? "Model unavailable.";
  const matchScore = snippets.length > 0
    ? Math.min(1, snippets.reduce((sum, r) => sum + r.score, 0) / snippets.length / 10)
    : 0;

  const responsePayload = createKnowledgeResponsePayload({
    inReplyTo: envelope.messageId,
    answer,
    sensitivity: allowedSensitivity,
    matchScore,
    refused: false,
  });

  return { ok: true, responsePayload };
}
