import { useState, useEffect, useRef, useCallback, useMemo, type ReactNode } from "react";
import { useT } from "../../context/I18nContext.js";
import { useNodeState } from "../../context/NodeStateContext.js";
import { useNodeService, useChatMessages } from "../../hooks/useNodeService.js";
import { useChatDrafts } from "../../hooks/useChatDrafts.js";
import { usePeerReachability, peerReachabilityLabel } from "../../hooks/usePeerReachability.js";
import { useCallSessionContext } from "../../context/CallSessionContext.js";
import type { ChatMessage, ContactAiPreferences } from "@envoymesh/api";
import {
  contactAiAccessLevelForAssistantMode,
  stripModelThinking,
  chatMessageTextForDisplay,
  MAX_CHAT_ATTACHMENT_BYTES,
  isContactComposeDraftSyncScope,
} from "@envoymesh/api";
import { createContactComposeDraftCrdt } from "../../lib/contact-compose-draft-crdt.js";
import { ContactPrivateNotesPanel } from "../ContactPrivateNotesPanel.js";
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
import { ChatAudioAttachment } from "../ChatAudioAttachment.js";
import { ShareFileDialog } from "../file-share/ShareFileDialog.js";
import { EditIcon, ChatIcon, BridgeIcon, P2PIcon, AttachIcon, RemoveIcon } from "../../icons.js";
import { ChatComposer } from "../ChatComposer.js";
import { VoiceNoteRecorderBar } from "../VoiceNoteRecorderBar.js";
import { useVoiceNoteRecorder } from "../../hooks/useVoiceNoteRecorder.js";
import { useToast } from "../../hooks/useToast.js";
import { PeerProfileAvatar } from "../PeerProfileAvatar.js";
import { PeerProfileGalleryStrip } from "../PeerProfileGalleryStrip.js";
import { PeerProfilePanel } from "../PeerProfilePanel.js";
import { RemoveContactConfirmModal } from "../RemoveContactConfirmModal.js";
import { ConfirmDialog } from "../ConfirmDialog.js";
import type { TFunction } from "../../context/I18nContext.js";
import {
  readPendingOutboundCache,
  writePendingOutboundCache,
} from "../../lib/chat-pending-outbound-cache.js";

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
    peerId,
  } = useNodeState();

  const { messages, isOutgoing, removeMessage, clearThread } = useChatMessages(selectedContact);
  const [pendingOutbound, setPendingOutboundState] = useState<ChatMessage[]>(() =>
    readPendingOutboundCache(selectedContact),
  );
  const setPendingOutbound = useCallback(
    (action: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => {
      setPendingOutboundState((prev) => {
        const next = typeof action === "function" ? action(prev) : action;
        writePendingOutboundCache(selectedContact, next);
        return next;
      });
    },
    [selectedContact],
  );
  useEffect(() => {
    setPendingOutboundState(readPendingOutboundCache(selectedContact));
  }, [selectedContact]);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const [chatInput, setChatInput] = useState("");
  const [notesOpen, setNotesOpen] = useState(false);
  const [confirm, setConfirm] = useState<{ title: string; message?: ReactNode; variant?: "default" | "destructive"; confirmLabel?: string; cancelLabel?: string; onConfirm: () => void } | null>(null);
  const draftRef = useRef<ReturnType<typeof createContactComposeDraftCrdt> | null>(null);
  const draftSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Tracks any pending "auto-clear sendError" timer so we can cancel it on
  // unmount and on subsequent errors. Fire-and-forget setTimeouts are a
  // common source of "setState on unmounted component" warnings — keep this
  // ref in sync with the latest scheduled timer.
  const sendErrorClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleClearSendError = useCallback((ms: number) => {
    if (sendErrorClearTimerRef.current !== null) {
      clearTimeout(sendErrorClearTimerRef.current);
    }
    sendErrorClearTimerRef.current = setTimeout(() => {
      sendErrorClearTimerRef.current = null;
      setSendError(null);
    }, ms);
  }, []);
  useEffect(() => {
    return () => {
      if (sendErrorClearTimerRef.current !== null) {
        clearTimeout(sendErrorClearTimerRef.current);
        sendErrorClearTimerRef.current = null;
      }
    };
  }, []);
  const selfOwnerId = humanProfile?.ownerId?.trim() ?? "";
  const ownerId = selfOwnerId || nodeConfig?.profileDir || "anonymous";
  const nodeServiceRef = useRef(nodeService);
  nodeServiceRef.current = nodeService;

  const pushDraftSync = useCallback((updateBase64: string, scope: string) => {
    if (draftSyncTimerRef.current) clearTimeout(draftSyncTimerRef.current);
    draftSyncTimerRef.current = setTimeout(() => {
      void nodeServiceRef.current.sendSyncStateUpdate({ scope, updateBase64 }).catch(() => {});
    }, 400);
  }, []);

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
  }, [ownerId, selectedContact]);

  useEffect(() => {
    return nodeService.on("crdt:sync", (data) => {
      if (!isContactComposeDraftSyncScope(data.scope)) return;
      if (data.scope === draftRef.current?.syncScope) {
        draftRef.current.applyRemoteUpdate(data.updateBase64);
      }
    });
  }, [nodeService]);

  const [shareOpen, setShareOpen] = useState(false);
  const [removeContactOpen, setRemoveContactOpen] = useState(false);
  const [attachBusy, setAttachBusy] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const lastChatSendRef = useRef<{ at: number; contact: string; text: string } | null>(null);

  const voiceRecorder = useVoiceNoteRecorder({
    onError: (code) => {
      setSendError(t(`audioMessage.${code}`));
      scheduleClearSendError(5000);
    },
  });

  useEffect(() => {
    voiceRecorder.cancel();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset when switching threads
  }, [selectedContact]);

  const nodeMeshOnline = connectionStatus?.online === true;

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

  const { info: peerReachability, checking: reachabilityChecking } = usePeerReachability(
    selectedContact,
    true,
  );
  const contactReachable = peerReachability?.connected === true;

  const isOutgoingMsg = useCallback(
    (msg: ChatMessage) => isPendingOutgoing(msg) || isOutgoing(msg),
    [isOutgoing],
  );

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [displayMessages]);

  useEffect(() => {
    setPendingOutbound((prev) => {
      if (prev.length === 0) return prev;
      return prev.filter((p) => {
        if (messages.some((m) => m.messageId === p.messageId)) return false;
        const needsReconcile =
          (p.metadata.deliveryReceipt === "failed" || p.metadata.deliveryReceipt === "pending") &&
          p.messageId.startsWith("pending-");
        if (needsReconcile) {
          const echoed = messages.some((m) => {
            if (!isOutgoing(m)) return false;
            if (p.messageId.startsWith("pending-voice-")) {
              const pendingFilename = p.content.attachments?.[0]?.filename;
              if (
                pendingFilename &&
                m.content.attachments?.some((att) => att.filename === pendingFilename)
              ) {
                return true;
              }
            }
            const pendingAttId = p.content.attachments?.[0]?.id;
            if (
              pendingAttId &&
              m.content.attachments?.some((att) => att.id === pendingAttId)
            ) {
              return true;
            }
            if (m.content.text !== p.content.text) return false;
            const delta = Math.abs(
              new Date(m.metadata.timestamp).getTime() - new Date(p.metadata.timestamp).getTime(),
            );
            return delta < 180_000;
          });
          if (echoed) return false;
        }
        if (p.metadata.deliveryReceipt === "pending" || p.metadata.deliveryReceipt === "failed") {
          return true;
        }
        return !messages.some((m) => m.messageId === p.messageId);
      });
    });
  }, [messages, isOutgoing]);

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
      scheduleClearSendError(5000);
      return;
    }

    if (text.startsWith("/ai ")) {
      const question = text.slice(4).trim();
      if (!question) return;
      void (async () => {
        try {
          const answer = await nodeService.knowledgeQuery(question);
          // Surface the answer via a toast — the dedicated Assistant view
          // (H2AChannelView) is the primary AI surface, but this slash
          // command gives quick inline feedback rather than silently
          // discarding the result.
          showToast(answer || t("contactChat.aiEmpty"), "info");
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          showToast(t("contactChat.aiFailed", { reason: msg }), "error");
        }
      })();
      setChatInput("");
      draftRef.current?.setPlainText("", { skipWireSync: true });
      return;
    }

    if (draftSyncTimerRef.current) {
      clearTimeout(draftSyncTimerRef.current);
      draftSyncTimerRef.current = null;
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
    draftRef.current?.setPlainText("", { skipWireSync: true });
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
        scheduleClearSendError(8000);
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

  const voiceNoteExtension = (mimeType: string) => (mimeType.includes("mp4") ? "m4a" : "webm");

  const handleSendVoiceNote = useCallback(async () => {
    if (voiceRecorder.phase === "sending") {
      return;
    }
    voiceRecorder.setSending();
    const capture = await voiceRecorder.finalizeCapture();
    if (!capture) {
      voiceRecorder.setIdle();
      return;
    }

    const { blob, mimeType, transcription } = capture;
    const ext = voiceNoteExtension(mimeType);
    const filename = `voice-note.${ext}`;

    try {
      const contentBase64 = await fileToBase64(new File([blob], `voice-${Date.now()}.${ext}`, { type: mimeType }));
      await nodeService.sendChatAttachment({
        targetOwnerId: selectedContact,
        filename,
        contentBase64,
        mimeType,
        chatText: transcription || "",
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("contactChat.sendFailed");
      setSendError(msg);
      scheduleClearSendError(8000);
    } finally {
      voiceRecorder.setIdle();
    }
  }, [
    nodeService,
    scheduleClearSendError,
    selectedContact,
    t,
    voiceRecorder.finalizeCapture,
    voiceRecorder.setIdle,
    voiceRecorder.setSending,
    voiceRecorder.phase,
  ]);

  const handleAttachFile = async (file: File) => {
    if (!nodeMeshOnline) {
      setSendError(t("contactChat.nodeOffline"));
      scheduleClearSendError(5000);
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
        draftRef.current?.setPlainText("", { skipWireSync: true });
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
    setConfirm({
      title: t("contactChat.deleteConfirm"),
      message: t("contactChat.deleteConfirmMessage"),
      variant: "destructive",
      confirmLabel: t("common.delete"),
      onConfirm: async () => {
        setConfirm(null);
        const ok = await removeMessage(messageId);
        if (ok) {
          showToast(t("contactChat.messageDeleted"), "success");
        } else {
          showToast(t("contactChat.deleteFailed"), "error");
        }
      },
    });
  };

  // Phase 38 — voice call (global UI in CallSessionProvider)
  const { startCall, callingState, activeCall } = useCallSessionContext();

  const threadKind = resolveChatThreadKind(selectedContact, bridgeStatus?.agentPeerId);
  const isBondedHumanContact =
    threadKind === "human" &&
    !selectedContact.startsWith("room:") &&
    Boolean(bonds.find((c) => c.peerOwnerId === selectedContact));

  const handleClearChat = async () => {
    if (displayMessages.length === 0) return;
    setConfirm({
      title: t("contactChat.clearConfirm"),
      message: t("contactChat.clearConfirmMessage"),
      variant: "destructive",
      confirmLabel: t("common.clear"),
      onConfirm: async () => {
        setConfirm(null);
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
      },
    });
  };

  const messageGroups = useMemo(() => groupMessagesByDate(displayMessages), [displayMessages]);
  const isHomeBridgeThread =
    Boolean(bridgeStatus?.enabled) && selectedContact === bridgeStatus?.agentPeerId;
  const showPathUnverifiedHint =
    isBondedHumanContact &&
    contactReachable &&
    peerReachability?.direct === true &&
    peerReachability?.pathVerified === false &&
    !reachabilityChecking &&
    !isHomeBridgeThread;

  const displayName =
    selectedContact === bridgeStatus?.agentPeerId
      ? (bridgeStatus.agentName || t("chat.myAgent"))
      : contactLabel(
          bonds.find((c) => c.peerOwnerId === selectedContact) ?? { peerOwnerId: selectedContact },
        );
  const headerInitial = displayName.trim().charAt(0).toUpperCase() || "?";

  const handleStartCall = useCallback(async () => {
    if (!selectedContact || !isBondedHumanContact) return;
    await startCall(selectedContact, displayName, "audio");
  }, [selectedContact, isBondedHumanContact, startCall, displayName]);

  const handleStartVideoCall = useCallback(async () => {
    if (!selectedContact || !isBondedHumanContact) return;
    await startCall(selectedContact, displayName, "video");
  }, [selectedContact, isBondedHumanContact, startCall, displayName]);

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

  const chatInputPlaceholder = !nodeMeshOnline
    ? t("contactChat.inputOffline")
    : !contactReachable && !reachabilityChecking
      ? isHomeBridgeThread
        ? t("contactChat.homeOfflineHint")
        : t("contactChat.contactOfflineHint")
      : t("contactChat.inputOnline");

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
            <span className={`chat-header-kind kind-${threadKind}`}>{threadKindLabel(threadKind, t)}</span>
            <span className={`contact-reachability ${reachabilityClass}`} title={t("contactChat.p2pPathTitle")}>
              <span className="contact-reachability-dot" aria-hidden />
              {isHomeBridgeThread && !contactReachable && !reachabilityChecking
                ? t("contactChat.homeOffline")
                : peerReachabilityLabel(peerReachability)}
            </span>
            {showPathUnverifiedHint ? (
              <p className="contact-path-unverified-hint">{t("contactChat.pathUnverifiedHint")}</p>
            ) : null}
          </div>
        </div>
        <div className="chat-header-right">
          {/* Phase 38 — voice call button (human contacts only) */}
          {isBondedHumanContact ? (
            <>
              <button
                type="button"
                className="chat-header-call-btn"
                title={
                  !contactReachable && !reachabilityChecking
                    ? t("call:offlineHint")
                    : t("call:start", "Voice call")
                }
                aria-label={t("call:startAria", { name: displayName })}
                disabled={Boolean(activeCall) || Boolean(callingState)}
                onClick={() => void handleStartCall()}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
              </button>
              <button
                type="button"
                className="chat-header-call-btn chat-header-call-btn--video"
                title={
                  !contactReachable && !reachabilityChecking
                    ? t("call:offlineHint")
                    : t("call:startVideo", "Video call")
                }
                aria-label={t("call:startVideoAria", { name: displayName })}
                disabled={Boolean(activeCall) || Boolean(callingState)}
                onClick={() => void handleStartVideoCall()}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" /></svg>
              </button>
            </>
          ) : null}
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
        <>
          <PeerProfileGalleryStrip ownerId={selectedContact} bondLevel={contactBondLevel} />
          <PeerProfilePanel ownerId={selectedContact} fallbackDisplayName={displayName} />
        </>
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
                          {msg.content.attachments?.map((attachment) => {
                            const isAudio = attachment.mimeType?.split(";")[0]?.startsWith("audio/") === true;
                            return isAudio ? (
                              <ChatAudioAttachment key={attachment.id} attachment={attachment} transcription={msg.content.text?.trim() || undefined} />
                            ) : (
                              <ChatFileAttachment key={attachment.id} attachment={attachment} />
                            );
                          })}
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
      <ContactPrivateNotesPanel
        ownerId={ownerId}
        contactOwnerId={selectedContact}
        open={notesOpen}
        onOpenChange={setNotesOpen}
      />
      <div className="chat-composer">
        {/* Floating overlays — render above the input row without pushing it down */}
        <div className="chat-composer-overlays">
          {sendError && <div className="chat-send-error">{sendError}</div>}
        </div>

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
        {shareOpen && (
          <ShareFileDialog
            targetOwnerId={selectedContact}
            onClose={() => setShareOpen(false)}
          />
        )}
        {voiceRecorder.phase !== "idle" ? (
          <VoiceNoteRecorderBar
            isCapturing={voiceRecorder.isCapturing}
            recordingSeconds={voiceRecorder.recordingSeconds}
            maxSeconds={voiceRecorder.maxSeconds}
            sending={voiceRecorder.phase === "sending"}
            onCancel={voiceRecorder.cancel}
            onSend={() => void handleSendVoiceNote()}
          />
        ) : (
          <ChatComposer
            value={chatInput}
            onChange={(next) => draftRef.current?.setPlainText(next)}
            onSend={handleSendMessage}
            placeholder={chatInputPlaceholder}
            sendLabel={t("contactChat.send")}
            disabled={!nodeMeshOnline}
            leading={
              <>
                <button
                  type="button"
                  className="secondary chat-mic-btn"
                  title={t("audioMessage.record")}
                  aria-label={t("audioMessage.record")}
                  disabled={!nodeMeshOnline}
                  onClick={() => void voiceRecorder.start()}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
                </button>
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
        )}
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
      {confirm ? (
        <ConfirmDialog
          title={confirm.title}
          message={confirm.message}
          variant={confirm.variant}
          confirmLabel={confirm.confirmLabel}
          cancelLabel={confirm.cancelLabel}
          onConfirm={confirm.onConfirm}
          onCancel={() => setConfirm(null)}
        />
      ) : null}
    </>
  );
}
