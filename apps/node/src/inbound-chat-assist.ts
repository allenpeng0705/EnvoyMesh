import type { ModelProviderConfig, SendChatResult } from "@envoymesh/api";
import {
  resolveInboundContactAiAccess,
  resolveInboundContactAgentMode,
  applyAiIdentityForIdentity,
  stripModelThinking,
  capGroupChatAiAccessLevel,
  ensureDefaultAutonomousPoliciesForModel,
} from "@envoymesh/api";
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
import { getCachedVaultIndex } from "./vault-index-cache.js";
import { auditAutonomousDecision, evaluateAutonomousPolicy } from "./autonomous-inbound.js";
import {
  applyAutoReplyLimitDenied,
  checkAutoReplyAllowed,
  recordAutoReplyAfterSend,
} from "./auto-reply-gate.js";
import { generateChatDraft } from "./chat-draft-inbound.js";
import { generateAgentModeChatDraft } from "./chat-draft-agent-mode.js";
import type { PersistedNodeConfig } from "./node-config-store.js";
import type { StyleAdapter } from "./style-adapter.js";

import type { RagService } from "./rag-service.js";
import type { AutoReplyLimitStore } from "@envoymesh/local-store";
import type { AutoReplyPausedNotification } from "@envoymesh/api";
import type { ModeController } from "./mode-controller.js";

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
  taskStore: Pick<LocalTaskStore, "appendAuditEvent" | "recordModelCallCost">;
  trustStore: LocalTrustStore;
  peerDirectoryStore: LocalPeerDirectoryStore;
  draftStore: ChatDraftStore;
  chatLogStore: LocalChatLogStore | null;
  humanProfileStore: HumanProfileStore;
  agentIdentityStore?: AgentIdentityStore | null;
  vaultDir: string;
  /** Profile dir for Published-toggle sensitivity overrides (57B). */
  profileDir?: string;
  styleAdapter: StyleAdapter | null;
  sendChat: (targetOwnerId: string, text: string) => Promise<SendChatResult>;
  emitDraft: (threadPeerOwnerId: string, draft: { draftId: string; text: string; inReplyToMessageId: string; createdAt: string }) => void;
  isOwnerOnline?: () => boolean | Promise<boolean>;
  ragService?: RagService | null;
  approvalQueue?: Pick<ApprovalQueue, "add"> | null;
  autoReplyLimitStore?: AutoReplyLimitStore | null;
  onAutoReplyPaused?: (notification: AutoReplyPausedNotification) => void;
  modeController?: ModeController | null;
  /** Group chat: prefs + drafts keyed by room thread; never auto-send when true. */
  draftThreadKey?: string;
  disableAutoSend?: boolean;
  /** OpenClaw hooks for Agent Mode (owner-scoped draft). Optional — missing → Assist. */
  askOpenClaw?: (prompt: string, context?: unknown) => Promise<string>;
  buildOpenClawTurnContext?: () => Promise<unknown>;
  ensureOpenClawReady?: () => boolean | Promise<boolean>;
}): Promise<void> {
  const {
    envelope,
    senderOwnerId,
    chatText,
    remotePeerId,
    receivedAt,
    correlationId,
    config: rawConfig,
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
    profileDir,
    styleAdapter,
    sendChat,
    emitDraft,
    isOwnerOnline = () => true,
    ragService = null,
    approvalQueue = null,
    autoReplyLimitStore = null,
    onAutoReplyPaused,
    modeController = null,
    draftThreadKey,
    disableAutoSend = false,
    askOpenClaw,
    buildOpenClawTurnContext,
    ensureOpenClawReady,
  } = input;

  const config: PersistedNodeConfig = {
    ...rawConfig,
    autonomousPolicies: ensureDefaultAutonomousPoliciesForModel(
      rawConfig.autonomousPolicies,
      rawConfig.modelProviders?.mode,
    ),
  };

  const accessThreadKey = draftThreadKey ?? senderOwnerId;
  const draftThread = draftThreadKey ?? senderOwnerId;

  const contactPrefs = config.contactAiPreferences ?? [];
  const autoSendEnabled =
    !disableAutoSend && (config.autonomousPolicies ?? []).some(
    (p) => p.domain === "social" && p.autoSendChat,
  );
  const senderTrust = await trustStore.getTrustRecord(senderOwnerId);
  const bondLevel = senderTrust?.level ?? "public";
  let aiAccessLevel = resolveInboundContactAiAccess({
    contactOwnerId: accessThreadKey,
    contactAiPreferences: contactPrefs,
    defaultModeForNewContacts: config.aiSettings?.defaultModeForNewContacts,
    globalAutoSendEnabled: autoSendEnabled,
  });
  if (disableAutoSend) {
    aiAccessLevel = capGroupChatAiAccessLevel(aiAccessLevel);
  }
  const allowWhileOwnerOnline =
    config.aiSettings?.status?.onlineAssistantEnabled === true ||
    (autoSendEnabled && aiAccessLevel === "full" && !(config.autonomousKillSwitch ?? false));
  const effectiveChatAssist =
    config.chatAssistEnabled ||
    aiAccessLevel === "assistant_only" ||
    (autoSendEnabled && aiAccessLevel === "full");

  if (!effectiveChatAssist || (aiAccessLevel !== "assistant_only" && aiAccessLevel !== "full")) {
    console.log(
      `[chat-assist] skipped for ${senderOwnerId}: effectiveChatAssist=${effectiveChatAssist} aiAccessLevel=${aiAccessLevel} autoSend=${autoSendEnabled}`,
    );
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

  const senderDisplayName = senderTrust?.displayName ?? senderOwnerId;
  const selfHuman = await humanProfileStore.loadHumanProfile().catch(() => null);
  const contactPref = contactPrefs.find((p) => p.peerOwnerId === accessThreadKey);

  const agentModeEnabled = resolveInboundContactAgentMode({
    preference: contactPref,
    forceOff: disableAutoSend,
  });

  let result:
    | Awaited<ReturnType<typeof generateChatDraft>>
    | Awaited<ReturnType<typeof generateAgentModeChatDraft>>;

  if (agentModeEnabled && askOpenClaw) {
    console.log(`[chat-assist] Agent Mode for ${senderOwnerId} — OpenClaw contact-scoped draft`);
    result = await generateAgentModeChatDraft({
      envelope,
      senderOwnerId,
      senderDisplayName,
      chatText,
      remotePeerId,
      receivedAt,
      correlationId,
      threadKey: draftThread,
      taskStore,
      draftStore,
      askOpenClaw,
      buildOpenClawTurnContext,
      ensureOpenClawReady,
      knowledgeAccess: contactPref?.knowledgeAccess ?? "public",
    });
    if (!result.ok) {
      // Fail closed to Assist (public KB only) — do not escalate private via Assist.
      console.warn(
        `[chat-assist] Agent Mode unavailable for ${senderOwnerId} (${result.reason}); falling back to Assist`,
      );
    }
  } else {
    if (agentModeEnabled && !askOpenClaw) {
      console.warn(
        `[chat-assist] Agent Mode on for ${senderOwnerId} but OpenClaw hook missing; using Assist`,
      );
    }
    result = { ok: false, reason: "use-assist" };
  }

  if (!result.ok) {
    const vaultIndex = await getCachedVaultIndex(vaultDir);
    result = await generateChatDraft({
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
      isOnline: await Promise.resolve(isOwnerOnline()),
      ownerDisplayName: selfHuman?.displayName,
      chatLogStore,
      humanProfileStore,
      agentIdentityStore,
      modeController: modeController ?? undefined,
      allowWhileOwnerOnline,
      knowledgeBase: config.aiSettings?.knowledgeBase,
      ragService,
      threadKey: draftThread,
      profileDir,
    });
  }

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
