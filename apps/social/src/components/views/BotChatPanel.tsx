/**
 * Chat panel for a dynamic AI character bot (`bot:<id>` thread).
 * Sends via `sendToAiBot`; history comes from the shared chat log.
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  aiBotThreadKey,
  parseBotIdFromThreadKey,
  stripModelThinking,
  type AiBotDefinition,
  type ChatMessage,
} from "@envoymesh/api";
import { useT } from "../../context/I18nContext.js";
import { useNodeState } from "../../context/NodeStateContext.js";
import { useChatMessages, useNodeService } from "../../hooks/useNodeService.js";
import { useChatStickToBottom } from "../../hooks/useChatStickToBottom.js";
import { useToast } from "../../hooks/useToast.js";
import { ChatComposer } from "../ChatComposer.js";
import { ChatMessageBubble } from "../ChatMessageBubble.js";
import { ConfirmDialog } from "../ConfirmDialog.js";
import { ChatIcon, RemoveIcon } from "../../icons.js";
import { extractChatMessageText } from "../../lib/bridge-chat-message.js";
import { buildMessageStacks, stackPosition } from "../../lib/chat-message-stack.js";

export interface BotChatPanelProps {
  /** Thread key `bot:<id>` or bare bot id. */
  threadKey: string;
}

function botInitial(name: string): string {
  const ch = name.trim().charAt(0);
  return (ch || "?").toUpperCase();
}

export function BotChatPanel({ threadKey }: BotChatPanelProps) {
  const t = useT();
  const nodeService = useNodeService();
  const { showToast } = useToast();
  const { nodeConfig, humanProfile } = useNodeState();
  const botId = parseBotIdFromThreadKey(threadKey) ?? threadKey.replace(/^bot:/, "");
  const normalizedKey = aiBotThreadKey(botId);
  const modelDisabled = nodeConfig?.modelProviders?.mode === "disabled";
  const selfOwnerId = humanProfile?.ownerId?.trim() ?? "";

  const bot: AiBotDefinition | undefined = useMemo(() => {
    const list = nodeConfig?.aiBots ?? [];
    return list.find((b) => b.id === botId && b.enabled !== false);
  }, [nodeConfig?.aiBots, botId]);

  const { messages, isOutgoing, clearThread } = useChatMessages(normalizedKey);
  const { containerRef, onScroll, pinToBottom } = useChatStickToBottom(
    normalizedKey,
    messages.length,
  );
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [pendingOutbound, setPendingOutbound] = useState<ChatMessage | null>(null);
  const [confirm, setConfirm] = useState<{
    title: string;
    message?: ReactNode;
    variant?: "default" | "destructive";
    confirmLabel?: string;
    onConfirm: () => void;
  } | null>(null);

  const displayMessages = useMemo(() => {
    const filtered = messages.filter((msg) => {
      const text = stripModelThinking(extractChatMessageText(msg));
      return text.trim().length > 0;
    });
    if (!pendingOutbound) return filtered;
    const pendingText = extractChatMessageText(pendingOutbound).trim();
    const echoed = filtered.some(
      (m) =>
        isOutgoing(m) &&
        extractChatMessageText(m).trim() === pendingText,
    );
    if (echoed) return filtered;
    return [...filtered, pendingOutbound];
  }, [isOutgoing, messages, pendingOutbound]);

  useEffect(() => {
    if (!pendingOutbound) return;
    const pendingText = extractChatMessageText(pendingOutbound).trim();
    const echoed = messages.some(
      (m) =>
        isOutgoing(m) &&
        extractChatMessageText(m).trim() === pendingText,
    );
    if (echoed) setPendingOutbound(null);
  }, [isOutgoing, messages, pendingOutbound]);

  const stacks = useMemo(
    () => buildMessageStacks(displayMessages, (msg) => isOutgoing(msg) || msg.messageId.startsWith("pending-")),
    [displayMessages, isOutgoing],
  );

  const handleSend = useCallback(async () => {
    const text = draft.trim();
    if (!text || sending || !bot) return;
    if (modelDisabled) {
      setSendError(t("chat.botModelDisabled", "AI model is disabled. Enable a model provider in Settings → AI."));
      return;
    }
    if (!nodeService.sendToAiBot) {
      setSendError(t("chat.botSendUnavailable", "Bot chat is not available on this connection."));
      return;
    }
    const optimistic: ChatMessage = {
      messageId: `pending-${Date.now()}`,
      sender: {
        nodeId: "",
        ownerId: selfOwnerId || "self",
        displayName: "You",
        actorRole: "human",
      },
      recipient: {
        nodeId: "",
        ownerId: normalizedKey,
        displayName: bot.name,
      },
      content: { text },
      metadata: {
        timestamp: new Date().toISOString(),
        deliveryReceipt: "pending",
        deliveryChannel: "ai",
      },
      signature: "",
    };
    setSending(true);
    setSendError(null);
    setDraft("");
    setPendingOutbound(optimistic);
    pinToBottom();
    try {
      await nodeService.sendToAiBot(botId, text);
    } catch (err) {
      setDraft(text);
      setPendingOutbound(null);
      setSendError(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
    }
  }, [bot, botId, draft, modelDisabled, nodeService, normalizedKey, pinToBottom, selfOwnerId, sending, t]);

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

  const title = bot?.name ?? botId;
  const subtitle = bot?.description?.trim() ?? "";
  const avatarColor = bot?.avatarColor ?? "#6366f1";

  if (!bot) {
    return (
      <div className="no-chat-selected">
        <h3>{t("chat.botMissingTitle", "Bot not found")}</h3>
        <p>{t("chat.botMissingDesc", "This bot was removed or disabled. Create a new one from the AI section.")}</p>
      </div>
    );
  }

  return (
    <>
      <header className="chat-header">
        <div className="chat-header-main">
          <div className="chat-header-left">
            <span
              className="chat-header-avatar kind-ai"
              style={{ background: avatarColor }}
              aria-hidden
            >
              {botInitial(title)}
            </span>
            <div className="chat-header-titles">
              <span className="chat-name">{title}</span>
              {subtitle ? (
                <span className="chat-header-kind kind-ai">{subtitle}</span>
              ) : null}
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
      </header>

      {modelDisabled ? (
        <p className="chat-reachability-hint" role="status">
          {t("chat.botModelDisabled", "AI model is disabled. Enable a model provider in Settings → AI.")}
        </p>
      ) : null}

      <div className="messages ai-messages-pane" ref={containerRef} onScroll={onScroll}>
        {displayMessages.length === 0 ? (
          <div className="ai-welcome-container">
            <div className="message-stack-row is-incoming ai-welcome-bubble">
              <div className="message-stack">
                <div className="message-bubble message-bubble--ai">
                  <div className="ai-welcome-greeting">{title}</div>
                  <p>
                    {bot.description?.trim()
                      || t("chat.botWelcome", "Say hello — this bot uses your home node model with its own personality.")}
                  </p>
                </div>
              </div>
            </div>
            <div className="empty-state">
              <div className="empty-state-icon">
                <ChatIcon size={40} />
              </div>
            </div>
          </div>
        ) : (
          stacks.map((stack) => {
            const outgoing = isOutgoing(stack[0]!) || stack[0]!.messageId.startsWith("pending-");
            return (
              <div
                key={stack[0]!.messageId}
                className={`message-stack-row ${outgoing ? "is-outgoing" : "is-incoming"}`}
              >
                <div className="message-stack">
                  {stack.map((msg: ChatMessage, idx: number) => {
                    const text = stripModelThinking(extractChatMessageText(msg));
                    const ts = msg.metadata?.timestamp;
                    const timeLabel = ts
                      ? new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                      : undefined;
                    return (
                      <ChatMessageBubble
                        key={msg.messageId}
                        variant={outgoing ? "ai-outgoing" : "ai-incoming"}
                        position={stackPosition(idx, stack.length)}
                        actorBadge={outgoing ? undefined : title}
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
            onSend={() => { void handleSend(); }}
            placeholder={`Message ${title}…`}
            sendLabel={t("common.send", "Send")}
            disabled={sending || modelDisabled}
            sendDisabled={!draft.trim() || sending || modelDisabled}
          />
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
