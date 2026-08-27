/**
 * Markdown rendering for Envoy Harness chat turns (assistant + system).
 */

import { stripModelThinking } from "@envoymesh/api"
import { SearchHighlightedText } from "../../lib/eh-transcript-search-highlight.js"
import { Markdown } from "../Markdown.js"

interface EhChatMessageTextProps {
  text: string
  className?: string
  /** When set, render plain highlighted text instead of markdown. */
  highlightQuery?: string
  highlightActive?: boolean
}

export function EhChatMessageText({
  text,
  className,
  highlightQuery,
  highlightActive = false,
}: EhChatMessageTextProps) {
  const display = stripModelThinking(text)
  const classes = ["message-text", "eh-chat-markdown", className]
    .filter(Boolean)
    .join(" ")
  if (highlightQuery?.trim()) {
    return (
      <div className={classes}>
        <SearchHighlightedText
          text={display}
          query={highlightQuery}
          active={highlightActive}
        />
      </div>
    )
  }
  return <Markdown text={display} className={classes} />
}
