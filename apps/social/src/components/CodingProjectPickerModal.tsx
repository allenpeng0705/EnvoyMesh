/**
 * Polished project-folder picker for Coding-section chats (Envoy Harness threads).
 */
import { useT } from "../context/I18nContext.js";
import { HomeFolderPicker } from "./HomeFolderPicker.js";
import { ModalPortal } from "./ModalPortal.js";

export interface CodingProjectPickerModalProps {
  open: boolean;
  title: string;
  description: string;
  value: string;
  onChange: (path: string) => void;
  error?: string | null;
  busy?: boolean;
  confirmLabel: string;
  busyLabel?: string;
  pickerTitle?: string;
  onClose: () => void;
  onConfirm: () => void;
}

export function CodingProjectPickerModal({
  open,
  title,
  description,
  value,
  onChange,
  error,
  busy = false,
  confirmLabel,
  busyLabel,
  pickerTitle,
  onClose,
  onConfirm,
}: CodingProjectPickerModalProps) {
  const t = useT();
  if (!open) return null;

  const trimmed = value.trim();
  const canConfirm = trimmed.length > 0 && !busy;

  return (
    <ModalPortal>
      <div
        className="modal-overlay coding-project-modal-overlay"
        role="presentation"
        onClick={() => {
          if (!busy) onClose();
        }}
      >
        <div
          className="modal-panel coding-project-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="coding-project-modal-title"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="modal-header">
            <h2 id="coding-project-modal-title">{title}</h2>
            <button
              type="button"
              className="modal-close"
              onClick={onClose}
              disabled={busy}
              aria-label={t("common.close", "Close")}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                aria-hidden
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          <p className="modal-desc coding-project-modal__desc">{description}</p>

          <div className="coding-project-modal__picker-wrap">
            <label className="modal-field coding-project-modal__field">
              {t("pi.projectPathLabel", "Project folder")}
              <HomeFolderPicker
                value={trimmed || undefined}
                onChange={(path) => onChange(path ?? "")}
                title={pickerTitle ?? title}
                disabled={busy}
              />
            </label>
            {trimmed ? (
              <p className="coding-project-modal__path-hint" title={trimmed}>
                {trimmed}
              </p>
            ) : null}
          </div>

          {error ? (
            <p className="modal-error coding-project-modal__error" role="alert">
              {error}
            </p>
          ) : null}

          <div className="modal-actions coding-project-modal__actions">
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={onClose}
            >
              {t("common.cancel", "Cancel")}
            </button>
            <button
              type="button"
              className="primary"
              disabled={!canConfirm}
              onClick={onConfirm}
            >
              {busy ? (busyLabel ?? "…") : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
