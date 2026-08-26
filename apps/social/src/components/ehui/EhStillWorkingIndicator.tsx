/**
 * Thinking dots + delayed "Still working…" for long Envoy Harness turns.
 */

import { useT } from "../../context/I18nContext.js"
import { useStillWorking } from "./useStillWorking.js"

export interface EhStillWorkingIndicatorProps {
  /** Turn in flight (`askEnvoyHarness` pending). */
  active: boolean
  /** Agent called `ask_user` / plan review — waiting on the human. */
  waitingForUser?: boolean
  /** Latest `session/activity` summary (tool name, progress). */
  activitySummary?: string
  /** @deprecated Unused — activity is a single replaceable line via activitySummary. */
  activityLog?: readonly string[]
  /** Optional cancel for long-running turns. */
  onCancel?: () => void
  className?: string
}

export function EhStillWorkingIndicator({
  active,
  waitingForUser = false,
  activitySummary,
  onCancel,
  className,
}: EhStillWorkingIndicatorProps) {
  const t = useT()
  const showStillWorking = useStillWorking(active)

  if (!active) return null

  let label: string | undefined
  if (waitingForUser) {
    label = t(
      "eh.stillWorkingWaitingForYou",
      "Still working — pick an option above when you're ready.",
    )
  } else if (showStillWorking) {
    label = t(
      "eh.stillWorking",
      "Still working… tools and the model can take a minute.",
    )
  } else {
    label = t("eh.thinking", "Thinking…")
  }

  return (
    <div
      className={`pi-chat-turn pi-chat-turn--assistant pi-chat-turn--thinking eh-still-working${className ? ` ${className}` : ""}`}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="eh-still-working-row">
        <div className="pi-chat-thinking-dots" aria-hidden="true">
          <span /> <span /> <span />
        </div>
        {label ? <span className="eh-still-working-label">{label}</span> : null}
      </div>
      {activitySummary ? (
        <div className="eh-still-working-activity" title={activitySummary}>
          {activitySummary}
        </div>
      ) : null}
      {onCancel ? (
        <div className="eh-still-working-actions">
          <button type="button" className="secondary eh-still-working-cancel" onClick={onCancel}>
            {t("eh.cancelTurn", "Cancel")}
          </button>
        </div>
      ) : null}
    </div>
  )
}
