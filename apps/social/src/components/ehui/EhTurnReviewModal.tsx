import type { EhTurnReview } from "@envoymesh/api"
import { useEffect, useRef } from "react"

import { useT } from "../../context/I18nContext.js"

export function EhTurnReviewModal({
  review,
  onClose,
  onRevert,
  onOpenFile,
}: {
  review: EhTurnReview
  onClose: () => void
  onRevert: () => void
  onOpenFile?: (path: string) => void
}) {
  const t = useT()
  const closeRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLElement>(null)
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
            <h2 id="eh-turn-review-title">{t("eh.turnReview", "Review this turn")}</h2>
            <p>{t("eh.turnReviewCount", "{count} file(s) changed", { count: review.files.length })}</p>
          </div>
          <button ref={closeRef} type="button" className="modal-close" aria-label={t("eh.close", "Close")} onClick={onClose}>×</button>
        </header>
        <div className="eh-turn-review-files">
          {review.files.map((file) => (
            <div key={file.path} className="eh-turn-review-file">
              <details open>
                <summary><span className={`eh-turn-review-status eh-turn-review-status--${file.status}`}>{file.status}</span><code>{file.path}</code>{file.attribution === "workspace" ? <span className="eh-turn-review-attribution">{t("eh.reviewOnly", "Workspace-detected · review only")}</span> : null}</summary>
                {file.diff ? <pre><code>{file.diff}</code></pre> : <p>{t("eh.diffUnavailable", "A textual diff is unavailable for this file.")}</p>}
              </details>
              {onOpenFile && file.status !== "deleted" ? <div className="eh-turn-review-file-actions"><button type="button" className="secondary eh-turn-review-open" onClick={() => onOpenFile(file.path)}>Open file</button></div> : null}
            </div>
          ))}
        </div>
        <footer className="eh-turn-review-actions">
          <button type="button" className="secondary" onClick={onClose}>{t("eh.close", "Close")}</button>
          {review.canRevert ? <button type="button" className="danger" onClick={onRevert}>{t("eh.changesRevert", "Revert this turn")}</button> : null}
        </footer>
      </section>
    </div>
  )
}
