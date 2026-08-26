/**
 * Changed-files summary above composer — opens turn review.
 */

import { useState } from "react"

import { useT } from "../../context/I18nContext.js"

export interface EhChangesDockProps {
  files: readonly string[]
  onReview?: () => void
  onReviewFile?: (path: string) => void
  onKeepAll?: () => void
  onRevert?: () => void
  reviewMinFiles?: number
  onReviewMinFilesChange?: (value: number) => void
}

export function EhChangesDock({
  files,
  onReview,
  onReviewFile,
  onKeepAll,
  onRevert,
  reviewMinFiles,
  onReviewMinFilesChange,
}: EhChangesDockProps) {
  const t = useT()
  const [expanded, setExpanded] = useState(files.length <= 6)

  if (files.length === 0) return null

  const showToggle = files.length > 3

  return (
    <div className="eh-changes-dock" role="region" aria-label={t("eh.changesTitle", "File changes")}>
      <div className="eh-changes-summary">
        <div className="eh-changes-heading">
          {t("eh.changesCount", "{count} file(s) changed this turn", { count: files.length })}
          {showToggle ? (
            <button
              type="button"
              className="eh-changes-toggle"
              aria-expanded={expanded}
              onClick={() => setExpanded((open) => !open)}
            >
              {expanded
                ? t("eh.changesHideList", "Hide list")
                : t("eh.changesShowList", "Show list")}
            </button>
          ) : null}
        </div>
        {expanded ? (
          <ul className="eh-changes-file-list">
            {files.map((path) => (
              <li key={path}>
                {onReviewFile ? (
                  <button
                    type="button"
                    className="eh-changes-file-btn"
                    onClick={() => onReviewFile(path)}
                  >
                    <code>{path}</code>
                  </button>
                ) : (
                  <code>{path}</code>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <span className="eh-changes-list" title={files.join("\n")}>
            {files.slice(0, 3).join(", ")}
            {files.length > 3 ? ` +${files.length - 3}` : ""}
          </span>
        )}
        {onReviewMinFilesChange !== undefined && reviewMinFiles !== undefined ? (
          <label className="eh-changes-auto-setting">
            <span>{t("eh.reviewAutoLabel", "Auto-review when ≥")}</span>
            <select
              value={reviewMinFiles}
              aria-label={t("eh.reviewAutoLabel", "Auto-review when ≥")}
              onChange={(event) =>
                onReviewMinFilesChange(Number(event.target.value))
              }
            >
              <option value={0}>{t("eh.reviewAutoAlways", "Always")}</option>
              <option value={1}>1</option>
              <option value={2}>2</option>
              <option value={5}>5</option>
            </select>
          </label>
        ) : null}
      </div>
      <div className="eh-changes-actions">
        {onReview ? (
          <button type="button" className="secondary" onClick={onReview}>
            {t("eh.changesReview", "Review changes")}
          </button>
        ) : null}
        {onKeepAll ? (
          <button type="button" className="secondary eh-changes-keep" onClick={onKeepAll}>
            {t("eh.changesKeepAll", "Keep all")}
          </button>
        ) : null}
        {onRevert ? (
          <button type="button" className="secondary eh-changes-revert" onClick={onRevert}>
            {t("eh.changesRevert", "Revert all")}
          </button>
        ) : null}
      </div>
    </div>
  )
}
