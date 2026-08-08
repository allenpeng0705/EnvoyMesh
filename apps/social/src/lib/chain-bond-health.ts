/**
 * Phase 43E — Bond / agent-card health for chain worker readiness.
 *
 * Three-dimension readiness model:
 *   - `cardStatus`:  card freshness (ready / stale / missing / blocked)
 *   - `onlineStatus`: live mesh reachability (online / offline / unknown)
 *   - `optIn`:        peer has opted into the Agent Network (agent-network-worker)
 *
 * Team jobs can only run on contacts that are card-ready, opted-in, AND online.
 * The composite `status` mirrors `cardStatus` for backwards compatibility; the
 * UI gates selectability on all three dimensions.
 */

import { isAgentNetworkMember, normalizeAgentCardMembership } from "@envoymesh/api";
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
  /** Peer has opted into the Agent Network (`agent-network-worker` on their card). */
  optIn: boolean;
  /**
   * Local Agent Network engine ready (Built-in OpenClaw or Ext Agent per
   * `agentNetworkWorkerEngine`). Only set for the local "You" worker;
   * undefined means unknown / remote peer.
   */
  engineReady?: boolean;
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
  const membership = normalizeAgentCardMembership(card.membership);
  const capabilityCount = membership.length;
  const optedIn = isAgentNetworkMember(membership);
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
      label: "No membership",
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

/**
 * Whether a bonded contact can actually participate in a team job right now.
 *
 * All readiness dimensions must pass:
 *   - Has an agent peer ID on their cached card (required for worker selection)
 *   - Card freshness is ready or stale (not missing/blocked)
 *   - Opted into the Agent Network (agent-network-worker on their card)
 *   - Not confirmed offline (unknown is OK — probe may still be in flight)
 *
 * Used by ChainStartDialog (selectability) and ChainsView (who can launch).
 */
export function isTeamJobReady(
  card: CachedAgentCardSummary | undefined,
  health: ChainBondHealth,
): boolean {
  if (health.engineReady === false) return false;
  return isTeamJobListed(card, health) && health.onlineStatus !== "offline";
}

/**
 * Whether a bonded contact should appear in the Team jobs contact list.
 *
 * Same as {@link isTeamJobReady} but **does not** require online — offline
 * opted-in workers stay visible with an offline badge so the list is not
 * empty while `chainProbeReachability` is still warming the mesh (or when
 * a peer is temporarily unreachable). Selection still uses
 * {@link isTeamJobReady}.
 */
export function isTeamJobListed(
  card: CachedAgentCardSummary | undefined,
  health: ChainBondHealth,
): boolean {
  return Boolean(
    card?.sourceAgentPeerId &&
      (health.cardStatus === "ready" || health.cardStatus === "stale") &&
      health.optIn,
  );
}
