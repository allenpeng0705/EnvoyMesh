import { useMemo, useState } from "react";
import { parseModelThinking, stripModelThinking } from "@envoymesh/api";
import { Markdown } from "./Markdown.js";
import { AIIcon } from "../icons.js";

interface ChatMessageTextProps {
  text: string;
  /** When true, reasoning blocks may be toggled visible (sender-side only). */
  allowThinkingToggle?: boolean;
  className?: string;
}

export function ChatMessageText({
  text,
  allowThinkingToggle = false,
  className = "message-text",
}: ChatMessageTextProps) {
  const parsed = useMemo(() => parseModelThinking(text), [text]);
  const [showThinking, setShowThinking] = useState(false);
  const displayText = allowThinkingToggle ? parsed.visibleText : stripModelThinking(text);
  const hasThinking = allowThinkingToggle && parsed.thinking != null && parsed.thinking.length > 0;

  return (
    <div className="chat-message-text">
      {hasThinking && showThinking ? (
        <div className="message-thinking" role="region" aria-label="Model reasoning">
          <span className="message-thinking-label">Reasoning</span>
          <Markdown text={parsed.thinking!} className="message-thinking-body" />
        </div>
      ) : null}
      <Markdown text={displayText} className={className} />
      {hasThinking ? (
        <button
          type="button"
          className={`message-thinking-toggle ${showThinking ? "is-open" : ""}`}
          title={showThinking ? "Hide reasoning" : "Show reasoning"}
          aria-label={showThinking ? "Hide reasoning" : "Show reasoning"}
          aria-expanded={showThinking}
          onClick={() => setShowThinking((open) => !open)}
        >
          <AIIcon size={14} />
        </button>
      ) : null}
    </div>
  );
}
