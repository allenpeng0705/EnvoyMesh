import type { BondRecord, PeerSearchResult } from "@envoymesh/api";
import { useT } from "../../context/I18nContext.js";
import { nearbyPeerLabel } from "../../lib/display.js";
import { DiscoverPeerCard } from "./DiscoverPeerCard.js";
import { resolvePeerHelloState } from "../../lib/discover-peer-state.js";

export function NearbyPeersPanel({
  discoveredPeers,
  bonds,
  outboundHellos,
  nodeStatus,
  emptyHint,
  helloHint,
  onSayHello,
}: {
  discoveredPeers: PeerSearchResult[];
  bonds: BondRecord[];
  outboundHellos: ReadonlySet<string>;
  nodeStatus: string;
  emptyHint?: string;
  helloHint?: string | null;
  onSayHello: (targetId: string) => void;
}) {
  const t = useT();
  const hint = emptyHint ?? t("discover.nearby.empty");

  return (
    <section className="discover-panel nearby-panel" aria-labelledby="nearby-peers-heading">
      <header className="discover-panel__header">
        <h4 id="nearby-peers-heading" className="discover-panel__title">
          {t("discover.nearby.title")}
        </h4>
        <p className="discover-panel__lede">{t("discover.nearby.lede")}</p>
      </header>

      {nodeStatus !== "running" ? (
        <p className="discover-status discover-status--warn" role="status">
          {t("discover.nearby.offline")}
        </p>
      ) : null}

      {helloHint ? (
        <p className="discover-status discover-status--ok" role="status">
          {helloHint}
        </p>
      ) : null}

      {discoveredPeers.length === 0 ? (
        <div className="discover-empty discover-empty--compact">
          <p className="discover-empty__desc">{hint}</p>
        </div>
      ) : (
        <ul className="around-me-list">
          {discoveredPeers
            .filter((peer) => {
              // Only show peers with a real profile (non-empty ownerId means
              // the profile probe succeeded).  Skip "Someone nearby" placeholders.
              if (!peer.ownerId) return false;
              const label = nearbyPeerLabel(peer.displayName, peer.nodeId);
              return label !== "Someone nearby";
            })
            .map((peer) => {
              const targetId = peer.ownerId || peer.nodeId;
              const helloState = resolvePeerHelloState(peer.ownerId, peer.nodeId, bonds, outboundHellos);
              const label = nearbyPeerLabel(peer.displayName, peer.nodeId);
              const displayLabel = label === "Someone nearby" ? t("discover.nearby.someoneNearby") : label;
            return (
              <DiscoverPeerCard
                key={peer.nodeId}
                peer={{ ...peer, displayName: displayLabel }}
                helloState={helloState}
                subtitle={t("discover.nearby.subtitle")}
                onSayHello={helloState === "none" ? () => onSayHello(targetId) : undefined}
              />
            );
          })}
        </ul>
      )}
    </section>
  );
}
