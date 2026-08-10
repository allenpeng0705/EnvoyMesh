/**
 * Phase 51F — Family DM panel (owner desktop).
 * Thread key `family:<sortedA>:<sortedB>`; send via sendFamilyMessage.
 * Header matches ContactChatPanel: call / AI / clear.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  OWNER_FAMILY_PROFILE_ID,
  contactAiAccessLevelForAssistantMode,
  isFamilyThreadKey,
  parseFamilyThreadKey,
  threadVisibleTo,
  type ChatMessage,
  type ContactAiPreferences,
  type FamilyProfile,
} from "@envoymesh/api";
import { useT } from "../../context/I18nContext.js";
import { useNodeState } from "../../context/NodeStateContext.js";
import { useCallSessionContext } from "../../context/CallSessionContext.js";
import { useChatMessages, useNodeService } from "../../hooks/useNodeService.js";
import { useChatStickToBottom } from "../../hooks/useChatStickToBottom.js";
import { useToast } from "../../hooks/useToast.js";
import { ChatComposer } from "../ChatComposer.js";
import { ChatMessageBubble } from "../ChatMessageBubble.js";
import { ConfirmDialog } from "../ConfirmDialog.js";
import { BridgeIcon, ChatIcon, EditIcon, RemoveIcon } from "../../icons.js";
import { extractChatMessageText } from "../../lib/bridge-chat-message.js";
import { buildMessageStacks, stackPosition } from "../../lib/chat-message-stack.js";
import type { AssistantMode } from "../../lib/storage.js";

export interface FamilyChatPanelProps {
  threadKey: string;
}

function initial(name: string): string {
  return (name.trim().charAt(0) || "?").toUpperCase();
}

export function FamilyChatPanel({ threadKey }: FamilyChatPanelProps) {
  const t = useT();
  const nodeService = useNodeService();
  const { showToast } = useToast();
  const {
    nodeConfig,
    humanProfile,
    contactAiModes,
    setContactAiModes,
    refreshNodeConfig,
  } = useNodeState();
  const { startCall, callingState, activeCall } = useCallSessionContext();
  const myProfileId =
    nodeConfig?.callerFamilyProfileId?.trim() || OWNER_FAMILY_PROFILE_ID;
  const parsed = parseFamilyThreadKey(threadKey);
  const toProfileId = parsed
    ? parsed.profileIdA === myProfileId
      ? parsed.profileIdB
      : parsed.profileIdA
    : "";

  const peer: FamilyProfile | undefined = useMemo(() => {
    const list = nodeConfig?.familyProfiles ?? [];
    return list.find((p) => p.id === toProfileId);
  }, [nodeConfig?.familyProfiles, toProfileId]);

  const selfOwnerId = humanProfile?.ownerId?.trim() ?? "";
  const { messages, isOutgoing, clearThread } = useChatMessages(threadKey);
  const { containerRef, onScroll, pinToBottom } = useChatStickToBottom(
    threadKey,
    messages.length,
  );
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [pendingOutbound, setPendingOutbound] = useState<ChatMessage | null>(null);
  const [confirm, setConfirm] = useState<{
    title: string;
    message?: string;
    variant?: "default" | "destructive";
    confirmLabel?: string;
    onConfirm: () => void;
  } | null>(null);

  const defaultAiMode: AssistantMode =
    nodeConfig?.aiSettings?.defaultModeForNewContacts ?? "manual";
  const currentAiMode: AssistantMode = contactAiModes[threadKey] ?? defaultAiMode;
  const autoSendEnabled = (nodeConfig?.autonomousPolicies ?? []).some(
    (p) => p.domain === "social" && p.autoSendChat,
  );
  const canDraftAssist = (nodeConfig?.chatAssistEnabled ?? false) || autoSendEnabled;
  const canAutoSend = autoSendEnabled && !(nodeConfig?.autonomousKillSwitch ?? false);

  const updateFamilyAiMode = useCallback(
    async (mode: AssistantMode) => {
      setContactAiModes({ ...contactAiModes, [threadKey]: mode });
      const currentPrefs = nodeConfig?.contactAiPreferences ?? [];
      const existingPref = currentPrefs.find((p) => p.peerOwnerId === threadKey);
      const otherPrefs = currentPrefs.filter((p) => p.peerOwnerId !== threadKey);
      const aiAccessLevel = contactAiAccessLevelForAssistantMode(mode);
      const newPrefs: ContactAiPreferences[] = [
        ...otherPrefs,
        {
          peerOwnerId: threadKey,
          aiAccessLevel,
          knowledgeAccess: existingPref?.knowledgeAccess ?? "public",
          priority: existingPref?.priority ?? "high",
        },
      ];
      const configPatch: {
        contactAiPreferences: ContactAiPreferences[];
        chatAssistEnabled?: boolean;
      } = { contactAiPreferences: newPrefs };
      if ((mode === "assistant" || mode === "auto") && !nodeConfig?.chatAssistEnabled) {
        configPatch.chatAssistEnabled = true;
      }
      await nodeService.updateNodeConfig(configPatch);
      await refreshNodeConfig();
    },
    [contactAiModes, nodeConfig, nodeService, refreshNodeConfig, setContactAiModes, threadKey],
  );

  const displayMessages = useMemo(() => {
    const filtered = messages.filter((msg) => {
      return extractChatMessageText(msg).trim().length > 0;
    });
    if (!pendingOutbound) return filtered;
    const pendingText = extractChatMessageText(pendingOutbound).trim();
    const echoed = filtered.some(
      (m) => isOutgoing(m) && extractChatMessageText(m).trim() === pendingText,
    );
    if (echoed) return filtered;
    return [...filtered, pendingOutbound];
  }, [isOutgoing, messages, pendingOutbound]);

  useEffect(() => {
    if (!pendingOutbound) return;
    const pendingText = extractChatMessageText(pendingOutbound).trim();
    const echoed = messages.some(
      (m) => isOutgoing(m) && extractChatMessageText(m).trim() === pendingText,
    );
    if (echoed) setPendingOutbound(null);
  }, [isOutgoing, messages, pendingOutbound]);

  const stacks = useMemo(
    () =>
      buildMessageStacks(
        displayMessages,
        (msg) => isOutgoing(msg) || msg.messageId.startsWith("pending-"),
      ),
    [displayMessages, isOutgoing],
  );

  const handleClearChat = () => {
    if (displayMessages.length === 0) return;
    setConfirm({
      title: t("contactChat.clearConfirm"),
      message: t("contactChat.clearConfirmMessage"),
      variant: "destructive",
      confirmLabel: t("common.clear"),
      onConfirm: () => {
        setConfirm(null);
        void clearThread().then((deletedCount) => {
          setPendingOutbound(null);
          if (deletedCount > 0) {
            showToast(
              deletedCount === 1
                ? t("contactChat.clearedOne", { count: deletedCount })
                : t("contactChat.clearedMany", { count: deletedCount }),
              "success",
            );
          } else {
            showToast(t("contactChat.chatCleared"), "success");
          }
        });
      },
    });
  };

  const handleStartCall = useCallback(
    async (callType: "audio" | "video") => {
      // Family profiles are local-only (not mesh owner IDs). Mesh call.invite
      // cannot target them yet — same-home family calling is a follow-up.
      showToast(
        t(
          "chat.familyCallUnavailable",
          "Family voice/video calls are not available yet — family profiles are local to this home node.",
        ),
        "info",
      );
      void callType;
      void startCall;
    },
    [showToast, startCall, t],
  );

  const handleSend = useCallback(async () => {
    const text = draft.trim();
    if (!text || sending || !toProfileId) return;
    if (!nodeService.sendFamilyMessage) {
      setSendError(
        t("chat.familySendUnavailable", "Family chat is not available on this connection."),
      );
      return;
    }
    const optimistic: ChatMessage = {
      messageId: `pending-${Date.now()}`,
      sender: {
        nodeId: "",
        ownerId: selfOwnerId || myProfileId,
        displayName: "You",
        actorRole: "human",
      },
      recipient: {
        nodeId: "",
        ownerId: threadKey,
        displayName: peer?.name ?? toProfileId,
      },
      content: { text },
      metadata: {
        timestamp: new Date().toISOString(),
        deliveryReceipt: "pending",
        deliveryChannel: "chat",
      },
      signature: "",
    };
    setSending(true);
    setSendError(null);
    setDraft("");
    setPendingOutbound(optimistic);
    pinToBottom();
    try {
      await nodeService.sendFamilyMessage({ toProfileId, text });
    } catch (err) {
      setPendingOutbound(null);
      setDraft(text);
      setSendError(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
    }
  }, [
    draft,
    myProfileId,
    nodeService,
    peer?.name,
    pinToBottom,
    selfOwnerId,
    sending,
    t,
    threadKey,
    toProfileId,
  ]);

  if (
    !isFamilyThreadKey(threadKey) ||
    !toProfileId ||
    !threadVisibleTo(threadKey, myProfileId)
  ) {
    return (
      <div className="no-chat-selected">
        <h3>{t("chat.familyInvalidTitle", "Invalid family chat")}</h3>
        <p>
          {t(
            "chat.familyInvalidDesc",
            "This family thread is not available for your profile.",
          )}
        </p>
      </div>
    );
  }

  const title = peer?.name ?? toProfileId;
  const avatarColor = peer?.avatarColor ?? "#6366f1";
  const offline = peer?.active === false;
  const callBusy = Boolean(activeCall) || Boolean(callingState);

  return (
    <>
      <header className="chat-header has-assistant-switch">
        <div className="chat-header-main">
          <div className="chat-header-left">
            <span
              className="chat-header-avatar kind-human"
              style={{ background: avatarColor }}
              aria-hidden
            >
              {initial(title)}
            </span>
            <div className="chat-header-titles">
              <span className="chat-name">{title}</span>
              <span className="chat-header-kind kind-human">
                {offline
                  ? t("chat.familyOffline", "Inactive profile")
                  : t("chat.familySubtitle", "Family")}
              </span>
            </div>
          </div>
          <div className="chat-header-actions-row">
            <button
              type="button"
              className="chat-header-call-btn"
              title={t("call:start", "Voice call")}
              aria-label={t("call:startAria", { name: title })}
              disabled={callBusy || offline}
              onClick={() => void handleStartCall("audio")}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
            </button>
            <button
              type="button"
              className="chat-header-call-btn chat-header-call-btn--video"
              title={t("call:startVideo", "Video call")}
              aria-label={t("call:startVideoAria", { name: title })}
              disabled={callBusy || offline}
              onClick={() => void handleStartCall("video")}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" /></svg>
            </button>
            <button
              type="button"
              className="chat-header-clear-btn"
              title={t("contactChat.clearAllTitle")}
              aria-label={t("contactChat.clearAllAria")}
              disabled={displayMessages.length === 0}
              onClick={handleClearChat}
            >
              <RemoveIcon size={16} />
            </button>
          </div>
        </div>
        <div className="chat-header-secondary">
          <span className="chat-header-web-links-spacer" aria-hidden="true" />
          <div className="assistant-switch" aria-label={t("contactChat.aiModeLabel", { mode: currentAiMode })}>
            <span className="assistant-switch-label">AI</span>
            <button
              type="button"
              className={`assistant-switch-btn ${currentAiMode === "manual" ? "active" : ""}`}
              title={t("contactChat.manualTitle")}
              aria-label={t("contactChat.manualAria")}
              onClick={() => void updateFamilyAiMode("manual")}
            >
              <EditIcon size={16} />
            </button>
            <button
              type="button"
              className={`assistant-switch-btn ${currentAiMode === "assistant" ? "active" : ""} ${!canDraftAssist ? "disabled" : ""}`}
              title={canDraftAssist ? t("contactChat.assistantTitle") : t("contactChat.assistantDisabledTitle")}
              aria-label={t("contactChat.assistantAria")}
              onClick={() => {
                if (!canDraftAssist) return;
                void updateFamilyAiMode("assistant");
              }}
            >
              <ChatIcon size={16} />
            </button>
            <button
              type="button"
              className={`assistant-switch-btn ${currentAiMode === "auto" ? "active" : ""} ${!canAutoSend ? "disabled" : ""}`}
              title={canAutoSend ? t("contactChat.autoTitle") : t("contactChat.autoDisabledTitle")}
              aria-label={t("contactChat.autoAria")}
              onClick={() => {
                if (!canAutoSend) return;
                void updateFamilyAiMode("auto");
              }}
            >
              <BridgeIcon size={16} />
            </button>
          </div>
        </div>
      </header>

      <div className="messages" ref={containerRef} onScroll={onScroll}>
        {displayMessages.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <ChatIcon size={40} />
            </div>
            <p>{t("chat.noMessagesYet", "No messages yet")}</p>
          </div>
        ) : (
          stacks.map((stack) => {
            const outgoing =
              isOutgoing(stack[0]!) || stack[0]!.messageId.startsWith("pending-");
            return (
              <div
                key={stack[0]!.messageId}
                className={`message-stack-row ${outgoing ? "is-outgoing" : "is-incoming"}`}
              >
                <div className="message-stack">
                  {stack.map((msg: ChatMessage, idx: number) => {
                    const text = extractChatMessageText(msg);
                    const ts = msg.metadata?.timestamp;
                    const timeLabel = ts
                      ? new Date(ts).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : undefined;
                    return (
                      <ChatMessageBubble
                        key={msg.messageId}
                        variant={outgoing ? "outgoing" : "incoming-peer"}
                        position={stackPosition(idx, stack.length)}
                        actorBadge={outgoing ? undefined : title}
                        timeLabel={timeLabel}
                        copyText={text}
                        deliveryReceipt={msg.metadata?.deliveryReceipt}
                      >
                        {text}
                      </ChatMessageBubble>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="chat-composer">
        <div className="chat-composer-overlays">
          {sendError ? <div className="chat-send-error" role="alert">{sendError}</div> : null}
        </div>
        <footer className="chat-input">
          <ChatComposer
            value={draft}
            onChange={setDraft}
            onSend={() => {
              void handleSend();
            }}
            placeholder={t("chat.familyComposePlaceholder", "Message family…")}
            sendLabel={t("common.send", "Send")}
            disabled={sending || offline}
            sendDisabled={!draft.trim() || sending || offline}
          />
        </footer>
      </div>

      {confirm ? (
        <ConfirmDialog
          title={confirm.title}
          message={confirm.message}
          variant={confirm.variant}
          confirmLabel={confirm.confirmLabel}
          onConfirm={confirm.onConfirm}
          onCancel={() => setConfirm(null)}
        />
      ) : null}
    </>
  );
}
