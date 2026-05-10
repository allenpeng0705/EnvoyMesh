import { useState } from "react";
import { useNodeState } from "../../context/NodeStateContext.js";
import { useNodeService } from "../../hooks/useNodeService.js";

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
          <div className="ai-empty">
            <p>Chat with your AI assistant</p>
            <small>Ask questions, get help with tasks, or just have a conversation</small>
            <div className="ai-suggestions">
              <button onClick={() => setAiInput("What can you help me with?")}>What can you help me with?</button>
              <button onClick={() => setAiInput("Summarize my recent conversations")}>Summarize my recent conversations</button>
              <button onClick={() => setAiInput("Help me draft a message")}>Help me draft a message</button>
            </div>
          </div>
        ) : (
          aiMessages.map((msg, i) => (
            <div key={i} className={`ai-message ${msg.role}`}>
              <span className="ai-message-role">{msg.role === "user" ? "You" : "AI"}</span>
              <p className="ai-message-text">{msg.text}</p>
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
