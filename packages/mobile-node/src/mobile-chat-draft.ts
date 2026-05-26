/**
 * Inbound chat draft generation for mobile — cloud APIs only (OpenAI / Anthropic compatible).
 */
import { buildModelProviders, routeModelRequest } from "@envoymesh/models";
import type {
  AiIdentity,
  AiRule,
  AiSettings,
  ChatDraft,
  ContactAiPreferences,
  ModelProviderConfig,
} from "@envoymesh/api";
import { applyAiIdentityToDraftText } from "@envoymesh/api";

export type MobileBondLevel = "blocked" | "public" | "referred" | "direct";

const LOCAL_ONLY_MODES = new Set<ModelProviderConfig["mode"]>(["ollama", "litellm"]);

export function isMobileCloudModelMode(mode: ModelProviderConfig["mode"]): boolean {
  return !LOCAL_ONLY_MODES.has(mode);
}

export function resolveMobileContactAiAccessLevel(
  senderOwnerId: string,
  contactPrefs: ContactAiPreferences[],
  aiSettings: AiSettings | undefined,
): "none" | "assistant_only" | "full" {
  const pref = contactPrefs.find((p) => p.peerOwnerId === senderOwnerId);
  if (pref) return pref.aiAccessLevel;
  const defaultMode = aiSettings?.defaultModeForNewContacts ?? "manual";
  if (defaultMode === "manual") return "none";
  if (defaultMode === "assistant") return "assistant_only";
  return "full";
}

function matchRule(
  rules: AiRule[],
  chatText: string,
  contactAiAccessLevel: "none" | "assistant_only" | "full",
): AiRule | undefined {
  const enabledRules = rules.filter((r) => r.enabled).sort((a, b) => a.priority - b.priority);
  return enabledRules.find((rule) => {
    const trigger = rule.trigger;
    if (trigger.keywords?.length) {
      const lowerText = chatText.toLowerCase();
      if (!trigger.keywords.some((kw) => lowerText.includes(kw.toLowerCase()))) return false;
    }
    if (trigger.messageContains) {
      try {
        if (!new RegExp(trigger.messageContains, "i").test(chatText)) return false;
      } catch {
        /* invalid regex */
      }
    }
    if (trigger.contactAiAccessLevel?.length) {
      if (!trigger.contactAiAccessLevel.includes(contactAiAccessLevel as "assistant_only" | "full")) {
        return false;
      }
    }
    if (trigger.isGreeting) {
      const lowerText = chatText.toLowerCase().trim();
      if (!/^(hi|hello|hey|howdy|hiya|greetings|good\s+(morning|afternoon|evening))[!.,?]*$/.test(lowerText)) {
        return false;
      }
    }
    if (trigger.isComplex) return false;
    return true;
  });
}

function identityInstructions(
  mode: AiIdentity["mode"],
  selfDisplayName: string,
  identityPrefix: string,
): string {
  switch (mode) {
    case "invisible":
      return `You are ${selfDisplayName}. Respond naturally as if you are them.
Keep your response style casual and in character with how they would normally write.
Do NOT mention that you are an AI.`;
    case "defensive":
      return `You are ${selfDisplayName}'s assistant. When they are unavailable, you act as a polite gatekeeper.
Prefix your responses with "${identityPrefix}".
Be courteous and professional. If you cannot help, politely explain limitations.`;
    default:
      return `You are ${selfDisplayName}'s AI assistant.
Your responses will be shown with the prefix "${identityPrefix}".
Be helpful, concise, and friendly.`;
  }
}

export async function generateMobileChatDraft(input: {
  senderOwnerId: string;
  senderDisplayName: string;
  chatText: string;
  messageId: string;
  remotePeerId: string;
  bondLevel: MobileBondLevel;
  modelProviders: ModelProviderConfig;
  chatAssistEnabled: boolean;
  aiSettings?: AiSettings;
  contactAiPreferences: ContactAiPreferences[];
  ownerDisplayName?: string;
  randomId?: () => string;
}): Promise<{ ok: true; draft: ChatDraft } | { ok: false; reason: string }> {
  const {
    senderOwnerId,
    senderDisplayName,
    chatText,
    messageId,
    remotePeerId,
    bondLevel,
    modelProviders,
    chatAssistEnabled,
    aiSettings,
    contactAiPreferences,
    ownerDisplayName,
    randomId = () => crypto.randomUUID(),
  } = input;

  if (!chatAssistEnabled) {
    return { ok: false, reason: "chat assist is disabled" };
  }
  if (modelProviders.mode === "disabled") {
    return { ok: false, reason: "model provider is disabled" };
  }
  if (LOCAL_ONLY_MODES.has(modelProviders.mode)) {
    return {
      ok: false,
      reason: "local model providers (Ollama/LiteLLM) are not supported on mobile — use OpenAI or Anthropic compatible APIs",
    };
  }

  const contactAiAccessLevel = resolveMobileContactAiAccessLevel(
    senderOwnerId,
    contactAiPreferences,
    aiSettings,
  );
  if (contactAiAccessLevel === "none") {
    return { ok: false, reason: "contact AI access level is none" };
  }
  if (bondLevel === "blocked") {
    return { ok: false, reason: "sender is blocked" };
  }

  const sensitivityCeiling =
    bondLevel === "direct" || bondLevel === "referred" ? "friends" : "public";

  const rules = aiSettings?.rules ?? [];
  const matchedRule = matchRule(rules, chatText, contactAiAccessLevel);

  const selfDisplayName = ownerDisplayName ?? "Owner";
  const identity = aiSettings?.identity;
  const identityMode = matchedRule?.action.aiIdentityOverride ?? identity?.mode ?? "transparent";
  const identityPrefix = identity?.transparentPrefix ?? "[AI Agent]";
  let identityBlock = identityInstructions(identityMode, selfDisplayName, identityPrefix);

  let ruleContext = "";
  if (matchedRule?.action.template) {
    ruleContext = `\n\nIMPORTANT: Use this response template for your reply:\n"${matchedRule.action.template.replace(/\{ownerName\}/g, senderDisplayName)}"`;
  }

  const prompt = `You are a helpful assistant in a secure P2P messaging app called EnvoyMesh.

${identityBlock}
${ruleContext}

Contact permissions:
- AI Access Level: ${contactAiAccessLevel}

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

  const providers = buildModelProviders(modelProviders, false, { trustedLocalAssist: true });
  if (providers.length === 0) {
    return { ok: false, reason: "no model providers available" };
  }

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

  if (modelResult.decision.action !== "allow") {
    const reason =
      "reason" in modelResult.decision
        ? modelResult.decision.reason
        : "no model provider approved";
    return { ok: false, reason: `model denied: ${reason}` };
  }

  const rawDraft = modelResult.response?.text?.trim() ?? "";
  if (!rawDraft) {
    return { ok: false, reason: "empty model response" };
  }

  const draftText = applyAiIdentityToDraftText(rawDraft, identity, matchedRule);

  const draft: ChatDraft = {
    draftId: randomId(),
    threadPeerOwnerId: senderOwnerId,
    inReplyToMessageId: messageId,
    text: draftText,
    createdAt: new Date().toISOString(),
  };

  return { ok: true, draft };
}
