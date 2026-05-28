import { useState, useMemo, useRef, useEffect } from "react";
import { useNodeState } from "../../context/NodeStateContext.js";
import { useNodeService } from "../../hooks/useNodeService.js";
import { stripModelThinking } from "@envoymesh/api";
import { buildMessageStacks, stackPosition } from "../../lib/chat-message-stack.js";
import { messageVisualVariant } from "../../lib/chat-thread-kind.js";
import { createAssistantDraftCrdt, ASSISTANT_DRAFT_SYNC_SCOPE } from "../../lib/assistant-draft-crdt.js";
import { ChatMessageBubble } from "../ChatMessageBubble.js";
import { ChatMessageText } from "../ChatMessageText.js";
import { ChatIcon, RemoveIcon } from "../../icons.js";

interface AiMessage {
  id: string;
  role: "user" | "ai";
  text: string;
  timestamp: string;
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

function groupByDate(msgs: AiMessage[]): [string, AiMessage[]][] {
  const groups = new Map<string, AiMessage[]>();
  for (const msg of msgs) {
    const key = new Date(msg.timestamp).toLocaleDateString();
    const arr = groups.get(key);
    if (arr) arr.push(msg);
    else groups.set(key, [msg]);
  }
  return [...groups.entries()];
}

export function AIChatPanel() {
  const nodeService = useNodeService();
  const { nodeConfig, humanProfile, nodeStatus } = useNodeState();
  const assistantReady = nodeStatus === "running";
  const assistantBlockedHint =
    nodeStatus === "starting"
      ? "Node is still starting. Wait a moment, then try again."
      : nodeStatus === "stopping"
        ? "Node is stopping. Try again after it finishes."
        : "Start your node from Settings → Node to use the Assistant.";

  const [aiMessages, setAiMessages] = useState<AiMessage[]>([]);
  const [aiInput, setAiInput] = useState("");
  const [isAiLoading, setIsAiLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const draftRef = useRef<ReturnType<typeof createAssistantDraftCrdt> | null>(null);
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ownerId = humanProfile?.ownerId ?? nodeConfig?.profileDir ?? "anonymous";

  const messageGroups = useMemo(() => groupByDate(aiMessages), [aiMessages]);

  const pushDraftSync = (updateBase64: string) => {
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(() => {
      void nodeService
        .sendSyncStateUpdate({ scope: ASSISTANT_DRAFT_SYNC_SCOPE, updateBase64 })
        .catch(() => {});
    }, 400);
  };

  useEffect(() => {
    const draft = createAssistantDraftCrdt(ownerId, { onLocalUpdate: pushDraftSync });
    draftRef.current = draft;
    setAiInput(draft.getPlainText());
    const onDraftChange = () => setAiInput(draft.getPlainText());
    draft.text.observe(onDraftChange);
    return () => {
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
      draft.text.unobserve(onDraftChange);
      draft.destroy();
      draftRef.current = null;
    };
  }, [ownerId, nodeService]);

  useEffect(() => {
    const unsub = nodeService.on("crdt:sync", (data) => {
      if (data.scope !== ASSISTANT_DRAFT_SYNC_SCOPE) return;
      draftRef.current?.applyRemoteUpdate(data.updateBase64);
    });
    return unsub;
  }, [nodeService]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [aiMessages, isAiLoading]);

  const sendAiMessage = async (question: string) => {
    if (!question.trim() || isAiLoading) return;

    if (!assistantReady) {
      setAiMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "user",
          text: question.trim(),
          timestamp: new Date().toISOString(),
        },
        {
          id: crypto.randomUUID(),
          role: "ai",
          text: assistantBlockedHint,
          timestamp: new Date().toISOString(),
        },
      ]);
      draftRef.current?.setPlainText("");
      return;
    }

    const userMsg: AiMessage = {
      id: crypto.randomUUID(),
      role: "user",
      text: question.trim(),
      timestamp: new Date().toISOString(),
    };
    setAiMessages((prev) => [...prev, userMsg]);
    draftRef.current?.setPlainText("");
    setIsAiLoading(true);

    try {
      const turn = await nodeService.runDocumentAgentTurn(question);
      setAiMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "ai",
          text: stripModelThinking(turn.answer),
          timestamp: new Date().toISOString(),
        },
      ]);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to get AI response";
      setAiMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "ai",
          text: `Error: ${msg}`,
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleDeleteAiMessage = (messageId: string) => {
    setAiMessages((prev) => prev.filter((msg) => msg.id !== messageId));
  };

  const handleClearAiChat = () => {
    if (aiMessages.length === 0) return;
    if (!window.confirm("Clear this Envoy AI session?")) return;
    setAiMessages([]);
  };

  return (
    <>
      <header className="chat-header">
        <div className="chat-header-left">
          <span className="chat-header-avatar kind-ai" aria-hidden>AI</span>
          <div className="chat-header-titles">
            <span className="chat-name">Envoy AI</span>
            <span className="chat-header-kind kind-ai">Knowledge assistant</span>
          </div>
        </div>
        <div className="chat-header-right">
          <button
            type="button"
            className="chat-header-clear-btn"
            title="Clear session"
            aria-label="Clear session"
            disabled={aiMessages.length === 0}
            onClick={handleClearAiChat}
          >
            <RemoveIcon size={16} />
          </button>
          <span className="ai-status" title={nodeConfig?.modelProviders?.modelName ?? undefined}>
            {nodeConfig?.modelProviders?.mode === "disabled" ? "AI Disabled" :
             nodeConfig?.modelProviders?.mode === "mock" ? "Mock Mode" :
             `Model: ${nodeConfig?.modelProviders?.modelName ?? "Not set"}`}
          </span>
        </div>
      </header>
      <div className="messages ai-messages-pane">
        {!assistantReady && (
          <p className="chat-reachability-hint ai-assistant-hint" role="status">
            {assistantBlockedHint}
          </p>
        )}
        {aiMessages.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <ChatIcon size={40} />
            </div>
            <div className="empty-state-title">Chat with your AI assistant</div>
            <div className="empty-state-desc">Ask questions, get help with tasks, or draft messages</div>
            <div className="ai-suggestions">
              <button type="button" onClick={() => draftRef.current?.setPlainText("What can you help me with?")}>What can you help me with?</button>
              <button type="button" onClick={() => draftRef.current?.setPlainText("Summarize my recent conversations")}>Summarize my recent conversations</button>
              <button type="button" onClick={() => draftRef.current?.setPlainText("Help me draft a message")}>Help me draft a message</button>
            </div>
          </div>
        ) : (
          messageGroups.map(([dateKey, msgs]) => (
            <div key={dateKey}>
              <div className="date-separator"><span>{fmtDateLabel(msgs[0].timestamp)}</span></div>
              {buildMessageStacks(msgs, (a, b) => a.role === b.role).map((stack) => {
                const outgoing = stack[0].role === "user";
                const variant = messageVisualVariant(outgoing, "ai");
                return (
                  <div
                    key={`${dateKey}-${stack[0].id}`}
                    className={`message-stack-row ${outgoing ? "is-outgoing" : "is-incoming"}`}
                  >
                    {!outgoing && (
                      <span className="message-stack-avatar agent" aria-hidden>AI</span>
                    )}
                    <div className="message-stack-bubbles">
                      {stack.map((msg, index) => (
                        <ChatMessageBubble
                          key={msg.id}
                          variant={variant}
                          position={stackPosition(index, stack.length)}
                          timeLabel={new Date(msg.timestamp).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                          copyText={stripModelThinking(msg.text)}
                          onDelete={() => handleDeleteAiMessage(msg.id)}
                        >
                          <ChatMessageText text={msg.text} className="message-text" />
                        </ChatMessageBubble>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ))
        )}
        {isAiLoading && (
          <div className="message-stack-row is-incoming">
            <span className="message-stack-avatar agent" aria-hidden>AI</span>
            <div className="message-stack-bubbles">
              <div className="message-bubble ai-incoming group-single">
                <span className="message-bubble-badge">Envoy AI</span>
                <p className="message-bubble-body ai-loading">Thinking…</p>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} className="messages-scroll-anchor" aria-hidden />
      </div>
      <footer className="chat-input">
        <input
          type="text"
          placeholder="Ask Envoy AI anything…"
          value={aiInput}
          onChange={(e) => draftRef.current?.setPlainText(e.target.value)}
          onKeyDown={async (e) => {
            if (e.key === "Enter" && aiInput.trim() && !isAiLoading) {
              e.preventDefault();
              await sendAiMessage(aiInput);
            }
          }}
          disabled={isAiLoading || !assistantReady}
        />
        <button
          type="button"
          onClick={async () => {
            if (aiInput.trim() && !isAiLoading) await sendAiMessage(aiInput);
          }}
          disabled={!aiInput.trim() || isAiLoading || !assistantReady}
        >
          Send
        </button>
      </footer>
    </>
  );
}
