import { useCallback, useEffect, useState } from "react";
import QRCode from "qrcode";
import { useT } from "../context/I18nContext.js";
import { useNodeService } from "../hooks/useNodeService.js";
import { ModalPortal } from "./ModalPortal.js";

interface PairingQRModalProps {
  onClose: () => void;
}

/**
 * Mobile-pairing QR + URI modal. Builds the `envoy://pair?...` URI from
 * the home node's pairing payload and renders a scannable QR alongside
 * the copy-able URL. Triggered from the top-bar QR icon so a user can
 * pair HomeClaw / EnvoyGo without leaving whatever view they're in.
 */
export function PairingQRModal({ onClose }: PairingQRModalProps) {
  const t = useT();
  const nodeService = useNodeService();
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [uri, setUri] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const payload = await nodeService.getPairingPayload();
        if (cancelled) return;
        const params = new URLSearchParams({ wsUrl: payload.wsUrl });
        if (payload.lanWsUrl) params.set("lanWsUrl", payload.lanWsUrl);
        if (payload.relayPeerId) params.set("relayPeerId", payload.relayPeerId);
        if (payload.relayWsUrl) params.set("relayWsUrl", payload.relayWsUrl);
        if (payload.agentPeerId) params.set("agentPeerId", payload.agentPeerId);
        if (payload.agentPubKey) params.set("agentPubKey", payload.agentPubKey);
        if (payload.agentName) params.set("agentName", payload.agentName);
        if (payload.token) params.set("token", payload.token);
        if (payload.ownerPublicKey) params.set("ownerPublicKey", payload.ownerPublicKey);
        if (payload.ownerId) params.set("ownerId", payload.ownerId);
        if (payload.homeNodePeerId) params.set("homeNodePeerId", payload.homeNodePeerId);
        // Include bootstrap preset names for compact QR encoding.
        // EnvoyGo resolves these to full multiaddr strings using the same
        // preset registry as the home node.
        if (payload.bootstrapPresetNames && payload.bootstrapPresetNames.length > 0) {
          params.set("bootstrapPresetNames", payload.bootstrapPresetNames.join(","));
        }
        // Also include full bootstrap peer multiaddrs for compatibility.
        if (payload.bootstrapPeers && payload.bootstrapPeers.length > 0) {
          params.set("bootstrapPeers", payload.bootstrapPeers.join(","));
        }
        const built = `envoy://pair?${params.toString()}`;
        const dataUrl = await QRCode.toDataURL(built, { width: 256, margin: 1 });
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

  return (
    <ModalPortal>
      <div className="modal-overlay" role="presentation" onClick={onClose}>
        <div
          className="pairing-modal"
          role="dialog"
          aria-label={t("pairing.modalAria")}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="pairing-modal__header">
            <div>
              <h2 className="pairing-modal__title">{t("pairing.title")}</h2>
              <p className="pairing-modal__subtitle">{t("pairing.subtitle")}</p>
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
            {loading && <p className="pairing-modal__status">{t("pairing.generating")}</p>}
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
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
