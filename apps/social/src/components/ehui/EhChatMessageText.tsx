/**
 * Markdown rendering for Envoy Harness chat turns (assistant + system).
 */

import { stripModelThinking } from "@envoymesh/api"
import { Markdown } from "../Markdown.js"

interface EhChatMessageTextProps {
  text: string
  className?: string
}

export function EhChatMessageText({ text, className }: EhChatMessageTextProps) {
  const display = stripModelThinking(text)
  const classes = ["message-text", "eh-chat-markdown", className]
    .filter(Boolean)
    .join(" ")
  return <Markdown text={display} className={classes} />
}
