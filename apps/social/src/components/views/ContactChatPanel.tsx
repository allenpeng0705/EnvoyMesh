import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useNodeState } from "../../context/NodeStateContext.js";
import { useNodeService, useChatMessages } from "../../hooks/useNodeService.js";
import { usePeerReachability, peerReachabilityLabel } from "../../hooks/usePeerReachability.js";
import type { ChatMessage } from "@envoymesh/api";
import type { AssistantMode } from "../../lib/storage.js";
import { contactLabel, peerDisplayLabel } from "../../lib/display.js";
import { buildMessageStacks, stackPosition } from "../../lib/chat-message-stack.js";
import {
  messageVisualVariant,
  resolveChatThreadKind,
  threadKindLabel,
} from "../../lib/chat-thread-kind.js";
import { ChatMessageBubble } from "../ChatMessageBubble.js";
import { ChatFileAttachment } from "../ChatFileAttachment.js";
import { Markdown } from "../Markdown.js";
import { ShareFileDialog } from "../file-share/ShareFileDialog.js";
import { EditIcon, ChatIcon, BridgeIcon, P2PIcon } from "../../icons.js";

interface ContactChatPanelProps {
  selectedContact: string;
  onSelectContact: (id: string | null) => void;
}

function fmtDateLabel(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const msgDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());

  if (msgDate.getTime() === today.getTime()) return "Today";
  if (msgDate.getTime() === yesterday.getTime()) return "Yesterday";
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

export function ContactChatPanel({ selectedContact }: ContactChatPanelProps) {
  const nodeService = useNodeService();
  const {
    bonds,
    nodeConfig,
    bridgeStatus,
    contactAiModes,
    setContactAiModes,
    connectionStatus,
  } = useNodeState();

  const { messages, isOutgoing } = useChatMessages(selectedContact);
  const { info: peerReachability, checking: reachabilityChecking } = usePeerReachability(selectedContact);
  const [pendingOutbound, setPendingOutbound] = useState<ChatMessage[]>([]);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const [chatInput, setChatInput] = useState("");
  const [isSendingChat, setIsSendingChat] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const lastChatSendRef = useRef<{ at: number; contact: string; text: string } | null>(null);

  const nodeMeshOnline = connectionStatus?.online === true;
  const contactReachable = peerReachability?.connected === true;

  const displayMessages = useMemo(() => {
    const merged = [...messages, ...pendingOutbound];
    const seen = new Set<string>();
    const out: ChatMessage[] = [];
    for (const m of merged) {
      if (seen.has(m.messageId)) continue;
      seen.add(m.messageId);
      out.push(m);
    }
    out.sort((a, b) => {
      const ta = new Date(a.metadata.timestamp).getTime();
      const tb = new Date(b.metadata.timestamp).getTime();
      return ta - tb;
    });
    return out;
  }, [messages, pendingOutbound]);

  const isOutgoingMsg = useCallback(
    (msg: ChatMessage) => isPendingOutgoing(msg) || isOutgoing(msg),
    [isOutgoing],
  );

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [displayMessages]);

  const getContactAiAccessLevel = useCallback(
    (ownerId: string): "none" | "assistant_only" | "full" =>
      nodeConfig?.contactAiPreferences?.find((p) => p.peerOwnerId === ownerId)?.aiAccessLevel ?? "none",
    [nodeConfig],
  );

  const handleSendMessage = async () => {
    const text = chatInput.trim();
    if (!text || isSendingChat) return;

    if (!nodeMeshOnline) {
      setSendError("Your node is offline — start the node before sending.");
      setTimeout(() => setSendError(null), 5000);
      return;
    }

    if (text.startsWith("/ai ")) {
      const question = text.slice(4);
      try {
        const answer = await nodeService.knowledgeQuery(question);
        console.log("[ContactChatPanel] AI answer:", answer);
      } catch (e) {
        console.error("[ContactChatPanel] AI query failed:", e);
      }
      setChatInput("");
      return;
    }

    const now = Date.now();
    const last = lastChatSendRef.current;
    if (last && last.contact === selectedContact && last.text === text && now - last.at < 1500) {
      return;
    }
    lastChatSendRef.current = { at: now, contact: selectedContact, text };

    const tempId = `pending-${crypto.randomUUID()}`;
    const pendingMsg: ChatMessage = {
      messageId: tempId,
      sender: { nodeId: "", ownerId: "", displayName: "You" },
      recipient: { nodeId: "", ownerId: selectedContact, displayName: selectedContact },
      content: { text },
      metadata: { timestamp: new Date().toISOString(), deliveryReceipt: "pending" },
      signature: "",
    };

    setPendingOutbound((prev) => [...prev, pendingMsg]);
    setChatInput("");
    setIsSendingChat(true);
    setSendError(null);

    try {
      await nodeService.sendChat(selectedContact, text);
      setPendingOutbound((prev) => prev.filter((m) => m.messageId !== tempId));
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to send message";
      console.error("[ContactChatPanel] sendChat failed:", error);
      setPendingOutbound((prev) =>
        prev.map((m) =>
          m.messageId === tempId
            ? { ...m, metadata: { ...m.metadata, deliveryReceipt: "failed" as const } }
            : m,
        ),
      );
      setSendError(msg);
      setTimeout(() => setSendError(null), 8000);
    } finally {
      setIsSendingChat(false);
    }
  };

  const currentAiMode: AssistantMode = contactAiModes[selectedContact] ?? "manual";
  const aiAccessLevel = getContactAiAccessLevel(selectedContact);
  const isAssistantAllowed = aiAccessLevel === "assistant_only" || aiAccessLevel === "full";
  const isAutoAllowed =
    aiAccessLevel === "full" &&
    (nodeConfig?.autonomousPolicies ?? []).some((p) => p.domain === "social" && p.autoSendChat);
  const isChatAssistEnabled = nodeConfig?.chatAssistEnabled ?? false;

  const messageGroups = useMemo(() => groupMessagesByDate(displayMessages), [displayMessages]);

  const threadKind = resolveChatThreadKind(selectedContact, bridgeStatus?.agentPeerId);
  const displayName =
    selectedContact === bridgeStatus?.agentPeerId
      ? (bridgeStatus.agentName ?? "My Agent")
      : contactLabel(
          bonds.find((c) => c.peerOwnerId === selectedContact) ?? { peerOwnerId: selectedContact },
        );
  const headerInitial = displayName.trim().charAt(0).toUpperCase() || "?";

  const reachabilityClass = contactReachable
    ? peerReachability?.direct
      ? "online-direct"
      : "online-relay"
    : reachabilityChecking
      ? "checking"
      : "offline";

  return (
    <>
      <header className="chat-header has-assistant-switch">
        <div className="chat-header-left">
          <span className={`chat-header-avatar kind-${threadKind}`} aria-hidden>
            {headerInitial}
          </span>
          <div className="chat-header-titles">
            <span className="chat-name">{displayName}</span>
            <span className={`chat-header-kind kind-${threadKind}`}>{threadKindLabel(threadKind)}</span>
            <span className={`contact-reachability ${reachabilityClass}`} title="P2P path to this contact">
              <span className="contact-reachability-dot" aria-hidden />
              {peerReachabilityLabel(peerReachability)}
            </span>
          </div>
        </div>
        <div className="chat-header-right">
          <div className="assistant-switch" title={`Current: ${currentAiMode.charAt(0).toUpperCase() + currentAiMode.slice(1)}`}>
            <span className="assistant-switch-label">AI</span>
            <button
              className={`assistant-switch-btn ${currentAiMode === "manual" ? "active" : ""}`}
              title="Manual: Type yourself"
              onClick={() => setContactAiModes({ ...contactAiModes, [selectedContact]: "manual" })}
            ><EditIcon size={16} /></button>
            <button
              className={`assistant-switch-btn ${currentAiMode === "assistant" ? "active" : ""} ${!isAssistantAllowed || !isChatAssistEnabled ? "disabled" : ""}`}
              title={!isAssistantAllowed ? "Assistant mode requires AI access for this contact" : isChatAssistEnabled ? "Assistant: AI suggests drafts" : "Chat Assist is disabled"}
              onClick={() => {
                if (!isAssistantAllowed || !isChatAssistEnabled) return;
                setContactAiModes({ ...contactAiModes, [selectedContact]: "assistant" });
              }}
            ><ChatIcon size={16} /></button>
            <button
              className={`assistant-switch-btn ${currentAiMode === "auto" ? "active" : ""} ${!isAutoAllowed ? "disabled" : ""}`}
              title={isAutoAllowed ? "Auto-Reply: AI responds automatically" : "Auto-Reply requires full AI access for this contact"}
              onClick={() => {
                if (!isAutoAllowed) return;
                setContactAiModes({ ...contactAiModes, [selectedContact]: "auto" });
              }}
            ><BridgeIcon size={16} /></button>
          </div>
        </div>
      </header>
      <div className="messages">
        {displayMessages.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <ChatIcon size={40} />
            </div>
            <div className="empty-state-title">No messages yet</div>
            <div className="empty-state-desc">Say hello to start the conversation</div>
          </div>
        ) : (
          messageGroups.map(([dateKey, msgs]) => (
            <div key={dateKey}>
              <div className="date-separator"><span>{fmtDateLabel(msgs[0].metadata.timestamp)}</span></div>
              {buildMessageStacks(msgs, (a, b) => isOutgoingMsg(a) === isOutgoingMsg(b)).map((stack) => {
                const outgoing = isOutgoingMsg(stack[0]);
                const variant = messageVisualVariant(outgoing, threadKind);
                const senderInitial = peerDisplayLabel(stack[0].sender).charAt(0).toUpperCase() || "?";
                return (
                  <div
                    key={stack[0].messageId}
                    className={`message-stack-row ${outgoing ? "is-outgoing" : "is-incoming"}`}
                  >
                    {!outgoing && (
                      <span
                        className={`message-stack-avatar ${threadKind === "agent" ? "agent" : "peer"}`}
                        aria-hidden
                      >
                        {senderInitial}
                      </span>
                    )}
                    <div className="message-stack-bubbles">
                      {stack.map((msg, index) => (
                        <ChatMessageBubble
                          key={msg.messageId}
                          variant={variant}
                          position={stackPosition(index, stack.length)}
                          senderLabel={peerDisplayLabel(msg.sender)}
                          timeLabel={new Date(msg.metadata.timestamp).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                          deliveryReceipt={outgoing ? msg.metadata.deliveryReceipt : undefined}
                        >
                          <Markdown text={msg.content.text} className="message-text" />
                          {msg.content.attachments?.map((attachment) => (
                            <ChatFileAttachment key={attachment.id} attachment={attachment} />
                          ))}
                        </ChatMessageBubble>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ))
        )}
        <div ref={messagesEndRef} className="messages-scroll-anchor" aria-hidden />
      </div>
      <footer className="chat-input">
        {sendError && <div className="chat-send-error">{sendError}</div>}
        {!contactReachable && nodeMeshOnline && !reachabilityChecking && (
          <div className="chat-reachability-hint">
            Contact is offline — sending will try to connect and may take longer.
          </div>
        )}
        {shareOpen && (
          <ShareFileDialog
            targetOwnerId={selectedContact}
            onClose={() => setShareOpen(false)}
          />
        )}
        {chatInput.trim() && !isSendingChat && (
          <div className="typing-indicator">
            <span /><span /><span />
          </div>
        )}
        <button
          type="button"
          className="secondary chat-share-file-btn"
          title="Share a vault file"
          aria-label="Share a vault file"
          onClick={() => setShareOpen(true)}
        >
          <P2PIcon size={18} />
        </button>
        <input
          type="text"
          placeholder={nodeMeshOnline ? "Type a message..." : "Node offline"}
          value={chatInput}
          onChange={(e) => setChatInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void handleSendMessage();
            }
          }}
          enterKeyHint="send"
          disabled={isSendingChat || !nodeMeshOnline}
        />
        <button
          type="button"
          onClick={() => void handleSendMessage()}
          disabled={isSendingChat || !chatInput.trim() || !nodeMeshOnline}
        >
          {isSendingChat ? "Sending\u2026" : "Send"}
        </button>
      </footer>
    </>
  );
}
