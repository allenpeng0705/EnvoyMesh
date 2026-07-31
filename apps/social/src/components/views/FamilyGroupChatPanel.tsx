/**
 * Phase 51F follow-up — Family group room panel (owner desktop).
 * Thread key `room:<uuid>`; send via sendFamilyRoomMessage.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  OWNER_FAMILY_PROFILE_ID,
  isChatRoomThreadKey,
  parseChatRoomThreadKey,
  type ChatMessage,
  type FamilyRoom,
} from "@envoymesh/api";
import { useT } from "../../context/I18nContext.js";
import { useNodeState } from "../../context/NodeStateContext.js";
import { useChatMessages, useNodeService } from "../../hooks/useNodeService.js";
import { useChatStickToBottom } from "../../hooks/useChatStickToBottom.js";
import { ChatComposer } from "../ChatComposer.js";
import { ChatMessageBubble } from "../ChatMessageBubble.js";
import { ChatIcon } from "../../icons.js";
import { extractChatMessageText } from "../../lib/bridge-chat-message.js";
import { buildMessageStacks, stackPosition } from "../../lib/chat-message-stack.js";

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
  const { nodeConfig, humanProfile } = useNodeState();
  const myProfileId =
    nodeConfig?.callerFamilyProfileId?.trim() || OWNER_FAMILY_PROFILE_ID;
  const roomId = parseChatRoomThreadKey(threadKey) ?? "";
  const title = room?.title?.trim() || t("chat.familyGroupFallback", "Family group");
  const memberCount = room?.memberProfileIds?.length ?? 0;

  const selfOwnerId = humanProfile?.ownerId?.trim() ?? "";
  const { messages, isOutgoing } = useChatMessages(threadKey);
  const { containerRef, onScroll, pinToBottom } = useChatStickToBottom(
    threadKey,
    messages.length,
  );
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [pendingOutbound, setPendingOutbound] = useState<ChatMessage | null>(null);

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
      setDraft(text);
      setPendingOutbound(null);
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
      <header className="chat-header">
        <div className="chat-header-left">
          <span className="chat-header-avatar" style={{ background: "#0d9488" }} aria-hidden>
            {initial(title)}
          </span>
          <div className="chat-header-titles">
            <span className="chat-name">{title}</span>
            <span className="chat-header-kind">
              {inactive
                ? t("chat.familyGroupInactive", "Inactive group")
                : t("chat.familyGroupSubtitle", "{{count}} members · Family", {
                    count: memberCount,
                  })}
            </span>
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
    </>
  );
}
