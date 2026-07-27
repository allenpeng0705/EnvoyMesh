import type { ReactNode } from "react";
import { useMemo } from "react";
import type { BondRecord, HelloRequest, PeerSearchResult } from "@envoymesh/api";
import type { NodeConfig } from "@envoymesh/api";
import { NearbyPeersPanel, enrichNearbyPeersWithBonds } from "./NearbyPeersPanel.js";
import { PendingHellosPanel } from "./PendingHellosPanel.js";
import { DiscoveryTroubleshooter } from "./DiscoveryTroubleshooter.js";

export function DiscoverSections({
  discoveredPeers,
  bonds,
  outboundHellos,
  nodeStatus,
  nodeConfig,
  helloHint,
  nearbyEmptyHint,
  pendingHellOs,
  onSayHello,
  onAcceptHello,
  onDeclineHello,
  networkPanel,
  pastePanel,
}: {
  discoveredPeers: PeerSearchResult[];
  bonds: BondRecord[];
  outboundHellos: ReadonlySet<string>;
  nodeStatus: string;
  nodeConfig: NodeConfig | null;
  helloHint: string | null;
  nearbyEmptyHint: string;
  pendingHellOs: HelloRequest[];
  onSayHello: (targetId: string) => void;
  onAcceptHello: (request: HelloRequest) => void | Promise<void>;
  onDeclineHello: (request: HelloRequest) => void | Promise<void>;
  networkPanel: ReactNode;
  pastePanel: ReactNode;
}) {
  // Troubleshooter should track people we can show, not probe noise.
  const identifiableCount = useMemo(
    () => enrichNearbyPeersWithBonds(discoveredPeers, bonds).length,
    [discoveredPeers, bonds],
  );

  return (
    <>
      <PendingHellosPanel requests={pendingHellOs} onAccept={onAcceptHello} onDecline={onDeclineHello} />
      {networkPanel}
      <NearbyPeersPanel
        discoveredPeers={discoveredPeers}
        bonds={bonds}
        outboundHellos={outboundHellos}
        nodeStatus={nodeStatus}
        emptyHint={nearbyEmptyHint}
        helloHint={helloHint}
        onSayHello={onSayHello}
      />
      <DiscoveryTroubleshooter
        nodeStatus={nodeStatus}
        nodeConfig={nodeConfig}
        discoveredCount={identifiableCount}
      />
      {pastePanel}
    </>
  );
}

/** @deprecated Use DiscoverSections */
export const AddFriendWizard = DiscoverSections;
