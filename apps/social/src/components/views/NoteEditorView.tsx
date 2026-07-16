/**
 * Inline note editor for creating and editing markdown notes in the vault.
 *
 * Used by LibraryView as a slide-in panel. Supports three modes:
 * - **create**: Start a new note (asks for filename on save)
 * - **edit**: Edit an existing vault .md file (saves in place)
 *
 * Phase 44A2 — Native Note Creation.
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { useNodeService } from "../../hooks/useNodeService.js"
import { useT } from "../../context/I18nContext.js"

export type NoteEditorMode = "create" | "edit"

export interface NoteEditorProps {
  /** Whether we are creating a new note or editing an existing one. */
  mode: NoteEditorMode
  /**
   * Vault-relative path of the note to edit.
   * Ignored when mode is "create".
   */
  relativePath?: string
  /** Optional subfolder for new notes (e.g. "projects"). */
  defaultSubfolder?: string
  /** Sensitivity for new notes. */
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
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const [filename, setFilename] = useState("")
  const [subfolder, setSubfolder] = useState(defaultSubfolder ?? "")
  const [sensitivity, setSensitivity] = useState<"public" | "friends" | "private">(
    defaultSensitivity ?? "public",
  )
  const [content, setContent] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  // Load existing note content when editing.
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
      // Auto-focus the filename field on mount.
      requestAnimationFrame(() => textareaRef.current?.focus())
    }
  }, [mode, initialRelativePath, loaded, nodeService])

  const handleSave = useCallback(async () => {
    if (mode === "create") {
      const name = filename.trim()
      if (!name) {
        setError(t("notes.errorFilename"))
        return
      }
      const fn = name.endsWith(".md") ? name : `${name}.md`
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
      // Save = createNote with the same relative path (overwrite).
      // Extract filename and subfolder from the path.
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

  return (
    <div className="note-editor-overlay" role="dialog" aria-label={t("notes.title")}>
      <div className="note-editor-panel">
        <div className="note-editor-header">
          <h3>{mode === "create" ? t("notes.newNote") : t("notes.editNote")}</h3>
          <button type="button" className="note-editor-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        {mode === "create" && (
          <div className="note-editor-meta">
            <input
              type="text"
              className="note-editor-filename"
              placeholder={t("notes.filenamePlaceholder")}
              value={filename}
              onChange={(e) => setFilename(e.target.value)}
              disabled={busy}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  textareaRef.current?.focus()
                }
              }}
            />
            <input
              type="text"
              className="note-editor-subfolder"
              placeholder={t("notes.subfolderPlaceholder")}
              value={subfolder}
              onChange={(e) => setSubfolder(e.target.value)}
              disabled={busy}
            />
            <select
              className="note-editor-sensitivity"
              value={sensitivity}
              onChange={(e) => setSensitivity(e.target.value as "public" | "friends" | "private")}
              disabled={busy}
            >
              <option value="public">{t("notes.sensitivityPublic")}</option>
              <option value="friends">{t("notes.sensitivityFriends")}</option>
              <option value="private">{t("notes.sensitivityPrivate")}</option>
            </select>
          </div>
        )}

        {mode === "edit" && (
          <div className="note-editor-meta">
            <span className="note-editor-path">{initialRelativePath}</span>
            {isEditingExistingNote && (
              <select
                className="note-editor-sensitivity"
                value={sensitivity}
                onChange={(e) => setSensitivity(e.target.value as "public" | "friends" | "private")}
                disabled={busy}
              >
                <option value="public">{t("notes.sensitivityPublic")}</option>
                <option value="friends">{t("notes.sensitivityFriends")}</option>
                <option value="private">{t("notes.sensitivityPrivate")}</option>
              </select>
            )}
          </div>
        )}

        <textarea
          ref={textareaRef}
          className="note-editor-content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          disabled={busy}
          placeholder={t("notes.contentPlaceholder")}
          spellCheck
        />

        {error && <p className="note-editor-error" role="alert">{error}</p>}

        <div className="note-editor-footer">
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
  )
}
