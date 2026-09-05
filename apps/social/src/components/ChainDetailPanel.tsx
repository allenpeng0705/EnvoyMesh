/**
 * Phase 43 follow-up — per-chain management panel.
 *
 *   - ChainLiveSteps   (Phase 58B — objectives / deps / waitingOn)
 *   - ChainBidInbox     (Award / Counter-bid live bids)
 *   - ChainRebalanceBar (raise budget & retry)
 *
 * Pulls live state from `chainGetState` on mount and on the `chain:state`
 * WebSocket event, so the bid inbox and rebalance bar reflect fresh bids.
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
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
import { ChainLiveSteps } from "./ChainLiveSteps.js";
import { ChainRebalanceBar } from "./ChainRebalanceBar.js";
import { BackIcon } from "../icons.js";
import {
  shortChainPeerId,
  summarizeChainHomes,
} from "../lib/chain-homes-summary.js";

export interface ChainDetailPanelProps {
  chainId: string;
  goal?: string;
  /** Optional subtask detail captured at start time (objective/capability). */
  subtasks?: Array<{
    subtaskId: string;
    depth?: number;
    requiredSkill?: string;
    objective?: string;
    costCeilingUsd?: number;
  }>;
  onBack: () => void;
  onChanged?: () => void;
  /** Phase 58A — replace dead-end no-workers copy with fleet checklist. */
  readinessPanel?: ReactNode;
}

export function ChainDetailPanel({
  chainId,
  goal,
  subtasks,
  onBack,
  onChanged,
  readinessPanel,
}: ChainDetailPanelProps) {
  const t = useT();
  const nodeService = useNodeService();
  const { showToast } = useToast();
  const [state, setState] = useState<ChainGetStateResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [busySubtaskId, setBusySubtaskId] = useState<string | null>(null);
  const [busyDeliveryKey, setBusyDeliveryKey] = useState<string | null>(null);
  const [busyOwnership, setBusyOwnership] = useState(false);

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

  const handleCancelStep = useCallback(
    async (subtaskId: string) => {
      setBusySubtaskId(subtaskId);
      try {
        const result = await nodeService.chainCancel({
          chainId,
          subtaskId,
          reason: "owner_cancel_step",
          cancelledBy: "owner",
        });
        if (!result.cancelled?.includes(subtaskId)) {
          showToast(t("chains.detail.stepCancelFailed"), "error");
          return;
        }
        showToast(t("chains.detail.stepCancelled"), "success");
        await load();
        onChanged?.();
      } catch (err) {
        showToast(err instanceof Error ? err.message : String(err), "error");
      } finally {
        setBusySubtaskId(null);
      }
    },
    [nodeService, chainId, load, onChanged, showToast, t],
  );

  const handleReassignStep = useCallback(
    async (subtaskId: string) => {
      if (!nodeService.chainReassignSubtask) {
        showToast(t("chains.detail.reassignUnavailable"), "error");
        return;
      }
      setBusySubtaskId(subtaskId);
      try {
        const result = await nodeService.chainReassignSubtask({ chainId, subtaskId });
        if (!result.ok) {
          showToast(result.error ?? t("chains.detail.reassignFailed"), "error");
          return;
        }
        showToast(t("chains.detail.stepReassigned"), "success");
        await load();
        onChanged?.();
      } catch (err) {
        showToast(err instanceof Error ? err.message : String(err), "error");
      } finally {
        setBusySubtaskId(null);
      }
    },
    [nodeService, chainId, load, onChanged, showToast, t],
  );

  const handleRetryInputDelivery = useCallback(
    async (input: { workerPeerId: string; sourceRelativePath: string }) => {
      if (!nodeService.chainRetryInputDelivery) {
        showToast(t("chains.detail.deliveryRetryUnavailable"), "error");
        return;
      }
      const key = `${input.workerPeerId}::${input.sourceRelativePath}`;
      setBusyDeliveryKey(key);
      try {
        const result = await nodeService.chainRetryInputDelivery({
          chainId,
          workerPeerId: input.workerPeerId,
          sourceRelativePath: input.sourceRelativePath,
        });
        if (!result.ok) {
          showToast(result.error ?? t("chains.detail.deliveryRetryFailed"), "error");
          return;
        }
        showToast(t("chains.detail.deliveryRetried"), "success");
        await load();
        onChanged?.();
      } catch (err) {
        showToast(err instanceof Error ? err.message : String(err), "error");
      } finally {
        setBusyDeliveryKey(null);
      }
    },
    [nodeService, chainId, load, onChanged, showToast, t],
  );

  // Map chainGetState.bidsBySubtask + optional captured subtask detail into
  // the shape ChainBidInbox expects. Keep zero-bid rows so solo/stalled
  // chains show an actionable empty state instead of "No subtasks yet".
  const bidInboxSubtasks: ChainBidInboxSubtask[] = (state?.bidsBySubtask ?? []).map((row) => {
    const detail = subtasks?.find((s) => s.subtaskId === row.subtaskId);
    return {
      subtaskId: row.subtaskId,
      label: detail?.requiredSkill,
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

  const totalBids = bidInboxSubtasks.reduce((n, row) => n + row.bids.length, 0);
  const showCostUi = state?.showCostUi === true;
  const competitive = state?.awardMode === "competitive";
  const waitingForWorkers =
    Boolean(state) &&
    !state!.published &&
    !state!.chainCancelled &&
    state!.awardedCount === 0 &&
    totalBids === 0 &&
    state!.subtaskCount > 0;
  const isFinalized = state?.published || state?.chainCancelled;
  const detailStatus = state ? deriveDetailStatus(state) : "unknown";
  const statusLabel = t(`chains.status.${detailStatus}`);
  const homes = useMemo(
    () =>
      summarizeChainHomes({
        remoteOwnership: state?.remoteOwnership,
        steps: state?.steps,
      }),
    [state?.remoteOwnership, state?.steps],
  );

  const strandedBanner =
    state?.assignerStranded &&
    state.remoteOwnership?.localRole === "creator" &&
    !state.published &&
    !state.chainCancelled ? (
      <section
        className="chain-detail-panel__section chain-assigner-stranded"
        data-testid="chain-assigner-stranded"
      >
        <h4>{t("chains.detail.assignerStrandedTitle")}</h4>
        <p>{t("chains.detail.assignerStrandedBody")}</p>
        <div className="chain-iteration-owner__actions">
          {state.assignerStranded.canReclaim ? (
            <button
              type="button"
              className="secondary btn-sm"
              disabled={busyOwnership}
              data-testid="chain-assigner-reclaim"
              onClick={() => {
                void (async () => {
                  if (!nodeService.chainReclaimAssigner) {
                    showToast(t("chains.detail.assignerStrandedFailed"), "error");
                    return;
                  }
                  setBusyOwnership(true);
                  try {
                    const r = await nodeService.chainReclaimAssigner({ chainId });
                    if (!r.ok) {
                      showToast(r.reason ?? t("chains.detail.assignerStrandedFailed"), "error");
                      return;
                    }
                    showToast(
                      r.mode === "restart"
                        ? t("chains.detail.assignerStrandedRestarted")
                        : t("chains.detail.assignerStrandedReclaimed"),
                      "success",
                    );
                    await load();
                    onChanged?.();
                  } catch (err) {
                    showToast(err instanceof Error ? err.message : String(err), "error");
                  } finally {
                    setBusyOwnership(false);
                  }
                })();
              }}
            >
              {t("chains.detail.assignerStrandedReclaim")}
            </button>
          ) : null}
          {state.assignerStranded.canCancel ? (
            <button
              type="button"
              className="link-btn"
              disabled={busyOwnership}
              data-testid="chain-assigner-cancel-delegated"
              onClick={() => {
                void (async () => {
                  if (!nodeService.chainCancelDelegated) {
                    showToast(t("chains.detail.assignerStrandedFailed"), "error");
                    return;
                  }
                  setBusyOwnership(true);
                  try {
                    const r = await nodeService.chainCancelDelegated({
                      chainId,
                      reason: "owner_stranded_cancel",
                    });
                    if (!r.ok) {
                      showToast(r.reason ?? t("chains.detail.assignerStrandedFailed"), "error");
                      return;
                    }
                    showToast(t("chains.detail.assignerStrandedCancelled"), "success");
                    await load();
                    onChanged?.();
                  } catch (err) {
                    showToast(err instanceof Error ? err.message : String(err), "error");
                  } finally {
                    setBusyOwnership(false);
                  }
                })();
              }}
            >
              {t("chains.detail.assignerStrandedCancel")}
            </button>
          ) : null}
        </div>
      </section>
    ) : null;

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
            <span className={`chain-status-badge status-${detailStatus}`}>
              {statusLabel}
            </span>
            {state.assignmentMode ? (
              <span
                className="chain-detail-panel__assignment-mode"
                data-testid="chain-detail-assignment-mode"
              >
                {state.assignmentMode === "role"
                  ? t("chains.detail.assignmentModeRole")
                  : t("chains.detail.assignmentModeSkill")}
              </span>
            ) : null}
            {state.teamStrategy?.id ? (
              <span
                className="chain-detail-panel__team-strategy"
                data-testid="chain-detail-team-strategy"
              >
                {t(`chains.strategy.${state.teamStrategy.id}` as "chains.strategy.balanced")}
              </span>
            ) : null}
            {state.recovery?.phase === "recovering" ? (
              <span
                className="chain-detail-panel__recovery"
                data-testid="chain-detail-recovery"
              >
                {t("chains.detail.recovering")}
              </span>
            ) : null}
            <span>
              {t("chains.active.progress", {
                partial: state.partialCount,
                awarded: state.awardedCount,
                total: state.subtaskCount,
              })}
            </span>
            {state.iteration && (state.iteration.maxRounds > 1 || state.iteration.extendsInRound > 0) ? (
              <span data-testid="chain-detail-iteration">
                {t("chains.iteration.progress", {
                  round: state.iteration.round,
                  max: state.iteration.maxRounds,
                  extended: state.iteration.extendsInRound,
                })}
              </span>
            ) : null}
            {showCostUi ? (
              <span>
                {t("chains.rebalance.spent", {
                  spent: state.budgetSpentUsd.toFixed(2),
                  max: state.budgetMaxUsd.toFixed(2),
                })}
              </span>
            ) : null}
          </section>

          {strandedBanner}

          {homes.assignerPeerId || homes.workerPeerIds.length > 0 ? (
            <section
              className="chain-detail-panel__section chain-detail-homes"
              data-testid="chain-detail-homes"
            >
              <h4>{t("chains.detail.homesTitle")}</h4>
              {homes.watchingRemoteAssigner ? (
                <p className="muted">{t("chains.detail.homesWatchingRemote")}</p>
              ) : homes.localRole === "assigner" ? (
                <p className="muted">{t("chains.detail.homesThisHomeAssigner")}</p>
              ) : null}
              {homes.assignerPeerId ? (
                <p data-testid="chain-detail-homes-assigner">
                  <strong>{t("chains.detail.homesAssigner")}:</strong>{" "}
                  <code>{shortChainPeerId(homes.assignerPeerId)}</code>
                </p>
              ) : null}
              {homes.workerPeerIds.length > 0 ? (
                <p data-testid="chain-detail-homes-workers">
                  <strong>{t("chains.detail.homesWorkers")}:</strong>{" "}
                  {homes.workerPeerIds.map((id) => shortChainPeerId(id)).join(", ")}
                </p>
              ) : null}
            </section>
          ) : null}

          {(state.steps ?? []).length > 0 ? (
            <ChainLiveSteps
              steps={state.steps!}
              chainId={chainId}
              provenanceSummary={state.provenanceSummary}
              goal={state.goal ?? goal}
              inputAttachments={state.inputAttachments}
              inputDeliveries={state.inputDeliveries}
              allowStepControl={!isFinalized && state.remoteOwnership?.localRole !== "creator"}
              busySubtaskId={busySubtaskId}
              busyDeliveryKey={busyDeliveryKey}
              onCancelStep={handleCancelStep}
              onReassignStep={handleReassignStep}
              onRetryInputDelivery={handleRetryInputDelivery}
            />
          ) : (
            <p className="chain-live-steps__honesty chain-live-steps__honesty--solo">
              {t("chains.detail.attachmentHonesty")}
            </p>
          )}

          {(state.planWarnings ?? []).length > 0 ? (
            <section
              className="chain-detail-panel__section chain-detail-plan-warnings"
              data-testid="chain-detail-plan-warnings"
            >
              <h4>{t("chains.detail.planWarningsTitle")}</h4>
              <ul>
                {state.planWarnings!.map((w, i) => (
                  <li key={`${w.code}-${i}`}>{w.message}</li>
                ))}
              </ul>
            </section>
          ) : null}

          {state.recovery?.phase === "recovering" ? (
            <p className="chain-detail-panel__honesty" data-testid="chain-detail-recovery-honesty">
              {t("chains.detail.recoveringHonesty")}
            </p>
          ) : null}

          {(state.speculationReview ?? []).map((review) => (
            <section
              key={review.subtaskId}
              className="chain-detail-panel__section chain-speculation-review"
              data-testid="chain-speculation-review"
            >
              <h4>{t("chains.detail.speculationReviewTitle")}</h4>
              <p>
                {review.reason === "none_pass"
                  ? t("chains.detail.speculationReviewNonePass")
                  : t("chains.detail.speculationReviewDisagree")}
              </p>
              <ul className="chain-speculation-review__attempts">
                {review.attempts.map((attempt) => (
                  <li key={attempt.attemptId}>
                    <code>{attempt.workerPeerId.slice(0, 14)}…</code>
                    {attempt.role ? (
                      <span className="chain-speculation-review__role">{attempt.role}</span>
                    ) : null}
                    <button
                      type="button"
                      className="secondary btn-sm"
                      disabled={busySubtaskId === review.subtaskId}
                      data-testid={`chain-speculation-pick-${attempt.attemptId}`}
                      onClick={() => {
                        void (async () => {
                          setBusySubtaskId(review.subtaskId);
                          try {
                            const r = await nodeService.chainResolveSpeculation({
                              chainId,
                              subtaskId: review.subtaskId,
                              action: "pick",
                              attemptId: attempt.attemptId,
                            });
                            if (!r.ok) {
                              showToast(r.reason ?? t("chains.detail.speculationReviewFailed"), "error");
                              return;
                            }
                            showToast(t("chains.detail.speculationReviewResolved"), "success");
                            await load();
                            onChanged?.();
                          } catch (err) {
                            showToast(err instanceof Error ? err.message : String(err), "error");
                          } finally {
                            setBusySubtaskId(null);
                          }
                        })();
                      }}
                    >
                      {t("chains.detail.speculationReviewPick")}
                    </button>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                className="link-btn"
                disabled={busySubtaskId === review.subtaskId}
                data-testid={`chain-speculation-reassign-${review.subtaskId}`}
                onClick={() => {
                  void (async () => {
                    setBusySubtaskId(review.subtaskId);
                    try {
                      const r = await nodeService.chainResolveSpeculation({
                        chainId,
                        subtaskId: review.subtaskId,
                        action: "reassign",
                      });
                      if (!r.ok) {
                        showToast(r.reason ?? t("chains.detail.speculationReviewFailed"), "error");
                        return;
                      }
                      showToast(t("chains.detail.stepReassigned"), "success");
                      await load();
                      onChanged?.();
                    } catch (err) {
                      showToast(err instanceof Error ? err.message : String(err), "error");
                    } finally {
                      setBusySubtaskId(null);
                    }
                  })();
                }}
              >
                {t("chains.detail.speculationReviewReassign")}
              </button>
            </section>
          ))}

          {state.iteration?.waitingForOwner ? (
            <section className="chain-detail-panel__section chain-iteration-owner" data-testid="chain-iteration-owner">
              <h4>{t("chains.iteration.askOwnerTitle")}</h4>
              <p>{t("chains.iteration.askOwnerBody")}</p>
              {state.iteration.drafts.at(-1)?.summary ? (
                <p className="chain-iteration-owner__draft">
                  {state.iteration.drafts.at(-1)!.summary.slice(0, 400)}
                </p>
              ) : null}
              <div className="chain-iteration-owner__actions">
                <button
                  type="button"
                  className="secondary btn-sm"
                  onClick={() => {
                    void (async () => {
                      try {
                        const r = await nodeService.chainResolveIteration({
                          chainId,
                          decision: "stop",
                        });
                        if (!r.ok) {
                          showToast(r.error ?? t("chains.iteration.resolveFailed"), "error");
                          return;
                        }
                        showToast(t("chains.iteration.accepted"), "success");
                        await load();
                        onChanged?.();
                      } catch (err) {
                        showToast(err instanceof Error ? err.message : String(err), "error");
                      }
                    })();
                  }}
                >
                  {t("chains.iteration.acceptDraft")}
                </button>
                <button
                  type="button"
                  className="primary btn-sm"
                  onClick={() => {
                    void (async () => {
                      try {
                        const r = await nodeService.chainResolveIteration({
                          chainId,
                          decision: "continue",
                        });
                        if (!r.ok) {
                          showToast(r.error ?? t("chains.iteration.resolveFailed"), "error");
                          return;
                        }
                        showToast(t("chains.iteration.continued"), "success");
                        await load();
                        onChanged?.();
                      } catch (err) {
                        showToast(err instanceof Error ? err.message : String(err), "error");
                      }
                    })();
                  }}
                >
                  {t("chains.iteration.continueRefine")}
                </button>
              </div>
            </section>
          ) : null}

          {showCostUi && state.budgetWarningLevel === "warn" ? (
            <p className="chain-budget-warn">{t("chains.rebalance.warn", { percent: 80 })}</p>
          ) : showCostUi && state.budgetWarningLevel === "exceeded" ? (
            <p className="chain-budget-exceeded">{t("chains.rebalance.exceeded")}</p>
          ) : null}

          {!isFinalized ? (
            <>
              {competitive ? (
                <section className="chain-detail-panel__section">
                  <h4>{t("chains.detail.bidsTitle")}</h4>
                  {waitingForWorkers ? (
                    <div className="chains-empty chains-empty--inline" data-testid="chain-detail-no-workers">
                      {readinessPanel ?? (
                        <>
                          <p>{t("chains.bidInbox.noWorkersTitle")}</p>
                          <p className="chains-empty__hint">{t("chains.bidInbox.noWorkersDesc")}</p>
                        </>
                      )}
                    </div>
                  ) : bidInboxSubtasks.length === 0 ? (
                    <p className="chains-empty chains-empty--inline">
                      {t("chains.bidInbox.empty")}
                    </p>
                  ) : totalBids === 0 ? (
                    <div className="chains-empty chains-empty--inline" data-testid="chain-detail-waiting-bids">
                      <p>{t("chains.bidInbox.waitingTitle")}</p>
                      <p className="chains-empty__hint">{t("chains.bidInbox.waitingDesc")}</p>
                    </div>
                  ) : (
                    <ChainBidInbox
                      chainId={chainId}
                      subtasks={bidInboxSubtasks.filter((s) => s.bids.length > 0)}
                      onAward={handleAward}
                      onCounterBid={handleCounterBid}
                      t={t}
                    />
                  )}
                </section>
              ) : waitingForWorkers ? (
                <div className="chains-empty chains-empty--inline" data-testid="chain-detail-no-workers">
                  {readinessPanel ?? (
                    <>
                      <p>{t("chains.bidInbox.noWorkersTitle")}</p>
                      <p className="chains-empty__hint">{t("chains.bidInbox.noWorkersDesc")}</p>
                    </>
                  )}
                </div>
              ) : (
                <p className="chain-detail-panel__direct-hint">{t("chains.detail.directAssignHint")}</p>
              )}

              {showCostUi ? (
                <section className="chain-detail-panel__section">
                  <h4>{t("chains.detail.budgetTitle")}</h4>
                  <ChainRebalanceBar
                    chainId={chainId}
                    liveState={state}
                    onRebalance={handleRebalance}
                    t={t}
                  />
                </section>
              ) : null}
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
  const bidCount = (r.bidsBySubtask ?? []).reduce((n, row) => n + row.bids.length, 0);
  // Solo / stalled: no awards and no worker ACK yet.
  if (r.awardedCount === 0 && bidCount === 0 && r.subtaskCount > 0) return "waitingWorkers";
  const preAward = r.awardMode === "competitive" ? "bidding" : "assigning";
  if (r.awardedCount < r.subtaskCount) return preAward;
  if (r.awardedCount > 0) return "running";
  return preAward;
}
