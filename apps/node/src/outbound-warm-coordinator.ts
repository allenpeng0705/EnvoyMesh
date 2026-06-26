import type { PeerConnectionInfo, WarmContactConnectionOptions, WarmContactSource } from "@envoymesh/api";

/** Minimum gap between disconnected full-warm dials for the same peer. */
export const COORDINATOR_DISCONNECTED_WARM_MS = 15_000;
/** Minimum gap between relay→direct upgrade attempts. */
export const COORDINATOR_RELAY_UPGRADE_MS = 60_000;
/** Minimum gap between keepAlive / verify probes that may redial. */
export const COORDINATOR_KEEPALIVE_PROBE_MS = 60_000;
/** Minimum gap between send-time prepare dials when not forced. */
export const COORDINATOR_SEND_PREPARE_MS = 5_000;

export type WarmDialKind =
  | "read_only"
  | "disconnected_warm"
  | "relay_upgrade"
  | "redial"
  | "keepalive_probe"
  | "verify_probe"
  | "send_prepare";

export type WarmCoordinatorDecision = {
  allow: boolean;
  kind: WarmDialKind;
  reason?: string;
};

type PeerWarmTimestamps = {
  disconnectedWarmAt: number;
  relayUpgradeAt: number;
  keepAliveProbeAt: number;
  verifyProbeAt: number;
  sendPrepareAt: number;
};

const timestampsByPeer = new Map<string, PeerWarmTimestamps>();
const inFlightPeers = new Set<string>();

export function isWarmInFlight(transportPeerId: string): boolean {
  return inFlightPeers.has(transportPeerId);
}

export function markWarmInFlight(transportPeerId: string, inFlight: boolean): void {
  if (inFlight) {
    inFlightPeers.add(transportPeerId);
  } else {
    inFlightPeers.delete(transportPeerId);
  }
}

function emptyTimestamps(): PeerWarmTimestamps {
  return {
    disconnectedWarmAt: 0,
    relayUpgradeAt: 0,
    keepAliveProbeAt: 0,
    verifyProbeAt: 0,
    sendPrepareAt: 0,
  };
}

function getTimestamps(transportPeerId: string): PeerWarmTimestamps {
  let row = timestampsByPeer.get(transportPeerId);
  if (!row) {
    row = emptyTimestamps();
    timestampsByPeer.set(transportPeerId, row);
  }
  return row;
}

/** Classify whether a warm/prepare request may dial or tear down connections. */
export function classifyWarmDialKind(input: {
  options?: Pick<
    WarmContactConnectionOptions,
    "verifyOnly" | "redial" | "upgradeRelayToDirect" | "keepAlive" | "verifyConnection"
  >;
  existing: PeerConnectionInfo;
  forceFreshDial?: boolean;
  upgradeRelayToDirect?: boolean;
  fromSendPrepare?: boolean;
}): WarmDialKind {
  const options = input.options;
  if (options?.verifyOnly) {
    return "read_only";
  }
  if (input.fromSendPrepare) {
    return "send_prepare";
  }
  if (options?.redial) {
    return "redial";
  }
  if (options?.upgradeRelayToDirect || input.upgradeRelayToDirect) {
    return "relay_upgrade";
  }
  if (options?.verifyConnection) {
    return "verify_probe";
  }
  if (options?.keepAlive) {
    return "keepalive_probe";
  }
  if (!input.existing.connected) {
    return "disconnected_warm";
  }
  if (input.forceFreshDial) {
    return "send_prepare";
  }
  return "read_only";
}

/** Gate outbound dials/probes so UI, bond warm, and send paths do not fight. */
export function evaluateWarmCoordinator(input: {
  transportPeerId: string;
  kind: WarmDialKind;
  options?: Pick<WarmContactConnectionOptions, "force" | "source">;
  now?: number;
}): WarmCoordinatorDecision {
  const { kind } = input;
  if (kind === "read_only") {
    return { allow: true, kind };
  }
  if (input.options?.force === true || kind === "redial") {
    return { allow: true, kind };
  }

  const now = input.now ?? Date.now();
  const ts = getTimestamps(input.transportPeerId);

  if (kind === "disconnected_warm") {
    const elapsed = now - ts.disconnectedWarmAt;
    if (elapsed < COORDINATOR_DISCONNECTED_WARM_MS) {
      return {
        allow: false,
        kind,
        reason: `disconnected warm cooldown (${Math.ceil((COORDINATOR_DISCONNECTED_WARM_MS - elapsed) / 1000)}s left)`,
      };
    }
    return { allow: true, kind };
  }

  if (kind === "relay_upgrade") {
    const elapsed = now - ts.relayUpgradeAt;
    if (elapsed < COORDINATOR_RELAY_UPGRADE_MS) {
      return {
        allow: false,
        kind,
        reason: `relay upgrade cooldown (${Math.ceil((COORDINATOR_RELAY_UPGRADE_MS - elapsed) / 1000)}s left)`,
      };
    }
    return { allow: true, kind };
  }

  if (kind === "keepalive_probe") {
    const elapsed = now - ts.keepAliveProbeAt;
    if (elapsed < COORDINATOR_KEEPALIVE_PROBE_MS) {
      return {
        allow: false,
        kind,
        reason: `keepAlive cooldown (${Math.ceil((COORDINATOR_KEEPALIVE_PROBE_MS - elapsed) / 1000)}s left)`,
      };
    }
    return { allow: true, kind };
  }

  if (kind === "verify_probe") {
    const elapsed = now - ts.verifyProbeAt;
    if (elapsed < COORDINATOR_KEEPALIVE_PROBE_MS) {
      return {
        allow: false,
        kind,
        reason: `verify probe cooldown (${Math.ceil((COORDINATOR_KEEPALIVE_PROBE_MS - elapsed) / 1000)}s left)`,
      };
    }
    return { allow: true, kind };
  }

  if (kind === "send_prepare") {
    if (input.options?.source === "send" || input.options?.force) {
      return { allow: true, kind };
    }
    const elapsed = now - ts.sendPrepareAt;
    if (elapsed < COORDINATOR_SEND_PREPARE_MS) {
      return {
        allow: false,
        kind,
        reason: `send prepare cooldown (${Math.ceil((COORDINATOR_SEND_PREPARE_MS - elapsed) / 1000)}s left)`,
      };
    }
    return { allow: true, kind };
  }

  return { allow: true, kind };
}

/** Record that a dial/probe actually started (call after allow=true). */
export function recordWarmDialStarted(input: {
  transportPeerId: string;
  kind: WarmDialKind;
  now?: number;
}): void {
  if (input.kind === "read_only") {
    return;
  }
  const now = input.now ?? Date.now();
  const ts = getTimestamps(input.transportPeerId);
  switch (input.kind) {
    case "disconnected_warm":
      ts.disconnectedWarmAt = now;
      break;
    case "relay_upgrade":
    case "redial":
      ts.relayUpgradeAt = now;
      ts.disconnectedWarmAt = now;
      break;
    case "keepalive_probe":
      ts.keepAliveProbeAt = now;
      break;
    case "verify_probe":
      ts.verifyProbeAt = now;
      break;
    case "send_prepare":
      ts.sendPrepareAt = now;
      break;
    default:
      break;
  }
}

/** Test helper */
export function resetWarmCoordinatorForTests(): void {
  timestampsByPeer.clear();
  inFlightPeers.clear();
}
