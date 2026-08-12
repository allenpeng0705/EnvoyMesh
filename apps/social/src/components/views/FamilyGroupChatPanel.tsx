/**
 * Phase 51F follow-up — Family group room panel (owner desktop).
 * Thread key `room:<uuid>`; send via sendFamilyRoomMessage.
 * Header matches GroupChatPanel: AI switch + clear.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  OWNER_FAMILY_PROFILE_ID,
  contactAiAccessLevelForAssistantMode,
  isChatRoomThreadKey,
  parseChatRoomThreadKey,
  type ChatMessage,
  type ContactAiPreferences,
  type FamilyRoom,
} from "@envoymesh/api";
import { useT } from "../../context/I18nContext.js";
import { useNodeState } from "../../context/NodeStateContext.js";
import { useChatMessages, useNodeService } from "../../hooks/useNodeService.js";
import { useChatStickToBottom } from "../../hooks/useChatStickToBottom.js";
import { useToast } from "../../hooks/useToast.js";
import { ChatComposer } from "../ChatComposer.js";
import { ChatMessageBubble } from "../ChatMessageBubble.js";
import { ConfirmDialog } from "../ConfirmDialog.js";
import { ChatIcon, EditIcon, RemoveIcon } from "../../icons.js";
import { extractChatMessageText } from "../../lib/bridge-chat-message.js";
import { buildMessageStacks, stackPosition } from "../../lib/chat-message-stack.js";
import type { AssistantMode } from "../../lib/storage.js";

export interface FamilyGroupChatPanelProps {
  threadKey: string;
  room: FamilyRoom | undefined;
}

function initial(name: string): string {
  return (name.trim().charAt(0) || "?").toUpperCase();
}

export function FamilyGroupChatPanel({ threadKey, room }: FamilyGroupChatPanelProps) {
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
  const myProfileId =
    nodeConfig?.callerFamilyProfileId?.trim() || OWNER_FAMILY_PROFILE_ID;
  const roomId = parseChatRoomThreadKey(threadKey) ?? "";
  const title = room?.title?.trim() || t("chat.familyGroupFallback", "Family group");
  const memberCount = room?.memberProfileIds?.length ?? 0;

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

  const defaultGroupAiMode: AssistantMode =
    nodeConfig?.aiSettings?.defaultModeForNewContacts === "manual" ? "manual" : "assistant";
  const storedMode = contactAiModes[threadKey] ?? defaultGroupAiMode;
  const currentAiMode: AssistantMode = storedMode === "auto" ? "assistant" : storedMode;
  const canDraftAssist = nodeConfig?.chatAssistEnabled ?? false;

  const updateGroupAiMode = useCallback(
    async (mode: Extract<AssistantMode, "manual" | "assistant">) => {
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
          ...(existingPref?.syndicationMaxSensitivity
            ? { syndicationMaxSensitivity: existingPref.syndicationMaxSensitivity }
            : {}),
          ...(mode !== "manual" && existingPref?.agentModeEnabled
            ? { agentModeEnabled: true }
            : {}),
        },
      ];
      const configPatch: {
        contactAiPreferences: ContactAiPreferences[];
        chatAssistEnabled?: boolean;
      } = { contactAiPreferences: newPrefs };
      if (mode === "assistant" && !nodeConfig?.chatAssistEnabled) {
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

  const handleSend = useCallback(async () => {
    const text = draft.trim();
    if (!text || sending || !roomId) return;
    if (!nodeService.sendFamilyRoomMessage) {
      setSendError(
        t("chat.familyGroupSendUnavailable", "Family groups are not available on this connection."),
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
        displayName: title,
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
      await nodeService.sendFamilyRoomMessage({ roomId, text });
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
    pinToBottom,
    roomId,
    selfOwnerId,
    sending,
    t,
    threadKey,
    title,
  ]);

  if (!isChatRoomThreadKey(threadKey) || !roomId) {
    return (
      <div className="no-chat-selected">
        <h3>{t("chat.familyGroupInvalidTitle", "Invalid family group")}</h3>
        <p>{t("chat.familyGroupInvalidDesc", "This family group thread key is not valid.")}</p>
      </div>
    );
  }

  const inactive = room?.active === false;

  return (
    <>
      <header className="chat-header has-assistant-switch">
        <div className="chat-header-main">
          <div className="chat-header-left">
            <span className="chat-header-avatar kind-group" style={{ background: "#0d9488" }} aria-hidden>
              {initial(title)}
            </span>
            <div className="chat-header-titles">
              <span className="chat-name">{title}</span>
              <span className="chat-header-kind kind-group">
                {inactive
                  ? t("chat.familyGroupInactive", "Inactive group")
                  : t("chat.familyGroupSubtitle", "{{count}} members · Family", {
                      count: memberCount,
                    })}
              </span>
            </div>
          </div>
          <div className="chat-header-actions-row">
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
              onClick={() => void updateGroupAiMode("manual")}
            >
              <EditIcon size={16} />
            </button>
            <button
              type="button"
              className={`assistant-switch-btn ${currentAiMode === "assistant" ? "active" : ""} ${!canDraftAssist ? "disabled" : ""}`}
              title={canDraftAssist ? t("groupChat.assistantTitle") : t("contactChat.assistantDisabledTitle")}
              aria-label={t("contactChat.assistantAria")}
              onClick={() => {
                if (!canDraftAssist) return;
                void updateGroupAiMode("assistant");
              }}
            >
              <ChatIcon size={16} />
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
            const peerLabel = stack[0]?.sender.displayName?.trim() || "Family";
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
                        actorBadge={outgoing ? undefined : peerLabel}
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
            placeholder={t("chat.familyGroupComposePlaceholder", "Message family group…")}
            sendLabel={t("common.send", "Send")}
            disabled={sending || inactive}
            sendDisabled={!draft.trim() || sending || inactive}
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
