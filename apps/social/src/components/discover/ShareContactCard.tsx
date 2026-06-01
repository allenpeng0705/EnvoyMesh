import { useCallback, useState } from "react";
import QRCode from "qrcode";
import { buildEnvoyContactUri } from "@envoymesh/api";
import { useNodeState } from "../../context/NodeStateContext.js";
import { useNodeService } from "../../hooks/useNodeService.js";
import { useT } from "../../context/I18nContext.js";

export function ShareContactCard({ compact = false }: { compact?: boolean }) {
  const t = useT();
  const nodeService = useNodeService();
  const { peerId, nodeStatus, humanProfile } = useNodeState();

  const [contactQr, setContactQr] = useState<string | null>(null);
  const [contactUri, setContactUri] = useState("");
  const [contactLoading, setContactLoading] = useState(false);
  const [copyMsg, setCopyMsg] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const networkPeerId = peerId && !peerId.startsWith("envoy_") ? peerId : null;

  const handleCreateContactLink = useCallback(async () => {
    setContactLoading(true);
    try {
      const invite = await nodeService.createWanJoinInvite({ expiresInHours: 168 });
      const uri = buildEnvoyContactUri({
        peerId: networkPeerId ?? invite.invite.targetPeerId,
        joinToken: invite.token,
        displayName: humanProfile?.displayName,
        ownerId: humanProfile?.ownerId,
      });
      setContactUri(uri);
      const dataUrl = await QRCode.toDataURL(uri, { width: compact ? 200 : 256, margin: 1 });
      setContactQr(dataUrl);
    } catch (e) {
      console.error("Failed to generate contact link:", e);
    } finally {
      setContactLoading(false);
    }
  }, [compact, humanProfile?.displayName, humanProfile?.ownerId, networkPeerId, nodeService]);

  const copyInvite = () => {
    if (!contactUri) return;
    void navigator.clipboard.writeText(contactUri).then(() => {
      setCopyMsg(t("discover.share.linkCopied"));
      window.setTimeout(() => setCopyMsg(null), 2500);
    });
  };

  const copyPeerId = () => {
    if (!networkPeerId) return;
    void navigator.clipboard.writeText(networkPeerId).then(() => {
      setCopyMsg(t("discover.share.technicalIdCopied"));
      window.setTimeout(() => setCopyMsg(null), 2500);
    });
  };

  return (
    <section className={`discover-panel share-contact-card${compact ? " share-contact-card--compact" : ""}`}>
      <header className="discover-panel__header">
        <h4 className="discover-panel__title">{t("discover.share.title")}</h4>
        <p className="discover-panel__lede">{t("discover.share.lede")}</p>
      </header>

      {nodeStatus !== "running" ? (
        <p className="discover-status discover-status--warn">{t("discover.share.connectFirst")}</p>
      ) : !contactQr ? (
        <div className="share-contact-card__invite">
          <button
            type="button"
            className="discover-primary-btn"
            disabled={contactLoading}
            onClick={() => void handleCreateContactLink()}
          >
            {contactLoading ? t("discover.share.generating") : t("discover.share.createLink")}
          </button>
        </div>
      ) : (
        <div className="share-contact-card__qr">
          <div className="share-contact-card__qr-frame">
            <img
              src={contactQr}
              alt="Contact link QR code"
              width={compact ? 200 : 256}
              height={compact ? 200 : 256}
            />
          </div>
          <p className="share-contact-card__uri">
            <code>{contactUri}</code>
          </p>
          <div className="share-contact-card__actions">
            <button type="button" className="discover-primary-btn" onClick={copyInvite}>
              {t("discover.share.copyLink")}
            </button>
            <button type="button" className="secondary" onClick={() => setContactQr(null)}>
              {t("discover.share.hideQr")}
            </button>
          </div>
        </div>
      )}

      {copyMsg ? <p className="discover-status discover-status--ok">{copyMsg}</p> : null}

      {networkPeerId ? (
        <button type="button" className="discover-text-action discover-text-action--inline" onClick={() => setShowAdvanced((v) => !v)}>
          {showAdvanced ? t("discover.share.hideTechnicalId") : t("discover.share.showTechnicalId")}
        </button>
      ) : null}

      {showAdvanced && networkPeerId ? (
        <div className="share-contact-card__peer">
          <code className="peer-id-display">{networkPeerId}</code>
          <button type="button" className="secondary" onClick={copyPeerId}>
            {t("common.copy")}
          </button>
        </div>
      ) : null}
    </section>
  );
}
