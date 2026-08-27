import type { EhTurnReview, EhTurnReviewFile } from "@envoymesh/api"
import { useEffect, useRef } from "react"

import { useT } from "../../context/I18nContext.js"
import { EhSplitDiff } from "./EhSplitDiff.js"

export function EhTurnReviewModal({
  review,
  focusPath,
  onClose,
  onKeepAll,
  onKeepFile,
  onRevertFile,
  onRevertAll,
  onOpenFile,
}: {
  review: EhTurnReview
  focusPath?: string | null
  onClose: () => void
  onKeepAll?: () => void
  onKeepFile?: (path: string) => void
  onRevertFile?: (path: string) => void
  onRevertAll?: () => void
  onOpenFile?: (path: string) => void
}) {
  const t = useT()
  const closeRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (!focusPath) return
    const target = dialogRef.current?.querySelector(
      `[data-review-path="${CSS.escape(focusPath)}"]`,
    )
    if (target instanceof HTMLElement) {
      target.scrollIntoView({ block: "nearest", behavior: "smooth" })
    }
  }, [focusPath, review.files.length])

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null
    closeRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key !== "Tab") return
      const focusable = [...(dialogRef.current?.querySelectorAll<HTMLElement>(
        "button:not([disabled]), summary, [href], [tabindex]:not([tabindex='-1'])",
      ) ?? [])]
      if (focusable.length === 0) return
      const first = focusable[0]!
      const last = focusable.at(-1)!
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => {
      window.removeEventListener("keydown", onKeyDown)
      previouslyFocused?.focus()
    }
  }, [onClose])

  const revertibleCount = review.files.filter((file) => file.revertible).length

  return (
    <div className="modal-overlay" role="presentation" onMouseDown={onClose}>
      <section
        ref={dialogRef}
        className="modal-panel eh-turn-review-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="eh-turn-review-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="eh-turn-review-header">
          <div>
            <h2 id="eh-turn-review-title">{t("eh.turnReview", "Review changes")}</h2>
            <p>
              {t("eh.turnReviewCount", "{count} file(s) changed", {
                count: review.files.length,
              })}
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            className="modal-close"
            aria-label={t("eh.close", "Close")}
            onClick={onClose}
          >
            ×
          </button>
        </header>
        <div className="eh-turn-review-files">
          {review.files.map((file) => (
            <ReviewFileCard
              key={file.path}
              file={file}
              focused={focusPath === file.path}
              onKeepFile={onKeepFile}
              onRevertFile={onRevertFile}
              onOpenFile={onOpenFile}
            />
          ))}
        </div>
        <footer className="eh-turn-review-actions">
          <button type="button" className="secondary" onClick={onClose}>
            {t("eh.close", "Close")}
          </button>
          <div className="eh-turn-review-actions-primary">
            {onKeepAll && review.files.length > 0 ? (
              <button type="button" className="primary" onClick={onKeepAll}>
                {t("eh.changesKeepAll", "Keep all")}
              </button>
            ) : null}
            {onRevertAll && revertibleCount > 0 ? (
              <button type="button" className="danger" onClick={onRevertAll}>
                {t("eh.changesRevert", "Revert all")}
              </button>
            ) : null}
          </div>
        </footer>
      </section>
    </div>
  )
}

function ReviewFileCard({
  file,
  focused,
  onKeepFile,
  onRevertFile,
  onOpenFile,
}: {
  file: EhTurnReviewFile
  focused?: boolean
  onKeepFile?: (path: string) => void
  onRevertFile?: (path: string) => void
  onOpenFile?: (path: string) => void
}) {
  const t = useT()
  return (
    <div
      className={`eh-turn-review-file${focused ? " eh-turn-review-file--focused" : ""}`}
      data-review-path={file.path}
    >
      <details open>
        <summary>
          <span className={`eh-turn-review-status eh-turn-review-status--${file.status}`}>
            {file.status}
          </span>
          <code>{file.path}</code>
          {file.attribution === "workspace" ? (
            <span className="eh-turn-review-attribution">
              {t("eh.reviewOnly", "Workspace-detected · review only")}
            </span>
          ) : null}
        </summary>
        {file.diff ? (
          <EhSplitDiff diff={file.diff} />
        ) : (
          <p className="eh-turn-review-empty-diff">
            {t("eh.diffUnavailable", "A textual diff is unavailable for this file.")}
          </p>
        )}
      </details>
      <div className="eh-turn-review-file-actions">
        {onKeepFile ? (
          <button type="button" className="secondary" onClick={() => onKeepFile(file.path)}>
            {t("eh.reviewKeepFile", "Keep")}
          </button>
        ) : null}
        {onRevertFile && file.revertible ? (
          <button type="button" className="secondary eh-turn-review-revert-file" onClick={() => onRevertFile(file.path)}>
            {t("eh.reviewRevertFile", "Revert")}
          </button>
        ) : null}
        {onOpenFile && file.status !== "deleted" ? (
          <button
            type="button"
            className="secondary eh-turn-review-open"
            onClick={() => onOpenFile(file.path)}
          >
            {t("eh.reviewOpenFile", "Open file")}
          </button>
        ) : null}
      </div>
    </div>
  )
}
