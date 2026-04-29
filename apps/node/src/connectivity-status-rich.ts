import type { ConnectivityStageDAnalysis } from "@envoymesh/local-store";

const WIDTH = 68;

function padLabel(label: string, value: string): string {
  const prefix = `${label.padEnd(14)}`;
  const rest = WIDTH - 4 - prefix.length;
  const truncated =
    value.length > rest ? `${value.slice(0, Math.max(0, rest - 3))}...` : value.padEnd(Math.max(rest, 0));
  return `| ${prefix}${truncated} |`;
}

function badgeLabel(badge: ConnectivityStageDAnalysis["badge"]): string {
  switch (badge) {
    case "ok":
      return "[ OK ]";
    case "warn":
      return "[ WARN ]";
    case "starting":
      return "[ WAIT ]";
    default:
      return "[ ?? ]";
  }
}

/** ASCII-only panel for terminals (Windows-safe). */
export function formatConnectivityRichPanel(analysis: ConnectivityStageDAnalysis): string[] {
  const top = `+${"-".repeat(WIDTH)}+`;
  const title = "| Stage D connectivity snapshot".padEnd(WIDTH + 1) + "|";

  const lines = [
    top,
    title,
    top,
    padLabel("Overall", `${badgeLabel(analysis.badge)} ${analysis.badgeExplanation}`),
    padLabel("Profile", analysis.discoveryProfile),
    padLabel("Bootstrap #", String(analysis.bootstrapPeerCount)),
    padLabel("Discovered", `${analysis.discoveredPeerCount} peer.discovery rows`),
    padLabel("Relay hits", `${analysis.relayDiscoveryCount} with source=relay`),
    padLabel("Probe OK/FAIL", `${analysis.bootstrapProbeSuccessCount}/${analysis.bootstrapProbeFailureCount}`),
    padLabel("Reprobe OK/FAIL", `${analysis.reprobeOkCount}/${analysis.reprobeFailCount}`),
    padLabel("Warnings", String(analysis.warningCount)),
    padLabel(
      "Checkpoint",
      analysis.lastCheckpointAt ? analysis.lastCheckpointAt.slice(0, 40) : "(none yet)",
    ),
    top,
    "| Legend: OK = peers seen | WARN = warnings/probes | WAIT = still discovering".slice(0, WIDTH + 2).padEnd(WIDTH + 2) + "|",
    top,
  ];

  return lines;
}
