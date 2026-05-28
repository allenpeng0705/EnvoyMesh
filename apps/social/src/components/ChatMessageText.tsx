import { chatMessageTextForDisplay, stripModelThinking, type AiIdentity } from "@envoymesh/api";
import { Markdown } from "./Markdown.js";

interface ChatMessageTextProps {
  text: string;
  className?: string;
  /** Strips configured debug prefix from message body for display. */
  identity?: AiIdentity | null;
}

export function ChatMessageText({ text, className = "message-text", identity }: ChatMessageTextProps) {
  const display = chatMessageTextForDisplay(stripModelThinking(text), identity);
  return <Markdown text={display} className={className} />;
}
