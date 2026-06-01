import { useEffect, useState } from "react";
import { useT } from "../context/I18nContext.js";
import { useNodeService } from "../hooks/useNodeService.js";
import { ModalPortal } from "./ModalPortal.js";

interface RemoveContactConfirmModalProps {
  peerOwnerId: string;
  displayName: string;
  onClose: () => void;
  onRemoved?: () => void;
}

export function RemoveContactConfirmModal({
  peerOwnerId,
  displayName,
  onClose,
  onRemoved,
}: RemoveContactConfirmModalProps) {
  const t = useT();
  const nodeService = useNodeService();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [busy, onClose]);

  const handleRemove = async () => {
    setBusy(true);
    setError(null);
    try {
      await nodeService.revokeBond(peerOwnerId);
      onRemoved?.();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("contactChat.removeContactFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalPortal>
      <div className="modal-overlay" role="presentation" onClick={busy ? undefined : onClose}>
        <div
          className="modal-panel remove-contact-modal"
          role="dialog"
          aria-labelledby="remove-contact-title"
          aria-describedby="remove-contact-desc"
          onClick={(e) => e.stopPropagation()}
        >
          <h2 id="remove-contact-title">{t("contacts.removeNamed", { name: displayName })}</h2>
          <p id="remove-contact-desc" className="modal-desc">
            {t("contacts.removeConfirm")}
          </p>
          {error ? <p className="modal-error">{error}</p> : null}
          <div className="modal-actions">
            <button type="button" className="secondary" disabled={busy} onClick={onClose}>
              {t("common.cancel")}
            </button>
            <button
              type="button"
              className="secondary danger"
              disabled={busy}
              onClick={() => void handleRemove()}
            >
              {busy ? t("common.loading") : t("contacts.removeContact")}
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
