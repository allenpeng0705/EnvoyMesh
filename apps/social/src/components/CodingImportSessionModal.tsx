/**
 * Pick a past Coding session for this project (resume / switch).
 */

import { useT } from "../context/I18nContext.js";
import { ModalPortal } from "./ModalPortal.js";

export type CodingImportSessionRow = {
  id: string;
  title: string;
  subtitle?: string;
};

export type CodingImportSessionModalProps = {
  open: boolean;
  rows: CodingImportSessionRow[];
  busy?: boolean;
  onClose: () => void;
  onPick: (id: string) => void;
};

export function CodingImportSessionModal({
  open,
  rows,
  busy = false,
  onClose,
  onPick,
}: CodingImportSessionModalProps) {
  const t = useT();
  if (!open) return null;

  return (
    <ModalPortal>
      <div
        className="modal-overlay"
        role="presentation"
        data-testid="coding-import-session-modal"
        onClick={() => {
          if (!busy) onClose();
        }}
      >
        <div
          className="modal-panel coding-job-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="coding-import-session-title"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="modal-header">
            <h2 id="coding-import-session-title">
              {t("codingView.importSessionTitle", "Import session")}
            </h2>
            <button
              type="button"
              className="modal-close"
              onClick={onClose}
              disabled={busy}
              aria-label={t("common.close", "Close")}
            >
              ×
            </button>
          </div>
          <p className="modal-desc">
            {t(
              "codingView.importSessionDesc",
              "Resume another task for this project.",
            )}
          </p>
          {rows.length === 0 ? (
            <p className="coding-import-session-empty" role="status">
              {t(
                "codingView.importSessionEmpty",
                "No other sessions for this project yet.",
              )}
            </p>
          ) : (
            <ul className="coding-import-session-list">
              {rows.map((row) => (
                <li key={row.id}>
                  <button
                    type="button"
                    className="coding-import-session-row"
                    disabled={busy}
                    data-testid={`coding-import-session-${row.id}`}
                    onClick={() => onPick(row.id)}
                  >
                    <strong>{row.title}</strong>
                    {row.subtitle ? (
                      <span className="coding-import-session-sub">
                        {row.subtitle}
                      </span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="modal-actions">
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={onClose}
            >
              {t("common.cancel", "Cancel")}
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
