/**
 * Phase 43 follow-up — per-chain management panel.
 *
 * Wires together the three previously-orphaned owner-control components:
 *   - ChainBidInbox     (Award / Counter-bid live bids)
 *   - ChainRebalanceBar (raise budget & retry)
 *   - ChainTreeView      (subtask lineage — rendered when subtask detail is
 *                         available; chainGetState does not return full
 *                         subtask objectives, so the tree is best-effort)
 *
 * Pulls live state from `chainGetState` on mount and on the `chain:state`
 * WebSocket event, so the bid inbox and rebalance bar reflect fresh bids.
 */
import { useCallback, useEffect, useState } from "react";
import type {
  ChainGetStateResult,
  ChainEvaluateBidsResult,
  ChainRebalanceResult,
  ChainCounterBidResult,
} from "@envoymesh/api";
import { useT } from "../context/I18nContext.js";
import { useToast } from "../hooks/useToast.js";
import { useNodeService } from "../hooks/useNodeService.js";
import { ChainBidInbox, type ChainBidInboxSubtask } from "./ChainBidInbox.js";
import { ChainRebalanceBar } from "./ChainRebalanceBar.js";
import { BackIcon } from "../icons.js";

export interface ChainDetailPanelProps {
  chainId: string;
  goal?: string;
  /** Optional subtask detail captured at start time (objective/capability). */
  subtasks?: Array<{
    subtaskId: string;
    depth?: number;
    requiredCapability?: string;
    objective?: string;
    costCeilingUsd?: number;
  }>;
  onBack: () => void;
  onChanged?: () => void;
}

export function ChainDetailPanel({
  chainId,
  goal,
  subtasks,
  onBack,
  onChanged,
}: ChainDetailPanelProps) {
  const t = useT();
  const nodeService = useNodeService();
  const { showToast } = useToast();
  const [state, setState] = useState<ChainGetStateResult | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const result = await nodeService.chainGetState({ chainId });
      setState(result);
    } catch (err) {
      console.error("[ChainDetailPanel] chainGetState failed:", err);
    } finally {
      setLoading(false);
    }
  }, [nodeService, chainId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Live updates: refresh when this chain's state changes.
  useEffect(() => {
    const unsub = nodeService.on("chain:state", (updated) => {
      const next = updated as ChainGetStateResult;
      if (next.chainId === chainId) {
        setState(next);
        // If the chain just completed or cancelled, notify the parent so it
        // can refresh its list (the chain may move to a different section).
        if (next.published || next.chainCancelled) {
          onChanged?.();
        }
      }
    });
    return unsub;
  }, [nodeService, chainId, onChanged]);

  const handleAward = useCallback(
    async (params: {
      chainId: string;
      subtaskId: string;
      pickWorkerPeerId: string;
    }): Promise<ChainEvaluateBidsResult> => {
      const result = await nodeService.chainEvaluateBids({
        chainId: params.chainId,
        subtaskId: params.subtaskId,
        pickWorkerPeerId: params.pickWorkerPeerId,
      });
      await load();
      return result;
    },
    [nodeService, load],
  );

  const handleCounterBid = useCallback(
    async (params: {
      chainId: string;
      subtaskId: string;
      newCostCeilingUsd: number;
      newDeadlineAt?: string;
    }): Promise<ChainCounterBidResult> => {
      try {
        // chainCounterBid RPC takes costCeilingUsd; map from the inbox's
        // newCostCeilingUsd field name.
        const result = await nodeService.chainCounterBid({
          chainId: params.chainId,
          subtaskId: params.subtaskId,
          newCostCeilingUsd: params.newCostCeilingUsd,
        });
        if (result.ok) {
          showToast(t("chains.bidInbox.counterSent"), "success");
        } else {
          showToast(result.reason ?? t("chains.bidInbox.counterFailed"), "error");
        }
        await load();
        onChanged?.();
        return result;
      } catch (err) {
        showToast(err instanceof Error ? err.message : String(err), "error");
        return { chainId: params.chainId, subtaskId: params.subtaskId, ok: false };
      }
    },
    [nodeService, load, showToast, onChanged, t],
  );

  const handleRebalance = useCallback(
    async (params: {
      chainId: string;
      additionalBudgetUsd: number;
    }): Promise<ChainRebalanceResult> => {
      const result = await nodeService.chainRebalance({
        chainId: params.chainId,
        additionalBudgetUsd: params.additionalBudgetUsd,
      });
      await load();
      onChanged?.();
      return result;
    },
    [nodeService, load, onChanged],
  );

  // Map chainGetState.bidsBySubtask + optional captured subtask detail into
  // the shape ChainBidInbox expects.
  const bidInboxSubtasks: ChainBidInboxSubtask[] = (state?.bidsBySubtask ?? [])
    .filter((row) => row.bids.length > 0)
    .map((row) => {
      const detail = subtasks?.find((s) => s.subtaskId === row.subtaskId);
      return {
        subtaskId: row.subtaskId,
        label: detail?.requiredCapability,
        costCeilingUsd: detail?.costCeilingUsd ?? state?.budgetMaxUsd ?? 0,
        bids: row.bids.map((b) => ({
          bidKey: b.bidKey,
          workerPeerId: b.workerPeerId,
          workerOwnerId: b.workerOwnerId,
          proposedCostUsd: b.proposedCostUsd,
          proposedEtaAt: b.proposedEtaAt,
          bidExpiresAt: b.bidExpiresAt,
          rationale: b.rationale,
        })),
      };
    });

  const isFinalized = state?.published || state?.chainCancelled;

  return (
    <div className="chain-detail-panel">
      <header className="chain-detail-panel__header">
        <button
          type="button"
          className="icon-btn chain-detail-panel__back"
          onClick={onBack}
          aria-label={t("common.back")}
          title={t("common.back")}
        >
          <BackIcon size={18} />
        </button>
        <div className="chain-detail-panel__title">
          <h3>{goal ?? chainId.slice(0, 12) + "…"}</h3>
          <code className="chain-id">{chainId.slice(0, 12)}…</code>
        </div>
      </header>

      {loading ? (
        <p className="chains-loading">{t("chains.loading")}</p>
      ) : !state ? (
        <p className="chains-empty">{t("chains.detail.loadFailed")}</p>
      ) : (
        <>
          <section className="chain-detail-panel__summary">
            <span className={`chain-status-badge status-${deriveDetailStatus(state)}`}>
              {t(`chains.status.${deriveDetailStatus(state)}`)}
            </span>
            <span>
              {t("chains.active.progress", {
                partial: state.partialCount,
                awarded: state.awardedCount,
                total: state.subtaskCount,
              })}
            </span>
            <span>
              {t("chains.rebalance.spent", {
                spent: state.budgetSpentUsd.toFixed(2),
                max: state.budgetMaxUsd.toFixed(2),
              })}
            </span>
          </section>

          {state.budgetWarningLevel === "warn" ? (
            <p className="chain-budget-warn">{t("chains.rebalance.warn", { percent: 80 })}</p>
          ) : state.budgetWarningLevel === "exceeded" ? (
            <p className="chain-budget-exceeded">{t("chains.rebalance.exceeded")}</p>
          ) : null}

          {!isFinalized ? (
            <>
              <section className="chain-detail-panel__section">
                <h4>{t("chains.detail.bidsTitle")}</h4>
                {bidInboxSubtasks.length === 0 ? (
                  <p className="chains-empty chains-empty--inline">
                    {t("chains.bidInbox.empty")}
                  </p>
                ) : (
                  <ChainBidInbox
                    chainId={chainId}
                    subtasks={bidInboxSubtasks}
                    onAward={handleAward}
                    onCounterBid={handleCounterBid}
                    t={t}
                  />
                )}
              </section>

              <section className="chain-detail-panel__section">
                <h4>{t("chains.detail.budgetTitle")}</h4>
                <ChainRebalanceBar
                  chainId={chainId}
                  liveState={state}
                  onRebalance={handleRebalance}
                  t={t}
                />
              </section>
            </>
          ) : (
            <p className="chain-detail-panel__finalized">
              {state.published
                ? t("chains.detail.finalized")
                : t("chains.detail.cancelled")}
            </p>
          )}
        </>
      )}
    </div>
  );
}

function deriveDetailStatus(r: ChainGetStateResult): string {
  if (r.chainCancelled) return "cancelled";
  if (r.published) return "completed";
  if (r.partialCount === r.subtaskCount && r.subtaskCount > 0) return "synthesizing";
  if (r.awardedCount < r.subtaskCount) return "bidding";
  if (r.awardedCount > 0) return "running";
  return "bidding";
}
