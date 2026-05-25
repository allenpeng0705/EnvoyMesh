import { stripModelThinking } from "@envoymesh/api";
import { Markdown } from "./Markdown.js";

interface ChatMessageTextProps {
  text: string;
  className?: string;
}

export function ChatMessageText({ text, className = "message-text" }: ChatMessageTextProps) {
  return <Markdown text={stripModelThinking(text)} className={className} />;
}
