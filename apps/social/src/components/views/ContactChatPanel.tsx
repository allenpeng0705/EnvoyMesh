import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useT } from "../../context/I18nContext.js";
import { useNodeState } from "../../context/NodeStateContext.js";
import { useNodeService, useChatMessages } from "../../hooks/useNodeService.js";
import { useChatDrafts } from "../../hooks/useChatDrafts.js";
import { usePeerReachability, peerReachabilityLabel } from "../../hooks/usePeerReachability.js";
import type { ChatMessage, ContactAiPreferences } from "@envoymesh/api";
import {
  contactAiAccessLevelForAssistantMode,
  stripModelThinking,
  chatMessageTextForDisplay,
  MAX_CHAT_ATTACHMENT_BYTES,
  isContactComposeDraftSyncScope,
  isContactNotesSyncScope,
} from "@envoymesh/api";
import { createContactComposeDraftCrdt } from "../../lib/contact-compose-draft-crdt.js";
import { createContactNotesCrdt } from "../../lib/contact-notes-crdt.js";
import type { AssistantMode } from "../../lib/storage.js";
import { contactLabel, peerDisplayLabel } from "../../lib/display.js";
import { buildMessageStacks, stackPosition } from "../../lib/chat-message-stack.js";
import {
  resolveChatThreadKind,
  threadKindLabel,
} from "../../lib/chat-thread-kind.js";
import {
  normalizeEnvoyDisclosureSettings,
  resolveChatBubblePresentation,
} from "@envoymesh/api";
import { ChatMessageBubble } from "../ChatMessageBubble.js";
import { ChatMessageText } from "../ChatMessageText.js";
import { ChatFileAttachment } from "../ChatFileAttachment.js";
import { ShareFileDialog } from "../file-share/ShareFileDialog.js";
import { EditIcon, ChatIcon, BridgeIcon, P2PIcon, AttachIcon, RemoveIcon } from "../../icons.js";
import { ChatComposer } from "../ChatComposer.js";
import { useToast } from "../../hooks/useToast.js";
import { PeerProfileAvatar } from "../PeerProfileAvatar.js";
import { PeerProfileGalleryStrip } from "../PeerProfileGalleryStrip.js";
import { RemoveContactConfirmModal } from "../RemoveContactConfirmModal.js";
import type { TFunction } from "../../context/I18nContext.js";

interface ContactChatPanelProps {
  selectedContact: string;
  onSelectContact: (id: string | null) => void;
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

export function ContactChatPanel({ selectedContact, onSelectContact }: ContactChatPanelProps) {
  const t = useT();
  const nodeService = useNodeService();
  const { showToast } = useToast();
  const {
    bonds,
    nodeConfig,
    bridgeStatus,
    contactAiModes,
    setContactAiModes,
    connectionStatus,
    refreshNodeConfig,
    humanProfile,
  } = useNodeState();

  const { messages, isOutgoing, removeMessage, clearThread } = useChatMessages(selectedContact);
  const { info: peerReachability, checking: reachabilityChecking } = usePeerReachability(
    selectedContact,
    true,
  );
  const [pendingOutbound, setPendingOutbound] = useState<ChatMessage[]>([]);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const [chatInput, setChatInput] = useState("");
  const [contactNote, setContactNote] = useState("");
  const [contactTags, setContactTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [notesOpen, setNotesOpen] = useState(false);
  const draftRef = useRef<ReturnType<typeof createContactComposeDraftCrdt> | null>(null);
  const notesRef = useRef<ReturnType<typeof createContactNotesCrdt> | null>(null);
  const draftSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notesSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ownerId = humanProfile?.ownerId ?? nodeConfig?.profileDir ?? "anonymous";

  const pushDraftSync = useCallback(
    (updateBase64: string, scope: string) => {
      if (draftSyncTimerRef.current) clearTimeout(draftSyncTimerRef.current);
      draftSyncTimerRef.current = setTimeout(() => {
        void nodeService.sendSyncStateUpdate({ scope, updateBase64 }).catch(() => {});
      }, 400);
    },
    [nodeService],
  );

  const pushNotesSync = useCallback(
    (updateBase64: string, scope: string) => {
      if (notesSyncTimerRef.current) clearTimeout(notesSyncTimerRef.current);
      notesSyncTimerRef.current = setTimeout(() => {
        void nodeService.sendSyncStateUpdate({ scope, updateBase64 }).catch(() => {});
      }, 400);
    },
    [nodeService],
  );

  useEffect(() => {
    const notes = createContactNotesCrdt(ownerId, selectedContact, {
      onLocalUpdate: pushNotesSync,
      onChange: () => {
        setContactNote(notes.getNote());
        setContactTags(notes.getTags());
      },
    });
    notesRef.current = notes;
    setContactNote(notes.getNote());
    setContactTags(notes.getTags());
    return () => {
      notes.destroy();
      notesRef.current = null;
    };
  }, [ownerId, selectedContact, pushNotesSync]);

  useEffect(() => {
    const draft = createContactComposeDraftCrdt(ownerId, selectedContact, {
      onLocalUpdate: pushDraftSync,
    });
    draftRef.current = draft;
    setChatInput(draft.getPlainText());
    const onDraftChange = () => setChatInput(draft.getPlainText());
    draft.text.observe(onDraftChange);
    return () => {
      if (draftSyncTimerRef.current) clearTimeout(draftSyncTimerRef.current);
      draft.text.unobserve(onDraftChange);
      draft.destroy();
      draftRef.current = null;
    };
  }, [ownerId, selectedContact, pushDraftSync]);

  useEffect(() => {
    return nodeService.on("crdt:sync", (data) => {
      if (isContactComposeDraftSyncScope(data.scope)) {
        if (data.scope === draftRef.current?.syncScope) {
          draftRef.current.applyRemoteUpdate(data.updateBase64);
        }
        return;
      }
      if (isContactNotesSyncScope(data.scope) && data.scope === notesRef.current?.syncScope) {
        notesRef.current.applyRemoteUpdate(data.updateBase64);
      }
    });
  }, [nodeService]);

  const [shareOpen, setShareOpen] = useState(false);
  const [removeContactOpen, setRemoveContactOpen] = useState(false);
  const [attachBusy, setAttachBusy] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
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
      setSendError(t("contactChat.nodeOffline"));
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
      draftRef.current?.setPlainText("");
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
      sender: { nodeId: "", ownerId: "", displayName: t("messageBubble.you") },
      recipient: { nodeId: "", ownerId: selectedContact, displayName: selectedContact },
      content: { text },
      metadata: { timestamp: new Date().toISOString(), deliveryReceipt: "pending" },
      signature: "",
    };

    setPendingOutbound((prev) => [...prev, pendingMsg]);
    setChatInput("");
    draftRef.current?.setPlainText("");
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
                  metadata: {
                    ...m.metadata,
                    deliveryReceipt:
                      result.deliveryReceipt === "delivered"
                        ? ("delivered" as const)
                        : ("sent" as const),
                  },
                }
              : m,
          ),
        );
      } catch (error) {
        const msg = error instanceof Error ? error.message : t("contactChat.sendFailed");
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
  const aiIdentity = nodeConfig?.aiSettings?.identity;
  const disclosure = normalizeEnvoyDisclosureSettings(nodeConfig?.aiSettings?.disclosure);
  const showDraftSuggestions = canDraftAssist && currentAiMode === "assistant";
  const { latestDraft, dismissDraft } = useChatDrafts(
    selectedContact,
    showDraftSuggestions,
  );

  const handleUseDraft = () => {
    if (!latestDraft) return;
    const text = chatMessageTextForDisplay(stripModelThinking(latestDraft.text), aiIdentity);
    draftRef.current?.setPlainText(text);
    setChatInput(text);
    void dismissDraft(latestDraft.draftId);
  };

  const fileToBase64 = async (file: File): Promise<string> => {
    const buf = await file.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
    return btoa(binary);
  };

  const handleAttachFile = async (file: File) => {
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
    setAttachBusy(true);
    setSendError(null);
    try {
      const contentBase64 = await fileToBase64(file);
      const caption = chatInput.trim() || undefined;
      await nodeService.sendChatAttachment({
        targetOwnerId: selectedContact,
        filename: file.name,
        contentBase64,
        mimeType: file.type || undefined,
        caption,
      });
      if (caption) {
        setChatInput("");
        draftRef.current?.setPlainText("");
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

  const handleDeleteMessage = async (messageId: string) => {
    if (messageId.startsWith("pending-")) {
      setPendingOutbound((prev) => prev.filter((m) => m.messageId !== messageId));
      return;
    }
    if (!window.confirm(t("contactChat.deleteConfirm"))) return;
    const ok = await removeMessage(messageId);
    if (ok) {
      showToast(t("contactChat.messageDeleted"), "success");
    } else {
      showToast(t("contactChat.deleteFailed"), "error");
    }
  };

  const handleClearChat = async () => {
    if (displayMessages.length === 0) return;
    if (!window.confirm(t("contactChat.clearConfirm"))) {
      return;
    }
    const deletedCount = await clearThread();
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
  };

  const messageGroups = useMemo(() => groupMessagesByDate(displayMessages), [displayMessages]);

  const threadKind = resolveChatThreadKind(selectedContact, bridgeStatus?.agentPeerId);
  const isBondedHumanContact =
    threadKind === "human" &&
    !selectedContact.startsWith("room:") &&
    Boolean(bonds.find((c) => c.peerOwnerId === selectedContact));
  const isHomeBridgeThread =
    Boolean(bridgeStatus?.enabled) && selectedContact === bridgeStatus?.agentPeerId;
  const displayName =
    selectedContact === bridgeStatus?.agentPeerId
      ? (bridgeStatus.agentName ?? t("chat.myAgent"))
      : contactLabel(
          bonds.find((c) => c.peerOwnerId === selectedContact) ?? { peerOwnerId: selectedContact },
        );
  const headerInitial = displayName.trim().charAt(0).toUpperCase() || "?";

  const contactBond = bonds.find((c) => c.peerOwnerId === selectedContact);

  useEffect(() => {
    if (threadKind === "agent" || threadKind === "ai") return;
    const pullProfile = () => {
      void nodeService.requestPeerProfile(selectedContact).catch(() => {});
    };
    pullProfile();
    const refreshTimer = window.setInterval(pullProfile, 20_000);
    const unsubDelivered = nodeService.on?.("chat:delivered", (data: { messageId: string }) => {
      setPendingOutbound((prev) =>
        prev.map((m) =>
          m.messageId === data.messageId
            ? { ...m, metadata: { ...m.metadata, deliveryReceipt: "delivered" as const } }
            : m,
        ),
      );
    });
    return () => {
      window.clearInterval(refreshTimer);
      unsubDelivered?.();
    };
  }, [nodeService, selectedContact, threadKind]);
  const contactBondLevel = contactBond?.level ?? "public";

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
          {threadKind === "agent" ? (
            <span className={`chat-header-avatar kind-${threadKind}`} aria-hidden>
              {headerInitial}
            </span>
          ) : (
            <PeerProfileAvatar
              ownerId={selectedContact}
              fallbackLabel={displayName}
              className={`chat-header-avatar kind-${threadKind}`}
            />
          )}
          <div className="chat-header-titles">
            <span className="chat-name">{displayName}</span>
            <span className={`chat-header-kind kind-${threadKind}`}>{threadKindLabel(threadKind)}</span>
            <span className={`contact-reachability ${reachabilityClass}`} title={t("contactChat.p2pPathTitle")}>
              <span className="contact-reachability-dot" aria-hidden />
              {isHomeBridgeThread && !contactReachable && !reachabilityChecking
                ? t("contactChat.homeOffline")
                : peerReachabilityLabel(peerReachability)}
            </span>
          </div>
        </div>
        <div className="chat-header-right">
          {isBondedHumanContact ? (
            <button
              type="button"
              className="chat-header-remove-contact-btn"
              title={t("contactChat.removeContactTitle")}
              aria-label={t("contactChat.removeContactAria", { name: displayName })}
              onClick={() => setRemoveContactOpen(true)}
            >
              {t("contacts.remove")}
            </button>
          ) : null}
          <button
            type="button"
            className="chat-header-clear-btn"
            title={t("contactChat.clearAllTitle")}
            aria-label={t("contactChat.clearAllAria")}
            disabled={displayMessages.length === 0}
            onClick={() => void handleClearChat()}
          >
            <RemoveIcon size={16} />
          </button>
          <div className="assistant-switch" aria-label={t("contactChat.aiModeLabel", { mode: currentAiMode })}>
            <span className="assistant-switch-label">AI</span>
            <button
              className={`assistant-switch-btn ${currentAiMode === "manual" ? "active" : ""}`}
              title={t("contactChat.manualTitle")}
              aria-label={t("contactChat.manualAria")}
              onClick={() => void updateContactAiMode(selectedContact, "manual")}
            ><EditIcon size={16} /></button>
            <button
              className={`assistant-switch-btn ${currentAiMode === "assistant" ? "active" : ""} ${!canDraftAssist ? "disabled" : ""}`}
              title={canDraftAssist ? t("contactChat.assistantTitle") : t("contactChat.assistantDisabledTitle")}
              aria-label={t("contactChat.assistantAria")}
              onClick={() => {
                if (!canDraftAssist) return;
                void updateContactAiMode(selectedContact, "assistant");
              }}
            ><ChatIcon size={16} /></button>
            <button
              className={`assistant-switch-btn ${currentAiMode === "auto" ? "active" : ""} ${!canAutoSend ? "disabled" : ""}`}
              title={canAutoSend ? t("contactChat.autoTitle") : t("contactChat.autoDisabledTitle")}
              aria-label={t("contactChat.autoAria")}
              onClick={() => {
                if (!canAutoSend) return;
                void updateContactAiMode(selectedContact, "auto");
              }}
            ><BridgeIcon size={16} /></button>
          </div>
        </div>
      </header>
      {threadKind !== "agent" && (
        <PeerProfileGalleryStrip ownerId={selectedContact} bondLevel={contactBondLevel} />
      )}
      <div className="messages">
        {displayMessages.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <ChatIcon size={40} />
            </div>
            <div className="empty-state-title">{t("chat.noMessagesYet")}</div>
            <div className="empty-state-desc">{t("contactChat.emptyDesc")}</div>
          </div>
        ) : (
          messageGroups.map(([dateKey, msgs]) => (
            <div key={dateKey} className="chat-day-group">
              <div className="date-separator"><span>{fmtDateLabel(msgs[0].metadata.timestamp, t)}</span></div>
              {buildMessageStacks(msgs, (a, b) => isOutgoingMsg(a) === isOutgoingMsg(b)).map((stack) => {
                const outgoing = isOutgoingMsg(stack[0]);
                const presentation = resolveChatBubblePresentation(
                  {
                    actorRole: stack[0].sender.actorRole,
                    agentVerified: stack[0].sender.agentVerified,
                    outgoing,
                    contactDisplayName: peerDisplayLabel(stack[0].sender),
                    threadKind,
                  },
                  disclosure,
                );
                const variant = presentation.variant;
                const actorBadge = presentation.actorBadge;
                const senderInitial = peerDisplayLabel(stack[0].sender).charAt(0).toUpperCase() || "?";
                return (
                  <div
                    key={stack[0].messageId}
                    className={`message-stack-row ${outgoing ? "is-outgoing" : "is-incoming"}`}
                  >
                    {!outgoing && (
                      threadKind === "agent" ? (
                        <span className="message-stack-avatar agent" aria-hidden>
                          {senderInitial}
                        </span>
                      ) : (
                        <PeerProfileAvatar
                          ownerId={selectedContact}
                          fallbackLabel={peerDisplayLabel(stack[0].sender)}
                          className="message-stack-avatar peer"
                        />
                      )
                    )}
                    <div className="message-stack-bubbles">
                      {stack.map((msg, index) => (
                        <ChatMessageBubble
                          key={msg.messageId}
                          variant={variant}
                          position={stackPosition(index, stack.length)}
                          senderLabel={peerDisplayLabel(msg.sender)}
                          actorBadge={actorBadge}
                          timeLabel={new Date(msg.metadata.timestamp).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                          deliveryReceipt={outgoing ? msg.metadata.deliveryReceipt : undefined}
                          copyText={chatMessageTextForDisplay(
                            stripModelThinking(msg.content.text),
                            aiIdentity,
                          )}
                          onDelete={() => void handleDeleteMessage(msg.messageId)}
                        >
                          <ChatMessageText text={msg.content.text} identity={aiIdentity} />
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
      <details
        className="contact-notes-panel"
        open={notesOpen}
        onToggle={(event) => setNotesOpen((event.target as HTMLDetailsElement).open)}
      >
        <summary>{t("contactChat.privateNotesSummary")}</summary>
        <textarea
          className="contact-notes-input"
          rows={3}
          placeholder={t("contactChat.privateNotesPlaceholder")}
          value={contactNote}
          onChange={(e) => notesRef.current?.setNote(e.target.value)}
        />
        <div className="contact-notes-tags">
          {contactTags.map((tag) => (
            <button
              key={tag}
              type="button"
              className="contact-notes-tag"
              onClick={() => notesRef.current?.removeTag(tag)}
              title={t("contactChat.removeTagTitle")}
            >
              {tag} ×
            </button>
          ))}
        </div>
        <div className="contact-notes-tag-add">
          <input
            type="text"
            className="contact-notes-tag-input"
            placeholder={t("contactChat.addTagPlaceholder")}
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              const value = tagInput.trim();
              if (!value) return;
              notesRef.current?.addTag(value);
              setTagInput("");
            }}
          />
          <button
            type="button"
            className="secondary"
            onClick={() => {
              const value = tagInput.trim();
              if (!value) return;
              notesRef.current?.addTag(value);
              setTagInput("");
            }}
          >
            {t("contactChat.addTagBtn")}
          </button>
        </div>
      </details>
      <div className="chat-composer">
        {latestDraft && (
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
        )}
      <footer className="chat-input">
        {sendError && <div className="chat-send-error">{sendError}</div>}
        {!contactReachable && nodeMeshOnline && !reachabilityChecking && (
          <div className="chat-reachability-hint">
            {isHomeBridgeThread
              ? t("contactChat.homeOfflineHint")
              : t("contactChat.contactOfflineHint")}
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
        <ChatComposer
          value={chatInput}
          onChange={(next) => draftRef.current?.setPlainText(next)}
          onSend={handleSendMessage}
          placeholder={nodeMeshOnline ? t("contactChat.inputOnline") : t("contactChat.inputOffline")}
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
              <button
                type="button"
                className="secondary chat-share-file-btn"
                title={t("contactChat.shareVaultTitle")}
                aria-label={t("contactChat.shareVaultAria")}
                onClick={() => setShareOpen(true)}
              >
                <P2PIcon size={18} />
              </button>
            </>
          }
        />
      </footer>
      </div>
      {removeContactOpen && isBondedHumanContact ? (
        <RemoveContactConfirmModal
          peerOwnerId={selectedContact}
          displayName={displayName}
          onClose={() => setRemoveContactOpen(false)}
          onRemoved={() => {
            showToast(t("contactChat.removeContactSuccess"), "success");
            onSelectContact(null);
          }}
        />
      ) : null}
    </>
  );
}
