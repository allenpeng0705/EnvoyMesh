import { useState, useMemo } from "react";
import { useNodeState } from "../../context/NodeStateContext.js";
import { useNodeService } from "../../hooks/useNodeService.js";
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

  const messageGroups = useMemo(() => groupByDate(aiMessages), [aiMessages]);

  const sendAiMessage = async (question: string) => {
    if (!question.trim() || isAiLoading) return;

    const userMsg: AiMessage = { role: "user", text: question.trim(), timestamp: new Date().toISOString() };
    setAiMessages((prev) => [...prev, userMsg]);
    setAiInput("");
    setIsAiLoading(true);

    try {
      const answer = await nodeService.knowledgeQuery(question);
      setAiMessages((prev) => [...prev, { role: "ai", text: answer, timestamp: new Date().toISOString() }]);
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
        <span className="chat-name">Envoy AI</span>
        <span className="ai-status">
          {nodeConfig?.modelProviders?.mode === "disabled" ? "AI Disabled" :
           nodeConfig?.modelProviders?.mode === "mock" ? "Mock Mode" :
           `Model: ${nodeConfig?.modelProviders?.modelName ?? "Not set"}`}
        </span>
      </header>
      <div className="ai-messages">
        {aiMessages.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <ChatIcon size={40} />
            </div>
            <div className="empty-state-title">Chat with your AI assistant</div>
            <div className="empty-state-desc">Ask questions, get help with tasks, or just have a conversation</div>
            <div className="ai-suggestions">
              <button onClick={() => setAiInput("What can you help me with?")}>What can you help me with?</button>
              <button onClick={() => setAiInput("Summarize my recent conversations")}>Summarize my recent conversations</button>
              <button onClick={() => setAiInput("Help me draft a message")}>Help me draft a message</button>
            </div>
          </div>
        ) : (
          messageGroups.map(([dateKey, msgs]) => (
            <div key={dateKey}>
              <div className="date-separator"><span>{fmtDateLabel(msgs[0].timestamp)}</span></div>
              {msgs.map((msg, i) => (
                <div key={i} className={`ai-message ${msg.role}`}>
                  <span className="ai-message-role">{msg.role === "user" ? "You" : "AI"}</span>
                  <Markdown text={msg.text} className="ai-message-text" />
                </div>
              ))}
            </div>
          ))
        )}
        {isAiLoading && (
          <div className="ai-message ai">
            <span className="ai-message-role">AI</span>
            <p className="ai-message-text ai-loading">Thinking...</p>
          </div>
        )}
      </div>
      <div className="ai-input-area">
        <input
          type="text"
          className="ai-input"
          placeholder="Ask the AI anything..."
          value={aiInput}
          onChange={(e) => setAiInput(e.target.value)}
          onKeyDown={async (e) => {
            if (e.key === "Enter" && aiInput.trim() && !isAiLoading) {
              await sendAiMessage(aiInput);
            }
          }}
        />
        <button
          className="ai-send"
          onClick={async () => { if (aiInput.trim() && !isAiLoading) await sendAiMessage(aiInput); }}
          disabled={!aiInput.trim() || isAiLoading}
        >
          Send
        </button>
      </div>
    </>
  );
}
