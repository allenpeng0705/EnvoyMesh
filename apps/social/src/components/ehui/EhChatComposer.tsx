/**
 * EH composer — queue vs inject while a turn is in flight (Codex-shaped).
 */

import type { ExtAgentCommandDescriptor } from "@envoymesh/api"
import { useCallback, useId, type ReactNode } from "react"
import { useT } from "../../context/I18nContext.js"
import { ChatComposer } from "../ChatComposer.js"
import type { EhSubmitMode } from "../../hooks/useEhTurnQueue.js"

export interface EhChatComposerProps {
  value: string
  onChange: (value: string) => void
  busy: boolean
  onSubmit: (mode: EhSubmitMode) => void
  placeholder?: string
  slashCommands?: ExtAgentCommandDescriptor[]
  autoFocus?: boolean
  /** Attach chips + picker rendered before the text field. */
  attachLeading?: ReactNode
  /** When true, send works with attachments but no typed text. */
  hasAttachments?: boolean
}

export function EhChatComposer({
  value,
  onChange,
  busy,
  onSubmit,
  placeholder,
  slashCommands,
  autoFocus,
  attachLeading,
  hasAttachments = false,
}: EhChatComposerProps) {
  const t = useT()
  const hintId = useId()

  const handleSend = useCallback(() => {
    onSubmit(busy ? "queue" : "send")
  }, [busy, onSubmit])

  const handleInject = useCallback(() => {
    onSubmit("inject")
  }, [onSubmit])

  const canSend = Boolean(value.trim()) || hasAttachments

  return (
    <div className="eh-chat-composer-wrap">
      {busy ? (
        <p id={hintId} className="eh-composer-hint">
          {t(
            "eh.composerHintBusy",
            "Enter queues · {inject} sends now (interrupts current turn)",
            { inject: "⌘↵" },
          )}
        </p>
      ) : null}
      <div className="eh-composer-row">
        <ChatComposer
          value={value}
          onChange={onChange}
          onSend={handleSend}
          placeholder={placeholder}
          sendLabel={busy ? "+" : "↑"}
          sendDisabled={!canSend}
          allowEmptySend={hasAttachments}
          disabled={false}
          autoFocus={autoFocus}
          showEmoji={false}
          leading={attachLeading}
          slashCommands={slashCommands}
          onModifierEnter={busy ? handleInject : undefined}
        />
        {busy ? (
          <button
            type="button"
            className="eh-composer-inject"
            disabled={!canSend}
            title={t("eh.composerInjectTitle", "Send now — cancel current turn and run this message")}
            aria-describedby={hintId}
            onClick={handleInject}
          >
            {t("eh.composerInject", "Now")}
          </button>
        ) : null}
      </div>
    </div>
  )
}
