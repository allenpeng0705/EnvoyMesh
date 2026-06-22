/**
 * Phase 41D — ChainsView dashboard panel.
 *
 * Displays active chains with subtask progress and budget burn-down.
 * Polls chainListActive on mount and uses ConfirmDialog for cancel confirmation.
 *
 * Renders at Settings → Activity → Chains tab.
 */

import React, { useEffect, useState, useCallback } from "react";
import type { ChainGetStateResult } from "@envoymesh/api";
import { useT } from "../../context/I18nContext.js";
import { useToast } from "../../hooks/useToast.js";
import { useNodeService } from "../../hooks/useNodeService.js";
import { ConfirmDialog } from "../ConfirmDialog.js";
import { ChainReportView } from "../ChainReportView.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChainSummary {
  chainId: string;
  chainMandateId: string;
  goal?: string;
  status: "bidding" | "running" | "synthesizing" | "completed" | "cancelled";
  subtaskCount: number;
  awardedCount: number;
  completedCount: number;
  budgetSpentUsd: number;
  budgetMaxUsd: number;
  budgetWarningLevel?: ChainGetStateResult["budgetWarningLevel"];
  estimatedCostRange?: ChainGetStateResult["estimatedCostRange"];
  published: boolean;
  chainCancelled: boolean;
}

/** Derive a human-readable status from ChainGetStateResult fields. */
function deriveStatus(r: {
  chainCancelled: boolean;
  published: boolean;
  awardedCount: number;
  subtaskCount: number;
  partialCount: number;
  cancelledCount: number;
}): ChainSummary["status"] {
  if (r.chainCancelled || r.cancelledCount === r.subtaskCount) return "cancelled";
  if (r.published) return "completed";
  if (r.partialCount === r.subtaskCount && r.subtaskCount > 0) return "synthesizing";
  if (r.awardedCount < r.subtaskCount) return "bidding";
  if (r.awardedCount > 0) return "running";
  return "bidding";
}

/** Map a ChainGetStateResult to our local ChainSummary. */
function asChainSummary(r: ChainGetStateResult): ChainSummary {
  return {
    chainId: r.chainId,
    chainMandateId: r.chainMandateId,
    goal: r.goal,
    status: deriveStatus(r),
    subtaskCount: r.subtaskCount,
    awardedCount: r.awardedCount,
    completedCount: r.partialCount,
    budgetSpentUsd: r.budgetSpentUsd,
    budgetMaxUsd: r.budgetMaxUsd,
    budgetWarningLevel: r.budgetWarningLevel,
    estimatedCostRange: r.estimatedCostRange,
    published: r.published,
    chainCancelled: r.chainCancelled,
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface ChainsViewProps {
  onBack?: () => void;
}

export function ChainsView({ onBack }: ChainsViewProps = {}) {
  const t = useT();
  const nodeService = useNodeService();
  const { showToast } = useToast();
  const [chains, setChains] = useState<ChainSummary[]>([]);
  const [viewingReport, setViewingReport] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirm, setConfirm] = useState<{
    chainId: string;
    onConfirm: () => void;
  } | null>(null);

  const loadChains = useCallback(async () => {
    try {
      const result = await nodeService.chainListActive();
      setChains((result.chains ?? []).map(asChainSummary));
    } catch (err) {
      console.error("[ChainsView] failed to load active chains:", err);
    }
  }, [nodeService]);

  useEffect(() => {
    setLoading(true);
    void loadChains().finally(() => setLoading(false));
  }, [loadChains]);

  useEffect(() => {
    const unsub = nodeService.on("chain:state", (state) => {
      setChains((prev) => {
        const next = asChainSummary(state);
        const idx = prev.findIndex((c) => c.chainId === next.chainId);
        if (idx < 0) return [next, ...prev];
        return prev.map((c, i) => (i === idx ? next : c));
      });
    });
    return unsub;
  }, [nodeService]);

  const handleCancel = useCallback(
    (chainId: string) => {
      setConfirm({
        chainId,
        onConfirm: async () => {
          setConfirm(null);
          try {
            await nodeService.chainCancel({
              chainId,
              reason: "Cancelled by owner",
              cancelledBy: "owner",
            });
            void loadChains();
            showToast(t("chains.active.cancelled"), "success");
          } catch (err) {
            console.error("[ChainsView] chainCancel failed:", err);
            showToast(t("chains.active.cancelFailed"), "error");
          }
        },
      });
    },
    [nodeService, loadChains, showToast, t],
  );

  const handleViewReport = useCallback((chainId: string) => {
    setViewingReport((prev) => (prev === chainId ? null : chainId));
  }, []);

  const handleExportCosts = useCallback(
    async (chainId: string) => {
      try {
        const result = await nodeService.chainExportCosts({ chainId });
        const blob = new Blob([result.csv], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${chainId}-costs.csv`;
        a.click();
        URL.revokeObjectURL(url);
      } catch (err) {
        console.error("[ChainsView] chainExportCosts failed:", err);
        showToast(t("chains.start.failed"), "error");
      }
    },
    [nodeService, showToast, t],
  );

  // ---- Render ----

  if (loading && chains.length === 0) {
    return (
      <div className="chains-view">
        <h3>{t("chains.nav")}</h3>
        <p className="chains-loading">{t("chains.loading")}</p>
      </div>
    );
  }

  const activeChains = chains.filter(
    (c) => c.status !== "completed" && c.status !== "cancelled",
  );
  const completedChains = chains.filter((c) => c.status === "completed");
  const cancelledChains = chains.filter((c) => c.status === "cancelled");

  return (
    <div className="chains-view">
      <h3>{t("chains.nav")}</h3>

      {activeChains.length === 0 ? (
        <p className="chains-empty">{t("chains.active.empty")}</p>
      ) : (
        activeChains.map((chain) => (
          <div key={chain.chainId} className="chain-card">
            <div className="chain-card-header">
              <span className={`chain-status-badge status-${chain.status}`}>
                {chain.status === "running"
                  ? "🔄"
                  : chain.status === "synthesizing"
                    ? "🧩"
                    : "⏳"}
                {" "}
                {t(`chains.status.${chain.status}`)}
              </span>
              <code className="chain-id">{chain.chainId.slice(0, 12)}…</code>
            </div>

            {chain.goal ? <p className="chain-card-goal">{chain.goal}</p> : null}
            {chain.estimatedCostRange ? (
              <p className="chain-card-estimate">
                {t("chains.start.costRange", {
                  min: chain.estimatedCostRange.minUsd.toFixed(2),
                  max: chain.estimatedCostRange.maxUsd.toFixed(2),
                })}
              </p>
            ) : null}
            {chain.budgetWarningLevel === "warn" ? (
              <p className="chain-budget-warn">{t("chains.rebalance.warn", { percent: 80 })}</p>
            ) : chain.budgetWarningLevel === "exceeded" ? (
              <p className="chain-budget-exceeded">{t("chains.rebalance.exceeded")}</p>
            ) : null}

            <div className="chain-card-progress">
              <span>
                {t("chains.active.progress", {
                  partial: chain.completedCount,
                  awarded: chain.awardedCount,
                  total: chain.subtaskCount,
                })}
              </span>
              <span>
                {t("chains.rebalance.spent", {
                  spent: chain.budgetSpentUsd.toFixed(2),
                  max: chain.budgetMaxUsd.toFixed(2),
                })}
              </span>
            </div>

            <div className="chain-card-actions">
              <button
                type="button"
                className="btn-sm"
                onClick={() => void handleExportCosts(chain.chainId)}
              >
                {t("chains.start.exportCsv")}
              </button>
              <button
                className="btn-sm btn-danger"
                onClick={() => handleCancel(chain.chainId)}
              >
                {t("chains.active.cancel")}
              </button>
            </div>
          </div>
        ))
      )}

      {completedChains.length > 0 && (
        <>
          <h3>{t("chains.reports.title")}</h3>
          {completedChains.map((chain) => (
            <div
              key={chain.chainId}
              className="chain-card chain-card-completed"
            >
              <div className="chain-card-header">
                <span className="chain-status-badge status-completed">
                  ✅ {t("chains.status.published")}
                </span>
                <code className="chain-id">{chain.chainId.slice(0, 12)}…</code>
                <span className="chain-cost">
                  {t("chains.rebalance.spent", {
                    spent: chain.budgetSpentUsd.toFixed(2),
                    max: chain.budgetMaxUsd.toFixed(2),
                  })}
                </span>
              </div>
              <div className="chain-card-actions">
                <button
                  type="button"
                  className="btn-sm"
                  onClick={() => void handleExportCosts(chain.chainId)}
                >
                  {t("chains.start.exportCsv")}
                </button>
                <button
                  className="btn-sm"
                  onClick={() => handleViewReport(chain.chainId)}
                >
                  {viewingReport === chain.chainId
                    ? t("chains.reports.hideReport")
                    : t("chains.reports.viewReport")}
                </button>
              </div>

              {viewingReport === chain.chainId && (
                <ChainReportView
                  chainId={chain.chainId}
                  onClose={() => setViewingReport(null)}
                />
              )}
            </div>
          ))}
        </>
      )}

      {cancelledChains.length > 0 && (
        <>
          <h3>{t("chains.status.cancelled")}</h3>
          {cancelledChains.map((chain) => (
            <div
              key={chain.chainId}
              className="chain-card chain-card-failed"
            >
              <span className="chain-status-badge status-cancelled">
                ❌ {t("chains.status.cancelled")}
              </span>
              <code className="chain-id">{chain.chainId.slice(0, 12)}…</code>
            </div>
          ))}
        </>
      )}

      {confirm && (
        <ConfirmDialog
          title={t("chains.active.cancelConfirm")}
          message={t("chains.active.cancelConfirmMessage")}
          variant="destructive"
          confirmLabel={t("chains.active.cancel")}
          onConfirm={confirm.onConfirm}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}
