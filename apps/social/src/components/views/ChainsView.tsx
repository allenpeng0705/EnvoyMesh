/**
 * Phase 41D — ChainsView dashboard panel.
 *
 * Displays active chains with subtask progress and budget burn-down.
 * Polls chainListActive on mount and uses ConfirmDialog for cancel confirmation.
 *
 * Renders at Settings → Activity → Chains tab.
 */

import React, { useEffect, useState, useCallback } from "react";
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
  status: "bidding" | "running" | "synthesizing" | "completed" | "cancelled";
  subtaskCount: number;
  awardedCount: number;
  completedCount: number;
  budgetSpentUsd: number;
  budgetMaxUsd: number;
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
function asChainSummary(r: {
  chainId: string;
  chainMandateId: string;
  subtaskCount: number;
  awardedCount: number;
  partialCount: number;
  cancelledCount: number;
  chainCancelled: boolean;
  published: boolean;
  budgetSpentUsd: number;
  budgetMaxUsd: number;
}): ChainSummary {
  return {
    chainId: r.chainId,
    chainMandateId: r.chainMandateId,
    status: deriveStatus(r),
    subtaskCount: r.subtaskCount,
    awardedCount: r.awardedCount,
    completedCount: r.partialCount,
    budgetSpentUsd: r.budgetSpentUsd,
    budgetMaxUsd: r.budgetMaxUsd,
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
