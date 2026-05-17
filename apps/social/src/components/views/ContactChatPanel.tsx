import { useState, useEffect, useRef, useCallback } from "react";
import { useNodeState } from "../../context/NodeStateContext.js";
import { useNodeService, useChatMessages } from "../../hooks/useNodeService.js";
import type { ChatMessage } from "@envoymesh/api";
import type { AssistantMode } from "../../lib/storage.js";
import { contactLabel, peerDisplayLabel } from "../../lib/display.js";
import { Markdown } from "../Markdown.js";
import {
  BackIcon,
  SendIcon,
  EditIcon,
  ChatIcon,
  AIIcon,
  P2PIcon,
  RelayIcon,
} from "../../icons.js";

interface ContactChatPanelProps {
  selectedContact: string;
  onSelectContact: (id: string | null) => void;
}

export function ContactChatPanel({ selectedContact, onSelectContact }: ContactChatPanelProps) {
  const nodeService = useNodeService();
  const {
    bonds,
    nodeConfig,
    bridgeStatus,
    appSettings,
    contactAiModes,
    setContactAiModes,
  } = useNodeState();

  const { messages, isOutgoing } = useChatMessages(selectedContact);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const [chatInput, setChatInput] = useState("");
  const [isSendingChat, setIsSendingChat] = useState(false);
  const lastChatSendRef = useRef<{ at: number; contact: string; text: string } | null>(null);

  // Peer connection info
  const [peerConnectionInfo, setPeerConnectionInfo] = useState<Record<string, { connected: boolean; direct: boolean; relayPeerId?: string }>>({});

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Fetch peer connection info
  useEffect(() => {
    if (!appSettings.showConnectionStatus || peerConnectionInfo[selectedContact]) return;
    nodeService.getPeerConnectionInfo(selectedContact).then((info) => {
      setPeerConnectionInfo((prev) => ({ ...prev, [selectedContact]: info }));
    }).catch(() => {});
  }, [appSettings.showConnectionStatus, selectedContact, nodeService]);

  const getContactAiAccessLevel = useCallback(
    (ownerId: string): "none" | "assistant_only" | "full" =>
      nodeConfig?.contactAiPreferences?.find(p => p.peerOwnerId === ownerId)?.aiAccessLevel ?? "none",
    [nodeConfig],
  );

  const handleSendMessage = async () => {
    const text = chatInput.trim();
    if (!text || isSendingChat) return;

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

    setIsSendingChat(true);
    try {
      await nodeService.sendChat(selectedContact, text);
      setChatInput("");
    } catch (error) {
      console.error("[ContactChatPanel] sendChat failed:", error);
    } finally {
      setIsSendingChat(false);
    }
  };

  const currentAiMode: AssistantMode = contactAiModes[selectedContact] ?? "manual";
  const aiAccessLevel = getContactAiAccessLevel(selectedContact);
  const isAssistantAllowed = aiAccessLevel === "assistant_only" || aiAccessLevel === "full";
  const isAutoAllowed = aiAccessLevel === "full" && (nodeConfig?.autonomousPolicies ?? []).some(p => p.domain === "social" && p.autoSendChat);
  const isChatAssistEnabled = nodeConfig?.chatAssistEnabled ?? false;

  const contact = bonds.find((c) => c.peerOwnerId === selectedContact);
  const displayName = selectedContact === bridgeStatus?.agentPeerId
    ? (bridgeStatus.agentName ?? "My Agent")
    : contactLabel(contact ?? { peerOwnerId: selectedContact });

  const connInfo = peerConnectionInfo[selectedContact];
  const isDirect = connInfo?.direct ?? false;

  return (
    <>
      <header className="chat-panel-header">
        <button
          className="back-btn"
          aria-label="Back to contacts"
          onClick={() => onSelectContact(null)}
        >
          <BackIcon size={20} />
        </button>
        <div className="contact-avatar" style={{ width: 36, height: 36, fontSize: "var(--text-sm)" }}>
          {displayName[0]}
        </div>
        <div className="chat-panel-header-info">
          <div className="chat-panel-header-name">{displayName}</div>
          <div className="chat-panel-header-status">
            {connInfo && (
              <>
                {isDirect ? <P2PIcon size={12} /> : <RelayIcon size={12} />}
                {isDirect ? "P2P" : "Relay"}
              </>
            )}
          </div>
        </div>
        {/* AI mode toggle */}
        <div className="ai-mode-toggle">
          <button
            className={`ai-mode-btn${currentAiMode === "manual" ? " active" : ""}`}
            title="Manual: Type yourself"
            onClick={() => setContactAiModes({ ...contactAiModes, [selectedContact]: "manual" })}
          >
            <EditIcon size={14} />
            Manual
          </button>
          <button
            className={`ai-mode-btn${currentAiMode === "assistant" ? " active" : ""}${!isAssistantAllowed || !isChatAssistEnabled ? " disabled" : ""}`}
            title={!isAssistantAllowed ? "Assistant mode requires AI access" : isChatAssistEnabled ? "AI suggests drafts" : "Chat Assist disabled"}
            onClick={() => {
              if (!isAssistantAllowed || !isChatAssistEnabled) return;
              setContactAiModes({ ...contactAiModes, [selectedContact]: "assistant" });
            }}
          >
            <ChatIcon size={14} />
            Assist
          </button>
          <button
            className={`ai-mode-btn${currentAiMode === "auto" ? " active" : ""}${!isAutoAllowed ? " disabled" : ""}`}
            title={isAutoAllowed ? "Auto-Reply" : "Requires full AI access"}
            onClick={() => {
              if (!isAutoAllowed) return;
              setContactAiModes({ ...contactAiModes, [selectedContact]: "auto" });
            }}
          >
            <AIIcon size={14} />
            Auto
          </button>
        </div>
      </header>

      <div className="chat-messages">
        {messages.length === 0 ? (
          <div className="no-chat-selected" style={{ padding: "32px 16px" }}>
            <p>No messages yet. Say hello!</p>
          </div>
        ) : (
          messages.map((msg) => {
            const outgoing = isOutgoing(msg);
            return (
              <div
                key={msg.messageId}
                className={`chat-bubble ${outgoing ? "outgoing" : "incoming"}`}
              >
                {!outgoing && (
                  <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-subtle)", marginBottom: 4, fontWeight: 500 }}>
                    {peerDisplayLabel(msg.sender)}
                  </div>
                )}
                <Markdown text={msg.content.text} className="markdown-content" />
                <div style={{ fontSize: "10px", opacity: 0.6, marginTop: 6, textAlign: "right" }}>
                  {new Date(msg.metadata.timestamp).toLocaleTimeString()}
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} className="messages-scroll-anchor" aria-hidden />
      </div>

      <footer className="chat-composer">
        <input
          type="text"
          placeholder="Type a message..."
          value={chatInput}
          onChange={(e) => setChatInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void handleSendMessage();
            }
          }}
          disabled={isSendingChat}
        />
        <button
          type="button"
          onClick={() => void handleSendMessage()}
          disabled={isSendingChat || !chatInput.trim()}
        >
          <SendIcon size={16} />
          {isSendingChat ? "Sending..." : "Send"}
        </button>
      </footer>
    </>
  );
}
