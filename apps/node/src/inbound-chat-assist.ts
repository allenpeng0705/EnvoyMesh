import type { ModelProviderConfig, SendChatResult } from "@envoymesh/api";
import { resolveContactAiAccessLevel, applyAiIdentityForIdentity, stripModelThinking, capGroupChatAiAccessLevel } from "@envoymesh/api";
import type { EnvoyEnvelope } from "@envoymesh/protocol";
import {
  createAuditEvent,
  type ChatDraftStore,
  type HumanProfileStore,
  type AgentIdentityStore,
  type LocalChatLogStore,
  type LocalPeerDirectoryStore,
  type LocalTaskStore,
  type LocalTrustStore,
  type NodeProfile,
} from "@envoymesh/local-store";
import { createApprovalItem, shouldSkipAgentChatAssist, type ApprovalQueue } from "@envoymesh/api";
import { buildVaultIndex } from "@envoymesh/vault";
import { auditAutonomousDecision, evaluateAutonomousPolicy } from "./autonomous-inbound.js";
import {
  applyAutoReplyLimitDenied,
  checkAutoReplyAllowed,
  recordAutoReplyAfterSend,
} from "./auto-reply-gate.js";
import { generateChatDraft } from "./chat-draft-inbound.js";
import type { PersistedNodeConfig } from "./node-config-store.js";
import type { StyleAdapter } from "./style-adapter.js";

import type { RagService } from "./rag-service.js";
import type { AutoReplyLimitStore } from "@envoymesh/local-store";
import type { AutoReplyPausedNotification } from "@envoymesh/api";

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
  approvalQueue?: Pick<ApprovalQueue, "add"> | null;
  autoReplyLimitStore?: AutoReplyLimitStore | null;
  onAutoReplyPaused?: (notification: AutoReplyPausedNotification) => void;
  /** Group chat: prefs + drafts keyed by room thread; never auto-send when true. */
  draftThreadKey?: string;
  disableAutoSend?: boolean;
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
    approvalQueue = null,
    autoReplyLimitStore = null,
    onAutoReplyPaused,
    draftThreadKey,
    disableAutoSend = false,
  } = input;

  const accessThreadKey = draftThreadKey ?? senderOwnerId;
  const draftThread = draftThreadKey ?? senderOwnerId;

  const contactPrefs = config.contactAiPreferences ?? [];
  let aiAccessLevel = resolveContactAiAccessLevel(
    accessThreadKey,
    contactPrefs,
    config.aiSettings?.defaultModeForNewContacts,
  );
  if (disableAutoSend) {
    aiAccessLevel = capGroupChatAiAccessLevel(aiAccessLevel);
  }
  const autoSendEnabled =
    !disableAutoSend && (config.autonomousPolicies ?? []).some(
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

  if (
    shouldSkipAgentChatAssist({
      senderRole: envelope.senderRole ?? "human",
      agentInteractionMode: config.agentInteractionMode,
      agentVerified: envelope.senderRole === "agent" ? Boolean(envelope.agentCredential) : undefined,
    })
  ) {
    console.log(`[chat-assist] skipped for verified peer agent (structured_preferred)`);
    return;
  }

  const senderTrust = await trustStore.getTrustRecord(senderOwnerId);
  const senderDisplayName = senderTrust?.displayName ?? senderOwnerId;
  const selfHuman = await humanProfileStore.loadHumanProfile().catch(() => null);
  const contactPref = contactPrefs.find((p) => p.peerOwnerId === accessThreadKey);

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
    threadKey: draftThread,
  });

  if (!result.ok) {
    console.log(`[chat-assist] draft skipped for ${senderOwnerId}: ${result.reason}`);
    return;
  }

  const adapted = styleAdapter
    ? styleAdapter.adapt(stripModelThinking(result.draft.text), senderOwnerId, false, "statement")
    : { adaptedText: stripModelThinking(result.draft.text) };
  const draftText = applyAiIdentityForIdentity(
    stripModelThinking(adapted.adaptedText),
    config.aiSettings?.identity,
  );

  emitDraft(draftThread, { ...result.draft, text: draftText });

  if (disableAutoSend) {
    return;
  }

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
    const limits = config.aiSettings?.autoReplyLimits;
    let limitAllowed = true;
    if (autoReplyLimitStore) {
      const limitDecision = await checkAutoReplyAllowed({
        store: autoReplyLimitStore,
        contactOwnerId: senderOwnerId,
        limits,
        inboundSenderRole: envelope.senderRole ?? "human",
        nowMs: receivedAt,
      });
      if (!limitDecision.allowed) {
        limitAllowed = false;
        const notification = await applyAutoReplyLimitDenied({
          store: autoReplyLimitStore,
          contactOwnerId: senderOwnerId,
          contactDisplayName: senderDisplayName,
          limits,
          decision: limitDecision,
          nowMs: receivedAt,
        });
        if (notification) {
          onAutoReplyPaused?.(notification);
        }
        await taskStore.appendAuditEvent(
          createAuditEvent({
            type: "autonomous.decided",
            intent: "chat.message",
            messageId: envelope.messageId,
            correlationId,
            remotePeerId,
            direction: "inbound",
            verificationStatus: "verified",
            latencyMs: Date.now() - receivedAt,
            outcome: "deny",
            summary: `auto-send denied: auto_reply_${limitDecision.reason} contact=${senderOwnerId}`,
            createdAt: envelope.createdAt,
          }),
        );
      }
    }

    if (limitAllowed) {
      console.log(`[chat-assist] auto-sending AI response to ${senderOwnerId}`);
      try {
        await sendChat(senderOwnerId, draftText);
        if (autoReplyLimitStore) {
          await recordAutoReplyAfterSend({
            store: autoReplyLimitStore,
            contactOwnerId: senderOwnerId,
            limits,
            inboundSenderRole: envelope.senderRole ?? "human",
            nowMs: receivedAt,
          });
        }
        console.log(`[chat-assist] auto-send success`);
      } catch (err) {
        console.warn(`[chat-assist] auto-send failed:`, err);
      }
    }
  } else if (draftText && approvalQueue) {
    const item = createApprovalItem(
      "send_chat",
      `Reply to ${senderDisplayName}`,
      `AI-drafted reply: "${draftText.slice(0, 80)}${draftText.length > 80 ? "..." : ""}"`,
      draftText,
      {
        contactOwnerId: senderOwnerId,
        contactDisplayName: senderDisplayName,
      },
      bondLevel === "direct" ? "normal" : "low",
    );
    approvalQueue.add(item);
    const denyReason = autoSendPolicy.allowed ? "policy" : autoSendPolicy.reason;
    console.log(`[approval] queued draft ${item.id} for owner review (auto-send denied: ${denyReason})`);
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
        outcome: "record",
        summary: `approval queued: ${item.id} action=send_chat contact=${senderOwnerId}`,
        createdAt: new Date().toISOString(),
      }),
    );
  }
}
