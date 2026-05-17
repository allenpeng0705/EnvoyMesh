import { useState } from "react";
import { useNodeState } from "../../context/NodeStateContext.js";
import { useNodeService } from "../../hooks/useNodeService.js";
import { Markdown } from "../Markdown.js";
import { SendIcon, AIIcon } from "../../icons.js";

interface AiMessage {
  role: "user" | "ai";
  text: string;
  timestamp: string;
}

export function AIChatPanel() {
  const nodeService = useNodeService();
  const { nodeConfig } = useNodeState();

  const [aiMessages, setAiMessages] = useState<AiMessage[]>([]);
  const [aiInput, setAiInput] = useState("");
  const [isAiLoading, setIsAiLoading] = useState(false);

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

  const modelLabel = nodeConfig?.modelProviders?.mode === "disabled" ? "AI Disabled"
    : nodeConfig?.modelProviders?.mode === "mock" ? "Mock Mode"
    : nodeConfig?.modelProviders?.modelName ?? "Not configured";

  return (
    <>
      <header className="chat-panel-header">
        <div className="contact-avatar" style={{
          width: 36, height: 36, fontSize: "var(--text-sm)",
          background: "linear-gradient(135deg, var(--color-secondary), var(--color-primary))",
        }}>
          <AIIcon size={18} color="#fff" stroke="none" fill="#fff" />
        </div>
        <div className="chat-panel-header-info">
          <div className="chat-panel-header-name">Envoy AI</div>
          <div className="chat-panel-header-status">{modelLabel}</div>
        </div>
      </header>

      <div className="chat-messages">
        {aiMessages.length === 0 ? (
          <div className="no-chat-selected">
            <div className="no-chat-selected-icon">
              <AIIcon size={32} />
            </div>
            <h3>Chat with your AI Assistant</h3>
            <p>Ask questions, get help with tasks, or just have a conversation</p>
            <div className="suggestion-chips">
              <button className="suggestion-chip" onClick={() => setAiInput("What can you help me with?")}>
                What can you help me with?
              </button>
              <button className="suggestion-chip" onClick={() => setAiInput("Summarize my recent conversations")}>
                Summarize my recent conversations
              </button>
              <button className="suggestion-chip" onClick={() => setAiInput("Help me draft a message")}>
                Help me draft a message
              </button>
            </div>
          </div>
        ) : (
          aiMessages.map((msg, i) => (
            <div
              key={i}
              className={`chat-bubble ${msg.role === "user" ? "outgoing" : "incoming"}`}
            >
              <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-subtle)", marginBottom: 4, fontWeight: 500 }}>
                {msg.role === "user" ? "You" : "AI"}
              </div>
              <Markdown text={msg.text} className="markdown-content" />
            </div>
          ))
        )}
        {isAiLoading && (
          <div className="chat-bubble incoming">
            <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-subtle)", marginBottom: 4, fontWeight: 500 }}>
              AI
            </div>
            <p style={{ fontStyle: "italic", color: "var(--color-text-muted)" }}>Thinking...</p>
          </div>
        )}
      </div>

      <div className="chat-composer">
        <input
          type="text"
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
          onClick={async () => { if (aiInput.trim() && !isAiLoading) await sendAiMessage(aiInput); }}
          disabled={!aiInput.trim() || isAiLoading}
        >
          <SendIcon size={16} />
          Send
        </button>
      </div>
    </>
  );
}
