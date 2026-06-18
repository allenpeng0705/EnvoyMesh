import { useEffect, useRef, useState, type ReactNode } from "react";
import { useT } from "../context/I18nContext.js";
import { ModalPortal } from "./ModalPortal.js";

export interface ConfirmDialogProps {
  /** The dialog title */
  title: string;
  /** Primary message body */
  message?: string | ReactNode;
  /** Destructive variant shows a red confirm button */
  variant?: "default" | "destructive";
  /** Label for the confirm (right) button */
  confirmLabel?: string;
  /** Label for the cancel (left) button */
  cancelLabel?: string;
  /** Called when the user confirms */
  onConfirm: () => void;
  /** Called when the user cancels or dismisses */
  onCancel: () => void;
}

/**
 * A themed confirmation dialog that replaces native `alert()` / `window.confirm()`.
 * Rendered via ModalPortal so it is not clipped by sidebar scroll containers.
 * Supports keyboard navigation (Escape to cancel, Enter to confirm).
 */
export function ConfirmDialog({
  title,
  message,
  variant = "default",
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const t = useT();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [mounted, setMounted] = useState(false);

  // Focus the cancel button by default (safe choice for destructive actions)
  useEffect(() => {
    setMounted(true);
    const timer = requestAnimationFrame(() => cancelRef.current?.focus());
    return () => cancelAnimationFrame(timer);
  }, []);

  // Trap focus inside the dialog
  useEffect(() => {
    if (!mounted) return;
    const panel = document.getElementById("confirm-dialog-panel");
    if (!panel) return;

    const focusableSelectors = [
      'button:not([disabled])',
      'input:not([disabled])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      '[tabindex]:not([tabindex="-1"])',
    ].join(", ");

    const getFocusable = (): HTMLElement[] =>
      Array.from(panel.querySelectorAll<HTMLElement>(focusableSelectors));

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
        return;
      }
      if (e.key === "Tab") {
        const focusable = getFocusable();
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    panel.addEventListener("keydown", handleKeyDown);
    return () => panel.removeEventListener("keydown", handleKeyDown);
  }, [mounted, onCancel]);

  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onCancel();
  };

  return (
    <ModalPortal>
      <div
        className="modal-overlay"
        role="presentation"
        onClick={handleOverlayClick}
      >
        <div
          id="confirm-dialog-panel"
          className="modal-panel confirm-dialog"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="confirm-dialog-title"
          aria-describedby={message ? "confirm-dialog-message" : undefined}
          onClick={(e) => e.stopPropagation()}
        >
          <h2 id="confirm-dialog-title" className="confirm-dialog-title">
            {title}
          </h2>

          {message && (
            <p id="confirm-dialog-message" className="confirm-dialog-message">
              {message}
            </p>
          )}

          <div className="modal-actions confirm-dialog-actions">
            <button
              ref={cancelRef}
              type="button"
              className="secondary"
              onClick={onCancel}
            >
              {cancelLabel ?? t("common.cancel")}
            </button>
            <button
              type="button"
              className={variant === "destructive" ? "primary danger" : "primary"}
              onClick={onConfirm}
            >
              {confirmLabel ?? t("common.confirm")}
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
