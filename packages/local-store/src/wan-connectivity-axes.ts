import type { ConnectivityAuditLike } from "./connectivity-stage-d.js";
import { analyzeConnectivityStageD } from "./connectivity-stage-d.js";

export type WanConnectivityAxisState = "ok" | "degraded" | "fail" | "unknown" | "disabled";

export interface WanConnectivityAxis {
  state: WanConnectivityAxisState;
  explanation: string;
}

export interface WanConnectivityAxesAnalysis {
  bootstrapReachability: WanConnectivityAxis;
  relayAvailability: WanConnectivityAxis;
  holePunch: WanConnectivityAxis;
  policyBlock: WanConnectivityAxis;
  /** Latest connectivity.profile feature flags when present */
  features: {
    relay?: boolean;
    dcutr?: boolean;
    dht?: boolean;
    quic?: boolean;
  };
}

function parseProfileFlags(summary: string | undefined): WanConnectivityAxesAnalysis["features"] {
  if (!summary) {
    return {};
  }
  const readBool = (key: string): boolean | undefined => {
    const match = summary.match(new RegExp(`${key}=(true|false)`));
    return match ? match[1] === "true" : undefined;
  };
  return {
    relay: readBool("relay"),
    dcutr: readBool("dcutr"),
    dht: readBool("dht"),
    quic: readBool("quic"),
  };
}

/**
 * Classifies WAN connectivity into operator-facing axes (bootstrap, relay, punch, policy)
 * from audit `p2p.trace` rows — same source as `connectivity-status`.
 */
export function analyzeWanConnectivityAxes(
  events: readonly ConnectivityAuditLike[],
  runtime?: {
    relayCheckinOk?: boolean;
    relayLookupOk?: boolean;
    directConnections?: number;
    circuitConnections?: number;
  },
): WanConnectivityAxesAnalysis {
  const stageD = analyzeConnectivityStageD(events);
  const traces = events.filter((event) => event.type === "p2p.trace");
  const profileEvent = [...traces].reverse().find((event) => event.protocol === "connectivity.profile");
  const features = parseProfileFlags(profileEvent?.summary);
  const relayEnabled = features.relay !== false;
  const dcutrEnabled = features.dcutr === true;

  const directDiscoveries = traces.filter(
    (event) =>
      event.protocol === "peer.discovery" &&
      !event.summary.includes("source=relay") &&
      !event.summary.includes("/p2p-circuit"),
  );
  const policyDenies = events.filter(
    (event) =>
      event.type === "p2p.trace" &&
      event.summary.includes("discovery.request denied"),
  );

  let bootstrapReachability: WanConnectivityAxis;
  if (stageD.bootstrapPeerCount === 0) {
    bootstrapReachability = {
      state: "disabled",
      explanation: "No bootstrap peers configured — WAN cold-start needs presets or manual bootstrap addrs.",
    };
  } else if (
    stageD.bootstrapProbeSuccessCount === 0 &&
    stageD.bootstrapProbeFailureCount > 0
  ) {
    bootstrapReachability = {
      state: "fail",
      explanation: "Bootstrap probes failing — check firewall, DNS, and bootstrap multiaddrs.",
    };
  } else if (stageD.bootstrapProbeSuccessCount > 0 && stageD.bootstrapProbeFailureCount > 0) {
    bootstrapReachability = {
      state: "degraded",
      explanation: `${stageD.bootstrapProbeSuccessCount} bootstrap probe(s) ok, ${stageD.bootstrapProbeFailureCount} failed — partial reachability.`,
    };
  } else if (stageD.bootstrapProbeSuccessCount > 0 || stageD.reprobeOkCount > 0) {
    bootstrapReachability = {
      state: "ok",
      explanation: "At least one bootstrap peer responded to probes.",
    };
  } else if (stageD.discoveryProfile === "unknown") {
    bootstrapReachability = {
      state: "unknown",
      explanation: "Node has not emitted connectivity.profile yet — start the node and retry.",
    };
  } else {
    bootstrapReachability = {
      state: "unknown",
      explanation: "Bootstrap peers configured but no probe results yet — wait for first connectivity cycle.",
    };
  }

  let relayAvailability: WanConnectivityAxis;
  if (!relayEnabled) {
    relayAvailability = {
      state: "disabled",
      explanation: "Relay transport disabled — cross-NAT chat requires relay in wan-default profile.",
    };
  } else if (runtime?.relayLookupOk || stageD.relayDiscoveryCount > 0) {
    relayAvailability = {
      state: "ok",
      explanation:
        stageD.relayDiscoveryCount > 0
          ? `${stageD.relayDiscoveryCount} peer.discovery row(s) with source=relay.`
          : "relay.lookup succeeded — circuit dial hints available.",
    };
  } else if (runtime?.relayCheckinOk === false) {
    relayAvailability = {
      state: "fail",
      explanation: "relay.checkin failing for all targets — relay fleet unreachable from this network.",
    };
  } else if (bootstrapReachability.state === "fail") {
    relayAvailability = {
      state: "degraded",
      explanation: "Bootstrap unreachable — relay client may not have started check-in yet.",
    };
  } else {
    relayAvailability = {
      state: "unknown",
      explanation: "Relay enabled — waiting for relay.checkin / relay.lookup or relay-sourced peer.discovery.",
    };
  }

  let holePunch: WanConnectivityAxis;
  if (!dcutrEnabled) {
    holePunch = {
      state: "disabled",
      explanation: "DCUtR hole punching disabled — direct WAN dials rely on relay circuits only.",
    };
  } else if ((runtime?.directConnections ?? 0) > 0) {
    holePunch = {
      state: "ok",
      explanation: `${runtime!.directConnections} direct libp2p connection(s) observed (non-circuit).`,
    };
  } else if (directDiscoveries.length > 0) {
    holePunch = {
      state: "degraded",
      explanation: `${directDiscoveries.length} non-relay peer.discovery row(s) — punch path may be warming up.`,
    };
  } else if ((runtime?.circuitConnections ?? 0) > 0) {
    holePunch = {
      state: "degraded",
      explanation: "Only relay/circuit paths active so far — DCUtR may not have completed yet.",
    };
  } else {
    holePunch = {
      state: "unknown",
      explanation: "DCUtR enabled — no direct connections yet (common behind symmetric NAT).",
    };
  }

  let policyBlock: WanConnectivityAxis;
  if (policyDenies.length === 0) {
    policyBlock = {
      state: "ok",
      explanation: "No inbound discovery.request policy denies recorded in audit tail.",
    };
  } else if (policyDenies.length <= 3) {
    policyBlock = {
      state: "degraded",
      explanation: `${policyDenies.length} discovery.request deny event(s) — check trust tier / anonymous allowlist.`,
    };
  } else {
    policyBlock = {
      state: "fail",
      explanation: `${policyDenies.length} discovery.request denies — peers may be blocked by bond policy.`,
    };
  }

  return {
    bootstrapReachability,
    relayAvailability,
    holePunch,
    policyBlock,
    features,
  };
}
