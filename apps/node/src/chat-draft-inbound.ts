import { randomUUID } from "node:crypto";
import { createAuditEvent, type LocalTaskStore, type LocalTrustStore, type LocalPeerDirectoryStore, type NodeProfile, type ChatDraftStore, type LocalChatLogStore, type HumanProfileStore } from "@envoymesh/local-store";
import {
  createMockModelProvider,
  createOllamaLiteLlmProvider,
  createLiteLlmProvider,
  createOpenAiProvider,
  createAnthropicProvider,
  routeModelRequest,
  type ModelProvider,
} from "@envoymesh/models";
import { searchVault, type VaultIndex } from "@envoymesh/vault";
import type { AiIdentity, AiRule, ModelProviderConfig } from "@envoymesh/api";
import type { EnvoyEnvelope } from "@envoymesh/protocol";
import { buildContextInjection } from "./context-injector.js";

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
 * Environment variables can override config values:
 * - ENVOY_MODEL_MODE: overrides config.mode (e.g., "openai-compatible", "mock")
 * - ENVOY_MODEL_ENDPOINT: overrides config.endpoint
 * - ENVOY_MODEL_API_KEY: overrides config.apiKey
 * - ENVOY_MODEL_NAME: overrides config.modelName
 */
function buildModelProviders(config: ModelProviderConfig): ModelProvider[] {
  // Allow environment variables to override config
  const effectiveConfig: ModelProviderConfig = {
    ...config,
    mode: (process.env.ENVOY_MODEL_MODE as ModelProviderConfig["mode"]) ?? config.mode,
    endpoint: process.env.ENVOY_MODEL_ENDPOINT ?? config.endpoint,
    apiKey: process.env.ENVOY_MODEL_API_KEY ?? config.apiKey,
    modelName: process.env.ENVOY_MODEL_NAME ?? config.modelName,
  };

  switch (effectiveConfig.mode) {
    case "disabled":
      return [];
    case "mock":
      return [createMockModelProvider({ providerId: "local.mock", providerType: "local" })];
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
          // Allow higher sensitivity for local chat assist since owner is using their own node
          policy: {
            allowedSensitivity: ["public", "friends", "trusted", "private"],
            requiresOwnerApproval: false,
          },
        }),
      ];
    case "anthropic-compatible":
      return [
        createAnthropicProvider({
          providerId: "cloud.anthropic-compatible",
          modelName: effectiveConfig.modelName ?? "claude-sonnet-4-20250514",
          apiKey: effectiveConfig.apiKey,
          endpoint: effectiveConfig.endpoint ?? "https://api.anthropic.com",
          // Allow higher sensitivity for local chat assist since owner is using their own node
          policy: {
            allowedSensitivity: ["public", "friends", "trusted", "private"],
            requiresOwnerApproval: false,
          },
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
  aiIdentity?: AiIdentity;
  contactAiAccessLevel?: "none" | "assistant_only" | "full";
  knowledgeAccess?: "public" | "professional" | "personal";
  rules?: AiRule[];
  vaultIndex?: VaultIndex | null;
  isOnline?: boolean;
  ownerDisplayName?: string;
  chatLogStore?: LocalChatLogStore | null;
  humanProfileStore?: HumanProfileStore;
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
    contactAiAccessLevel = "none",
    knowledgeAccess = "public",
    trustStore,
    profile,
    draftStore,
    modelProviders,
    chatAssistEnabled,
    aiIdentity,
    rules = [],
    vaultIndex,
    isOnline = true,
    ownerDisplayName,
    chatLogStore = null,
    humanProfileStore,
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

  // Match rules against the incoming message
  // Rules are sorted by priority; first matching rule wins
  const enabledRules = rules
    .filter((r) => r.enabled)
    .sort((a, b) => a.priority - b.priority);

  const matchedRule = enabledRules.find((rule) => {
    const trigger = rule.trigger;

    // Check keywords
    if (trigger.keywords && trigger.keywords.length > 0) {
      const lowerText = chatText.toLowerCase();
      const hasKeyword = trigger.keywords.some((kw) => lowerText.includes(kw.toLowerCase()));
      if (!hasKeyword) return false;
    }

    // Check messageContains (regex)
    if (trigger.messageContains) {
      try {
        const regex = new RegExp(trigger.messageContains, "i");
        if (!regex.test(chatText)) return false;
      } catch {
        // Invalid regex, skip this trigger
      }
    }

    // Check contact AI access level
    if (trigger.contactAiAccessLevel && trigger.contactAiAccessLevel.length > 0) {
      // contactAiAccessLevel can be "none" but rule trigger only accepts "assistant_only" | "full"
      // If contact has "none" access, we shouldn't be here anyway (caller checks this)
      if (!trigger.contactAiAccessLevel.includes(contactAiAccessLevel as "assistant_only" | "full")) return false;
    }

    // Check isGreeting (simple heuristics)
    if (trigger.isGreeting) {
      const lowerText = chatText.toLowerCase().trim();
      const greetingPatterns = /^(hi|hello|hey|howdy|hiya|greetings|good\s+(morning|afternoon|evening))[!.,?]*$/;
      if (!greetingPatterns.test(lowerText)) return false;
    }

    // Check isComplex (placeholder - always false for now)
    if (trigger.isComplex) {
      return false; // Not implemented yet
    }

    return true;
  });

  // Build model providers
  const providers = buildModelProviders(modelProviders);
  console.log(`[chat-draft] ENVOY_MODEL_MODE=${process.env.ENVOY_MODEL_MODE}`);
  console.log(`[chat-draft] providers.length=${providers.length}`);
  if (providers.length === 0) {
    return { ok: false, reason: "no model providers available" };
  }

  // Build the prompt for draft generation
  const selfDisplayName = ownerDisplayName ?? profile.owner.ownerId;
  const identityMode = aiIdentity?.mode ?? "transparent";
  const identityPrefix = aiIdentity?.transparentPrefix ?? "[AI Agent]";

  // Build identity-specific system instructions
  let identityInstructions = "";
  switch (identityMode) {
    case "invisible":
      identityInstructions = `You are ${selfDisplayName}. Respond naturally as if you are them.
Keep your response style casual and in character with how they would normally write.
Do NOT mention that you are an AI.`;
      break;
    case "transparent":
      identityInstructions = `You are ${selfDisplayName}'s AI assistant.
Your responses will be shown with the prefix "${identityPrefix}".
Be helpful, concise, and friendly.`;
      break;
    case "defensive":
      identityInstructions = `You are ${selfDisplayName}'s assistant. When they are unavailable, you act as a polite gatekeeper.
Prefix your responses with "${identityPrefix}".
Be courteous and professional. If you cannot help, politely explain limitations.`;
      break;
  }

  // Build rule context for the prompt
  let ruleContext = "";
  if (matchedRule) {
    console.log(`[chat-draft] matched rule: ${matchedRule.name} (${matchedRule.id})`);
    // If rule has an identity override, update identity instructions
    if (matchedRule.action.aiIdentityOverride) {
      const overrideMode = matchedRule.action.aiIdentityOverride;
      switch (overrideMode) {
        case "invisible":
          identityInstructions = `You are ${selfDisplayName}. Respond naturally as if you are them.
Keep your response style casual and in character with how they would normally write.
Do NOT mention that you are an AI.`;
          break;
        case "transparent":
          identityInstructions = `You are ${selfDisplayName}'s AI assistant.
Your responses will be shown with the prefix "${identityPrefix}".
Be helpful, concise, and friendly.`;
          break;
        case "defensive":
          identityInstructions = `You are ${selfDisplayName}'s assistant. When they are unavailable, you act as a polite gatekeeper.
Prefix your responses with "${identityPrefix}".
Be courteous and professional. If you cannot help, politely explain limitations.`;
          break;
      }
    }
    // Add template context if provided
    if (matchedRule.action.template) {
      ruleContext = `\n\nIMPORTANT: Use this response template for your reply:\n"${matchedRule.action.template.replace(/\{ownerName\}/g, senderDisplayName)}"`;
    }
  }

  // Build vault context if rule has vaultQuery
  let vaultContext = "";
  if (matchedRule?.action?.vaultQuery && vaultIndex) {
    const vaultQuery = matchedRule.action.vaultQuery;
    console.log(`[chat-draft] querying vault: path=${vaultQuery.path}, maxSensitivity=${vaultQuery.maxSensitivity}`);

    // Search vault for relevant content
    const vaultResults = searchVault(vaultIndex, vaultQuery.path, { limit: 5 });

    // Filter results based on knowledgeAccess sensitivity
    // Sensitivity hierarchy: public (0) < friends (1) < professional (2) < personal (3)
    const sensitivityOrder = ["public", "friends", "professional", "personal"];
    const maxSensitivityIndex = sensitivityOrder.indexOf(vaultQuery.maxSensitivity);
    const userSensitivityIndex = sensitivityOrder.indexOf(knowledgeAccess);

    const filteredResults = vaultResults.filter((result) => {
      // Simple heuristic: documents with "personal" in path are personal,
      // "work" or "professional" or "office" are professional,
      // "friends" or "shared" are friends, rest is public
      const path = result.document.relativePath.toLowerCase();
      let docSensitivity: "public" | "friends" | "professional" | "personal" = "public";
      if (path.includes("personal") || path.includes("private")) {
        docSensitivity = "personal";
      } else if (path.includes("work") || path.includes("professional") || path.includes("office")) {
        docSensitivity = "professional";
      } else if (path.includes("friends") || path.includes("shared")) {
        docSensitivity = "friends";
      }
      // Include document if its sensitivity is <= both the rule's max and the user's access level
      return sensitivityOrder.indexOf(docSensitivity) <= maxSensitivityIndex && sensitivityOrder.indexOf(docSensitivity) <= userSensitivityIndex;
    });

    if (filteredResults.length > 0) {
      vaultContext = `\n\nRelevant information from vault:\n`;
      for (const result of filteredResults.slice(0, 3)) {
        vaultContext += `- ${result.document.title}: "${result.chunk.text.slice(0, 200)}${result.chunk.text.length > 200 ? "..." : ""}"\n`;
      }
      console.log(`[chat-draft] vault returned ${filteredResults.length} results`);
    }
  }

  // Build status and permissions context
  const statusContext = `\n\nUser status: ${isOnline ? "ONLINE (draft mode — owner will review before sending)" : "OFFLINE (auto-reply mode)"}
Contact permissions:
- AI Access Level: ${contactAiAccessLevel}
- Knowledge Access: ${knowledgeAccess}`;

  // Build rich context injection (Phase 9C): conversation history + relationship + profile
  const injectedContext = humanProfileStore
    ? await buildContextInjection(senderOwnerId, chatLogStore, trustStore, humanProfileStore)
    : "";

  const prompt = `You are a helpful assistant in a secure P2P messaging app called EnvoyMesh.

${identityInstructions}
${ruleContext}
${statusContext}${injectedContext}
${vaultContext}

A message was just received from your contact "${senderDisplayName}" (owner ID: ${senderOwnerId}).

Your task is to draft a reply to their message.
Guidelines:
- Keep the reply short (1-3 sentences).
- Match the tone and topic of the received message.
- Do not reveal any private information that wasn't in the message.
- Do not make up facts not supported by the conversation.
- The reply draft is for the owner to review and send manually.

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
