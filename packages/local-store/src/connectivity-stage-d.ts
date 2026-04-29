/**
 * Minimal audit row shape for connectivity trace analysis (avoids circular imports with index.ts).
 */
export interface ConnectivityAuditLike {
  type: string;
  protocol?: string;
  summary: string;
  createdAt: string;
}

export type ConnectivityStageDBadge = "ok" | "warn" | "starting" | "unknown";

export interface ConnectivityStageDAnalysis {
  discoveryProfile: "lan-fast" | "wan-default" | "unknown";
  bootstrapPeerCount: number;
  discoveredPeerCount: number;
  relayDiscoveryCount: number;
  bootstrapProbeSuccessCount: number;
  bootstrapProbeFailureCount: number;
  reprobeOkCount: number;
  reprobeFailCount: number;
  warningCount: number;
  warnings: string[];
  lastCheckpointAt?: string;
  badge: ConnectivityStageDBadge;
  badgeExplanation: string;
}

/**
 * Summarizes connectivity audit traces for Stage D diagnostics (CLI `connectivity-status`
 * and dashboard Discovery Health). Pure function over audit rows.
 */
export function analyzeConnectivityStageD(events: readonly ConnectivityAuditLike[]): ConnectivityStageDAnalysis {
  const traces = events.filter((event) => event.type === "p2p.trace");
  const warningEvents = traces.filter((event) => event.protocol === "connectivity.warning");
  const profileEvent = [...traces]
    .reverse()
    .find((event) => event.protocol === "connectivity.profile");
  const checkpointEvent = [...traces]
    .reverse()
    .find((event) => event.protocol === "connectivity.health");
  const discovered = traces.filter((event) => event.protocol === "peer.discovery");
  const relayDiscovered = discovered.filter((event) => event.summary.includes("source=relay"));
  const bootstrapProbeSuccess = traces.filter((event) => event.protocol === "connectivity.bootstrap.ok");
  const bootstrapProbeFailure = traces.filter((event) => event.protocol === "connectivity.bootstrap.fail");
  const reprobeOk = traces.filter((event) => event.protocol === "connectivity.reprobe.ok");
  const reprobeFail = traces.filter((event) => event.protocol === "connectivity.reprobe.fail");

  const profileMatch = profileEvent?.summary.match(/profile=(lan-fast|wan-default)/);
  const bootstrapMatch = profileEvent?.summary.match(/bootstrap=(\d+)/);
  const discoveryProfile: ConnectivityStageDAnalysis["discoveryProfile"] =
    profileMatch?.[1] === "wan-default" || profileMatch?.[1] === "lan-fast" ? profileMatch[1] : "unknown";

  const bootstrapPeerCount = bootstrapMatch ? Number.parseInt(bootstrapMatch[1], 10) : 0;
  const warningSummaries = warningEvents.slice(-5).map((event) => event.summary);

  const { badge, badgeExplanation } = deriveConnectivityBadge({
    discoveryProfile,
    bootstrapPeerCount,
    discoveredPeerCount: discovered.length,
    bootstrapProbeSuccessCount: bootstrapProbeSuccess.length,
    bootstrapProbeFailureCount: bootstrapProbeFailure.length,
    reprobeFailCount: reprobeFail.length,
    warningCount: warningEvents.length,
  });

  return {
    discoveryProfile,
    bootstrapPeerCount,
    discoveredPeerCount: discovered.length,
    relayDiscoveryCount: relayDiscovered.length,
    bootstrapProbeSuccessCount: bootstrapProbeSuccess.length,
    bootstrapProbeFailureCount: bootstrapProbeFailure.length,
    reprobeOkCount: reprobeOk.length,
    reprobeFailCount: reprobeFail.length,
    warningCount: warningEvents.length,
    warnings: warningSummaries,
    lastCheckpointAt: checkpointEvent?.createdAt,
    badge,
    badgeExplanation: badgeExplanation,
  };
}

function deriveConnectivityBadge(input: {
  discoveryProfile: ConnectivityStageDAnalysis["discoveryProfile"];
  bootstrapPeerCount: number;
  discoveredPeerCount: number;
  bootstrapProbeSuccessCount: number;
  bootstrapProbeFailureCount: number;
  reprobeFailCount: number;
  warningCount: number;
}): { badge: ConnectivityStageDBadge; badgeExplanation: string } {
  if (input.discoveryProfile === "unknown") {
    return {
      badge: "unknown",
      badgeExplanation:
        "No connectivity.profile trace yet — start the node with a discovery profile or wait for first checkpoint.",
    };
  }

  if (input.warningCount > 0) {
    return {
      badge: "warn",
      badgeExplanation: `${input.warningCount} connectivity warning(s) recorded — review warnings below.`,
    };
  }

  const probesAllFailed =
    input.bootstrapPeerCount > 0 &&
    input.bootstrapProbeSuccessCount === 0 &&
    input.bootstrapProbeFailureCount > 0;

  if (probesAllFailed || input.reprobeFailCount >= 5) {
    return {
      badge: "warn",
      badgeExplanation:
        "Bootstrap probes failing repeatedly — check outbound firewall/DNS or bootstrap multiaddrs.",
    };
  }

  if (input.discoveredPeerCount === 0) {
    return {
      badge: "starting",
      badgeExplanation:
        input.discoveryProfile === "wan-default"
          ? "WAN profile active — waiting for peer.discovery rows (bootstrap/DHT may still be warming up)."
          : "LAN profile — discovery depends on local peers/mDNS.",
    };
  }

  return {
    badge: "ok",
    badgeExplanation: "Peer discovery activity observed — overlay attachment looks plausible.",
  };
}
