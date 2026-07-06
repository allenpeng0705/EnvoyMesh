import { useCallback, useState } from "react";
import { useT } from "../../context/I18nContext.js";
import { ModalPortal } from "../ModalPortal.js";

type ShareContactModalProps = {
  onClose: () => void;
  contactUri: string;
  contactQr: string | null;
  expiryLabel?: string;
};

export function ShareContactModal({
  onClose,
  contactUri,
  contactQr,
  expiryLabel,
}: ShareContactModalProps) {
  const t = useT();
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(contactUri);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard may be unavailable in embedded WebViews.
    }
  }, [contactUri]);

  return (
    <ModalPortal>
      <div className="modal-overlay" role="presentation" onClick={onClose}>
        <div
          className="pairing-modal share-contact-modal"
          role="dialog"
          aria-label={t("discover.share.modalTitle")}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="pairing-modal__header">
            <div>
              <h2 className="pairing-modal__title">{t("discover.share.modalTitle")}</h2>
              <p className="pairing-modal__subtitle">{t("discover.share.modalSubtitle")}</p>
              {expiryLabel ? (
                <p className="share-contact-modal__expiry">{expiryLabel}</p>
              ) : null}
            </div>
            <button
              type="button"
              className="pairing-modal__close"
              onClick={onClose}
              aria-label={t("discover.share.closeModal")}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          <div className="pairing-modal__body">
            {contactQr ? (
              <>
                <img
                  src={contactQr}
                  alt={t("discover.share.qrAlt")}
                  className="pairing-modal__qr share-contact-modal__qr"
                />
                <p className="pairing-modal__hint">{t("discover.share.scanHint")}</p>
                <p className="pairing-modal__hint pairing-modal__hint--muted">
                  {t("discover.share.qrIdentityHint")}
                </p>
              </>
            ) : (
              <p className="pairing-modal__hint">{t("discover.share.qrLinkOnlyHint")}</p>
            )}
            <code className="pairing-modal__uri">{contactUri}</code>
            <div className="pairing-modal__actions">
              <button type="button" className="btn btn-primary" onClick={() => void handleCopy()}>
                {copied ? t("discover.share.linkCopied") : t("discover.share.copyLink")}
              </button>
              <button type="button" className="btn btn-secondary" onClick={onClose}>
                {t("discover.share.closeModal")}
              </button>
            </div>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
