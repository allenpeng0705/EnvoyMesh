/**
 * Queued user messages while envoy-harness is working (Codex / Claude Code pattern).
 */

import { useT } from "../../context/I18nContext.js"

export interface EhInputQueueProps {
  items: ReadonlyArray<{ id: string; text: string }>
  onUpdate: (id: string, text: string) => void
  onRemove: (id: string) => void
  onClear?: () => void
}

export function EhInputQueue({ items, onUpdate, onRemove, onClear }: EhInputQueueProps) {
  const t = useT()

  if (items.length === 0) return null

  return (
    <div className="eh-input-queue" role="region" aria-label={t("eh.inputQueue", "Queued messages")}>
      <div className="eh-input-queue-header">
        <span className="eh-input-queue-title">
          {t("eh.inputQueueTitle", "Queued ({count})", { count: items.length })}
        </span>
        {onClear ? (
          <button type="button" className="secondary eh-input-queue-clear" onClick={onClear}>
            {t("eh.inputQueueClear", "Clear all")}
          </button>
        ) : null}
      </div>
      <ul className="eh-input-queue-list">
        {items.map((item, index) => (
          <li key={item.id} className="eh-input-queue-item">
            <span className="eh-input-queue-index" aria-hidden="true">
              {index + 1}
            </span>
            <textarea
              className="eh-input-queue-text"
              rows={1}
              value={item.text}
              aria-label={t("eh.inputQueueEdit", "Edit queued message {n}", { n: index + 1 })}
              onChange={(e) => onUpdate(item.id, e.target.value)}
            />
            <button
              type="button"
              className="secondary eh-input-queue-remove"
              title={t("eh.inputQueueRemove", "Remove from queue")}
              aria-label={t("eh.inputQueueRemove", "Remove from queue")}
              onClick={() => onRemove(item.id)}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
