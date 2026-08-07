/**
 * Phase 43E — Compact bond/agent-card health badge for contacts UI.
 */

import type { BondRecord, CachedAgentCardSummary } from "@envoymesh/api";

import { useT } from "../context/I18nContext.js";
import { computeChainBondHealth } from "../lib/chain-bond-health.js";

export interface ChainBondHealthBadgeProps {
  bond: BondRecord;
  card?: CachedAgentCardSummary;
  compact?: boolean;
}

export function ChainBondHealthBadge({ bond, card, compact = false }: ChainBondHealthBadgeProps) {
  const t = useT();
  const health = computeChainBondHealth(bond, card);

  const title = t(`chains.bondHealth.${health.status}`, health.label);
  const strengthCount = card?.agentNetworkProfile?.skills?.length ?? 0;
  const detail = health.lastSyncedAt
    ? t("chains.bondHealth.detail", {
        count: strengthCount,
        synced: new Date(health.lastSyncedAt).toLocaleDateString(),
      })
    : t("chains.bondHealth.noSync");

  return (
    <span
      className={`chain-bond-health chain-bond-health--${health.status}${compact ? " chain-bond-health--compact" : ""}`}
      title={`${title} — ${detail}`}
      data-status={health.status}
    >
      {health.status === "ready" ? "✓" : health.status === "stale" ? "⏳" : health.status === "blocked" ? "⛔" : "?"}
      {!compact ? ` ${title}` : null}
    </span>
  );
}
