/**
 * Changed-files summary above composer — opens EHUI git-diff review.
 */

import { useT } from "../../context/I18nContext.js"

export interface EhChangesDockProps {
  files: readonly string[]
  onReview?: () => void
  onRevert?: () => void
  onDismiss?: () => void
}

export function EhChangesDock({ files, onReview, onRevert, onDismiss }: EhChangesDockProps) {
  const t = useT()

  if (files.length === 0) return null

  return (
    <div className="eh-changes-dock" role="region" aria-label={t("eh.changesTitle", "File changes")}>
      <div className="eh-changes-summary">
        {t("eh.changesCount", "{count} file(s) changed this turn", { count: files.length })}
        <span className="eh-changes-list" title={files.join("\n")}>
          {files.slice(0, 3).join(", ")}
          {files.length > 3 ? ` +${files.length - 3}` : ""}
        </span>
      </div>
      <div className="eh-changes-actions">
        {onReview ? (
          <button type="button" className="secondary" onClick={onReview}>
            {t("eh.changesReview", "Review diff")}
          </button>
        ) : null}
        {onRevert ? (
          <button type="button" className="secondary eh-changes-revert" onClick={onRevert}>
            {t("eh.changesRevert", "Revert this turn")}
          </button>
        ) : null}
        {onDismiss ? (
          <button type="button" className="secondary eh-changes-dismiss" onClick={onDismiss}>
            {t("eh.changesDismiss", "Dismiss")}
          </button>
        ) : null}
      </div>
    </div>
  )
}
