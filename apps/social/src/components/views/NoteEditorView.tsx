/**
 * Modal markdown file editor for creating and editing vault notes under notes/.
 *
 * Used by LibraryView. Supports:
 * - **create**: New markdown file (filename + optional subfolder)
 * - **edit**: Existing vault .md file (saves in place)
 *
 * Reuses MarkdownEditor (toolbar, write/preview/split) in a centered popup.
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { useNodeService } from "../../hooks/useNodeService.js"
import { useT } from "../../context/I18nContext.js"
import { MarkdownEditor } from "../MarkdownEditor.js"
import { ModalPortal } from "../ModalPortal.js"

export type NoteEditorMode = "create" | "edit"

export interface NoteEditorProps {
  /** Whether we are creating a new file or editing an existing one. */
  mode: NoteEditorMode
  /**
   * Vault-relative path of the file to edit.
   * Ignored when mode is "create".
   */
  relativePath?: string
  /** Optional subfolder for new files (e.g. "projects"). */
  defaultSubfolder?: string
  /** Sensitivity for new files. */
  defaultSensitivity?: "public" | "friends" | "private"
  /** Called after a successful save or create. */
  onSaved?: (relativePath: string) => void
  /** Called when the user dismisses the editor. */
  onClose: () => void
}

export function NoteEditorView({
  mode,
  relativePath: initialRelativePath,
  defaultSubfolder,
  defaultSensitivity,
  onSaved,
  onClose,
}: NoteEditorProps) {
  const t = useT()
  const nodeService = useNodeService()
  const filenameInputRef = useRef<HTMLInputElement>(null)

  const [filename, setFilename] = useState("")
  const [subfolder, setSubfolder] = useState(defaultSubfolder ?? "")
  const [sensitivity, setSensitivity] = useState<"public" | "friends" | "private">(
    defaultSensitivity ?? "public",
  )
  const [content, setContent] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (mode === "edit" && initialRelativePath && !loaded) {
      setBusy(true)
      nodeService
        .readLibraryItemContent({ relativePath: initialRelativePath, maxBytes: 512 * 1024 })
        .then((result) => {
          const bytes = Uint8Array.from(atob(result.contentBase64), (c) => c.charCodeAt(0))
          const text = new TextDecoder().decode(bytes)
          setContent(text)
          setLoaded(true)
        })
        .catch((err) => {
          setError(err instanceof Error ? err.message : String(err))
        })
        .finally(() => {
          setBusy(false)
        })
    }
    if (mode === "create") {
      requestAnimationFrame(() => filenameInputRef.current?.focus())
    }
  }, [mode, initialRelativePath, loaded, nodeService])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose()
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [busy, onClose])

  const handleSave = useCallback(async () => {
    if (mode === "create") {
      const name = filename.trim()
      if (!name) {
        setError(t("notes.errorFilename"))
        return
      }
      const fn = /\.md$/i.test(name) ? name.replace(/\.md$/i, ".md") : `${name}.md`
      setBusy(true)
      setError(null)
      try {
        const result = await nodeService.createNote({
          filename: fn,
          content,
          subfolder: subfolder.trim() || undefined,
          sensitivity,
        })
        onSaved?.(result.relativePath)
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setBusy(false)
      }
    } else if (mode === "edit" && initialRelativePath) {
      const parts = initialRelativePath.replace(/^notes\//, "").split("/")
      const fn = parts.pop() ?? ""
      const sf = parts.join("/") || undefined
      setBusy(true)
      setError(null)
      try {
        const result = await nodeService.createNote({
          filename: fn,
          content,
          subfolder: sf,
          sensitivity,
        })
        onSaved?.(result.relativePath)
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setBusy(false)
      }
    }
  }, [mode, filename, content, subfolder, sensitivity, initialRelativePath, nodeService, onSaved, t])

  const isEditingExistingNote = initialRelativePath?.startsWith("notes/")
  const title = mode === "create" ? t("notes.newNote") : t("notes.editNote")

  return (
    <ModalPortal>
      <div
        className="modal-overlay"
        role="presentation"
        onClick={() => {
          if (!busy) onClose()
        }}
      >
        <div
          className="modal-panel note-editor-modal"
          role="dialog"
          aria-labelledby="note-editor-title"
          data-testid="note-editor-modal"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="note-editor-modal__header">
            <h2 id="note-editor-title">{title}</h2>
            <button
              type="button"
              className="note-editor-modal__close"
              onClick={onClose}
              disabled={busy}
              aria-label={t("common.cancel")}
            >
              ✕
            </button>
          </div>
          <p className="modal-desc note-editor-modal__lede">{t("notes.lede")}</p>

          {mode === "create" && (
            <div className="note-editor-modal__meta">
              <div className="note-editor-modal__filename-wrap">
                <input
                  ref={filenameInputRef}
                  type="text"
                  className="text-input note-editor-modal__filename"
                  placeholder={t("notes.filenamePlaceholder")}
                  value={filename}
                  onChange={(e) => setFilename(e.target.value)}
                  disabled={busy}
                  aria-label={t("notes.filenameAria")}
                  data-testid="note-editor-filename"
                />
                <span className="note-editor-modal__ext" aria-hidden="true">
                  .md
                </span>
              </div>
              <input
                type="text"
                className="text-input note-editor-modal__subfolder"
                placeholder={t("notes.subfolderPlaceholder")}
                value={subfolder}
                onChange={(e) => setSubfolder(e.target.value)}
                disabled={busy}
                aria-label={t("notes.subfolderPlaceholder")}
              />
              <select
                className="text-input note-editor-modal__sensitivity"
                value={sensitivity}
                onChange={(e) => setSensitivity(e.target.value as "public" | "friends" | "private")}
                disabled={busy}
                aria-label={t("notes.sensitivityPublic")}
              >
                <option value="public">{t("notes.sensitivityPublic")}</option>
                <option value="friends">{t("notes.sensitivityFriends")}</option>
                <option value="private">{t("notes.sensitivityPrivate")}</option>
              </select>
            </div>
          )}

          {mode === "edit" && (
            <div className="note-editor-modal__meta">
              <span className="note-editor-modal__path">{initialRelativePath}</span>
              {isEditingExistingNote && (
                <select
                  className="text-input note-editor-modal__sensitivity"
                  value={sensitivity}
                  onChange={(e) =>
                    setSensitivity(e.target.value as "public" | "friends" | "private")
                  }
                  disabled={busy}
                >
                  <option value="public">{t("notes.sensitivityPublic")}</option>
                  <option value="friends">{t("notes.sensitivityFriends")}</option>
                  <option value="private">{t("notes.sensitivityPrivate")}</option>
                </select>
              )}
            </div>
          )}

          <div className="note-editor-modal__editor">
            <MarkdownEditor
              value={content}
              onChange={setContent}
              disabled={busy || (mode === "edit" && !loaded)}
              placeholder={t("notes.contentPlaceholder")}
              rows={18}
              articleMode
              data-testid="note-markdown-editor"
            />
          </div>

          {error && (
            <p className="note-editor-modal__error" role="alert">
              {error}
            </p>
          )}

          <div className="note-editor-modal__footer">
            <button type="button" className="secondary" onClick={onClose} disabled={busy}>
              {t("common.cancel")}
            </button>
            <button
              type="button"
              className="primary"
              disabled={busy || (mode === "create" && !filename.trim())}
              onClick={() => void handleSave()}
            >
              {busy ? t("notes.saving") : t("common.save")}
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  )
}
