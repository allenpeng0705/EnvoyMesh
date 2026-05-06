import { randomUUID } from "node:crypto";
import { createAuditEvent, type LocalTaskStore, type LocalTrustStore, type LocalPeerDirectoryStore, type NodeProfile, type ChatDraftStore } from "@envoymesh/local-store";
import {
  createMockModelProvider,
  createOllamaLiteLlmProvider,
  createLiteLlmProvider,
  routeModelRequest,
  type ModelProvider,
} from "@envoymesh/models";
import type { ModelProviderConfig } from "@envoymesh/api";
import type { EnvoyEnvelope } from "@envoymesh/protocol";

export interface ChatDraftResult {
  ok: true;
  draft: {
    draftId: string;
    text: string;
    inReplyToMessageId: string;
    createdAt: string;
  };
  auditWritten: boolean;
}

export interface ChatDraftFailure {
  ok: false;
  reason: string;
}

/**
 * Build the list of model providers from the node's model provider configuration.
 */
function buildModelProviders(config: ModelProviderConfig): ModelProvider[] {
  switch (config.mode) {
    case "disabled":
      return [];
    case "mock":
      return [createMockModelProvider({ providerId: "local.mock", providerType: "local" })];
    case "ollama":
      return [
        createOllamaLiteLlmProvider({
          providerId: `local.ollama.${config.modelName ?? "llama3.1"}`,
          modelName: config.modelName ?? "llama3.1",
          endpoint: config.endpoint ?? "http://127.0.0.1:11434",
        }),
      ];
    case "litellm":
      return [
        createLiteLlmProvider({
          providerId: `cloud.${config.modelName ?? "litellm-model"}`,
          providerType: config.requireApprovalForCloud !== false ? "cloud" : "local",
          modelName: config.modelName ?? "gpt-4o-mini",
          endpoint: config.endpoint ?? "http://127.0.0.1:4000/v1",
          apiKey: config.apiKey,
        }),
      ];
    default:
      return [createMockModelProvider({ providerId: "local.mock" })];
  }
}

/**
 * Attempt to generate a chat draft for the given inbound chat message.
 *
 * Conditions:
 * - chatAssistEnabled must be true (caller checks this)
 * - model provider must not be disabled
 * - sender must not be blocked
 * - Sensitivity ceiling is "friends" (direct/referred bonds), "public" otherwise
 *
 * Drafts are saved to the draft store and returned. The caller is responsible
 * for emitting the `chat:draft` event to connected clients.
 *
 * This function does NOT auto-send anything — drafts are surfaced for owner review only.
 */
export async function generateChatDraft(input: {
  envelope: EnvoyEnvelope;
  senderOwnerId: string;
  senderDisplayName: string;
  chatText: string;
  remotePeerId: string;
  receivedAt: number;
  correlationId: string | undefined;
  taskStore: Pick<LocalTaskStore, "appendAuditEvent">;
  trustStore: LocalTrustStore;
  peerDirectoryStore: LocalPeerDirectoryStore;
  profile: NodeProfile;
  draftStore: ChatDraftStore;
  modelProviders: ModelProviderConfig;
  chatAssistEnabled: boolean;
}): Promise<ChatDraftResult | ChatDraftFailure> {
  const {
    envelope,
    senderOwnerId,
    senderDisplayName,
    chatText,
    remotePeerId,
    receivedAt,
    correlationId,
    taskStore,
    trustStore,
    profile,
    draftStore,
    modelProviders,
    chatAssistEnabled,
  } = input;

  // Guard: chat assist must be enabled
  if (!chatAssistEnabled) {
    return { ok: false, reason: "chat assist is disabled" };
  }

  // Guard: provider must not be disabled
  if (modelProviders.mode === "disabled") {
    return { ok: false, reason: "model provider is disabled" };
  }

  // Look up sender's trust level
  const trustRecord = await trustStore.getTrustRecord(senderOwnerId);
  const bondLevel = trustRecord?.level ?? "public";

  // Blocked senders never get drafts
  if (bondLevel === "blocked") {
    return { ok: false, reason: "sender is blocked" };
  }

  // Sensitivity ceiling based on bond level
  const sensitivityCeiling = bondLevel === "direct" || bondLevel === "referred" ? "friends" : "public";

  // Build model providers
  const providers = buildModelProviders(modelProviders);
  if (providers.length === 0) {
    return { ok: false, reason: "no model providers available" };
  }

  // Build the prompt for draft generation
  const selfDisplayName = profile.owner.ownerId; // fallback
  const prompt = `You are a helpful assistant in a secure P2P messaging app called EnvoyMesh.
A message was just received from your contact "${senderDisplayName}" (owner ID: ${senderOwnerId}).

Your task is to draft a concise, friendly reply to their message.
Guidelines:
- Keep the reply short (1-3 sentences).
- Match the tone and topic of the received message.
- Do not reveal any private information that wasn't in the message.
- Do not make up facts not supported by the conversation.
- The reply draft is for the owner to review and send manually — never auto-send.

Received message:
"${chatText}"

Write your reply draft below:`;

  // Route through model router
  const modelResult = await routeModelRequest(
    {
      taskType: "chat.draft",
      prompt,
      sensitivity: sensitivityCeiling,
      requesterPeerId: remotePeerId,
      ownerApproved: false,
    },
    providers,
  );

  // Audit model routing
  const modelOk = modelResult.decision.action === "allow";
  await taskStore.appendAuditEvent(
    createAuditEvent({
      type: "model.routed",
      intent: "chat.message",
      messageId: envelope.messageId,
      correlationId,
      remotePeerId,
      direction: "inbound",
      verificationStatus: "verified",
      latencyMs: Date.now() - receivedAt,
      outcome: modelOk ? "allow" : "deny",
      summary: `chat draft routing: ${modelResult.decision.action}${!("provider" in modelResult.decision) ? "" : ` (${"provider" in modelResult.decision ? (modelResult.decision as any).provider?.providerId : ""})`}`,
      createdAt: new Date().toISOString(),
    }),
  );

  if (!modelOk) {
    return {
      ok: false,
      reason: `model denied: ${"reason" in modelResult.decision ? modelResult.decision.reason : "no model provider approved"}`,
    };
  }

  const draftText = modelResult.response?.text ?? "";

  // Generate and save the draft
  const draftId = randomUUID();
  const createdAt = new Date().toISOString();
  const draft = {
    draftId,
    threadPeerOwnerId: senderOwnerId,
    inReplyToMessageId: envelope.messageId,
    text: draftText.trim(),
    createdAt,
  };

  await draftStore.save(draft);

  // Audit draft creation (without logging the full draft text for privacy)
  await taskStore.appendAuditEvent(
    createAuditEvent({
      type: "model.routed",
      intent: "chat.message",
      messageId: envelope.messageId,
      correlationId,
      remotePeerId,
      direction: "inbound",
      verificationStatus: "verified",
      latencyMs: Date.now() - receivedAt,
      outcome: "allow",
      summary: `chat draft created: id=${draftId} bond=${bondLevel} sensitivity=${sensitivityCeiling}`,
      createdAt: new Date().toISOString(),
    }),
  );

  return {
    ok: true,
    draft: {
      draftId,
      text: draftText.trim(),
      inReplyToMessageId: envelope.messageId,
      createdAt,
    },
    auditWritten: true,
  };
}
