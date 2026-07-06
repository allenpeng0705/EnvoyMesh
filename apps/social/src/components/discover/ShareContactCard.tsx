import { useCallback, useState } from "react";
import QRCode from "qrcode";
import { buildEnvoyContactQrUri, buildEnvoyContactUri } from "@envoymesh/api";
import type { WanJoinInviteExpiryPresetId } from "@envoymesh/api";
import { useNodeState } from "../../context/NodeStateContext.js";
import { useIsInProcessMobileNode, useNodeService } from "../../hooks/useNodeService.js";
import { useT } from "../../context/I18nContext.js";
import {
  WanJoinInviteExpirySelect,
  expiresInHoursForPreset,
} from "../common/WanJoinInviteExpirySelect.js";
import { ShareContactModal } from "./ShareContactModal.js";

function ShareLinkIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ShareContactCard({ compact = false }: { compact?: boolean }) {
  const t = useT();
  const nodeService = useNodeService();
  const isMobileNode = useIsInProcessMobileNode();
  const { peerId, nodeStatus, humanProfile } = useNodeState();

  const [contactQr, setContactQr] = useState<string | null>(null);
  const [contactUri, setContactUri] = useState("");
  const [contactLoading, setContactLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copyMsg, setCopyMsg] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [expiryPreset, setExpiryPreset] = useState<WanJoinInviteExpiryPresetId>("days7");

  const networkPeerId = peerId && !peerId.startsWith("envoy_") ? peerId : null;
  const expiryLabel = t(`discover.share.expiry.${expiryPreset}`);
  const canCreate =
    nodeStatus === "running" && !isMobileNode && !contactLoading;

  const handleCreateContactLink = useCallback(async () => {
    setContactLoading(true);
    setError(null);
    setCopyMsg(null);
    try {
      const result = await nodeService.createWanJoinInvite({
        expiresInHours: expiresInHoursForPreset(expiryPreset),
        compact: true,
      });
      const contactFields = {
        peerId: networkPeerId ?? result.invite.targetPeerId,
        displayName: humanProfile?.displayName,
        ownerId: humanProfile?.ownerId,
      };
      const uri = buildEnvoyContactUri({
        ...contactFields,
        joinToken: result.token,
      });
      const qrUri = buildEnvoyContactQrUri(contactFields);
      let dataUrl: string | null = null;
      try {
        dataUrl = await QRCode.toDataURL(qrUri, {
          width: compact ? 280 : 320,
          margin: 2,
          errorCorrectionLevel: "L",
        });
      } catch (qrErr) {
        console.warn("Contact QR encode failed; showing copy link only:", qrErr);
      }
      setContactUri(uri);
      setContactQr(dataUrl);
      setModalOpen(true);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error("Failed to generate contact link:", e);
      setError(message || t("discover.share.errorGeneric"));
    } finally {
      setContactLoading(false);
    }
  }, [
    compact,
    expiryPreset,
    humanProfile?.displayName,
    humanProfile?.ownerId,
    networkPeerId,
    nodeService,
    t,
  ]);

  const handleCloseModal = useCallback(() => {
    setModalOpen(false);
  }, []);

  const copyPeerId = () => {
    if (!networkPeerId) return;
    void navigator.clipboard.writeText(networkPeerId).then(() => {
      setCopyMsg(t("discover.share.technicalIdCopied"));
      window.setTimeout(() => setCopyMsg(null), 2500);
    });
  };

  return (
    <>
      <section className={`discover-panel share-contact-card${compact ? " share-contact-card--compact" : ""}`}>
        <header className="share-contact-card__header">
          <div className="share-contact-card__icon" aria-hidden="true">
            <ShareLinkIcon />
          </div>
          <div>
            <h4 className="discover-panel__title">{t("discover.share.title")}</h4>
            <p className="discover-panel__lede">{t("discover.share.lede")}</p>
          </div>
        </header>

        {nodeStatus !== "running" ? (
          <p className="discover-status discover-status--warn">{t("discover.share.connectFirst")}</p>
        ) : isMobileNode ? (
          <p className="discover-status discover-status--warn">{t("discover.share.mobileHomeNodeOnly")}</p>
        ) : (
          <div className="share-contact-card__invite">
            <WanJoinInviteExpirySelect
              id="share-contact-expiry"
              value={expiryPreset}
              onChange={setExpiryPreset}
              disabled={contactLoading}
            />
            <button
              type="button"
              className="discover-primary-btn share-contact-card__create-btn"
              disabled={!canCreate}
              onClick={() => void handleCreateContactLink()}
            >
              {contactLoading ? t("discover.share.generating") : t("discover.share.createLink")}
            </button>
            {contactUri && !modalOpen ? (
              <button
                type="button"
                className="discover-secondary-btn share-contact-card__reopen-btn"
                onClick={() => setModalOpen(true)}
              >
                {t("discover.share.showQrAgain")}
              </button>
            ) : null}
          </div>
        )}

        {error ? <p className="discover-status discover-status--warn">{error}</p> : null}
        {copyMsg ? <p className="discover-status discover-status--ok">{copyMsg}</p> : null}

        {networkPeerId ? (
          <button
            type="button"
            className="discover-text-action discover-text-action--inline"
            onClick={() => setShowAdvanced((v) => !v)}
          >
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

      {modalOpen && contactUri ? (
        <ShareContactModal
          onClose={handleCloseModal}
          contactUri={contactUri}
          contactQr={contactQr}
          expiryLabel={t("discover.share.expiryNote", { label: expiryLabel })}
        />
      ) : null}
    </>
  );
}
