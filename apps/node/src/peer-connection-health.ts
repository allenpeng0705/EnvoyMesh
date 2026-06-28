import type { PeerConnectionHealth, WarmContactSource } from "@envoymesh/api";
import {
  classifyWarmDialKind,
  evaluateWarmCoordinator,
  isWarmInFlight,
} from "./outbound-warm-coordinator.js";
import { isOutboundPeerRecentlyVerified } from "./outbound-peer-freshness.js";
import { getStoredOutboundPath } from "./outbound-path-memory.js";

export function buildPeerConnectionHealth(input: {
  peerOwnerId: string;
  transportPeerId?: string;
  connection: { connected: boolean; direct: boolean; relayPeerId?: string };
  now?: number;
}): PeerConnectionHealth {
  const now = input.now ?? Date.now();
  const transportPeerId = input.transportPeerId;
  const { connected, direct } = input.connection;

  let warmInFlight = false;
  let coordinatorBlocked: string | undefined;
  if (transportPeerId) {
    warmInFlight = isWarmInFlight(transportPeerId);
    const kind = classifyWarmDialKind({
      existing: input.connection,
    });
    if (kind !== "read_only") {
      const decision = evaluateWarmCoordinator({
        transportPeerId,
        kind,
        options: { source: "open_chat" satisfies WarmContactSource },
        now,
      });
      if (!decision.allow) {
        coordinatorBlocked = decision.reason;
      }
    }
  }

  let suggestedAction: PeerConnectionHealth["suggestedAction"];
  if (!connected) {
    suggestedAction = coordinatorBlocked ? "wait" : "retry";
  } else if (!direct && getStoredOutboundPath(transportPeerId ?? "")?.kind === "relay") {
    suggestedAction = "relay_only";
  }

  const lastVerifiedAt =
    transportPeerId && isOutboundPeerRecentlyVerified(transportPeerId)
      ? new Date(now).toISOString()
      : undefined;

  return {
    peerOwnerId: input.peerOwnerId,
    transportPeerId,
    connected,
    direct,
    relayPeerId: input.connection.relayPeerId,
    lastVerifiedAt,
    warmInFlight,
    coordinatorBlocked,
    suggestedAction,
  };
}
