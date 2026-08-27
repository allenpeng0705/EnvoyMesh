/**
 * Active context chips above the EH composer (touched / attached files).
 *
 * The project folder is already shown in the chat header (ProjectFolderLink)
 * and the terminal session title — repeating it here is redundant and eats
 * vertical space, so this strip only surfaces the files the agent is
 * working on / has in context.
 */

import { useT } from "../../context/I18nContext.js"

export interface EhContextStripProps {
  files: readonly string[]
  /** Paths that may show a remove control (composer attachments). */
  attachedPaths?: readonly string[]
  onRemoveAttached?: (path: string) => void
}

function basename(path: string): string {
  const norm = path.replace(/\\/g, "/")
  const i = norm.lastIndexOf("/")
  return i >= 0 ? norm.slice(i + 1) : norm
}

export function EhContextStrip({
  files,
  attachedPaths,
  onRemoveAttached,
}: EhContextStripProps) {
  const t = useT()

  if (files.length === 0) return null

  return (
    <div className="eh-context-strip" role="region" aria-label={t("eh.contextStrip", "Context")}>
      {files.map((file) => (
        <span key={file} className="eh-context-chip" title={file}>
          {basename(file)}
          {onRemoveAttached && attachedPaths?.includes(file) ? (
            <button
              type="button"
              className="eh-context-chip-remove"
              aria-label={t("eh.contextRemove", "Remove {file}", { file: basename(file) })}
              onClick={() => onRemoveAttached(file)}
            >
              ×
            </button>
          ) : null}
        </span>
      ))}
    </div>
  )
}
