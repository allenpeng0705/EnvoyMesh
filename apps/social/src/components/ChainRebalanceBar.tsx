/**
 * Phase 40D — ChainRebalanceBar.
 *
 * Inline "raise the budget" affordance shown alongside the ChainBidInbox.
 * The owner types an additional amount (USD) and clicks "Add budget & retry":
 * the parent calls `chainRebalance`, which raises the chain's
 * `maxChainCostUsd` and re-runs evaluation for every not-yet-awarded
 * subtask. Already-awarded subtasks are *not* touched — raising the ceiling
 * mid-flight only helps the bids we haven't picked yet.
 *
 * Honors the chain's `rebalancePolicy`:
 *   - `"never"`:   bar is hidden entirely (owner opted out of any increase).
 *   - `"manual"`:  bar shows the input + button. (Default 40D behavior.)
 *   - `"auto"`:    bar shows a read-only "auto-rebalance is on" line plus
 *                  the most recent auto-rebalance history. The input +
 *                  button are still available so the owner can override
 *                  the auto trigger at any time.
 */

import { useCallback, useMemo, useState } from "react";

import type { ChainGetStateResult, ChainRebalanceResult } from "@envoymesh/api";

import type { TFunction } from "../context/I18nContext.js";

export interface ChainRebalanceBarProps {
  chainId: string;
  /** Latest live state from `chainGetState`. Used to show "spent / max" and
   *  to decide whether the rebalance button makes sense (don't show on
   *  finalized chains). */
  liveState: ChainGetStateResult | null;
  onRebalance: (params: { chainId: string; additionalBudgetUsd: number }) => Promise<ChainRebalanceResult>;
  t: TFunction;
}

export function ChainRebalanceBar({ chainId, liveState, onRebalance, t }: ChainRebalanceBarProps) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("1.00");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<ChainRebalanceResult | null>(null);

  const spent = liveState?.budgetSpentUsd ?? 0;
  const max = liveState?.budgetMaxUsd ?? 0;
  const remaining = useMemo(() => Math.max(0, max - spent), [max, spent]);
  const finalized = liveState?.published ?? false;
  const policy = (liveState as (typeof liveState & { rebalancePolicy?: "manual" | "auto" | "never" }) | null)?.rebalancePolicy ?? "manual";
  const autoCount = (liveState as (typeof liveState & { autoRebalanceCount?: number }) | null)?.autoRebalanceCount ?? 0;
  const maxAuto = (liveState as (typeof liveState & { maxAutoRebalances?: number }) | null)?.maxAutoRebalances ?? 2;
  const autoHistory = (liveState as (typeof liveState & { autoRebalanceHistory?: Array<{ at: string; reason: string; additionalBudgetUsd: number }> }) | null)?.autoRebalanceHistory ?? [];

  // "never" → hide the bar entirely.
  if (policy === "never") return null;
  // Finalized chains don't need a rebalance affordance.
  if (finalized) return null;

  const handleSubmit = useCallback(async () => {
    const next = Number(amount);
    if (!Number.isFinite(next) || next <= 0) {
      setError(t("chains.rebalance.invalidAmount"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await onRebalance({ chainId, additionalBudgetUsd: next });
      setLastResult(result);
      if (result.ok) {
        setOpen(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [amount, chainId, onRebalance, t]);

  if (finalized) return null;

  return (
    <div
      className="chain-rebalance-bar"
      data-testid="chain-rebalance-bar"
      data-policy={policy}
    >
      {policy === "auto" ? (
        <div className="chain-rebalance-policy" data-testid="chain-rebalance-policy-auto">
          {t("chains.rebalance.autoActive", { used: autoCount, max: maxAuto })}
          {autoHistory.length > 0 ? (
            <ul className="chain-rebalance-history">
              {autoHistory.slice(0, 3).map((h, i) => (
                <li key={`${h.at}-${i}`} className="chain-rebalance-history-item">
                  <code>{h.at.slice(11, 19)}</code>
                  <span>{" "}+${h.additionalBudgetUsd.toFixed(2)}</span>
                  <span>{" "}({h.reason})</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      <div className="chain-rebalance-summary">
        <span className="chain-rebalance-spent">
          {t("chains.rebalance.spent", { spent: spent.toFixed(2), max: max.toFixed(2) })}
        </span>
        <span className="chain-rebalance-remaining">
          {t("chains.rebalance.remaining", { remaining: remaining.toFixed(2) })}
        </span>
        {!open ? (
          <button
            type="button"
            className="chain-rebalance-open"
            onClick={() => setOpen(true)}
            data-action="rebalance-open"
            disabled={busy}
          >
            {t("chains.rebalance.open")}
          </button>
        ) : null}
      </div>
      {open ? (
        <div className="chain-rebalance-form" data-testid="chain-rebalance-form">
          <label className="chain-rebalance-label">
            {t("chains.rebalance.label")}
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={busy}
              data-testid="chain-rebalance-input"
            />
          </label>
          <button
            type="button"
            className="chain-rebalance-submit"
            onClick={() => void handleSubmit()}
            disabled={busy}
            data-action="rebalance-submit"
          >
            {busy ? t("chains.rebalance.submitting") : t("chains.rebalance.submit")}
          </button>
          <button
            type="button"
            className="chain-rebalance-cancel"
            onClick={() => setOpen(false)}
            disabled={busy}
          >
            {t("chains.rebalance.cancel")}
          </button>
        </div>
      ) : null}
      {error ? (
        <div className="chain-rebalance-error" role="alert">
          {error}
        </div>
      ) : null}
      {lastResult && lastResult.ok ? (
        <div className="chain-rebalance-result" data-testid="chain-rebalance-result">
          {t("chains.rebalance.result", {
            previous: (lastResult.previousMaxUsd ?? 0).toFixed(2),
            next: (lastResult.newMaxUsd ?? 0).toFixed(2),
            awarded: (lastResult.reEvaluated ?? []).filter((r) => r.awarded).length,
            total: (lastResult.reEvaluated ?? []).length,
          })}
        </div>
      ) : null}
    </div>
  );
}