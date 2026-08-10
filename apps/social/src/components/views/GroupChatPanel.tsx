import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useT } from "../../context/I18nContext.js";
import type { TFunction } from "../../context/I18nContext.js";
import { useNodeState } from "../../context/NodeStateContext.js";
import { useNodeService, useChatMessages } from "../../hooks/useNodeService.js";
import { useChatDrafts } from "../../hooks/useChatDrafts.js";
import { useChatStickToBottom } from "../../hooks/useChatStickToBottom.js";
import type { ChatMessage, ChatRoom, ContactAiPreferences } from "@envoymesh/api";
import {
  chatMessageTextForDisplay,
  contactAiAccessLevelForAssistantMode,
  MAX_CHAT_ATTACHMENT_BYTES,
  normalizeEnvoyDisclosureSettings,
  parseChatRoomThreadKey,
  stripModelThinking,
} from "@envoymesh/api";
import {
  mergeGroupDeliveryAck,
  hasPartialGroupDelivery,
  groupDeliveryRecipientCount,
  isGroupDeliveryComplete,
} from "@envoymesh/api/group-chat-delivery";
import { buildMessageStacks, stackPosition } from "../../lib/chat-message-stack.js";
import { peerDisplayLabel } from "../../lib/display.js";
import { resolveChatBubblePresentation } from "@envoymesh/api";
import { ChatMessageBubble } from "../ChatMessageBubble.js";
import { ChatMessageText } from "../ChatMessageText.js";
import { ChatFileAttachment } from "../ChatFileAttachment.js";
import { ChatAudioAttachment } from "../ChatAudioAttachment.js";
import { VoiceNoteRecorderBar } from "../VoiceNoteRecorderBar.js";
import { useVoiceNoteRecorder } from "../../hooks/useVoiceNoteRecorder.js";
import { ChatIcon, EditIcon, AttachIcon, RemoveIcon } from "../../icons.js";
import { ChatComposer } from "../ChatComposer.js";
import { ConfirmDialog } from "../ConfirmDialog.js";
import { useToast } from "../../hooks/useToast.js";
import { PeerProfileAvatar } from "../PeerProfileAvatar.js";
import type { AssistantMode } from "../../lib/storage.js";
import { InviteMembersModal } from "./InviteMembersModal.js";
import { GroupManageModal } from "./GroupManageModal.js";

interface GroupChatPanelProps {
  threadKey: string;
  room: ChatRoom | undefined;
  onLeaveGroup?: () => void;
}

function fmtDateLabel(dateStr: string, t: TFunction): string {
  const d = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const msgDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());

  if (msgDate.getTime() === today.getTime()) return t("contactChat.dateToday");
  if (msgDate.getTime() === yesterday.getTime()) return t("contactChat.dateYesterday");
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function groupMessagesByDate(msgs: ChatMessage[]): [string, ChatMessage[]][] {
  const groups = new Map<string, ChatMessage[]>();
  for (const msg of msgs) {
    const key = new Date(msg.metadata.timestamp).toLocaleDateString();
    const arr = groups.get(key);
    if (arr) arr.push(msg);
    else groups.set(key, [msg]);
  }
  return [...groups.entries()];
}

function isPendingOutgoing(msg: ChatMessage): boolean {
  return msg.messageId.startsWith("pending-") || msg.metadata.deliveryReceipt === "pending";
}

function sameMessageStackGroup(a: ChatMessage, b: ChatMessage, isOutgoingMsg: (m: ChatMessage) => boolean): boolean {
  const outA = isOutgoingMsg(a);
  const outB = isOutgoingMsg(b);
  if (outA !== outB) return false;
  if (outA) return true;
  return (a.sender.ownerId || "") === (b.sender.ownerId || "");
}

export function GroupChatPanel({
  threadKey,
  room,
  onLeaveGroup,
}: GroupChatPanelProps) {
  const t = useT();
  const nodeService = useNodeService();
  const { showToast } = useToast();
  const { humanProfile, nodeConfig, contactAiModes, setContactAiModes, refreshNodeConfig, connectionStatus } =
    useNodeState();
  const { messages, isOutgoing, clearThread } = useChatMessages(threadKey);
  const [chatInput, setChatInput] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  const [pendingOutbound, setPendingOutbound] = useState<ChatMessage[]>([]);
  const [showInvite, setShowInvite] = useState(false);
  const [showManage, setShowManage] = useState(false);
  const [leaveBusy, setLeaveBusy] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string;
    message?: ReactNode;
    variant?: "default" | "destructive";
    confirmLabel?: string;
    onConfirm: () => void;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const lastSendRef = useRef<{ at: number; text: string } | null>(null);
  const [attachBusy, setAttachBusy] = useState(false);

  // Voice notes — mirrors the ContactChatPanel flow but targets the group room
  // via `sendChatRoomAttachment` instead of `sendChatAttachment`.
  const voiceRecorder = useVoiceNoteRecorder({
    onError: (code) => {
      setSendError(t(`audioMessage.${code}`));
    },
  });

  const roomId = parseChatRoomThreadKey(threadKey);
  const isCreator = !!room && humanProfile?.ownerId === room.creatorOwnerId;
  const roomTitle = room?.title ?? t("groupChat.untitled");
  const headerInitial = roomTitle.trim().charAt(0).toUpperCase() || "G";
  const memberCount = room?.memberOwnerIds.length ?? 0;
  const nodeMeshOnline = connectionStatus?.online === true;

  const defaultGroupAiMode: AssistantMode =
    nodeConfig?.aiSettings?.defaultModeForNewContacts === "manual" ? "manual" : "assistant";
  const storedMode = contactAiModes[threadKey] ?? defaultGroupAiMode;
  const currentAiMode: AssistantMode = storedMode === "auto" ? "assistant" : storedMode;
  const canDraftAssist = nodeConfig?.chatAssistEnabled ?? false;
  const aiIdentity = nodeConfig?.aiSettings?.identity;
  const disclosure = normalizeEnvoyDisclosureSettings(nodeConfig?.aiSettings?.disclosure);
  const showDraftSuggestions = canDraftAssist && currentAiMode === "assistant";
  const { latestDraft, dismissDraft } = useChatDrafts(threadKey, showDraftSuggestions);

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
        },
      ];
      const configPatch: { contactAiPreferences: ContactAiPreferences[]; chatAssistEnabled?: boolean } = {
        contactAiPreferences: newPrefs,
      };
      if (mode === "assistant" && !nodeConfig?.chatAssistEnabled) {
        configPatch.chatAssistEnabled = true;
      }
      await nodeService.updateNodeConfig(configPatch);
      await refreshNodeConfig();
    },
    [contactAiModes, nodeConfig, nodeService, refreshNodeConfig, setContactAiModes, threadKey],
  );

  const handleUseDraft = () => {
    if (!latestDraft) return;
    setChatInput(chatMessageTextForDisplay(stripModelThinking(latestDraft.text), aiIdentity));
    void dismissDraft(latestDraft.draftId);
  };

  const displayMessages = useMemo(() => {
    const merged = [...messages, ...pendingOutbound];
    const seen = new Set<string>();
    const out: ChatMessage[] = [];
    for (const m of merged) {
      if (seen.has(m.messageId)) continue;
      seen.add(m.messageId);
      out.push(m);
    }
    out.sort(
      (a, b) =>
        new Date(a.metadata.timestamp).getTime() - new Date(b.metadata.timestamp).getTime(),
    );
    return out;
  }, [messages, pendingOutbound]);

  const isOutgoingMsg = useCallback(
    (msg: ChatMessage) => isPendingOutgoing(msg) || isOutgoing(msg),
    [isOutgoing],
  );

  const messageGroups = useMemo(() => groupMessagesByDate(displayMessages), [displayMessages]);

  const scrollRevision = useMemo(() => {
    const last = displayMessages[displayMessages.length - 1];
    return `${displayMessages.length}:${last?.messageId ?? ""}:${last?.content.text?.length ?? 0}`;
  }, [displayMessages]);
  const { containerRef: messagesRef, onScroll: onMessagesScroll, pinToBottom } =
    useChatStickToBottom(threadKey, scrollRevision);

  useEffect(() => {
    setPendingOutbound((prev) =>
      prev.filter((p) => {
        if (p.metadata.deliveryReceipt === "pending" || p.metadata.deliveryReceipt === "failed") {
          return true;
        }
        return !messages.some((m) => m.messageId === p.messageId);
      }),
    );
  }, [messages]);

  useEffect(() => {
    const unsub = nodeService.on("chat:delivered", (data) => {
      const { messageId, recipientOwnerId } = data as {
        messageId: string;
        recipientOwnerId?: string;
      };
      if (!messageId) return;

      const applyDelivery = (msg: ChatMessage): ChatMessage => {
        if (msg.messageId !== messageId) return msg;
        if (!recipientOwnerId) {
          return {
            ...msg,
            metadata: { ...msg.metadata, deliveryReceipt: "delivered" as const },
          };
        }
        return {
          ...msg,
          metadata: mergeGroupDeliveryAck(msg.metadata, recipientOwnerId),
        };
      };

      setPendingOutbound((prev) => prev.map(applyDelivery));
    });
    return unsub;
  }, [nodeService]);

  const fileToBase64 = async (file: File): Promise<string> => {
    const buf = await file.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
    return btoa(binary);
  };

  const handleAttachFile = async (file: File) => {
    if (!roomId) return;
    if (!nodeMeshOnline) {
      setSendError(t("contactChat.nodeOffline"));
      setTimeout(() => setSendError(null), 5000);
      return;
    }
    if (file.size > MAX_CHAT_ATTACHMENT_BYTES) {
      showToast(
        t("contactChat.fileTooLarge", { maxMb: Math.round(MAX_CHAT_ATTACHMENT_BYTES / (1024 * 1024)) }),
        "error",
      );
      return;
    }
    pinToBottom();
    setAttachBusy(true);
    setSendError(null);
    try {
      const contentBase64 = await fileToBase64(file);
      const caption = chatInput.trim() || undefined;
      await nodeService.sendChatRoomAttachment({
        roomId,
        filename: file.name,
        contentBase64,
        mimeType: file.type || undefined,
        caption,
      });
      if (caption) {
        setChatInput("");
      }
      showToast(t("contactChat.sendingFile", { filename: file.name }), "success");
    } catch (error) {
      const msg = error instanceof Error ? error.message : t("contactChat.sendFileFailed");
      setSendError(msg);
      showToast(msg, "error");
    } finally {
      setAttachBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleSendVoiceNote = useCallback(async () => {
    if (voiceRecorder.phase === "sending" || !roomId) return;
    pinToBottom();
    voiceRecorder.setSending();
    const capture = await voiceRecorder.finalizeCapture();
    if (!capture) {
      voiceRecorder.setIdle();
      return;
    }
    const { blob, mimeType, transcription } = capture;
    const ext = mimeType.includes("mp4") ? "m4a" : "webm";
    const filename = `voice-note.${ext}`;
    try {
      const contentBase64 = await fileToBase64(
        new File([blob], `voice-${Date.now()}.${ext}`, { type: mimeType }),
      );
      await nodeService.sendChatRoomAttachment({
        roomId,
        filename,
        contentBase64,
        mimeType,
        caption: transcription || undefined,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("contactChat.sendFailed");
      setSendError(msg);
      setTimeout(() => setSendError(null), 8000);
    } finally {
      voiceRecorder.setIdle();
    }
  }, [voiceRecorder, roomId, nodeService, t, pinToBottom]);

  const handleSend = () => {
    const text = stripModelThinking(chatInput).trim();
    if (!text || !roomId) return;

    pinToBottom();

    if (!nodeMeshOnline) {
      setSendError(t("contactChat.nodeOffline"));
      setTimeout(() => setSendError(null), 5000);
      return;
    }

    const now = Date.now();
    const last = lastSendRef.current;
    if (last && last.text === text && now - last.at < 1500) return;
    lastSendRef.current = { at: now, text };

    const tempId = `pending-${crypto.randomUUID()}`;
    const pendingMsg: ChatMessage = {
      messageId: tempId,
      sender: { nodeId: "", ownerId: "", displayName: t("messageBubble.you") },
      recipient: {
        nodeId: roomId,
        ownerId: threadKey,
        displayName: roomTitle,
      },
      content: { text },
      metadata: { timestamp: new Date().toISOString(), deliveryReceipt: "pending" },
      signature: "",
    };

    setPendingOutbound((prev) => [...prev, pendingMsg]);
    setChatInput("");
    setSendError(null);

    void (async () => {
      try {
        const result = await nodeService.sendChatRoomMessage(roomId, text);
        setPendingOutbound((prev) =>
          prev.map((m) =>
            m.messageId === tempId
              ? {
                  ...m,
                  messageId: result.messageId,
                  metadata: {
                    ...m.metadata,
                    deliveryReceipt:
                      result.deliveryReceipt === "delivered" ? ("delivered" as const) : ("sent" as const),
                    deliveredToOwnerIds: result.deliveredToOwnerIds,
                    pendingRecipientOwnerIds: result.pendingRecipientOwnerIds,
                  },
                }
              : m,
          ),
        );
      } catch (error) {
        const msg = error instanceof Error ? error.message : t("groupChat.sendFailed");
        setPendingOutbound((prev) =>
          prev.map((m) =>
            m.messageId === tempId
              ? { ...m, metadata: { ...m.metadata, deliveryReceipt: "failed" as const } }
              : m,
          ),
        );
        setSendError(msg);
        setTimeout(() => setSendError(null), 8000);
      }
    })();
  };

  const handleRetryMessage = useCallback(
    (msg: ChatMessage) => {
      const text = stripModelThinking(msg.content.text).trim();
      if (!text || !roomId) {
        showToast(t("messageBubble.retryNeedsText"), "error");
        return;
      }
      if (!nodeMeshOnline) {
        setSendError(t("contactChat.nodeOffline"));
        setTimeout(() => setSendError(null), 5000);
        return;
      }

      pinToBottom();
      setSendError(null);

      const trackId = msg.messageId.startsWith("pending-")
        ? msg.messageId
        : `pending-${crypto.randomUUID()}`;

      setPendingOutbound((prev) => {
        const without = prev.filter((m) => m.messageId !== msg.messageId);
        return [
          ...without,
          {
            ...msg,
            messageId: trackId,
            metadata: {
              ...msg.metadata,
              timestamp: new Date().toISOString(),
              deliveryReceipt: "pending" as const,
            },
          },
        ];
      });

      void (async () => {
        try {
          const result = await nodeService.sendChatRoomMessage(roomId, text);
          setPendingOutbound((prev) =>
            prev.map((m) =>
              m.messageId === trackId
                ? {
                    ...m,
                    messageId: result.messageId,
                    metadata: {
                      ...m.metadata,
                      deliveryReceipt:
                        result.deliveryReceipt === "delivered"
                          ? ("delivered" as const)
                          : ("sent" as const),
                      pendingRecipientOwnerIds: result.pendingRecipientOwnerIds,
                    },
                  }
                : m,
            ),
          );
        } catch (error) {
          const errMsg = error instanceof Error ? error.message : t("groupChat.sendFailed");
          setPendingOutbound((prev) =>
            prev.map((m) =>
              m.messageId === trackId
                ? { ...m, metadata: { ...m.metadata, deliveryReceipt: "failed" as const } }
                : m,
            ),
          );
          setSendError(errMsg);
          setTimeout(() => setSendError(null), 8000);
        }
      })();
    },
    [nodeMeshOnline, nodeService, pinToBottom, roomId, showToast, t],
  );

  const handleLeave = async () => {
    if (!roomId || !window.confirm(t("groupChat.leaveConfirm"))) return;
    setLeaveBusy(true);
    try {
      await nodeService.leaveChatRoom(roomId);
      onLeaveGroup?.();
    } catch (error) {
      setSendError(error instanceof Error ? error.message : t("groupChat.sendFailed"));
    } finally {
      setLeaveBusy(false);
    }
  };

  const handleClearChat = () => {
    if (displayMessages.length === 0) return;
    setConfirmDialog({
      title: t("contactChat.clearConfirm"),
      message: t("contactChat.clearConfirmMessage"),
      variant: "destructive",
      confirmLabel: t("common.clear"),
      onConfirm: () => {
        setConfirmDialog(null);
        void clearThread().then((deletedCount) => {
          setPendingOutbound([]);
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

  return (
    <>
      <header className="chat-header has-assistant-switch">
        <div className="chat-header-main">
          <div className="chat-header-left">
            <span className="chat-header-avatar kind-group" aria-hidden>
              {headerInitial}
            </span>
            <div className="chat-header-titles">
              <span className="chat-name">{roomTitle}</span>
              <span className="chat-header-kind kind-group">{t("groupChat.threadKindLabel")}</span>
              <span className="contact-reachability checking">
                {t("groupChat.memberCount", { count: memberCount })}
              </span>
            </div>
          </div>
          <div className="chat-header-actions-row">
            {!(isCreator && memberCount > 1) ? (
              <button
                type="button"
                className="chat-header-remove-contact-btn"
                onClick={() => void handleLeave()}
                disabled={leaveBusy}
              >
                {t("groupChat.leaveGroup")}
              </button>
            ) : null}
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
          {isCreator ? (
            <div className="chat-header-web-links">
              <div
                className="contact-web-content contact-web-content--compact"
                data-testid="group-header-links"
              >
                <div
                  className="contact-web-content__actions contact-web-content__actions--links"
                  role="group"
                  aria-label={t("groupChat.manageGroup")}
                >
                  <span className="contact-web-content__link-item">
                    <button
                      type="button"
                      className="contact-web-content__link"
                      onClick={() => setShowManage(true)}
                    >
                      {t("groupChat.manageGroup")}
                    </button>
                  </span>
                  <span className="contact-web-content__link-item">
                    <span className="contact-web-content__sep" aria-hidden="true">·</span>
                    <button
                      type="button"
                      className="contact-web-content__link"
                      onClick={() => setShowInvite(true)}
                    >
                      {t("groupChat.addPeople")}
                    </button>
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <span className="chat-header-web-links-spacer" aria-hidden="true" />
          )}
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

      <div className="messages" ref={messagesRef} onScroll={onMessagesScroll}>
        {displayMessages.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <ChatIcon size={40} />
            </div>
            <div className="empty-state-title">{t("chat.noMessagesYet")}</div>
            <div className="empty-state-desc">{t("groupChat.emptyDesc")}</div>
          </div>
        ) : (
          messageGroups.map(([dateKey, msgs]) => (
            <div key={dateKey} className="chat-day-group">
              <div className="date-separator">
                <span>{fmtDateLabel(msgs[0].metadata.timestamp, t)}</span>
              </div>
              {buildMessageStacks(msgs, (a, b) => sameMessageStackGroup(a, b, isOutgoingMsg)).map((stack) => {
                const outgoing = isOutgoingMsg(stack[0]);
                const senderOwnerId = stack[0].sender.ownerId?.trim() || "";
                const presentation = resolveChatBubblePresentation(
                  {
                    actorRole: stack[0].sender.actorRole,
                    agentVerified: stack[0].sender.agentVerified,
                    outgoing,
                    contactDisplayName: peerDisplayLabel(stack[0].sender),
                    threadKind: "human",
                  },
                  disclosure,
                );
                const variant = presentation.variant;
                const actorBadge = presentation.actorBadge;
                const totalRecipients = groupDeliveryRecipientCount(memberCount);
                const deliveredCount = stack[0].metadata.deliveredToOwnerIds?.length ?? 0;
                const partial =
                  outgoing && hasPartialGroupDelivery(stack[0].metadata, memberCount);
                const deliveryDetail =
                  partial && totalRecipients > 0
                    ? t("groupChat.deliveryPartial", { delivered: deliveredCount, total: totalRecipients })
                    : undefined;
                const deliveryReceipt =
                  outgoing && isGroupDeliveryComplete(stack[0].metadata, memberCount)
                    ? ("delivered" as const)
                    : outgoing
                      ? stack[0].metadata.deliveryReceipt
                      : undefined;

                return (
                  <div
                    key={stack[0].messageId}
                    className={`message-stack-row ${outgoing ? "is-outgoing" : "is-incoming"}`}
                  >
                    {!outgoing && senderOwnerId ? (
                      <PeerProfileAvatar
                        ownerId={senderOwnerId}
                        fallbackLabel={peerDisplayLabel(stack[0].sender)}
                        className="message-stack-avatar peer"
                      />
                    ) : null}
                    <div className="message-stack-bubbles">
                      {stack.map((msg, index) => {
                        const msgPartial =
                          outgoing && hasPartialGroupDelivery(msg.metadata, memberCount);
                        const msgDeliveredCount = msg.metadata.deliveredToOwnerIds?.length ?? 0;
                        const msgDeliveryDetail =
                          msgPartial && totalRecipients > 0
                            ? t("groupChat.deliveryPartial", {
                                delivered: msgDeliveredCount,
                                total: totalRecipients,
                              })
                            : deliveryDetail;
                        const msgReceipt =
                          outgoing && isGroupDeliveryComplete(msg.metadata, memberCount)
                            ? ("delivered" as const)
                            : outgoing
                              ? msg.metadata.deliveryReceipt
                              : undefined;
                        const showReceipt =
                          msg.metadata.deliveryReceipt === "failed" || index === stack.length - 1;
                        return (
                          <ChatMessageBubble
                            key={msg.messageId}
                            variant={variant}
                            position={stackPosition(index, stack.length)}
                            senderLabel={outgoing ? t("messageBubble.you") : peerDisplayLabel(msg.sender)}
                            actorBadge={actorBadge}
                            timeLabel={new Date(msg.metadata.timestamp).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                            deliveryReceipt={showReceipt ? msgReceipt : undefined}
                            deliveryDetail={
                              showReceipt && index === stack.length - 1 ? msgDeliveryDetail : undefined
                            }
                            onRetry={
                              outgoing && msg.metadata.deliveryReceipt === "failed"
                                ? () => handleRetryMessage(msg)
                                : undefined
                            }
                          >
                            {msg.content.attachments?.map((attachment) => {
                              const isAudio = attachment.mimeType?.split(";")[0]?.startsWith("audio/") === true;
                              return isAudio ? (
                                <ChatAudioAttachment
                                  key={attachment.id}
                                  attachment={attachment}
                                  transcription={msg.content.text?.trim() || undefined}
                                />
                              ) : (
                                <ChatFileAttachment key={attachment.id} attachment={attachment} />
                              );
                            })}
                            {msg.content.text.trim() ? (
                              <ChatMessageText text={msg.content.text} identity={aiIdentity} />
                            ) : null}
                          </ChatMessageBubble>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>

      <div className="chat-composer">
        {/* Floating overlays — render above the input row without pushing it down */}
        <div className="chat-composer-overlays">
          {sendError ? <div className="chat-send-error">{sendError}</div> : null}
          {pendingOutbound.some((m) => m.metadata.deliveryReceipt === "pending") ? (
            <div className="typing-indicator">
              <span />
              <span />
              <span />
            </div>
          ) : null}
        </div>

        {latestDraft ? (
          <div className="chat-draft-suggestion" role="region" aria-label={t("contactChat.suggestedReplyAria")}>
            <div className="chat-draft-suggestion-body">
              <span className="chat-draft-suggestion-label">{t("contactChat.suggestedReply")}</span>
              <p className="chat-draft-suggestion-text">
                {chatMessageTextForDisplay(stripModelThinking(latestDraft.text), aiIdentity)}
              </p>
            </div>
            <div className="chat-draft-suggestion-actions">
              <button
                type="button"
                className="secondary chat-draft-dismiss-btn"
                onClick={() => void dismissDraft(latestDraft.draftId)}
              >
                {t("contactChat.dismiss")}
              </button>
              <button type="button" className="chat-draft-use-btn" onClick={handleUseDraft}>
                {t("contactChat.use")}
              </button>
            </div>
          </div>
        ) : null}
        {voiceRecorder.phase !== "idle" ? (
          <VoiceNoteRecorderBar
            isCapturing={voiceRecorder.isCapturing}
            recordingSeconds={voiceRecorder.recordingSeconds}
            maxSeconds={voiceRecorder.maxSeconds}
            sending={voiceRecorder.phase === "sending"}
            onCancel={voiceRecorder.cancel}
            onSend={() => void handleSendVoiceNote()}
          />
        ) : null}
        <footer className="chat-input">
          <ChatComposer
            value={chatInput}
            onChange={setChatInput}
            onSend={handleSend}
            placeholder={nodeMeshOnline ? t("groupChat.inputPlaceholder") : t("contactChat.inputOffline")}
            sendLabel={t("contactChat.send")}
            disabled={!nodeMeshOnline}
            leading={
              <>
                <button
                  type="button"
                  className="secondary chat-attach-file-btn"
                  title={t("contactChat.attachFileTitle")}
                  aria-label={t("contactChat.attachFileAria")}
                  disabled={!nodeMeshOnline || attachBusy}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <AttachIcon size={18} />
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="chat-file-input-hidden"
                  accept="*/*"
                  aria-hidden
                  tabIndex={-1}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void handleAttachFile(file);
                  }}
                />
                {/* Voice note mic button — starts the recorder bar above */}
                <button
                  type="button"
                  className="secondary chat-mic-btn"
                  title={t("audioMessage.recordTitle")}
                  aria-label={t("audioMessage.recordAria")}
                  disabled={!nodeMeshOnline || voiceRecorder.phase !== "idle"}
                  onClick={() => void voiceRecorder.start()}
                >
                  🎤
                </button>
              </>
            }
          />
        </footer>
      </div>

      {showInvite && roomId && room ? (
        <InviteMembersModal
          roomId={roomId}
          existingMemberOwnerIds={room.memberOwnerIds}
          onClose={() => setShowInvite(false)}
          onInvited={() => setShowInvite(false)}
        />
      ) : null}

      {showManage && room ? (
        <GroupManageModal
          room={room}
          onClose={() => setShowManage(false)}
          onDismissed={() => onLeaveGroup?.()}
        />
      ) : null}

      {confirmDialog ? (
        <ConfirmDialog
          title={confirmDialog.title}
          message={confirmDialog.message}
          variant={confirmDialog.variant}
          confirmLabel={confirmDialog.confirmLabel}
          onConfirm={confirmDialog.onConfirm}
          onCancel={() => setConfirmDialog(null)}
        />
      ) : null}
    </>
  );
}
