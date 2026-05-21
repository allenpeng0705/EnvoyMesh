import { useState, useMemo, useRef, useEffect } from "react";
import { useNodeState } from "../../context/NodeStateContext.js";
import { useNodeService } from "../../hooks/useNodeService.js";
import { buildMessageStacks, stackPosition } from "../../lib/chat-message-stack.js";
import { messageVisualVariant } from "../../lib/chat-thread-kind.js";
import { ChatMessageBubble } from "../ChatMessageBubble.js";
import { Markdown } from "../Markdown.js";
import { ChatIcon } from "../../icons.js";

interface AiMessage {
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
  const { nodeConfig } = useNodeState();

  const [aiMessages, setAiMessages] = useState<AiMessage[]>([]);
  const [aiInput, setAiInput] = useState("");
  const [isAiLoading, setIsAiLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const messageGroups = useMemo(() => groupByDate(aiMessages), [aiMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [aiMessages, isAiLoading]);

  const sendAiMessage = async (question: string) => {
    if (!question.trim() || isAiLoading) return;

    const userMsg: AiMessage = { role: "user", text: question.trim(), timestamp: new Date().toISOString() };
    setAiMessages((prev) => [...prev, userMsg]);
    setAiInput("");
    setIsAiLoading(true);

    try {
      const turn = await nodeService.runDocumentAgentTurn(question);
      setAiMessages((prev) => [...prev, { role: "ai", text: turn.answer, timestamp: new Date().toISOString() }]);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to get AI response";
      setAiMessages((prev) => [...prev, { role: "ai", text: `Error: ${msg}`, timestamp: new Date().toISOString() }]);
    } finally {
      setIsAiLoading(false);
    }
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
          <span className="ai-status" title={nodeConfig?.modelProviders?.modelName ?? undefined}>
            {nodeConfig?.modelProviders?.mode === "disabled" ? "AI Disabled" :
             nodeConfig?.modelProviders?.mode === "mock" ? "Mock Mode" :
             `Model: ${nodeConfig?.modelProviders?.modelName ?? "Not set"}`}
          </span>
        </div>
      </header>
      <div className="messages ai-messages-pane">
        {aiMessages.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <ChatIcon size={40} />
            </div>
            <div className="empty-state-title">Chat with your AI assistant</div>
            <div className="empty-state-desc">Ask questions, get help with tasks, or draft messages</div>
            <div className="ai-suggestions">
              <button type="button" onClick={() => setAiInput("What can you help me with?")}>What can you help me with?</button>
              <button type="button" onClick={() => setAiInput("Summarize my recent conversations")}>Summarize my recent conversations</button>
              <button type="button" onClick={() => setAiInput("Help me draft a message")}>Help me draft a message</button>
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
                    key={`${dateKey}-${stack[0].timestamp}`}
                    className={`message-stack-row ${outgoing ? "is-outgoing" : "is-incoming"}`}
                  >
                    {!outgoing && (
                      <span className="message-stack-avatar agent" aria-hidden>AI</span>
                    )}
                    <div className="message-stack-bubbles">
                      {stack.map((msg, index) => (
                        <ChatMessageBubble
                          key={`${msg.timestamp}-${index}`}
                          variant={variant}
                          position={stackPosition(index, stack.length)}
                          timeLabel={new Date(msg.timestamp).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        >
                          <Markdown text={msg.text} className="message-text" />
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
          onChange={(e) => setAiInput(e.target.value)}
          onKeyDown={async (e) => {
            if (e.key === "Enter" && aiInput.trim() && !isAiLoading) {
              e.preventDefault();
              await sendAiMessage(aiInput);
            }
          }}
          disabled={isAiLoading}
        />
        <button
          type="button"
          onClick={async () => {
            if (aiInput.trim() && !isAiLoading) await sendAiMessage(aiInput);
          }}
          disabled={!aiInput.trim() || isAiLoading}
        >
          Send
        </button>
      </footer>
    </>
  );
}
