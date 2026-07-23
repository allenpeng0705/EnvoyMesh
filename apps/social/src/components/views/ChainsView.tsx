/**
 * Phase 41D — ChainsView dashboard panel.
 *
 * Displays active chains with subtask progress and budget burn-down.
 * Polls chainListActive on mount and uses ConfirmDialog for cancel confirmation.
 *
 * Phase 43 follow-up: this view is now the primary chain entry point — a
 * "New chain" button + goal composer lives here (not only in AI chat), so a
 * user can start a multi-agent chain without first finding the hidden
 * "Run as chain" affordance under a chat message.
 */

import React, { useEffect, useState, useCallback } from "react";
import type { ChainGetStateResult } from "@envoymesh/api";
import { useT } from "../../context/I18nContext.js";
import { useToast } from "../../hooks/useToast.js";
import { useNodeService } from "../../hooks/useNodeService.js";
import { ConfirmDialog } from "../ConfirmDialog.js";
import { ChainReportView } from "../ChainReportView.js";
import { ChainStartDialog } from "../ChainStartDialog.js";
import { ChainDetailPanel } from "../ChainDetailPanel.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChainSummary {
  chainId: string;
  chainMandateId: string;
  goal?: string;
  status: "bidding" | "waitingWorkers" | "running" | "synthesizing" | "awaitingOwner" | "completed" | "cancelled";
  subtaskCount: number;
  awardedCount: number;
  completedCount: number;
  budgetSpentUsd: number;
  budgetMaxUsd: number;
  budgetWarningLevel?: ChainGetStateResult["budgetWarningLevel"];
  estimatedCostRange?: ChainGetStateResult["estimatedCostRange"];
  awardMode?: "direct" | "competitive";
  showCostUi?: boolean;
  published: boolean;
  chainCancelled: boolean;
  iteration?: ChainGetStateResult["iteration"];
}

/** Derive a human-readable status from ChainGetStateResult fields. */
function deriveStatus(r: {
  chainCancelled: boolean;
  published: boolean;
  awardedCount: number;
  subtaskCount: number;
  partialCount: number;
  cancelledCount: number;
  bidsBySubtask?: ChainGetStateResult["bidsBySubtask"];
  iteration?: ChainGetStateResult["iteration"];
}): ChainSummary["status"] {
  if (r.chainCancelled || r.cancelledCount === r.subtaskCount) return "cancelled";
  if (r.published) return "completed";
  if (r.iteration?.waitingForOwner) return "awaitingOwner";
  if (r.partialCount === r.subtaskCount && r.subtaskCount > 0) return "synthesizing";
  const bidCount = (r.bidsBySubtask ?? []).reduce((n, row) => n + row.bids.length, 0);
  if (r.awardedCount === 0 && bidCount === 0 && r.subtaskCount > 0) return "waitingWorkers";
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
    awardMode: r.awardMode,
    showCostUi: r.showCostUi,
    published: r.published,
    chainCancelled: r.chainCancelled,
    iteration: r.iteration,
  };
}

function formatIterationProgress(
  it: NonNullable<ChainGetStateResult["iteration"]>,
  t: (key: string, vars?: Record<string, string | number>) => string,
): string {
  return t("chains.iteration.progress", {
    round: it.round,
    max: it.maxRounds,
    extended: it.extendsInRound,
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface ChainsViewProps {
  onBack?: () => void;
  onOpenDiscover?: () => void;
}

export function ChainsView({ onBack, onOpenDiscover }: ChainsViewProps = {}) {
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

  // Chain creation flow (Phase 43 follow-up): a "New chain" button opens a
  // goal composer; the preview+launch reuses ChainStartDialog.
  const [newChainGoal, setNewChainGoal] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [goalDraft, setGoalDraft] = useState("");

  // Chain detail view: clicking an active chain opens the management panel
  // (bid inbox + subtask tree + rebalance bar) that was previously orphaned.
  const [detailChainId, setDetailChainId] = useState<string | null>(null);

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

  // Quick-start goal templates — mirror the Phase 43B RPC defaults so a new
  // user has one-tap on-ramps without having to author a goal from scratch.
  const goalTemplates: { label: string; goal: string }[] = [
    { label: t("chains.start.template.research"), goal: t("chains.start.template.researchGoal") },
    { label: t("chains.start.template.summarize"), goal: t("chains.start.template.summarizeGoal") },
    { label: t("chains.start.template.askNetwork"), goal: t("chains.start.template.askNetworkGoal") },
  ];

  const openComposer = useCallback((initialGoal?: string) => {
    setGoalDraft(initialGoal ?? "");
    setComposing(true);
  }, []);

  const launchChain = useCallback(() => {
    const goal = goalDraft.trim();
    if (!goal) return;
    setComposing(false);
    setNewChainGoal(goal);
  }, [goalDraft]);

  const handleStarted = useCallback(() => {
    setNewChainGoal(null);
    void loadChains();
  }, [loadChains]);

  // ---- Render ----

  if (loading && chains.length === 0) {
    return (
      <div className="chains-view">
        <div className="chains-view__header">
          <h3>{t("chains.nav")}</h3>
        </div>
        <p className="chains-loading">{t("chains.loading")}</p>
      </div>
    );
  }

  const activeChains = chains.filter(
    (c) => c.status !== "completed" && c.status !== "cancelled",
  );
  const completedChains = chains.filter((c) => c.status === "completed");
  const cancelledChains = chains.filter((c) => c.status === "cancelled");

  // When a chain detail is open, render the management panel instead of the list.
  if (detailChainId) {
    const chain = chains.find((c) => c.chainId === detailChainId);
    return (
      <div className="chains-view">
        <ChainDetailPanel
          chainId={detailChainId}
          goal={chain?.goal}
          onBack={() => setDetailChainId(null)}
          onChanged={() => void loadChains()}
        />
      </div>
    );
  }

  return (
    <div className="chains-view">
      <div className="chains-view__header">
        <h3>{t("chains.nav")}</h3>
        <button
          type="button"
          className="primary btn-sm chains-view__new-btn"
          onClick={() => openComposer()}
        >
          {t("chains.start.newChain")}
        </button>
      </div>

      {composing ? (
        <div className="chain-composer">
          <label htmlFor="chain-goal-input" className="chain-composer__label">
            {t("chains.start.composerLabel")}
          </label>
          <textarea
            id="chain-goal-input"
            className="chain-composer__input"
            value={goalDraft}
            onChange={(e) => setGoalDraft(e.target.value)}
            placeholder={t("chains.start.composerPlaceholder")}
            rows={3}
            autoFocus
          />
          <div className="chain-composer__templates">
            {goalTemplates.map((tpl) => (
              <button
                key={tpl.label}
                type="button"
                className="topic-chip chain-composer__template"
                onClick={() => setGoalDraft(tpl.goal)}
              >
                {tpl.label}
              </button>
            ))}
          </div>
          <div className="chain-composer__actions">
            <button type="button" className="secondary btn-sm" onClick={() => setComposing(false)}>
              {t("chains.start.cancel")}
            </button>
            <button
              type="button"
              className="primary btn-sm"
              onClick={launchChain}
              disabled={goalDraft.trim().length < 8}
            >
              {t("chains.start.preview")}
            </button>
          </div>
        </div>
      ) : null}

      {newChainGoal ? (
        <ChainStartDialog
          goal={newChainGoal}
          onClose={() => setNewChainGoal(null)}
          onStarted={handleStarted}
          onOpenDiscover={onOpenDiscover}
        />
      ) : null}

      {activeChains.length === 0 && !composing ? (
        <div className="chains-empty">
          <p>{t("chains.active.empty")}</p>
          <p className="chains-empty__hint">{t("chains.active.prerequisite")}</p>
          <div className="chains-empty__actions">
            {onOpenDiscover ? (
              <button
                type="button"
                className="secondary"
                data-testid="chains-open-discover"
                onClick={onOpenDiscover}
              >
                {t("chains.start.openDiscover")}
              </button>
            ) : null}
            <button
              type="button"
              className="primary"
              onClick={() => openComposer()}
            >
              {t("chains.start.newChain")}
            </button>
          </div>
        </div>
      ) : (
        activeChains.map((chain) => (
          <div
            key={chain.chainId}
            className="chain-card chain-card--clickable"
            onClick={() => setDetailChainId(chain.chainId)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setDetailChainId(chain.chainId);
              }
            }}
          >
            <div className="chain-card-header">
              <span className={`chain-status-badge status-${chain.status}`}>
                {chain.status === "running"
                  ? "🔄"
                  : chain.status === "synthesizing"
                    ? "🧩"
                    : chain.status === "waitingWorkers"
                      ? "📡"
                      : chain.status === "awaitingOwner"
                        ? "👤"
                        : "⏳"}
                {" "}
                {chain.status === "bidding" && chain.awardMode !== "competitive"
                  ? t("chains.status.assigning")
                  : t(`chains.status.${chain.status}`)}
              </span>
              <code className="chain-id">{chain.chainId.slice(0, 12)}…</code>
            </div>

            {chain.goal ? <p className="chain-card-goal">{chain.goal}</p> : null}
            {chain.iteration && (chain.iteration.maxRounds > 1 || chain.iteration.extendsInRound > 0) ? (
              <p className="chain-card-iteration" data-testid="chain-iteration-progress">
                {formatIterationProgress(chain.iteration, t)}
              </p>
            ) : null}
            {chain.showCostUi && chain.estimatedCostRange ? (
              <p className="chain-card-estimate">
                {t("chains.start.costRange", {
                  min: chain.estimatedCostRange.minUsd.toFixed(2),
                  max: chain.estimatedCostRange.maxUsd.toFixed(2),
                })}
              </p>
            ) : null}
            {chain.showCostUi && chain.budgetWarningLevel === "warn" ? (
              <p className="chain-budget-warn">{t("chains.rebalance.warn", { percent: 80 })}</p>
            ) : chain.showCostUi && chain.budgetWarningLevel === "exceeded" ? (
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
              {chain.showCostUi ? (
                <span>
                  {t("chains.rebalance.spent", {
                    spent: chain.budgetSpentUsd.toFixed(2),
                    max: chain.budgetMaxUsd.toFixed(2),
                  })}
                </span>
              ) : null}
            </div>

            <div className="chain-card-actions">
              <button
                type="button"
                className="btn-sm chain-card__manage-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  setDetailChainId(chain.chainId);
                }}
              >
                {t("chains.active.manage")}
              </button>
              {chain.showCostUi ? (
                <button
                  type="button"
                  className="btn-sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleExportCosts(chain.chainId);
                  }}
                >
                  {t("chains.start.exportCsv")}
                </button>
              ) : null}
              <button
                className="btn-sm btn-danger"
                onClick={(e) => {
                  e.stopPropagation();
                  handleCancel(chain.chainId);
                }}
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
              {chain.goal ? <p className="chain-card-goal">{chain.goal}</p> : null}
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
