import { randomUUID } from "node:crypto";
import { createAuditEvent, type LocalTaskStore, type LocalTrustStore, type LocalPeerDirectoryStore, type NodeProfile, type ChatDraftStore, type LocalChatLogStore, type HumanProfileStore, type AgentIdentityStore } from "@envoymesh/local-store";
import { buildModelProviders, type ModelProvider } from "@envoymesh/models";
import { routeModelRequestWithCostTracking } from "./model-cost-tracking.js";
import type { VaultIndex } from "@envoymesh/vault";
import type { AiIdentity, AiKnowledgeBaseSettings, AiRule, ModelProviderConfig } from "@envoymesh/api";
import { applyAiIdentityToDraftText } from "@envoymesh/api";
import type { EnvoyEnvelope } from "@envoymesh/protocol";
import { formatVaultKnowledgeSection, searchVaultKnowledgeBase } from "./ai-context.js";
import { buildContextInjection } from "./context-injector.js";
import { loadAgentIdentitySection } from "./agent-identity-context.js";
import type { ModeController } from "./mode-controller.js";
import { aiIdentityNoPrefixPromptLine } from "@envoymesh/api";
import type { RagService } from "./rag-service.js";

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
  taskStore: Pick<LocalTaskStore, "appendAuditEvent" | "recordModelCallCost">;
  trustStore: LocalTrustStore;
  peerDirectoryStore: LocalPeerDirectoryStore;
  profile: NodeProfile;
  draftStore: ChatDraftStore;
  modelProviders: ModelProviderConfig;
  chatAssistEnabled: boolean;
  aiIdentity?: AiIdentity;
  contactAiAccessLevel?: "none" | "assistant_only" | "full";
  knowledgeAccess?: "public" | "friends" | "private";
  rules?: AiRule[];
  vaultIndex?: VaultIndex | null;
  isOnline?: boolean;
  ownerDisplayName?: string;
  chatLogStore?: LocalChatLogStore | null;
  humanProfileStore?: HumanProfileStore;
  agentIdentityStore?: AgentIdentityStore | null;
  modeController?: ModeController;
  knowledgeBase?: AiKnowledgeBaseSettings | null;
  ragService?: RagService | null;
  /** When true, skip reactive-mode guard (auto-reply or online assistant enabled). */
  allowWhileOwnerOnline?: boolean;
  /** Persist drafts and load thread context under this key (e.g. room:uuid for group chat). */
  threadKey?: string;
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
    agentIdentityStore = null,
    modeController,
    knowledgeBase,
    ragService = null,
    allowWhileOwnerOnline = false,
    threadKey: threadKeyOverride,
  } = input;

  const threadKey = threadKeyOverride ?? senderOwnerId;

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

  // Mode guard (Phase 9D): skip draft in reactive mode when owner is connected,
  // unless auto-reply or online assistant explicitly allows it.
  if (
    modeController &&
    modeController.getCurrentMode() === "reactive" &&
    modeController.isOwnerConnected() &&
    !allowWhileOwnerOnline
  ) {
    return { ok: false, reason: "agent is in reactive mode with owner online" };
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
  const providers = buildModelProviders(modelProviders, false, { trustedLocalAssist: true });
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
${aiIdentityNoPrefixPromptLine(identityPrefix)}
Be helpful, concise, and friendly.`;
      break;
    case "defensive":
      identityInstructions = `You are ${selfDisplayName}'s assistant. When they are unavailable, you act as a polite gatekeeper.
${aiIdentityNoPrefixPromptLine(identityPrefix)}
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
${aiIdentityNoPrefixPromptLine(identityPrefix)}
Be helpful, concise, and friendly.`;
          break;
        case "defensive":
          identityInstructions = `You are ${selfDisplayName}'s assistant. When they are unavailable, you act as a polite gatekeeper.
${aiIdentityNoPrefixPromptLine(identityPrefix)}
Be courteous and professional. If you cannot help, politely explain limitations.`;
          break;
      }
    }
    // Add template context if provided
    if (matchedRule.action.template) {
      ruleContext = `\n\nIMPORTANT: Use this response template for your reply:\n"${matchedRule.action.template.replace(/\{ownerName\}/g, senderDisplayName)}"`;
    }
  }

  // Knowledge base (vault RAG) — message-conditioned + optional rule path override
  let vaultContext = "";
  let externalContext = "";
  if (vaultIndex) {
    const ruleVaultQuery = matchedRule?.action?.vaultQuery;
    if (ruleVaultQuery) {
      console.log(
        `[chat-draft] querying vault: path=${ruleVaultQuery.path}, maxSensitivity=${ruleVaultQuery.maxSensitivity}`,
      );
    }
    // Assist path: honor per-contact knowledgeAccess for sensitivity filtering.
    // Keep knowledgeScope "public" (no owner/private vault roots) — Agent Mode uses OpenClaw.
    const vaultResults = ragService
      ? await ragService.searchVaultKnowledgeBase({
          vaultIndex,
          query: chatText,
          knowledgeAccess,
          knowledgeBase,
          knowledgeScope: "public",
          ruleVaultQuery,
        })
      : searchVaultKnowledgeBase({
          vaultIndex,
          query: chatText,
          knowledgeAccess,
          knowledgeBase,
          knowledgeScope: "public",
          ruleVaultQuery,
        });
    vaultContext = formatVaultKnowledgeSection(vaultResults);
    if (vaultResults.length > 0) {
      console.log(`[chat-draft] knowledge base returned ${vaultResults.length} snippet(s)`);
    }
  }

  if (ragService) {
    externalContext = await ragService.getExternalKnowledgeContext({
      query: chatText,
      knowledgeBase,
      knowledgeScope: "public",
    });
  }

  // Build status and permissions context
  const statusContext = `\n\nUser status: ${isOnline ? "ONLINE (draft mode — owner will review before sending)" : "OFFLINE (auto-reply mode)"}
Contact permissions:
- AI Access Level: ${contactAiAccessLevel}
- Knowledge Access: ${knowledgeAccess}`;

  const injectedContext = humanProfileStore
    ? await buildContextInjection(threadKey, chatLogStore, trustStore, humanProfileStore, {
        knowledgeBase,
        ragQuery: chatText,
        ragService,
      })
    : "";

  const agentIdentitySection = await loadAgentIdentitySection(agentIdentityStore);

  const prompt = `You are a helpful assistant in a secure P2P messaging app called EnvoyMesh.

${identityInstructions}${agentIdentitySection}
${ruleContext}
${statusContext}${injectedContext}
${vaultContext}
${externalContext}

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
  const modelResult = await routeModelRequestWithCostTracking(
    {
      taskType: "chat.draft",
      prompt,
      sensitivity: sensitivityCeiling,
      requesterPeerId: remotePeerId,
      ownerApproved: false,
    },
    providers,
    { taskStore },
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

  const draftText = applyAiIdentityToDraftText(
    modelResult.response?.text ?? "",
    aiIdentity,
    matchedRule,
  );

  // Generate and save the draft
  const draftId = randomUUID();
  const createdAt = new Date().toISOString();
  const draft = {
    draftId,
    threadPeerOwnerId: threadKey,
    inReplyToMessageId: envelope.messageId,
    text: draftText,
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
      text: draftText,
      inReplyToMessageId: envelope.messageId,
      createdAt,
    },
    auditWritten: true,
  };
}
