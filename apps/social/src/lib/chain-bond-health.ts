/**
 * Phase 43E — Bond / agent-card health for chain worker readiness.
 */

import type { BondRecord, CachedAgentCardSummary } from "@envoymesh/api";

export type ChainBondHealthStatus = "ready" | "stale" | "missing" | "blocked";

export interface ChainBondHealth {
  status: ChainBondHealthStatus;
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
    return { status: "blocked", capabilityCount: 0, label: "Blocked" };
  }
  if (!card) {
    return { status: "missing", capabilityCount: 0, label: "No agent card" };
  }
  const capabilityCount = card.capabilities.length;
  const cachedMs = Date.parse(card.cachedAt);
  const stale = Number.isFinite(cachedMs) && nowMs - cachedMs > STALE_MS;
  if (capabilityCount === 0) {
    return {
      status: "missing",
      capabilityCount: 0,
      lastSyncedAt: card.cachedAt,
      label: "No capabilities",
    };
  }
  if (stale) {
    return {
      status: "stale",
      capabilityCount,
      lastSyncedAt: card.cachedAt,
      label: "Stale card",
    };
  }
  return {
    status: "ready",
    capabilityCount,
    lastSyncedAt: card.cachedAt,
    label: "Ready for chains",
  };
}
