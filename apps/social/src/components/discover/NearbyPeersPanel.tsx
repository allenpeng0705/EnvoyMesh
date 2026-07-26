import type { BondRecord, PeerSearchResult } from "@envoymesh/api";
import { useT } from "../../context/I18nContext.js";
import { nearbyPeerLabel } from "../../lib/display.js";
import { DiscoverPeerCard } from "./DiscoverPeerCard.js";
import { resolvePeerHelloState } from "../../lib/discover-peer-state.js";

/** Only show people we can actually recognize (name + owner). */
export function isIdentifiableNearbyPeer(peer: PeerSearchResult): boolean {
  if (!peer.ownerId?.trim()) return false;
  return nearbyPeerLabel(peer.displayName, peer.nodeId) !== "Someone nearby";
}

function nearbyStatusNote(
  peers: readonly PeerSearchResult[],
  identifiableCount: number,
  t: ReturnType<typeof useT>,
): string | null {
  const pending = peers.filter(
    (p) => !p.ownerId?.trim() && p.profileStatus !== "unreachable",
  ).length;
  const unreachable = peers.filter((p) => p.profileStatus === "unreachable").length;

  if (unreachable > 0 && identifiableCount === 0) {
    return t("discover.nearby.heardUnreachable", { count: String(unreachable) });
  }
  if (unreachable > 0) {
    return t("discover.nearby.someUnreachable", { count: String(unreachable) });
  }
  if (pending > 0 && identifiableCount === 0) {
    return t("discover.nearby.identifying");
  }
  if (pending > 0) {
    return t("discover.nearby.identifyingMore", { count: String(pending) });
  }
  return null;
}

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
  const identifiable = discoveredPeers.filter(isIdentifiableNearbyPeer);
  const statusNote = nearbyStatusNote(discoveredPeers, identifiable.length, t);
  const showEmpty = identifiable.length === 0 && !statusNote;

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

      {statusNote ? (
        <p
          className={`discover-status ${
            discoveredPeers.some((p) => p.profileStatus === "unreachable")
              ? "discover-status--warn"
              : "discover-status--ok"
          }`}
          role="status"
          data-testid="nearby-status-note"
        >
          {statusNote}
        </p>
      ) : null}

      {showEmpty ? (
        <div className="discover-empty discover-empty--compact">
          <p className="discover-empty__desc">{hint}</p>
        </div>
      ) : null}

      {identifiable.length > 0 ? (
        <ul className="around-me-list" data-testid="nearby-peers-list">
          {identifiable.map((peer) => {
            const targetId = peer.ownerId.trim();
            const helloState = resolvePeerHelloState(
              peer.ownerId,
              peer.nodeId,
              bonds,
              outboundHellos,
            );
            return (
              <DiscoverPeerCard
                key={peer.nodeId}
                peer={peer}
                helloState={helloState}
                subtitle={t("discover.nearby.subtitle")}
                onSayHello={helloState === "none" ? () => onSayHello(targetId) : undefined}
              />
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
