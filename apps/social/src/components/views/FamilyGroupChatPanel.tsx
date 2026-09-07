/**
 * Phase 51F follow-up — Family group room panel (owner desktop).
 * Thread key `room:<uuid>`; send via sendFamilyRoomMessage.
 * Header matches GroupChatPanel: AI switch + clear.
 * Composer matches FamilyChatPanel: mic + attach (family-media) + voice.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  OWNER_FAMILY_PROFILE_ID,
  contactAiAccessLevelForAssistantMode,
  isChatRoomThreadKey,
  parseChatRoomThreadKey,
  type ChatMessage,
  type ContactAiPreferences,
  type FamilyAttachmentDescriptor,
  type FamilyRoom,
  MAX_CHAT_ATTACHMENT_BYTES,
} from "@envoymesh/api";
import { useT } from "../../context/I18nContext.js";
import { useNodeState } from "../../context/NodeStateContext.js";
import { useChatMessages, useNodeService } from "../../hooks/useNodeService.js";
import { useChatStickToBottom } from "../../hooks/useChatStickToBottom.js";
import { useToast } from "../../hooks/useToast.js";
import { ChatComposer } from "../ChatComposer.js";
import { ChatComposerAttachMenu } from "../ChatComposerAttachMenu.js";
import { VoiceNoteRecorderBar } from "../VoiceNoteRecorderBar.js";
import { useVoiceNoteRecorder } from "../../hooks/useVoiceNoteRecorder.js";
import { ChatMessageBubble } from "../ChatMessageBubble.js";
import { ChatAudioAttachment } from "../ChatAudioAttachment.js";
import { ChatFileAttachment } from "../ChatFileAttachment.js";
import { ConfirmDialog } from "../ConfirmDialog.js";
import { ChatIcon, EditIcon, RemoveIcon } from "../../icons.js";
import { extractChatMessageText } from "../../lib/bridge-chat-message.js";
import { buildMessageStacks, stackPosition } from "../../lib/chat-message-stack.js";
import type { AssistantMode } from "../../lib/storage.js";

export interface FamilyGroupChatPanelProps {
  threadKey: string;
  room: FamilyRoom | undefined;
}

function initial(name: string): string {
  return (name.trim().charAt(0) || "?").toUpperCase();
}

async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

export function FamilyGroupChatPanel({ threadKey, room }: FamilyGroupChatPanelProps) {
  const t = useT();
  const nodeService = useNodeService();
  const { showToast } = useToast();
  const {
    nodeConfig,
    humanProfile,
    contactAiModes,
    setContactAiModes,
    refreshNodeConfig,
  } = useNodeState();
  const myProfileId =
    nodeConfig?.callerFamilyProfileId?.trim() || OWNER_FAMILY_PROFILE_ID;
  const roomId = parseChatRoomThreadKey(threadKey) ?? "";
  const title = room?.title?.trim() || t("chat.familyGroupFallback", "Family group");
  const memberCount = room?.memberProfileIds?.length ?? 0;

  const selfOwnerId = humanProfile?.ownerId?.trim() ?? "";
  const { messages, isOutgoing, clearThread } = useChatMessages(threadKey);
  const { containerRef, onScroll, pinToBottom } = useChatStickToBottom(
    threadKey,
    messages.length,
  );
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [pendingOutbound, setPendingOutbound] = useState<ChatMessage | null>(null);
  const [attachBusy, setAttachBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [confirm, setConfirm] = useState<{
    title: string;
    message?: string;
    variant?: "default" | "destructive";
    confirmLabel?: string;
    onConfirm: () => void;
  } | null>(null);

  const voiceRecorder = useVoiceNoteRecorder({
    onError: (code) => {
      setSendError(t(`chat.audioMessage.${code}`));
    },
  });

  const defaultGroupAiMode: AssistantMode =
    nodeConfig?.aiSettings?.defaultModeForNewContacts === "manual" ? "manual" : "assistant";
  const storedMode = contactAiModes[threadKey] ?? defaultGroupAiMode;
  const currentAiMode: AssistantMode = storedMode === "auto" ? "assistant" : storedMode;
  const canDraftAssist = nodeConfig?.chatAssistEnabled ?? false;

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
          ...(existingPref?.syndicationMaxSensitivity
            ? { syndicationMaxSensitivity: existingPref.syndicationMaxSensitivity }
            : {}),
          ...(mode !== "manual" && existingPref?.agentModeEnabled
            ? { agentModeEnabled: true }
            : {}),
        },
      ];
      const configPatch: {
        contactAiPreferences: ContactAiPreferences[];
        chatAssistEnabled?: boolean;
      } = { contactAiPreferences: newPrefs };
      if (mode === "assistant" && !nodeConfig?.chatAssistEnabled) {
        configPatch.chatAssistEnabled = true;
      }
      await nodeService.updateNodeConfig(configPatch);
      await refreshNodeConfig();
    },
    [contactAiModes, nodeConfig, nodeService, refreshNodeConfig, setContactAiModes, threadKey],
  );

  const displayMessages = useMemo(() => {
    const filtered = messages.filter((msg) => {
      return (
        extractChatMessageText(msg).trim().length > 0 ||
        (msg.content.attachments?.length ?? 0) > 0
      );
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

  const handleClearChat = () => {
    if (displayMessages.length === 0) return;
    setConfirm({
      title: t("contactChat.clearConfirm"),
      message: t("contactChat.clearConfirmMessage"),
      variant: "destructive",
      confirmLabel: t("common.clear"),
      onConfirm: () => {
        setConfirm(null);
        void clearThread().then((deletedCount) => {
          setPendingOutbound(null);
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
      setPendingOutbound(null);
      setDraft(text);
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

  const uploadAndSendFamilyAttachment = useCallback(
    async (file: File, caption?: string) => {
      if (!roomId || !nodeService.uploadFamilyAttachment || !nodeService.sendFamilyRoomMessage) {
        setSendError(
          t("chat.familyGroupSendUnavailable", "Family groups are not available on this connection."),
        );
        return;
      }
      if (file.size > MAX_CHAT_ATTACHMENT_BYTES) {
        showToast(
          t("contactChat.fileTooLarge", {
            maxMb: Math.round(MAX_CHAT_ATTACHMENT_BYTES / (1024 * 1024)),
          }),
          "error",
        );
        return;
      }
      pinToBottom();
      setAttachBusy(true);
      setSendError(null);
      try {
        const contentBase64 = await fileToBase64(file);
        const uploaded = await nodeService.uploadFamilyAttachment({
          scope: { room: { roomId } },
          filename: file.name,
          mimeType: file.type || "application/octet-stream",
          contentBase64,
        });
        const descriptor: FamilyAttachmentDescriptor = {
          id: uploaded.id,
          filename: uploaded.filename,
          mimeType: uploaded.mimeType,
          sizeBytes: uploaded.sizeBytes,
          contentHash: uploaded.contentHash,
        };
        await nodeService.sendFamilyRoomMessage({
          roomId,
          text: caption?.trim() || undefined,
          attachments: [descriptor],
        });
        if (caption?.trim()) setDraft("");
        showToast(t("contactChat.sendingFile", { filename: file.name }), "success");
      } catch (err) {
        const msg = err instanceof Error ? err.message : t("contactChat.sendFileFailed");
        setSendError(msg);
        showToast(msg, "error");
      } finally {
        setAttachBusy(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    },
    [nodeService, pinToBottom, roomId, showToast, t],
  );

  const handleAttachFile = useCallback(
    (file: File) => {
      void uploadAndSendFamilyAttachment(file, draft);
    },
    [draft, uploadAndSendFamilyAttachment],
  );

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
      await uploadAndSendFamilyAttachment(
        new File([blob], filename, { type: mimeType }),
        transcription || undefined,
      );
    } catch (err) {
      setSendError(err instanceof Error ? err.message : t("contactChat.sendFailed"));
    } finally {
      voiceRecorder.setIdle();
    }
  }, [pinToBottom, roomId, t, uploadAndSendFamilyAttachment, voiceRecorder]);

  if (!isChatRoomThreadKey(threadKey) || !roomId) {
    return (
      <div className="no-chat-selected">
        <h3>{t("chat.familyGroupInvalidTitle", "Invalid family group")}</h3>
        <p>{t("chat.familyGroupInvalidDesc", "This family group thread key is not valid.")}</p>
      </div>
    );
  }

  const inactive = room?.active === false;
  const composerLocked = sending || inactive || attachBusy;

  return (
    <>
      <header className="chat-header has-assistant-switch">
        <div className="chat-header-main">
          <div className="chat-header-left">
            <span className="chat-header-avatar kind-group" style={{ background: "#0d9488" }} aria-hidden>
              {initial(title)}
            </span>
            <div className="chat-header-titles">
              <span className="chat-name">{title}</span>
              <span className="chat-header-kind kind-group">
                {inactive
                  ? t("chat.familyGroupInactive", "Inactive group")
                  : t("chat.familyGroupSubtitle", "{{count}} members · Family", {
                      count: memberCount,
                    })}
              </span>
            </div>
          </div>
          <div className="chat-header-actions-row">
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
          <span className="chat-header-web-links-spacer" aria-hidden="true" />
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
                        {msg.content.attachments?.map((attachment) => {
                          const isAudio =
                            attachment.mimeType?.split(";")[0]?.startsWith("audio/") === true;
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
              value={draft}
              onChange={setDraft}
              onSend={() => {
                void handleSend();
              }}
              placeholder={t("chat.familyGroupComposePlaceholder", "Message family group…")}
              sendLabel={t("common.send", "Send")}
              disabled={composerLocked}
              sendDisabled={!draft.trim() || composerLocked}
              leading={
                <>
                  <button
                    type="button"
                    className="chat-composer-icon-btn chat-mic-btn"
                    title={t("chat.audioMessage.record")}
                    aria-label={t("chat.audioMessage.record")}
                    disabled={composerLocked}
                    onClick={() => void voiceRecorder.start()}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
                  </button>
                  <ChatComposerAttachMenu
                    attachDisabled={composerLocked}
                    showShareVault={false}
                    onAttachFile={() => fileInputRef.current?.click()}
                  />
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="chat-file-input-hidden"
                    accept="*/*"
                    aria-hidden
                    tabIndex={-1}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleAttachFile(file);
                      e.target.value = "";
                    }}
                  />
                </>
              }
            />
          )}
        </footer>
      </div>

      {confirm ? (
        <ConfirmDialog
          title={confirm.title}
          message={confirm.message}
          variant={confirm.variant}
          confirmLabel={confirm.confirmLabel}
          onConfirm={confirm.onConfirm}
          onCancel={() => setConfirm(null)}
        />
      ) : null}
    </>
  );
}
