import { useCallback, useEffect, useState } from "react";
import QRCode from "qrcode";
import { encodePairingToken } from "@envoymesh/api";
import { useT } from "../context/I18nContext.js";
import { useNodeService } from "../hooks/useNodeService.js";
import { ModalPortal } from "./ModalPortal.js";
import { FamilyInviteQRModal } from "./FamilyInviteQRModal.js";

interface PairingQRModalProps {
  onClose: () => void;
}

/**
 * Mobile-pairing QR + URI modal. Uses a gzip-compressed token in the QR code
 * (via {@link encodePairingToken}) so the URI stays short enough to scan reliably.
 * The token format is: `envoy://pair?pairing=<base64url-gzip-json>`.
 *
 * EnvoyGo decodes the `pairing` param with its own pure-Dart gzip decoder.
 * Extra regional relays travel as compact `rels` WebSocket bases; the built-in
 * community relay is not embedded (EnvoyGo already has it).
 *
 * Phase 51 — includes a button to open the family invite QR (not shown by
 * default; owner pairing remains the primary code in this dialog).
 */
export function PairingQRModal({ onClose }: PairingQRModalProps) {
  const t = useT();
  const nodeService = useNodeService();
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [uri, setUri] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showFamilyInvite, setShowFamilyInvite] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const payload = await nodeService.getPairingPayload();
        if (cancelled) return;

        // Encode all fields into a gzip-compressed token — keeps the QR short
        // enough to scan reliably despite the dense encoding.
        const token = await encodePairingToken(payload);
        const built = `envoy://pair?pairing=${token}`;
        const dataUrl = await QRCode.toDataURL(built, { width: 512, margin: 2 });
        if (cancelled) return;
        setUri(built);
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
      // Clipboard might be unavailable in some embedded contexts; fail quietly.
    }
  }, [uri]);

  if (showFamilyInvite) {
    return (
      <FamilyInviteQRModal
        closeAriaLabel={t(
          "pairing.familyInviteBackAria",
          "Back to owner pairing QR",
        )}
        onClose={() => {
          // Back to owner pairing QR (same top-bar session). Closing the
          // family modal does not dismiss the whole pairing flow.
          setShowFamilyInvite(false);
        }}
      />
    );
  }

  const familyInviteSection = (
    <div className="pairing-modal__family">
      <p className="pairing-modal__family-hint">
        {t(
          "pairing.familyHint",
          "Inviting Mom or Dad? Use a family invite — not this code (this one grants full owner access).",
        )}
      </p>
      <button
        type="button"
        className="btn btn-secondary pairing-modal__family-btn"
        onClick={() => setShowFamilyInvite(true)}
      >
        {t("pairing.showFamilyInvite", "Show family invite QR")}
      </button>
    </div>
  );

  return (
    <ModalPortal>
      <div className="modal-overlay" role="presentation" onClick={onClose}>
        <div
          className="pairing-modal"
          role="dialog"
          aria-modal="true"
          aria-label={t("pairing.modalAria")}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="pairing-modal__header">
            <div>
              <h2 className="pairing-modal__title">{t("pairing.title")}</h2>
              {qrDataUrl && !loading && !error && (
                <p className="pairing-modal__subtitle">{t("pairing.subtitle")}</p>
              )}
            </div>
            <button
              type="button"
              className="pairing-modal__close"
              onClick={onClose}
              aria-label={t("pairing.closeAria")}
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
            {loading && (
              <div className="pairing-modal__loading">
                <svg className="pairing-modal__spinner" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" strokeDasharray="31.4 31.4" />
                </svg>
              </div>
            )}
            {error && <p className="pairing-modal__error">{error}</p>}
            {qrDataUrl && !loading && !error && (
              <>
                <img
                  src={qrDataUrl}
                  alt={t("pairing.qrAlt")}
                  className="pairing-modal__qr"
                />
                <p className="pairing-modal__hint">{t("pairing.scanToPair")}</p>
                <code className="pairing-modal__uri">{uri}</code>
                <div className="pairing-modal__actions">
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => void handleCopy()}
                  >
                    {copied ? t("pairing.copied") : t("pairing.copyUri")}
                  </button>
                </div>
              </>
            )}
            {/* Family invite is independent of owner QR generation — keep reachable on error. */}
            {!loading ? familyInviteSection : null}
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
