import type { PeerSearchResult } from "@envoymesh/api";
import { useT } from "../../context/I18nContext.js";
import { nearbyPeerLabel } from "../../lib/display.js";
import type { PeerHelloUiState } from "../../lib/discover-peer-state.js";
import { PeerProfileAvatar } from "../PeerProfileAvatar.js";

export function DiscoverPeerCard({
  peer,
  helloState,
  subtitle,
  onSayHello,
}: {
  peer: PeerSearchResult;
  helloState: PeerHelloUiState;
  subtitle?: string;
  onSayHello?: () => void;
}) {
  const t = useT();
  const label = nearbyPeerLabel(peer.displayName, peer.nodeId);
  const ownerId = peer.ownerId?.trim() || peer.nodeId;

  return (
    <li className="around-me-item discover-peer-card">
      <PeerProfileAvatar ownerId={ownerId} fallbackLabel={label} className="discover-peer-card__avatar" />
      <div className="peer-info discover-peer-card__body">
        <strong>{label}</strong>
        {peer.username ? <span className="result-username">@{peer.username}</span> : null}
        <span className="peer-id">{subtitle ?? t("discover.nearby.subtitle")}</span>
      </div>
      {helloState === "connected" ? (
        <span className="discover-peer-card__status discover-peer-card__status--connected" role="status">
          {t("common.connected")}
        </span>
      ) : helloState === "sent" ? (
        <span className="discover-peer-card__status discover-peer-card__status--sent" role="status">
          {t("common.helloSentWaiting")}
        </span>
      ) : onSayHello ? (
        <button type="button" className="say-hello-btn" onClick={onSayHello}>
          {t("common.sayHello")}
        </button>
      ) : null}
    </li>
  );
}
