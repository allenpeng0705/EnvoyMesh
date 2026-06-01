import type { ReactNode } from "react";
import type { BondRecord, HelloRequest, PeerSearchResult } from "@envoymesh/api";
import type { NodeConfig } from "@envoymesh/api";
import type { NetworkPresetId } from "../../lib/network-presets.js";
import { useT } from "../../context/I18nContext.js";
import { BackIcon, CopyIcon, P2PIcon, QRCodeIcon, SearchIcon } from "../../icons.js";
import { NearbyPeersPanel } from "./NearbyPeersPanel.js";
import { ShareContactCard } from "./ShareContactCard.js";
import { PendingHellosPanel } from "./PendingHellosPanel.js";
import { DiscoveryTroubleshooter } from "./DiscoveryTroubleshooter.js";

export type WizardStep = "choose" | "nearby" | "share" | "paste" | "search";

export function AddFriendWizard({
  step,
  onStep,
  networkPreset,
  discoveredPeers,
  bonds,
  outboundHellos,
  nodeStatus,
  nodeConfig,
  helloHint,
  pendingHellOs,
  onSayHello,
  onAcceptHello,
  onDeclineHello,
  pastePanel,
  searchPanel,
}: {
  step: WizardStep;
  onStep: (step: WizardStep) => void;
  networkPreset: NetworkPresetId;
  discoveredPeers: PeerSearchResult[];
  bonds: BondRecord[];
  outboundHellos: ReadonlySet<string>;
  nodeStatus: string;
  nodeConfig: NodeConfig | null;
  helloHint: string | null;
  pendingHellOs: HelloRequest[];
  onSayHello: (targetId: string) => void;
  onAcceptHello: (request: HelloRequest) => void | Promise<void>;
  onDeclineHello: (request: HelloRequest) => void | Promise<void>;
  pastePanel: ReactNode;
  searchPanel: ReactNode;
}) {
  const t = useT();
  const sameWifiRecommended = networkPreset === "same-wifi";

  const pathChoices: Array<{
    step: Exclude<WizardStep, "choose">;
    icon: typeof P2PIcon;
    title: string;
    subtitle: string;
    recommended: boolean;
  }> = [
    {
      step: "nearby",
      icon: P2PIcon,
      title: t("discover.wizard.sameWifi"),
      subtitle: t("discover.wizard.sameWifiHint"),
      recommended: sameWifiRecommended,
    },
    {
      step: "share",
      icon: QRCodeIcon,
      title: t("discover.wizard.shareLink"),
      subtitle: t("discover.wizard.shareLinkHint"),
      recommended: !sameWifiRecommended,
    },
    {
      step: "paste",
      icon: CopyIcon,
      title: t("discover.wizard.pasteLink"),
      subtitle: t("discover.wizard.pasteLinkHint"),
      recommended: false,
    },
    {
      step: "search",
      icon: SearchIcon,
      title: t("discover.wizard.searchNetwork"),
      subtitle: t("discover.wizard.searchNetworkHint"),
      recommended: false,
    },
  ];

  return (
    <>
      <PendingHellosPanel requests={pendingHellOs} onAccept={onAcceptHello} onDecline={onDeclineHello} />

      {step === "choose" ? (
        <section className="discover-panel add-friend-wizard" aria-labelledby="add-friend-heading">
          <header className="discover-panel__header">
            <h4 id="add-friend-heading" className="discover-panel__title">
              {t("discover.wizard.title")}
            </h4>
            <p className="discover-panel__lede">
              {sameWifiRecommended
                ? t("discover.wizard.sameWifiRecommended")
                : t("discover.wizard.internetRecommended")}
            </p>
          </header>
          <div className="discover-path-grid" role="list">
            {pathChoices.map(({ step: pathStep, icon: Icon, title, subtitle, recommended }) => (
              <button
                key={pathStep}
                type="button"
                role="listitem"
                className={`discover-path-card${recommended ? " discover-path-card--recommended" : ""}`}
                onClick={() => onStep(pathStep)}
              >
                <span className="discover-path-card__icon" aria-hidden>
                  <Icon size={22} />
                </span>
                <span className="discover-path-card__body">
                  <strong className="discover-path-card__title">{title}</strong>
                  <span className="discover-path-card__subtitle">{subtitle}</span>
                </span>
                {recommended ? (
                  <span className="discover-path-card__badge">{t("discover.wizard.recommended")}</span>
                ) : null}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {step === "nearby" ? (
        <>
          <button type="button" className="discover-back-link" onClick={() => onStep("choose")}>
            <BackIcon size={16} />
            {t("common.back")}
          </button>
          <NearbyPeersPanel
            discoveredPeers={discoveredPeers}
            bonds={bonds}
            outboundHellos={outboundHellos}
            nodeStatus={nodeStatus}
            emptyHint={t("discover.nearby.empty")}
            helloHint={helloHint}
            onSayHello={onSayHello}
          />
          <DiscoveryTroubleshooter
            nodeStatus={nodeStatus}
            nodeConfig={nodeConfig}
            discoveredCount={discoveredPeers.length}
          />
        </>
      ) : null}

      {step === "share" ? (
        <>
          <button type="button" className="discover-back-link" onClick={() => onStep("choose")}>
            <BackIcon size={16} />
            {t("common.back")}
          </button>
          <ShareContactCard compact />
        </>
      ) : null}

      {step === "paste" ? (
        <>
          <button type="button" className="discover-back-link" onClick={() => onStep("choose")}>
            <BackIcon size={16} />
            {t("common.back")}
          </button>
          {pastePanel}
        </>
      ) : null}

      {step === "search" ? (
        <>
          <button type="button" className="discover-back-link" onClick={() => onStep("choose")}>
            <BackIcon size={16} />
            {t("common.back")}
          </button>
          {searchPanel}
        </>
      ) : null}
    </>
  );
}
