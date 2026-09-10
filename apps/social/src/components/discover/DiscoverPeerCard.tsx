import type { PeerSearchResult } from "@envoymesh/api";
import { useT } from "../../context/I18nContext.js";
import { isPeerReachableNow } from "../../lib/discover-dialability.js";
import { nearbyPeerLabel } from "../../lib/display.js";
import { openPeerProfile } from "../../lib/open-peer-profile.js";
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
  const label = nearbyPeerLabel(t, peer.displayName, peer.nodeId);
  const ownerId = peer.ownerId?.trim() || "";
  const canOpenProfile = ownerId.startsWith("envoy:owner:");
  const openLabel = t("discoverCards.openProfile", "Open profile");
  /**
   * Relay-roster hits carry `hasHopSlot: false` while the peer is checked in but
   * holds no live circuit hop (see relay-roster `hasHopSlot`). Such a peer is
   * fine to *show* — they are on the mesh — but a hello has no transport path
   * yet, so it would fail with a confusing error. A direct address still wins
   * (see `isPeerReachableNow`).
   */
  const reachable = isPeerReachableNow(peer);
  const pendingHopHint = t(
    "discover.peer.pendingHopHint",
    "This person is online, but their connection is still being set up. Try again in a few seconds.",
  );

  const identity = (
    <>
      <PeerProfileAvatar
        ownerId={canOpenProfile ? ownerId : peer.nodeId}
        fallbackLabel={label}
        className="discover-peer-card__avatar"
      />
      <div className="peer-info discover-peer-card__body">
        <strong>{label}</strong>
        {peer.username ? <span className="result-username">@{peer.username}</span> : null}
        <span className="peer-id">{subtitle ?? t("discover.nearby.subtitle")}</span>
      </div>
    </>
  );

  return (
    <li className="around-me-item discover-peer-card">
      {canOpenProfile ? (
        <button
          type="button"
          className="peer-result-card__open-profile discover-peer-card__main"
          data-testid="discover-open-profile"
          aria-label={openLabel}
          title={openLabel}
          onClick={() => openPeerProfile(ownerId)}
        >
          {identity}
        </button>
      ) : (
        <div className="discover-peer-card__main">{identity}</div>
      )}
      {helloState === "connected" ? (
        <span className="discover-peer-card__status discover-peer-card__status--connected" role="status">
          {t("common.connected")}
        </span>
      ) : helloState === "sent" ? (
        <span className="discover-peer-card__status discover-peer-card__status--sent" role="status">
          {t("common.helloSentWaiting")}
        </span>
      ) : !reachable && onSayHello ? (
        <span
          className="discover-peer-card__status discover-peer-card__status--pending-hop"
          role="status"
          data-testid="discover-peer-pending-hop"
          title={pendingHopHint}
        >
          {t("discover.peer.pendingHop", "Reachable in a moment")}
        </span>
      ) : onSayHello ? (
        <button type="button" className="say-hello-btn" onClick={onSayHello}>
          {t("common.sayHello")}
        </button>
      ) : null}
    </li>
  );
}
