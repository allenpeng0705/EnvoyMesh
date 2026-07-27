import type { BondRecord, PeerSearchResult } from "@envoymesh/api";
import { useMemo } from "react";
import { useT } from "../../context/I18nContext.js";
import { nearbyPeerLabel } from "../../lib/display.js";
import { DiscoverPeerCard } from "./DiscoverPeerCard.js";
import { resolvePeerHelloState } from "../../lib/discover-peer-state.js";

/** Only show people we can actually recognize (name + owner). */
export function isIdentifiableNearbyPeer(
  t: ReturnType<typeof useT>,
  peer: PeerSearchResult,
): boolean {
  if (!peer.ownerId?.trim()) return false;
  return nearbyPeerLabel(t, peer.displayName, peer.nodeId) !== t("display.nearbyPeerFallback", "Someone nearby");
}

/**
 * Prefer bonded contact identity when mDNS only gave a bare peer id.
 * Fixes empty People-nearby while Contacts already shows online-direct.
 */
export function enrichNearbyPeersWithBonds(
  t: ReturnType<typeof useT>,
  peers: readonly PeerSearchResult[],
  bonds: readonly BondRecord[],
): PeerSearchResult[] {
  const activeBonds = bonds.filter((b) => b.level !== "blocked");
  const out: PeerSearchResult[] = [];
  const seen = new Set<string>();
  const contactFallback = t("display.nearbyPeerFallback", "Someone nearby");

  for (const peer of peers) {
    const bond =
      activeBonds.find((b) => b.libp2pPeerId && b.libp2pPeerId === peer.nodeId) ??
      (peer.ownerId
        ? activeBonds.find((b) => b.peerOwnerId === peer.ownerId)
        : undefined);

    if (bond) {
      const displayName =
        peer.displayName?.trim() ||
        bond.displayName?.trim() ||
        bond.peerOwnerId.replace(/^envoy:owner:/, "").slice(0, 8) ||
        contactFallback;
      const enriched: PeerSearchResult = {
        ...peer,
        ownerId: peer.ownerId?.trim() || bond.peerOwnerId,
        displayName,
        profileStatus: "resolved",
      };
      if (isIdentifiableNearbyPeer(t, enriched)) {
        out.push(enriched);
        seen.add(peer.nodeId);
      }
      continue;
    }

    if (isIdentifiableNearbyPeer(t, peer)) {
      out.push(peer);
      seen.add(peer.nodeId);
    }
  }

  return out;
}

function isBondMatchedNoise(
  peer: PeerSearchResult,
  bonds: readonly BondRecord[],
): boolean {
  return bonds.some(
    (b) =>
      b.level !== "blocked" &&
      ((b.libp2pPeerId && b.libp2pPeerId === peer.nodeId) ||
        (peer.ownerId && b.peerOwnerId === peer.ownerId)),
  );
}

function nearbyStatusNote(
  peers: readonly PeerSearchResult[],
  bonds: readonly BondRecord[],
  identifiableCount: number,
  t: ReturnType<typeof useT>,
): string | null {
  // Ignore pending/unreachable for peers we already know as bonds — those
  // are shown as contacts above, not "still identifying".
  const noise = peers.filter((p) => !isBondMatchedNoise(p, bonds));
  const pending = noise.filter(
    (p) => !p.ownerId?.trim() && p.profileStatus !== "unreachable",
  ).length;
  const unreachable = noise.filter((p) => p.profileStatus === "unreachable").length;

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
  const identifiable = useMemo(
    () => enrichNearbyPeersWithBonds(t, discoveredPeers, bonds),
    [discoveredPeers, bonds, t],
  );
  const statusNote = nearbyStatusNote(discoveredPeers, bonds, identifiable.length, t);
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
            discoveredPeers.some(
              (p) => p.profileStatus === "unreachable" && !isBondMatchedNoise(p, bonds),
            )
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
