import { useCallback, useEffect, useState } from "react";
import QRCode from "qrcode";
import { useT } from "../context/I18nContext.js";
import { useNodeService } from "../hooks/useNodeService.js";
import { ModalPortal } from "./ModalPortal.js";

interface FamilyInviteQRModalProps {
  onClose: () => void;
}

/**
 * Phase 51F — family invite QR (`envoy://invite?…` with kind family).
 * Distinct from the owner pairing QR in the top bar.
 */
export function FamilyInviteQRModal({ onClose }: FamilyInviteQRModalProps) {
  const t = useT();
  const nodeService = useNodeService();
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [uri, setUri] = useState("");
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const result = await nodeService.generateFamilyInviteToken({
          expiresInHours: 72,
          note: "Family invite",
        });
        if (cancelled) return;
        const dataUrl = await QRCode.toDataURL(result.uri, {
          width: 512,
          margin: 2,
        });
        if (cancelled) return;
        setUri(result.uri);
        setExpiresAt(result.expiresAt);
        setQrDataUrl(dataUrl);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [nodeService]);

  const handleCopy = useCallback(async () => {
    if (!uri) return;
    try {
      await navigator.clipboard.writeText(uri);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard may be unavailable */
    }
  }, [uri]);

  return (
    <ModalPortal>
      <div className="modal-overlay" role="presentation" onClick={onClose}>
        <div
          className="pairing-modal family-invite-modal"
          role="dialog"
          aria-label={t("settings.family.inviteModalAria", "Family invite QR")}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="pairing-modal__header">
            <div>
              <p className="family-invite-modal__eyebrow">
                {t("settings.family.inviteEyebrow", "Family invite")}
              </p>
              <h2 className="pairing-modal__title">
                {t("settings.family.inviteTitle", "Invite a family member")}
              </h2>
              {!loading && !error ? (
                <p className="pairing-modal__subtitle">
                  {t(
                    "settings.family.inviteSubtitle",
                    "Scan with EnvoyGo → Join Family → enter a name (or pick an existing profile).",
                  )}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              className="pairing-modal__close"
              onClick={onClose}
              aria-label={t("pairing.closeAria", "Close")}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          <div className="pairing-modal__body">
            {loading ? (
              <div className="pairing-modal__loading">
                <svg className="pairing-modal__spinner" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <circle
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeDasharray="31.4 31.4"
                  />
                </svg>
                <p className="pairing-modal__hint">
                  {t("settings.family.inviteLoading", "Generating invite…")}
                </p>
              </div>
            ) : null}
            {error ? <p className="pairing-modal__error" role="alert">{error}</p> : null}
            {qrDataUrl && !loading && !error ? (
              <>
                <img
                  src={qrDataUrl}
                  alt={t("settings.family.inviteQrAlt", "Family invite QR code")}
                  className="pairing-modal__qr"
                  width={256}
                  height={256}
                />
                <p className="pairing-modal__hint">
                  {t(
                    "settings.family.inviteScanHint",
                    "Open EnvoyGo → Pair → scan this code (not the owner pairing QR).",
                  )}
                </p>
                {expiresAt ? (
                  <p className="pairing-modal__hint pairing-modal__hint--muted">
                    {t("settings.family.inviteExpires", "Expires {at}", {
                      at: new Date(expiresAt).toLocaleString(),
                    })}
                  </p>
                ) : null}
                <code className="pairing-modal__uri">{uri}</code>
                <div className="pairing-modal__actions">
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => void handleCopy()}
                  >
                    {copied
                      ? t("settings.family.copied", "Copied")
                      : t("settings.family.copyUri", "Copy invite link")}
                  </button>
                </div>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
