/**
 * Link-style project folder control — click to open folder picker modal.
 * Used by Envoy Harness chat and Ext Agent chat header (matches Profile · Blog links).
 */
import { useCallback, useId, useState, type MouseEvent } from "react";

import { useT } from "../context/I18nContext.js";
import { HomeFolderPicker } from "./HomeFolderPicker.js";

export interface ProjectFolderLinkProps {
  path?: string | null;
  onSave: (path: string) => Promise<void>;
  onClear?: () => Promise<void>;
  emptyLabel?: string;
  chooseTitle?: string;
  changeTitle?: string;
  description?: string;
  ariaLabel?: string;
  confirmLabel?: string;
  pickerTitle?: string;
  linkClassName?: string;
  disabled?: boolean;
}

export function ProjectFolderLink({
  path,
  onSave,
  onClear,
  emptyLabel,
  chooseTitle,
  changeTitle,
  description,
  ariaLabel,
  confirmLabel,
  pickerTitle,
  linkClassName = "contact-web-content__link eh-project-link",
  disabled = false,
}: ProjectFolderLinkProps) {
  const t = useT();
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmedPath = path?.trim() ?? "";
  const hasPath = trimmedPath.length > 0;

  const chooseLabel =
    chooseTitle ??
    t("settings.ai.aiEngine.projectFolderTitle", "Choose project folder");
  const changeLabel =
    changeTitle ?? chooseLabel;
  const emptyText =
    emptyLabel ??
    t("settings.ai.aiEngine.projectFolderPlaceholder", "No folder selected");
  const aria =
    ariaLabel ??
    t("settings.ai.aiEngine.projectFolder", "Project folder");
  const confirmText =
    confirmLabel ??
    t("settings.ai.aiEngine.applyFolder", "Set");
  const pickerLabel = pickerTitle ?? (hasPath ? changeLabel : chooseLabel);

  const openModal = useCallback(() => {
    if (disabled) return;
    setError(null);
    setDraft(trimmedPath);
    setOpen(true);
  }, [disabled, trimmedPath]);

  const closeModal = useCallback(() => {
    if (!busy) setOpen(false);
  }, [busy]);

  const submit = useCallback(async () => {
    const next = draft.trim();
    if (!next) {
      setError(t("pi.projectPathRequired", "Choose a project folder."));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSave(next);
      setOpen(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setBusy(false);
    }
  }, [draft, onSave, t]);

  const handlePickerChange = useCallback(
    (next: string | undefined) => {
      setError(null);
      setDraft(next ?? "");
      if (!next && onClear) {
        void (async () => {
          setBusy(true);
          try {
            await onClear();
            setOpen(false);
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            setError(msg);
          } finally {
            setBusy(false);
          }
        })();
      }
    },
    [onClear],
  );

  const stop = (e: MouseEvent) => e.stopPropagation();

  return (
    <>
      <button
        type="button"
        className={linkClassName}
        onClick={openModal}
        disabled={disabled}
        title={hasPath ? changeLabel : chooseLabel}
        aria-label={aria}
      >
        {hasPath ? trimmedPath : emptyText}
      </button>

      {open ? (
        <div
          className="modal-overlay"
          role="presentation"
          onClick={closeModal}
        >
          <div
            className="modal-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            onClick={stop}
          >
            <h2 id={titleId}>
              {hasPath ? changeLabel : chooseLabel}
            </h2>
            {description ? (
              <p className="modal-desc">{description}</p>
            ) : null}
            <div className="modal-field">
              <span>{t("pi.projectPathLabel", "Project folder")}</span>
              <HomeFolderPicker
                value={draft.trim() || undefined}
                onChange={handlePickerChange}
                title={pickerLabel}
                disabled={busy}
              />
            </div>
            {error ? <p className="modal-error">{error}</p> : null}
            <div className="modal-actions">
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={closeModal}
              >
                {t("common.cancel", "Cancel")}
              </button>
              <button
                type="button"
                className="primary"
                disabled={busy || !draft.trim()}
                onClick={() => void submit()}
              >
                {busy ? "…" : confirmText}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
