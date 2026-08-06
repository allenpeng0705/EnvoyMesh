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

  const circuitReservation =
    typeof input.mesh?.getRelayReservationStatus === "function"
      ? input.mesh.getRelayReservationStatus()
      : undefined;
  // Sustained relay failure (M2): when the reservation health loop has been
  // failing repeatedly, surface a clear "Relay unreachable" warning so the
  // operator knows WAN discovery + cross-NAT reachability are degraded and can
  // add a backup relay. This is especially important under quietWan where the
  // relay is the only WAN discovery path.
  const SUSTAINED_RELAY_FAILURE_THRESHOLD = 4; // matches M1 backoff threshold
  if (
    circuitReservation?.state === "failed" &&
    (circuitReservation.failureStreak ?? 0) >= SUSTAINED_RELAY_FAILURE_THRESHOLD
  ) {
    hints.unshift(
      `Relay unreachable — ${circuitReservation.failureStreak} consecutive reservation failures. ` +
        "WAN discovery and cross-NAT reachability are degraded. Add a backup relay in Settings → Agent Network, or check the relay server.",
    );
  } else if (circuitReservation?.state === "failed") {
    hints.unshift(
      circuitReservation.lastError
        ? `Circuit reservation: ${circuitReservation.lastError}`
        : "Circuit reservation failed — this node is not inbound-reachable via /p2p-circuit/.",
    );
  } else if (circuitReservation?.state === "pending") {
    hints.unshift(
      "Circuit reservation still PENDING — wait for relay=RESERVED before minting WAN invites.",
    );
  }

  // CGNAT / constrained-network suggestion: when the node is on a DHT-enabled
  // mode (not quietWan/aggressive) but the public DHT is unreachable
  // (bootstrap failing) and there's visible connection churn, suggest trying
  // quietWan. This is a SUGGESTION, not auto-apply — false positives on a node
  // that's actually reachable would silently disable public-DHT discovery.
  // Definitive CGNAT auto-apply happens at startup (see cgnat-detection.ts).
  const connectivityMode = input.config?.connectivityMode ?? "optimized";
  const dhtStillOn = connectivityMode !== "quietWan" && connectivityMode !== "aggressive";
  const bootstrapFailing =
    axes.bootstrapReachability.state === "fail" || axes.bootstrapReachability.state === "degraded";
  const churnSymptom = (connStats?.totalPeerIds ?? 0) > 32 || (connStats?.dialQueueLength ?? 0) > 20;
  if (dhtStillOn && bootstrapFailing && churnSymptom) {
    hints.push(
      "High connection churn with the public DHT unreachable — your node may be behind CGNAT or a restrictive NAT. " +
        "Consider switching to 'Quiet WAN' mode (Settings → Resource Tuning) to disable the public DHT swarm and rely on relay-roster discovery. " +
        "This stops the churn while keeping WAN relay + LAN discovery.",
    );
  } else if (
    connectivityMode === "quietWan" &&
    input.config?.connectivityModeAutoAppliedReason === "cgnat"
  ) {
    hints.unshift(
      "Quiet WAN was auto-applied because this node looks like it is behind CGNAT. " +
        "Public DHT discovery is off; WAN uses relay roster + circuit. " +
        "Change Settings → Resource Tuning if you want a different mode.",
    );
  }

  return {
    checkedAt: new Date().toISOString(),
    nodeOnline: input.nodeOnline,
    stageD,
    axes,
    circuitReservation,
    quicEnabled: axes.features.quic ?? false,
    hints,
    signOffChecklist: [
      "Run live-connectivity-testing.md §4: two NAT clients + relay (relay.checkin / relay.lookup / circuit dial).",
      "Optional §5: DCUtR signed ping across punch when both nodes are wan-default.",
      "Capture connectivity-status --rich output and fill a row in docs/wan-connectivity-signoff.md.",
    ],
  };
}
