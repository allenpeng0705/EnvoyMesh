import type { ModelProviderConfig, SendChatResult } from "@envoymesh/api";
import { resolveContactAiAccessLevel } from "@envoymesh/api";
import type { EnvoyEnvelope } from "@envoymesh/protocol";
import {
  type ChatDraftStore,
  type HumanProfileStore,
  type AgentIdentityStore,
  type LocalChatLogStore,
  type LocalPeerDirectoryStore,
  type LocalTaskStore,
  type LocalTrustStore,
  type NodeProfile,
} from "@envoymesh/local-store";
import { buildVaultIndex } from "@envoymesh/vault";
import { auditAutonomousDecision, evaluateAutonomousPolicy } from "./autonomous-inbound.js";
import { generateChatDraft } from "./chat-draft-inbound.js";
import type { PersistedNodeConfig } from "./node-config-store.js";
import type { StyleAdapter } from "./style-adapter.js";

import type { RagService } from "./rag-service.js";

export async function runInboundChatAssist(input: {
  envelope: EnvoyEnvelope;
  senderOwnerId: string;
  chatText: string;
  remotePeerId: string;
  receivedAt: number;
  correlationId: string | undefined;
  config: PersistedNodeConfig;
  modelProviders: ModelProviderConfig;
  profile: NodeProfile;
  taskStore: Pick<LocalTaskStore, "appendAuditEvent">;
  trustStore: LocalTrustStore;
  peerDirectoryStore: LocalPeerDirectoryStore;
  draftStore: ChatDraftStore;
  chatLogStore: LocalChatLogStore | null;
  humanProfileStore: HumanProfileStore;
  agentIdentityStore?: AgentIdentityStore | null;
  vaultDir: string;
  styleAdapter: StyleAdapter | null;
  sendChat: (targetOwnerId: string, text: string) => Promise<SendChatResult>;
  emitDraft: (threadPeerOwnerId: string, draft: { draftId: string; text: string; inReplyToMessageId: string; createdAt: string }) => void;
  isOwnerOnline?: () => boolean;
  ragService?: RagService | null;
}): Promise<void> {
  const {
    envelope,
    senderOwnerId,
    chatText,
    remotePeerId,
    receivedAt,
    correlationId,
    config,
    modelProviders,
    profile,
    taskStore,
    trustStore,
    peerDirectoryStore,
    draftStore,
    chatLogStore,
    humanProfileStore,
    agentIdentityStore = null,
    vaultDir,
    styleAdapter,
    sendChat,
    emitDraft,
    isOwnerOnline = () => true,
    ragService = null,
  } = input;

  const contactPrefs = config.contactAiPreferences ?? [];
  const aiAccessLevel = resolveContactAiAccessLevel(
    senderOwnerId,
    contactPrefs,
    config.aiSettings?.defaultModeForNewContacts,
  );
  const autoSendEnabled = (config.autonomousPolicies ?? []).some(
    (p) => p.domain === "social" && p.autoSendChat,
  );
  const allowWhileOwnerOnline =
    config.aiSettings?.status?.onlineAssistantEnabled === true ||
    (autoSendEnabled && aiAccessLevel === "full" && !(config.autonomousKillSwitch ?? false));
  const effectiveChatAssist =
    config.chatAssistEnabled ||
    aiAccessLevel === "assistant_only" ||
    (autoSendEnabled && aiAccessLevel === "full");

  if (!effectiveChatAssist || (aiAccessLevel !== "assistant_only" && aiAccessLevel !== "full")) {
    return;
  }

  const senderTrust = await trustStore.getTrustRecord(senderOwnerId);
  const senderDisplayName = senderTrust?.displayName ?? senderOwnerId;
  const selfHuman = await humanProfileStore.loadHumanProfile().catch(() => null);
  const contactPref = contactPrefs.find((p) => p.peerOwnerId === senderOwnerId);

  let vaultIndex = null;
  try {
    vaultIndex = await buildVaultIndex({ rootDir: vaultDir });
  } catch {
    vaultIndex = null;
  }

  const result = await generateChatDraft({
    envelope,
    senderOwnerId,
    senderDisplayName,
    chatText,
    remotePeerId,
    receivedAt,
    correlationId,
    taskStore,
    trustStore,
    peerDirectoryStore,
    profile,
    draftStore,
    modelProviders,
    chatAssistEnabled: effectiveChatAssist,
    aiIdentity: config.aiSettings?.identity,
    contactAiAccessLevel: aiAccessLevel,
    knowledgeAccess: contactPref?.knowledgeAccess ?? "public",
    rules: config.aiSettings?.rules ?? [],
    vaultIndex,
    isOnline: isOwnerOnline(),
    ownerDisplayName: selfHuman?.displayName,
    chatLogStore,
    humanProfileStore,
    agentIdentityStore,
    allowWhileOwnerOnline,
    knowledgeBase: config.aiSettings?.knowledgeBase,
    ragService,
  });

  if (!result.ok) {
    console.log(`[chat-assist] draft skipped for ${senderOwnerId}: ${result.reason}`);
    return;
  }

  const adapted = styleAdapter
    ? styleAdapter.adapt(result.draft.text, senderOwnerId, false, "statement")
    : { adaptedText: result.draft.text };
  const draftText = adapted.adaptedText;

  emitDraft(senderOwnerId, { ...result.draft, text: draftText });

  const bondLevel = senderTrust?.level ?? "public";
  const requestedSensitivity = bondLevel === "direct" || bondLevel === "referred" ? "friends" : "public";
  const autoSendPolicy = evaluateAutonomousPolicy({
    autonomousKillSwitch: config.autonomousKillSwitch ?? false,
    autonomousPolicies: config.autonomousPolicies ?? [],
    domain: "social",
    action: "auto_send_chat",
    requestedSensitivity,
  });

  await auditAutonomousDecision({
    taskStore,
    intent: "chat.message",
    messageId: envelope.messageId,
    correlationId,
    remotePeerId,
    receivedAt,
    domain: "social",
    action: "auto_send_chat",
    allowed: autoSendPolicy.allowed,
    reason: autoSendPolicy.allowed ? undefined : autoSendPolicy.reason,
    createdAt: envelope.createdAt,
  });

  if (autoSendPolicy.allowed && aiAccessLevel === "full") {
    console.log(`[chat-assist] auto-sending AI response to ${senderOwnerId}`);
    try {
      await sendChat(senderOwnerId, draftText);
      console.log(`[chat-assist] auto-send success`);
    } catch (err) {
      console.warn(`[chat-assist] auto-send failed:`, err);
    }
  }
}
