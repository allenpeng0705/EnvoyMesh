import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useT } from "../../context/I18nContext.js";
import { useNodeState } from "../../context/NodeStateContext.js";
import { useNodeService, useChatMessages } from "../../hooks/useNodeService.js";
import { useChatDrafts } from "../../hooks/useChatDrafts.js";
import type { ChatMessage, ChatRoom, ContactAiPreferences } from "@envoymesh/api";
import {
  chatMessageTextForDisplay,
  contactAiAccessLevelForAssistantMode,
  parseChatRoomThreadKey,
  stripModelThinking,
} from "@envoymesh/api";
import {
  mergeGroupDeliveryAck,
  hasPartialGroupDelivery,
  groupDeliveryRecipientCount,
  isGroupDeliveryComplete,
} from "@envoymesh/api/group-chat-delivery";
import { peerDisplayLabel } from "../../lib/display.js";
import { ChatMessageBubble } from "../ChatMessageBubble.js";
import { ChatMessageText } from "../ChatMessageText.js";
import { ChatIcon, EditIcon } from "../../icons.js";
import type { AssistantMode } from "../../lib/storage.js";
import { InviteMembersModal } from "./InviteMembersModal.js";
import { GroupManageModal } from "./GroupManageModal.js";

interface GroupChatPanelProps {
  threadKey: string;
  room: ChatRoom | undefined;
  onLeaveGroup?: () => void;
  showPostCreateHint?: boolean;
  onDismissPostCreateHint?: () => void;
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

export function GroupChatPanel({
  threadKey,
  room,
  onLeaveGroup,
  showPostCreateHint,
  onDismissPostCreateHint,
}: GroupChatPanelProps) {
  const t = useT();
  const nodeService = useNodeService();
  const { humanProfile, nodeConfig, contactAiModes, setContactAiModes, refreshNodeConfig } = useNodeState();
  const { messages, isOutgoing } = useChatMessages(threadKey);
  const [chatInput, setChatInput] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  const [pendingOutbound, setPendingOutbound] = useState<ChatMessage[]>([]);
  const [showInvite, setShowInvite] = useState(false);
  const [showManage, setShowManage] = useState(false);
  const [leaveBusy, setLeaveBusy] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const roomId = parseChatRoomThreadKey(threadKey);
  const isCreator = !!room && humanProfile?.ownerId === room.creatorOwnerId;

  const defaultGroupAiMode: AssistantMode =
    nodeConfig?.aiSettings?.defaultModeForNewContacts === "manual" ? "manual" : "assistant";
  const storedMode = contactAiModes[threadKey] ?? defaultGroupAiMode;
  const currentAiMode: AssistantMode = storedMode === "auto" ? "assistant" : storedMode;
  const canDraftAssist = nodeConfig?.chatAssistEnabled ?? false;
  const aiIdentity = nodeConfig?.aiSettings?.identity;
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
  const displayMessages = useMemo(
    () => [...messages, ...pendingOutbound].sort((a, b) =>
      new Date(a.metadata.timestamp).getTime() - new Date(b.metadata.timestamp).getTime(),
    ),
    [messages, pendingOutbound],
  );

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [displayMessages.length]);

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

  const handleSend = () => {
    const text = stripModelThinking(chatInput).trim();
    if (!text || !roomId) return;

    const tempId = `pending-${Date.now()}`;
    const pendingMsg: ChatMessage = {
      messageId: tempId,
      sender: { nodeId: "", ownerId: "", displayName: t("messageBubble.you") },
      recipient: {
        nodeId: roomId,
        ownerId: threadKey,
        displayName: room?.title ?? t("groupChat.untitled"),
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

  const handleLeave = async () => {
    if (!roomId || !confirm(t("groupChat.leaveConfirm"))) return;
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

  return (
    <div className="contact-chat-panel group-chat-panel">
      <header className="chat-header has-assistant-switch group-chat-panel__header">
        <div className="chat-header-main">
          <h2>{room?.title ?? t("groupChat.untitled")}</h2>
          <p className="chat-header-subtitle">
            {t("groupChat.memberCount", { count: room?.memberOwnerIds.length ?? 0 })}
          </p>
        </div>
        <div className="chat-header-actions">
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
          {isCreator ? (
            <button type="button" className="secondary" onClick={() => setShowManage(true)}>
              {t("groupChat.manageGroup")}
            </button>
          ) : null}
          {isCreator ? (
            <button type="button" className="secondary" onClick={() => setShowInvite(true)}>
              {t("groupChat.addPeople")}
            </button>
          ) : null}
          {!(isCreator && (room?.memberOwnerIds.length ?? 0) > 1) ? (
            <button type="button" className="secondary danger" onClick={() => void handleLeave()} disabled={leaveBusy}>
              {t("groupChat.leaveGroup")}
            </button>
          ) : null}
        </div>
      </header>

      {showPostCreateHint ? (
        <div className="group-chat-hint banner-info">
          <span>{t("groupChat.postCreateHint")}</span>
          <button type="button" className="link-btn" onClick={() => setShowInvite(true)}>
            {t("groupChat.addPeople")}
          </button>
          {onDismissPostCreateHint ? (
            <button type="button" className="link-btn" onClick={onDismissPostCreateHint}>
              {t("groupChat.dismissHint")}
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="chat-messages">
        {groupMessagesByDate(displayMessages).map(([dateKey, msgs]) => (
          <div key={dateKey} className="chat-date-group">
            {msgs.map((msg) => {
              const outgoing = isOutgoing(msg);
              const memberCount = room?.memberOwnerIds.length ?? 0;
              const totalRecipients = groupDeliveryRecipientCount(memberCount);
              const deliveredCount = msg.metadata.deliveredToOwnerIds?.length ?? 0;
              const partial =
                outgoing &&
                hasPartialGroupDelivery(msg.metadata, memberCount);
              const deliveryDetail =
                partial && totalRecipients > 0
                  ? t("groupChat.deliveryPartial", { delivered: deliveredCount, total: totalRecipients })
                  : undefined;
              const deliveryReceipt =
                outgoing && isGroupDeliveryComplete(msg.metadata, memberCount)
                  ? ("delivered" as const)
                  : outgoing
                    ? msg.metadata.deliveryReceipt
                    : undefined;
              return (
                <ChatMessageBubble
                  key={msg.messageId}
                  variant={outgoing ? "outgoing" : "incoming-peer"}
                  position="single"
                  senderLabel={outgoing ? t("messageBubble.you") : peerDisplayLabel(msg.sender)}
                  timeLabel={new Date(msg.metadata.timestamp).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                  deliveryReceipt={deliveryReceipt}
                  deliveryDetail={deliveryDetail}
                >
                  <ChatMessageText text={chatMessageTextForDisplay(msg.content.text)} />
                </ChatMessageBubble>
              );
            })}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {sendError ? <p className="chat-send-error">{sendError}</p> : null}

      <div className="chat-composer">
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
      <div className="chat-compose">
        <textarea
          className="chat-input"
          rows={2}
          value={chatInput}
          onChange={(e) => setChatInput(e.target.value)}
          placeholder={t("groupChat.inputPlaceholder")}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
        />
        <button type="button" className="primary" onClick={handleSend} disabled={!chatInput.trim()}>
          {t("contactChat.send")}
        </button>
      </div>
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
    </div>
  );
}
