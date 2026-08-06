/**
 * Phase 43E — Bond / agent-card health for chain worker readiness.
 *
 * Three-dimension readiness model:
 *   - `cardStatus`:  card freshness (ready / stale / missing / blocked)
 *   - `onlineStatus`: live mesh reachability (online / offline / unknown)
 *   - `optIn`:        peer has opted into the Agent Network (capability-provider)
 *
 * Team jobs can only run on contacts that are card-ready, opted-in, AND online.
 * The composite `status` mirrors `cardStatus` for backwards compatibility; the
 * UI gates selectability on all three dimensions.
 */

import { isAgentNetworkWorker } from "@envoymesh/api";
import type { BondRecord, CachedAgentCardSummary, ChainWorkerReachability } from "@envoymesh/api";

export type ChainBondHealthStatus = "ready" | "stale" | "missing" | "blocked";
export type ChainOnlineStatus = "online" | "offline" | "unknown";

export interface ChainBondHealth {
  /** Composite card-freshness status (backwards compatible with Phase 43E). */
  status: ChainBondHealthStatus;
  /** Card freshness dimension. */
  cardStatus: ChainBondHealthStatus;
  /** Reachability dimension — merged from `chainProbeReachability`. */
  onlineStatus: ChainOnlineStatus;
  /** Peer has opted into the Agent Network (`capability-provider` on their card). */
  optIn: boolean;
  capabilityCount: number;
  lastSyncedAt?: string;
  label: string;
}

const STALE_MS = 7 * 24 * 60 * 60 * 1000;

export function computeChainBondHealth(
  bond: BondRecord,
  card: CachedAgentCardSummary | undefined,
  nowMs: number = Date.now(),
): ChainBondHealth {
  if (bond.level === "blocked") {
    return {
      status: "blocked",
      cardStatus: "blocked",
      onlineStatus: "unknown",
      optIn: false,
      capabilityCount: 0,
      label: "Blocked",
    };
  }
  if (!card) {
    return {
      status: "missing",
      cardStatus: "missing",
      onlineStatus: "unknown",
      optIn: false,
      capabilityCount: 0,
      label: "No agent card",
    };
  }
  const capabilityCount = card.capabilities.length;
  const optedIn = isAgentNetworkWorker(card.capabilities);
  const cachedMs = Date.parse(card.cachedAt);
  const stale = Number.isFinite(cachedMs) && nowMs - cachedMs > STALE_MS;
  if (capabilityCount === 0) {
    return {
      status: "missing",
      cardStatus: "missing",
      onlineStatus: "unknown",
      optIn: optedIn,
      capabilityCount: 0,
      lastSyncedAt: card.cachedAt,
      label: "No capabilities",
    };
  }
  if (stale) {
    return {
      status: "stale",
      cardStatus: "stale",
      onlineStatus: "unknown",
      optIn: optedIn,
      capabilityCount,
      lastSyncedAt: card.cachedAt,
      label: "Stale card",
    };
  }
  return {
    status: "ready",
    cardStatus: "ready",
    onlineStatus: "unknown",
    optIn: optedIn,
    capabilityCount,
    lastSyncedAt: card.cachedAt,
    label: "Ready for chains",
  };
}

/**
 * Layer reachability data (from `chainProbeReachability`) onto card health.
 * Leaves `onlineStatus` as "unknown" when no probe result is available yet so
 * the UI doesn't block selection while the batch RPC is in flight.
 */
export function mergeReachability(
  health: ChainBondHealth,
  reachability: ChainWorkerReachability | undefined,
): ChainBondHealth {
  if (!reachability) return health;
  return { ...health, onlineStatus: reachability.online ? "online" : "offline" };
}
