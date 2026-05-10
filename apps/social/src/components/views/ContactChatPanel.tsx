import { useState, useEffect, useRef, useCallback } from "react";
import { useNodeState } from "../../context/NodeStateContext.js";
import { useNodeService, useChatMessages } from "../../hooks/useNodeService.js";
import type { ChatMessage } from "@envoymesh/api";
import type { AssistantMode } from "../../lib/storage.js";
import { contactLabel, peerDisplayLabel } from "../../lib/display.js";

interface ContactChatPanelProps {
  selectedContact: string;
  onSelectContact: (id: string | null) => void;
}

export function ContactChatPanel({ selectedContact }: ContactChatPanelProps) {
  const nodeService = useNodeService();
  const {
    bonds,
    nodeConfig,
    appSettings,
    contactAiModes,
    setContactAiModes,
  } = useNodeState();

  const { messages, isOutgoing } = useChatMessages(selectedContact);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const [chatInput, setChatInput] = useState("");
  const [isSendingChat, setIsSendingChat] = useState(false);
  const lastChatSendRef = useRef<{ at: number; contact: string; text: string } | null>(null);

  // Peer connection info (locally cached)
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

  // AI access
  const getContactAiAccessLevel = useCallback(
    (ownerId: string): "none" | "assistant_only" | "full" =>
      nodeConfig?.contactAiPreferences?.find(p => p.peerOwnerId === ownerId)?.aiAccessLevel ?? "none",
    [nodeConfig],
  );

  const handleSendMessage = async () => {
    const text = chatInput.trim();
    if (!text || isSendingChat) return;

    // /ai command routing
    if (text.startsWith("/ai ")) {
      const question = text.slice(4);
      try {
        const answer = await nodeService.knowledgeQuery(question);
        // For now, we don't display AI answers inline in ContactChatPanel
        console.log("[ContactChatPanel] AI answer:", answer);
      } catch (e) {
        console.error("[ContactChatPanel] AI query failed:", e);
      }
      setChatInput("");
      return;
    }

    // Duplicate send guard (1.5s)
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

  return (
    <>
      <header className="chat-header has-assistant-switch">
        <div className="chat-header-left">
          <span className="chat-name">
            {contactLabel(
              bonds.find((c) => c.peerOwnerId === selectedContact) ?? { peerOwnerId: selectedContact },
            )}
          </span>
          {appSettings.showConnectionStatus && peerConnectionInfo[selectedContact] && (
            <span className={`connection-type ${peerConnectionInfo[selectedContact].direct ? "p2p" : "relay"}`}>
              {peerConnectionInfo[selectedContact].direct ? "P2P" : "Relay"}
            </span>
          )}
        </div>
        <div className="chat-header-right">
          <div className="assistant-switch" title={`Current: ${currentAiMode.charAt(0).toUpperCase() + currentAiMode.slice(1)}`}>
            <span className="assistant-switch-label">AI</span>
            <button
              className={`assistant-switch-btn ${currentAiMode === "manual" ? "active" : ""}`}
              title="Manual: Type yourself"
              onClick={() => setContactAiModes({ ...contactAiModes, [selectedContact]: "manual" })}
            >✏️</button>
            <button
              className={`assistant-switch-btn ${currentAiMode === "assistant" ? "active" : ""} ${!isAssistantAllowed || !isChatAssistEnabled ? "disabled" : ""}`}
              title={!isAssistantAllowed ? "Assistant mode requires AI access for this contact" : isChatAssistEnabled ? "Assistant: AI suggests drafts" : "Chat Assist is disabled"}
              onClick={() => {
                if (!isAssistantAllowed || !isChatAssistEnabled) return;
                setContactAiModes({ ...contactAiModes, [selectedContact]: "assistant" });
              }}
            >💬</button>
            <button
              className={`assistant-switch-btn ${currentAiMode === "auto" ? "active" : ""} ${!isAutoAllowed ? "disabled" : ""}`}
              title={isAutoAllowed ? "Auto-Reply: AI responds automatically" : "Auto-Reply requires full AI access for this contact"}
              onClick={() => {
                if (!isAutoAllowed) return;
                setContactAiModes({ ...contactAiModes, [selectedContact]: "auto" });
              }}
            >🔄</button>
          </div>
        </div>
      </header>
      <div className="messages">
        {messages.length === 0 ? (
          <p className="empty">No messages yet. Say hello!</p>
        ) : (
          messages.map((msg) => {
            const outgoing = isOutgoing(msg);
            return (
              <div key={msg.messageId} className={`message ${outgoing ? "outgoing" : "incoming"}`}>
                {!outgoing && <span className="message-sender">{peerDisplayLabel(msg.sender)}</span>}
                <span className="message-text">{msg.content.text}</span>
                <span className="message-time">{new Date(msg.metadata.timestamp).toLocaleTimeString()}</span>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} className="messages-scroll-anchor" aria-hidden />
      </div>
      <footer className="chat-input">
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
        <button type="button" onClick={() => void handleSendMessage()} disabled={isSendingChat || !chatInput.trim()}>
          {isSendingChat ? "Sending\u2026" : "Send"}
        </button>
      </footer>
    </>
  );
}
