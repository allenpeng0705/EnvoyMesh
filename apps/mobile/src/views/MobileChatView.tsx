/**
 * MobileChatView — Mobile-native chat experience.
 *
 * Full-screen layout: collapsible contact list (top, max 40vh) +
 * chat panel (bottom, flex-1). Inline AI chat and contact chat.
 * Reuses useNodeState / useNodeService / useChatMessages hooks.
 */
import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { useT } from "@envoymesh/social/context/I18nContext.js";
import { useNodeState } from "@envoymesh/social/context/NodeStateContext.js";
import { useNodeService } from "@envoymesh/social/hooks/useNodeService.js";
import { useInboxActivityCount } from "@envoymesh/social/hooks/useInboxActivityCount.js";
import { useChatMessages } from "@envoymesh/social/hooks/useNodeService.js";
import { useChatThreadPreviews } from "@envoymesh/social/hooks/useChatThreadPreviews.js";
import { InboxView } from "@envoymesh/social/components/views/InboxView.js";
import { ShareFileDialog } from "@envoymesh/social/components/file-share/ShareFileDialog.js";
import { contactLabel, peerDisplayLabel } from "@envoymesh/social/lib/display.js";
import { Markdown } from "@envoymesh/social/components/Markdown.js";
import { ChatIcon, SendIcon, CheckIcon, CloseIcon, BridgeIcon, P2PIcon } from "@envoymesh/social/icons.js";
import type { ChatMessage, HelloProfile } from "@envoymesh/api";

// ---- Date helpers (same logic as ContactChatPanel) ----

const fmtDateLabel = (dateStr: string): string => {
  const d = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = (today.getTime() - target.getTime()) / 86400000;
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

const groupMessagesByDate = (msgs: ChatMessage[]): [string, ChatMessage[]][] => {
  const groups = new Map<string, ChatMessage[]>();
  for (const m of msgs) {
    const key = new Date(m.metadata?.timestamp ?? Date.now()).toLocaleDateString();
    const list = groups.get(key);
    if (list) list.push(m);
    else groups.set(key, [m]);
  }
  return [...groups.entries()];
};

const AI_CONTACT_ID = "__envoy_ai__";

type ChatPanelMode = "threads" | "inbox";

export interface MobileChatViewProps {
  /** When set (e.g. from Contacts), open this bonded peer's thread */
  focusPeerId?: string | null;
  onFocusPeerConsumed?: () => void;
}

export function MobileChatView({
  focusPeerId = null,
  onFocusPeerConsumed,
}: MobileChatViewProps) {
  const t = useT();
  const nodeService = useNodeService();
  const {
    bonds,
    bridgeStatus,
    pendingHellOs,
    pendingMessages,
    humanProfile,
    sendHello,
    acceptHello,
    declineHello,
    clearPendingMessages,
  } = useNodeState();

  const [selectedContact, setSelectedContact] = useState<string | null>(() => focusPeerId ?? null);
  const [panelMode, setPanelMode] = useState<ChatPanelMode>("threads");
  const [showContacts, setShowContacts] = useState(() => !focusPeerId);
  const [shareOpen, setShareOpen] = useState(false);
  const inboxActivityCount = useInboxActivityCount();
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [lastSent, setLastSent] = useState<Record<string, number>>({});

  // AI chat state
  const [aiMessages, setAiMessages] = useState<Array<{ role: "user" | "ai"; text: string }>>([]);
  const [aiLoading, setAiLoading] = useState(false);

  // Chat messages for selected contact
  const { messages, isOutgoing } = useChatMessages(
    selectedContact && selectedContact !== AI_CONTACT_ID ? selectedContact : null,
  );

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (focusPeerId == null) return;
    setSelectedContact(focusPeerId);
    setShowContacts(false);
    onFocusPeerConsumed?.();
  }, [focusPeerId, onFocusPeerConsumed]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, aiMessages]);

  // Duplicate-send guard (same logic as ContactChatPanel)
  const canSend = useCallback((target: string) => {
    const prev = lastSent[target] ?? 0;
    return Date.now() - prev > 1500;
  }, [lastSent]);

  const handleSendChat = useCallback(async () => {
    const text = input.trim();
    if (!text || !selectedContact || selectedContact === AI_CONTACT_ID) return;
    if (!canSend(selectedContact)) return;

    setInput("");
    setSending(true);
    navigator.vibrate?.(10);
    setLastSent((p) => ({ ...p, [selectedContact]: Date.now() }));
    try {
      if (text.startsWith("/ai ")) {
        await nodeService.knowledgeQuery(text.slice(4));
      } else {
        await nodeService.sendChat(selectedContact, text);
      }
    } catch (e) {
      console.error("[MobileChat] send failed:", e);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }, [input, selectedContact, canSend, nodeService]);

  // AI chat send
  const handleAiSend = useCallback(async () => {
    const text = input.trim();
    if (!text) return;
    setInput("");
    setAiMessages((p) => [...p, { role: "user", text }]);
    setAiLoading(true);
    try {
      const response = await nodeService.knowledgeQuery(text);
      setAiMessages((p) => [...p, { role: "ai", text: response }]);
    } catch (e) {
      console.error(e);
      setAiMessages((p) => [...p, { role: "ai", text: "Error: " + (e instanceof Error ? e.message : "unknown") }]);
    } finally {
      setAiLoading(false);
    }
  }, [input, nodeService]);

  const handleAcceptHello = useCallback(async (messageId: string) => {
    try { await acceptHello(messageId); } catch (e) { console.error(e); }
  }, [acceptHello]);

  const handleDeclineHello = useCallback(async (messageId: string) => {
    try { await declineHello(messageId); } catch (e) { console.error(e); }
  }, [declineHello]);

  const handleSayHello = useCallback(async (targetOwnerId: string) => {
    try {
      const profile: HelloProfile = {
        displayName: humanProfile?.displayName ?? "Envoy User",
        bio: humanProfile?.bio ?? "",
        interests: [...(humanProfile?.hobbies ?? []), ...(humanProfile?.knowledge ?? [])],
        whatShares: [],
      };
      await sendHello(targetOwnerId, profile, "Hello!");
    } catch (e) { console.error(e); }
  }, [humanProfile, sendHello]);

  const groupedMessages = useMemo(
    () => groupMessagesByDate(messages),
    [messages],
  );

  const bondPeerIds = useMemo(() => bonds.map((b) => b.peerOwnerId), [bonds]);
  const threadPreviews = useChatThreadPreviews(bondPeerIds);

  // ---- No contact selected ----
  if (!selectedContact) {
    if (panelMode === "inbox") {
      return (
        <div className="mv-chat">
          <div className="mv-chat-primary-tabs" aria-label="Chat or inbox">
            <button
              type="button"
              onClick={() => setPanelMode("threads")}
            >
              {t("mobile.chat.chats")}
            </button>
            <button
              type="button"
              className={`active${inboxActivityCount > 0 ? " has-inbox-tab" : ""}`}
            >
              {t("mobile.chat.inbox")}
              {inboxActivityCount > 0 ? (
                <span className="inbox-badge">{inboxActivityCount > 99 ? "99+" : inboxActivityCount}</span>
              ) : null}
            </button>
          </div>
          <div className="mv-chat-inbox-panel">
            <InboxView embedded />
          </div>
        </div>
      );
    }

    return (
      <div className="mv-chat">
        <div className="mv-chat-primary-tabs" aria-label="Chat or inbox">
          <button
            type="button"
            className="active"
            onClick={() => setPanelMode("threads")}
          >
            {t("mobile.chat.chats")}
          </button>
          <button
            type="button"
            className={inboxActivityCount > 0 ? "has-inbox-tab" : ""}
            onClick={() => setPanelMode("inbox")}
          >
            {t("mobile.chat.inbox")}
            {inboxActivityCount > 0 ? (
              <span className="inbox-badge">{inboxActivityCount > 99 ? "99+" : inboxActivityCount}</span>
            ) : null}
          </button>
        </div>
        <p className="mv-tab-hint">
          {t("mobile.chat.threadHint")}
        </p>
        {/* Contact list */}
        <div className={`mv-chat-contacts${showContacts ? "" : " collapsed"}`}>
          {/* AI contact */}
          <button
            className={`mv-contact-row`}
            onClick={() => { setSelectedContact(AI_CONTACT_ID); setShowContacts(false); }}
          >
            <div className="mv-contact-avatar ai">AI</div>
            <div className="mv-contact-info">
              <div className="mv-contact-name">{t("mobile.chat.aiName")}</div>
              <div className="mv-contact-preview">{t("mobile.chat.aiPrompt")}</div>
            </div>
          </button>

          {/* Pending Hellos */}
          {pendingHellOs.length > 0 && pendingHellOs.map((r) => (
            <div key={r.messageId} className="mv-contact-row mv-contact-pending">
              <div className="mv-contact-avatar">{r.profile.displayName[0]}</div>
              <div className="mv-contact-info">
                <div className="mv-contact-name">{r.profile.displayName}</div>
                <div className="mv-contact-preview">{t("mobile.chat.helloRequest")}</div>
              </div>
              <div style={{ display: "flex", gap: "var(--space-1)" }}>
                <button
                  className="mv-say-hello-btn"
                  onClick={(e) => { e.stopPropagation(); handleAcceptHello(r.messageId); }}
                  style={{ borderColor: "var(--color-success)", color: "var(--color-success)" }}
                >
                  <CheckIcon size={14} />
                </button>
                <button
                  className="mv-say-hello-btn"
                  onClick={(e) => { e.stopPropagation(); handleDeclineHello(r.messageId); }}
                  style={{ borderColor: "var(--color-danger)", color: "var(--color-danger)" }}
                >
                  <CloseIcon size={14} />
                </button>
              </div>
            </div>
          ))}

          {/* Pending messages */}
          {pendingMessages.length > 0 && pendingMessages.map((msg) => (
            <button
              key={msg.messageId}
              className="mv-contact-row mv-contact-pending"
              onClick={() => handleSayHello(msg.sender.ownerId ?? msg.sender.nodeId)}
            >
              <div className="mv-contact-avatar">
                {peerDisplayLabel(msg.sender).charAt(0) || "?"}
              </div>
              <div className="mv-contact-info">
                <div className="mv-contact-name">{peerDisplayLabel(msg.sender)}</div>
                <div className="mv-contact-preview">{msg.content?.text?.slice(0, 40) ?? ""}</div>
              </div>
            </button>
          ))}

          {/* Bonded contacts */}
          {bonds.map((contact) => {
            const pv = threadPreviews[contact.peerOwnerId];
            return (
              <button
                key={contact.peerOwnerId}
                className="mv-contact-row"
                onClick={() => { setSelectedContact(contact.peerOwnerId); setShowContacts(false); }}
              >
                <div className="mv-contact-avatar">
                  {contact.displayName?.[0] ?? "?"}
                </div>
                <div className="mv-contact-info">
                  <div className="mv-contact-name-row">
                    <div className="mv-contact-name">{contactLabel(contact)}</div>
                    {pv ? <span className="mv-contact-time">{pv.timeLabel}</span> : null}
                  </div>
                  {pv ? <div className="mv-contact-preview">{pv.text}</div> : null}
                </div>
              </button>
            );
          })}

          {/* Bridge agent */}
          {bridgeStatus?.enabled && (
            <button
              className="mv-contact-row"
              onClick={() => { setSelectedContact(bridgeStatus.agentPeerId); setShowContacts(false); }}
            >
              <div className="mv-contact-avatar">
                <BridgeIcon size={20} />
              </div>
              <div className="mv-contact-info">
                <div className="mv-contact-name">{bridgeStatus.agentName ?? "My Agent"}</div>
              </div>
            </button>
          )}

          {/* Empty state */}
          {bonds.length === 0 && pendingHellOs.length === 0 && pendingMessages.length === 0 && (
            <div className="mv-empty-state" style={{ padding: "var(--space-8) var(--space-4)" }}>
              <div className="mv-empty-state-icon"><ChatIcon size={40} /></div>
              <div className="mv-empty-state-title">{t("mobile.contacts.emptyTitle")}</div>
              <div className="mv-empty-state-desc">{t("mobile.chat.selectContactDesc")}</div>
            </div>
          )}
        </div>

        {/* Empty chat prompt */}
        <div className="mv-chat-panel">
          <div className="mv-empty-state" style={{ flex: 1 }}>
            <div className="mv-empty-state-icon"><ChatIcon size={48} /></div>
            <div className="mv-empty-state-title">{t("mobile.chat.selectContact")}</div>
            <div className="mv-empty-state-desc">{t("mobile.chat.selectContactDesc")}</div>
          </div>
        </div>
      </div>
    );
  }

  // ---- Chat active ----
  const contact = bonds.find((b) => b.peerOwnerId === selectedContact);
  const headerLabel = selectedContact === AI_CONTACT_ID
    ? t("mobile.chat.aiName")
    : contact
      ? contactLabel(contact)
      : selectedContact;

  return (
    <div className="mv-chat">
      {/* Chat header */}
      <div className="mv-chat-header">
        <button
          className="mv-say-hello-btn"
          onClick={() => { setSelectedContact(null); setShowContacts(true); }}
          style={{ border: "none", padding: "var(--space-1)", minWidth: "auto", fontSize: "var(--text-lg)" }}
        >
          &#8592;
        </button>
        <div className="mv-chat-header-name">{headerLabel}</div>
      </div>

      {/* Messages */}
      <div className="mv-chat-messages">
        {/* AI chat messages */}
        {selectedContact === AI_CONTACT_ID && aiMessages.map((msg, i) => (
          <div
            key={i}
            className={`mv-message ${msg.role === "user" ? "outgoing" : "incoming"}`}
          >
            {msg.role === "ai" && <div className="mv-message-sender">{t("mobile.chat.aiName")}</div>}
            <Markdown text={msg.text} className="message-text" />
          </div>
        ))}

        {/* Contact chat messages */}
        {selectedContact !== AI_CONTACT_ID && groupedMessages.map(([date, msgs]) => (
          <div key={date}>
            <div className="mv-date-separator">{fmtDateLabel(date)}</div>
            {msgs.map((msg) => {
              const outgoing = isOutgoing(msg);
              return (
                <div
                  key={msg.messageId}
                  className={`mv-message ${outgoing ? "outgoing" : "incoming"}`}
                >
                  {!outgoing && (
                    <div className="mv-message-sender">{peerDisplayLabel(msg.sender)}</div>
                  )}
                  <Markdown text={msg.content.text} className="message-text" />
                  <div className="mv-message-time">
                    {new Date(msg.metadata?.timestamp ?? Date.now()).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        ))}

        {/* AI loading indicator */}
        {aiLoading && (
          <div className="mv-message incoming">
            <div className="mv-message-sender">{t("mobile.chat.aiName")}</div>
            <div style={{ display: "flex", gap: "4px", padding: "4px 0" }}>
              <div className="mv-skeleton" style={{ width: 8, height: 8, borderRadius: "50%" }} />
              <div className="mv-skeleton" style={{ width: 8, height: 8, borderRadius: "50%", animationDelay: "0.15s" }} />
              <div className="mv-skeleton" style={{ width: 8, height: 8, borderRadius: "50%", animationDelay: "0.3s" }} />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input bar */}
      <div className="mv-chat-input">
        {shareOpen && selectedContact !== AI_CONTACT_ID && (
          <ShareFileDialog
            targetOwnerId={selectedContact}
            onClose={() => setShareOpen(false)}
          />
        )}
        {selectedContact !== AI_CONTACT_ID && (
          <button
            type="button"
            className="mv-chat-share-btn"
            aria-label={t("mobile.chat.shareFile")}
            onClick={() => setShareOpen(true)}
          >
            <P2PIcon size={20} />
          </button>
        )}
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (selectedContact === AI_CONTACT_ID) handleAiSend();
              else handleSendChat();
            }
          }}
          placeholder={
            selectedContact === AI_CONTACT_ID
              ? t("mobile.chat.askAi")
              : t("mobile.chat.typeMessage")
          }
          enterKeyHint="send"
          autoComplete="off"
          autoCorrect="off"
        />
        <button
          className="mv-chat-send"
          onClick={() => {
            if (selectedContact === AI_CONTACT_ID) handleAiSend();
            else handleSendChat();
          }}
          disabled={!input.trim() || sending}
        >
          <SendIcon size={18} />
        </button>
      </div>
    </div>
  );
}

export { MobileChatView as default };
