import type { ConnectivityDiagnostics } from "@envoymesh/api";
import type { EnvoyMesh } from "@envoymesh/network";
import {
  analyzeConnectivityStageD,
  analyzeWanConnectivityAxes,
  type AuditEvent,
} from "@envoymesh/local-store";
import type { PersistedNodeConfig } from "./node-config-store.js";
import { getRelayDiagnosticsSnapshot } from "./relay-diagnostics-state.js";

export interface BuildConnectivityDiagnosticsInput {
  mesh: EnvoyMesh | undefined;
  nodeOnline: boolean;
  config: PersistedNodeConfig | undefined;
  auditEvents: readonly AuditEvent[];
}

export function buildConnectivityDiagnostics(
  input: BuildConnectivityDiagnosticsInput,
): ConnectivityDiagnostics {
  const relaySnapshot = getRelayDiagnosticsSnapshot();
  const relayCheckinOk = relaySnapshot?.checkinResults.some((r) => r.ok);
  const relayLookupOk = relaySnapshot?.lookup?.ok === true;

  const connStats = input.mesh?.getConnectionStats();
  const directConnections =
    connStats && connStats.totalConnections > connStats.circuitConnections
      ? connStats.totalConnections - connStats.circuitConnections
      : 0;

  const stageD = analyzeConnectivityStageD(input.auditEvents);
  const axes = analyzeWanConnectivityAxes(input.auditEvents, {
    relayCheckinOk,
    relayLookupOk,
    directConnections,
    circuitConnections: connStats?.circuitConnections ?? 0,
  });

  const hints: string[] = [];
  for (const axis of [
    axes.bootstrapReachability,
    axes.relayAvailability,
    axes.holePunch,
    axes.policyBlock,
  ]) {
    if (axis.state === "fail" || axis.state === "degraded") {
      hints.push(axis.explanation);
    }
  }
  if (hints.length === 0) {
    hints.push(
      stageD.badge === "ok"
        ? "WAN axes look healthy — validate end-to-end with system.ping across NAT if chat fails."
        : "No blocking axis detected yet — wait for bootstrap/relay cycles or run connectivity-status --rich.",
    );
  }

  return {
    checkedAt: new Date().toISOString(),
    nodeOnline: input.nodeOnline,
    stageD,
    axes,
    quicEnabled: axes.features.quic ?? false,
    hints,
    signOffChecklist: [
      "Run live-connectivity-testing.md §4: two NAT clients + relay (relay.checkin / relay.lookup / circuit dial).",
      "Optional §5: DCUtR signed ping across punch when both nodes are wan-default.",
      "Capture connectivity-status --rich output and fill a row in docs/wan-connectivity-signoff.md.",
    ],
  };
}
