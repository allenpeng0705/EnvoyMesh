import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useNodeState } from "../../context/NodeStateContext.js";
import { useNodeService, useChatMessages } from "../../hooks/useNodeService.js";
import { useChatDrafts } from "../../hooks/useChatDrafts.js";
import { usePeerReachability, peerReachabilityLabel } from "../../hooks/usePeerReachability.js";
import type { ChatMessage, ContactAiPreferences } from "@envoymesh/api";
import { contactAiAccessLevelForAssistantMode, stripModelThinking } from "@envoymesh/api";
import type { AssistantMode } from "../../lib/storage.js";
import { contactLabel, peerDisplayLabel } from "../../lib/display.js";
import { buildMessageStacks, stackPosition } from "../../lib/chat-message-stack.js";
import {
  messageVisualVariant,
  resolveChatThreadKind,
  threadKindLabel,
} from "../../lib/chat-thread-kind.js";
import { ChatMessageBubble } from "../ChatMessageBubble.js";
import { ChatMessageText } from "../ChatMessageText.js";
import { ChatFileAttachment } from "../ChatFileAttachment.js";
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
    refreshNodeConfig,
  } = useNodeState();

  const { messages, isOutgoing } = useChatMessages(selectedContact);
  const { info: peerReachability, checking: reachabilityChecking } = usePeerReachability(
    selectedContact,
    true,
  );
  const [pendingOutbound, setPendingOutbound] = useState<ChatMessage[]>([]);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const [chatInput, setChatInput] = useState("");
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

  const updateContactAiMode = useCallback(
    async (ownerId: string, mode: AssistantMode) => {
      setContactAiModes({ ...contactAiModes, [ownerId]: mode });

      const currentPrefs = nodeConfig?.contactAiPreferences ?? [];
      const existingPref = currentPrefs.find((p) => p.peerOwnerId === ownerId);
      const otherPrefs = currentPrefs.filter((p) => p.peerOwnerId !== ownerId);
      const aiAccessLevel = contactAiAccessLevelForAssistantMode(mode);
      const newPrefs: ContactAiPreferences[] = [
        ...otherPrefs,
        {
          peerOwnerId: ownerId,
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
    [contactAiModes, nodeConfig, nodeService, refreshNodeConfig, setContactAiModes],
  );

  const handleSendMessage = () => {
    const text = chatInput.trim();
    if (!text) return;

    if (!nodeMeshOnline) {
      setSendError("Your node is offline — start the node before sending.");
      setTimeout(() => setSendError(null), 5000);
      return;
    }

    if (text.startsWith("/ai ")) {
      const question = text.slice(4);
      void (async () => {
        try {
          const answer = await nodeService.knowledgeQuery(question);
          console.log("[ContactChatPanel] AI answer:", answer);
        } catch (e) {
          console.error("[ContactChatPanel] AI query failed:", e);
        }
      })();
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
    setSendError(null);

    void (async () => {
      try {
        const result = await nodeService.sendChat(selectedContact, text);
        setPendingOutbound((prev) =>
          prev.map((m) =>
            m.messageId === tempId
              ? {
                  ...m,
                  messageId: result.messageId,
                  metadata: { ...m.metadata, deliveryReceipt: "sent" as const },
                }
              : m,
          ),
        );
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
      }
    })();
  };

  const defaultContactAiMode: AssistantMode =
    nodeConfig?.aiSettings?.defaultModeForNewContacts ?? "manual";
  const currentAiMode: AssistantMode = contactAiModes[selectedContact] ?? defaultContactAiMode;
  const autoSendEnabled = (nodeConfig?.autonomousPolicies ?? []).some(
    (p) => p.domain === "social" && p.autoSendChat,
  );
  const canDraftAssist = (nodeConfig?.chatAssistEnabled ?? false) || autoSendEnabled;
  const canAutoSend = autoSendEnabled && !(nodeConfig?.autonomousKillSwitch ?? false);
  const showDraftSuggestions = canDraftAssist && currentAiMode === "assistant";
  const { latestDraft, dismissDraft } = useChatDrafts(
    selectedContact,
    showDraftSuggestions,
  );

  const handleUseDraft = () => {
    if (!latestDraft) return;
    setChatInput(stripModelThinking(latestDraft.text));
    void dismissDraft(latestDraft.draftId);
  };

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
          <div className="assistant-switch" aria-label={`AI mode: ${currentAiMode}`}>
            <span className="assistant-switch-label">AI</span>
            <button
              className={`assistant-switch-btn ${currentAiMode === "manual" ? "active" : ""}`}
              title="Manual: type yourself"
              aria-label="Manual mode"
              onClick={() => void updateContactAiMode(selectedContact, "manual")}
            ><EditIcon size={16} /></button>
            <button
              className={`assistant-switch-btn ${currentAiMode === "assistant" ? "active" : ""} ${!canDraftAssist ? "disabled" : ""}`}
              title={canDraftAssist ? "Assistant: AI suggests drafts" : "Enable Chat Assist or social auto-send in Settings"}
              aria-label="Assistant mode"
              onClick={() => {
                if (!canDraftAssist) return;
                void updateContactAiMode(selectedContact, "assistant");
              }}
            ><ChatIcon size={16} /></button>
            <button
              className={`assistant-switch-btn ${currentAiMode === "auto" ? "active" : ""} ${!canAutoSend ? "disabled" : ""}`}
              title={canAutoSend ? "Auto-reply: AI responds automatically" : "Enable social auto-send in Settings"}
              aria-label="Auto-reply mode"
              onClick={() => {
                if (!canAutoSend) return;
                void updateContactAiMode(selectedContact, "auto");
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
                          <ChatMessageText
                            text={msg.content.text}
                            allowThinkingToggle={outgoing}
                          />
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
      <div className="chat-composer">
        {latestDraft && (
          <div className="chat-draft-suggestion" role="region" aria-label="Suggested reply">
            <div className="chat-draft-suggestion-body">
              <span className="chat-draft-suggestion-label">Suggested reply</span>
              <p className="chat-draft-suggestion-text">{stripModelThinking(latestDraft.text)}</p>
            </div>
            <div className="chat-draft-suggestion-actions">
              <button
                type="button"
                className="secondary chat-draft-dismiss-btn"
                onClick={() => void dismissDraft(latestDraft.draftId)}
              >
                Dismiss
              </button>
              <button type="button" className="chat-draft-use-btn" onClick={handleUseDraft}>
                Use
              </button>
            </div>
          </div>
        )}
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
        {pendingOutbound.some((m) => m.metadata.deliveryReceipt === "pending") && (
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
              handleSendMessage();
            }
          }}
          enterKeyHint="send"
          disabled={!nodeMeshOnline}
        />
        <button
          type="button"
          onClick={handleSendMessage}
          disabled={!chatInput.trim() || !nodeMeshOnline}
        >
          Send
        </button>
      </footer>
      </div>
    </>
  );
}
