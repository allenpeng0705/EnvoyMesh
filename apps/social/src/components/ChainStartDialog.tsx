/**
 * Phase 43B — Plan preview + one-click chain launch from chat.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { ChainPreviewGoalResult, ChainPreviewSuggestedWorker, ChainStartFromGoalResult, BondRecord, CachedAgentCardSummary } from "@envoymesh/api";

import { useT } from "../context/I18nContext.js";
import { useNodeService } from "../hooks/useNodeService.js";
import { useToast } from "../hooks/useToast.js";
import { isTeamJobReady } from "../lib/chain-bond-health.js";
import type { ChainBondHealth } from "../lib/chain-bond-health.js";
import { AgentNetworkSkillsPreview } from "./AgentNetworkSkillsPreview.js";

export interface WorkerCandidate {
  bond: BondRecord;
  card: CachedAgentCardSummary | undefined;
  health: ChainBondHealth;
  /** Local agent (team job creator) — labeled "You"; same select/order rules as peers. */
  isSelf?: boolean;
}

export interface ChainStartDialogProps {
  goal: string;
  onClose: () => void;
  onStarted?: (chainId: string) => void;
  /** Optional — send the user to Discover when no workers are available. */
  onOpenDiscover?: () => void;
  /** Bonded contacts with agent-card health, passed from ChainsView. */
  workerCandidates?: WorkerCandidate[];
}

export function ChainStartDialog({
  goal,
  onClose,
  onStarted,
  onOpenDiscover,
  workerCandidates = [],
}: ChainStartDialogProps) {
  const t = useT();
  const nodeService = useNodeService();
  const { showToast } = useToast();
  const [preview, setPreview] = useState<ChainPreviewGoalResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [recipeLabel, setRecipeLabel] = useState("");
  const [savingRecipe, setSavingRecipe] = useState(false);
  const [showCostUi, setShowCostUi] = useState(false);
  const [iterationMaxRounds, setIterationMaxRounds] = useState(1);
  const [extendMaxStepsPerRound, setExtendMaxStepsPerRound] = useState(2);
  const [iterationJudgeMode, setIterationJudgeMode] = useState<
    "llm" | "always_stop" | "owner"
  >("llm");
  const [showJobSettings, setShowJobSettings] = useState(false);
  const iterationTouchedRef = useRef(false);

  // Team member selection — track by agent peer ID (card.sourceAgentPeerId)
  const [selectedPeerIds, setSelectedPeerIds] = useState<Set<string>>(new Set());
  // True once the owner manually toggles a worker. Until then the selection
  // mirrors the system's suggested pool (auto-first); the launch path treats
  // an untouched selection as "use the recommended pool as-is".
  const selectionTouchedRef = useRef(false);

  // A contact is selectable for a team job only when all three readiness
  // dimensions pass: a fresh agent card, opted into the Agent Network, and
  // currently online. "unknown" online (probe still in flight) stays selectable
  // so the UI doesn't dead-lock while the batch RPC loads; explicit "offline"
  // sinks to non-selectable — team jobs can only run on reachable workers.
  const selectableCandidates = useMemo(
    () => workerCandidates.filter((w) => isTeamJobReady(w.card, w.health)),
    [workerCandidates],
  );

  // System-recommended workers from the preview, keyed by agent peer id.
  const suggestedByPeer = useMemo(() => {
    const map = new Map<string, ChainPreviewSuggestedWorker>();
    for (const w of preview?.suggestedWorkers ?? []) {
      map.set(w.peerId, w);
    }
    return map;
  }, [preview?.suggestedWorkers]);

  // Auto-first: union plan assignees + suggested pool (backups for stall
  // reassign). Only runs until the owner manually toggles.
  useEffect(() => {
    if (!preview?.ok || selectionTouchedRef.current) return;
    const selectableIds = new Set(
      selectableCandidates.map((w) => w.card!.sourceAgentPeerId!),
    );
    const preferredIds = [
      ...new Set(
        (preview.subtasks ?? [])
          .map((s) => s.preferredWorkerPeerId)
          .filter((id): id is string => Boolean(id)),
      ),
    ].filter((id) => selectableIds.has(id));
    const suggestedSelectable = [...suggestedByPeer.keys()].filter((id) =>
      selectableIds.has(id),
    );
    const autoIds = [...new Set([...preferredIds, ...suggestedSelectable])];
    setSelectedPeerIds((prev) => {
      // Only adopt the system pick if the owner hasn't chosen anyone yet.
      if (prev.size > 0) return prev;
      return new Set(autoIds);
    });
  }, [preview, preview?.ok, preview?.subtasks, suggestedByPeer, selectableCandidates]);

  // Prune stale selections when the candidate list changes
  useEffect(() => {
    const validIds = new Set(
      selectableCandidates.map((w) => w.card!.sourceAgentPeerId!),
    );
    setSelectedPeerIds((prev) => {
      let changed = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (validIds.has(id)) {
          next.add(id);
        } else {
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [selectableCandidates]);

  const toggleWorker = useCallback((peerId: string) => {
    selectionTouchedRef.current = true;
    setSelectedPeerIds((prev) => {
      const next = new Set(prev);
      if (next.has(peerId)) next.delete(peerId);
      else next.add(peerId);
      return next;
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    void nodeService.chainGetDefaults({}).then((r) => {
      if (cancelled) return;
      setShowCostUi(r.defaults?.showCostUi === true);
      // Don't clobber a choice the user already made while defaults were loading.
      if (!iterationTouchedRef.current) {
        setIterationMaxRounds(r.defaults?.iterationMaxRounds ?? 1);
        setIterationJudgeMode(r.defaults?.iterationJudgeMode ?? "llm");
        setExtendMaxStepsPerRound(r.defaults?.extendMaxStepsPerRound ?? 2);
      }
    }).catch(() => {
      /* keep hidden */
    });
    return () => {
      cancelled = true;
    };
  }, [nodeService]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void nodeService
      .chainPreviewGoal({ goal, allowLlm: true })
      .then((result) => {
        if (!cancelled) setPreview(result);
      })
      .catch((err) => {
        if (!cancelled) {
          setPreview({ ok: false, subtasks: [], reason: String(err) });
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [goal, nodeService]);

  const hasWorkers = useMemo(
    () => Boolean(preview?.ok && preview.subtasks.some((s) => s.workerCount > 0)),
    [preview],
  );
  const noWorkers =
    Boolean(preview?.ok && preview.subtasks.length > 0) && !hasWorkers;

  // Display order: same rules for You and peers — suggested/score, then
  // online, then card health. Cap to 8, but always keep You visible when
  // Join is on (may still be unselectable if the engine is down).
  const displayCandidates = useMemo(() => {
    const order = { ready: 0, stale: 1, missing: 2, blocked: 3 };
    const onlineRank = (s: string) => (s === "online" ? 0 : s === "unknown" ? 1 : 2);
    const withScore = workerCandidates.map((w) => {
      const peerId = w.card?.sourceAgentPeerId;
      const suggested = peerId ? suggestedByPeer.get(peerId) : undefined;
      return {
        ...w,
        peerId,
        suggested,
        healthOrder: order[w.health.cardStatus] ?? 9,
        onlineOrder: onlineRank(w.health.onlineStatus),
      };
    });
    withScore.sort((a, b) => {
      const aSuggested = a.suggested ? 1 : 0;
      const bSuggested = b.suggested ? 1 : 0;
      if (aSuggested !== bSuggested) return bSuggested - aSuggested;
      if (a.suggested && b.suggested) {
        return (b.suggested.score ?? 0) - (a.suggested.score ?? 0);
      }
      if (a.onlineOrder !== b.onlineOrder) return a.onlineOrder - b.onlineOrder;
      return a.healthOrder - b.healthOrder;
    });
    const capped = withScore.slice(0, 8);
    const self = withScore.find((w) => w.isSelf);
    if (self && capped.length > 0 && !capped.some((w) => w.isSelf)) {
      capped[capped.length - 1] = self;
      // Re-sort so You keeps score order among the final eight.
      capped.sort((a, b) => {
        const aSuggested = a.suggested ? 1 : 0;
        const bSuggested = b.suggested ? 1 : 0;
        if (aSuggested !== bSuggested) return bSuggested - aSuggested;
        if (a.suggested && b.suggested) {
          return (b.suggested.score ?? 0) - (a.suggested.score ?? 0);
        }
        if (a.onlineOrder !== b.onlineOrder) return a.onlineOrder - b.onlineOrder;
        return a.healthOrder - b.healthOrder;
      });
    }
    return capped;
  }, [workerCandidates, suggestedByPeer]);

  const handleStart = useCallback(async () => {
    if (!hasWorkers) {
      showToast(t("chains.start.noWorkersToast"), "error");
      return;
    }
    setStarting(true);
    try {
      const result: ChainStartFromGoalResult = await nodeService.chainStartFromGoal({
        goal,
        allowLlm: true,
        iterationMaxRounds,
        iterationJudgeMode,
        extendMaxStepsPerRound,
        preferredWorkerPeerIds:
          selectedPeerIds.size > 0 ? [...selectedPeerIds] : undefined,
        plannedSubtasks:
          preview?.ok && preview.subtasks.length > 0
            ? preview.subtasks.map((s) => ({
                subtaskId: s.subtaskId,
                depth: s.depth,
                requiredSkill: s.requiredSkill,
                objective: s.objective,
                requestedResult: s.requestedResult,
                constraints: s.constraints,
                dependsOn: s.dependsOn,
                costCeilingUsd: s.costCeilingUsd,
                deadlineAt: s.deadlineAt,
                preferredWorkerPeerId: s.preferredWorkerPeerId,
                createdAt: s.createdAt,
              }))
            : undefined,
      });
      if (!result.ok) {
        const err =
          result.error === "no_workers"
            ? t("chains.start.noWorkersToast")
            : (result.error ?? t("chains.start.failed"));
        showToast(err, "error");
        return;
      }
      showToast(t("chains.start.started"), "success");
      if (result.chainId) onStarted?.(result.chainId);
      onClose();
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), "error");
    } finally {
      setStarting(false);
    }
  }, [goal, hasWorkers, iterationMaxRounds, iterationJudgeMode, extendMaxStepsPerRound, nodeService, onClose, onStarted, preview, selectedPeerIds, showToast, t]);

  const handleSaveRecipe = useCallback(async () => {
    setSavingRecipe(true);
    try {
      const result = await nodeService.chainSaveRecipe({
        label: recipeLabel.trim() || goal.slice(0, 48),
        goal,
        maxChainCostUsd: preview?.estimatedCostRange?.maxUsd,
      });
      if (!result.ok) {
        showToast(t("chains.recipes.saveFailed"), "error");
        return;
      }
      showToast(t("chains.recipes.saved"), "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), "error");
    } finally {
      setSavingRecipe(false);
    }
  }, [goal, nodeService, preview?.estimatedCostRange?.maxUsd, recipeLabel, showToast, t]);

  return (
    <div className="chain-start-dialog-backdrop" role="presentation" onClick={onClose}>
      <div
        className="chain-start-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="chain-start-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="chain-start-title">{t("chains.start.title")}</h3>
        <p className="chain-start-goal">{goal}</p>

        {loading ? (
          <p>{t("chains.loading")}</p>
        ) : preview && !preview.ok ? (
          <p className="chain-start-error">{preview.reason ?? t("chains.start.previewFailed")}</p>
        ) : preview ? (
          <>
            {showCostUi && preview.estimatedCostRange ? (
              <p className="chain-start-cost">
                {t("chains.start.costRange", {
                  min: preview.estimatedCostRange.minUsd.toFixed(2),
                  max: preview.estimatedCostRange.maxUsd.toFixed(2),
                })}
              </p>
            ) : null}
            <ul className="chain-start-subtasks">
              {preview.subtasks.map((s) => {
                const assigneePeerId = s.preferredWorkerPeerId;
                const assigneeCandidate = assigneePeerId
                  ? workerCandidates.find((w) => w.card?.sourceAgentPeerId === assigneePeerId)
                  : undefined;
                const assigneeSuggested = assigneePeerId
                  ? suggestedByPeer.get(assigneePeerId)
                  : undefined;
                const assigneeLabel = assigneeCandidate?.isSelf
                  ? t("chains.start.youLabel")
                  : (assigneeCandidate?.bond.displayName
                    ?? assigneeCandidate?.card?.displayName
                    ?? assigneeSuggested?.summary?.split(":")[0]?.trim()
                    ?? (assigneePeerId ? assigneePeerId.slice(0, 12) : undefined));
                return (
                  <li key={s.subtaskId}>
                    <strong>{s.requiredSkill}</strong>
                    <span>{s.objective}</span>
                    <span className="chain-start-workers">
                      {t("chains.start.workerCount", { count: s.workerCount })}
                    </span>
                    {assigneeLabel ? (
                      <span className="chain-start-assignee">
                        {t("chains.start.assignee", { name: assigneeLabel })}
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ul>

            {/* Team workers — system auto-picks the best matches (auto-first);
                the owner only narrows the pool if they want to. */}
            {workerCandidates.length > 0 ? (
              <div className="chain-workers">
                <div className="chain-workers__header">
                  <h4 className="chain-workers__title">{t("chains.start.selectTeamTitle")}</h4>
                  <span className="chain-workers__selected-count">
                    {t("chains.start.selectTeamCount", {
                      selected: selectedPeerIds.size,
                      selectable: selectableCandidates.length,
                    })}
                  </span>
                </div>
                <p className="chain-workers__desc">{t("chains.start.selectTeamDesc")}</p>
                <ul className="chain-workers__list">
                  {displayCandidates.map(({ bond, card, health, peerId, suggested, isSelf }) => {
                    const selectable = isTeamJobReady(card, health);
                    const checked = peerId ? selectedPeerIds.has(peerId) : false;
                    const offline = health.onlineStatus === "offline";
                    const displayName = isSelf
                      ? t("chains.start.youLabel")
                      : (bond.displayName ?? bond.libp2pPeerId?.slice(0, 10) ?? bond.peerOwnerId.slice(0, 10));
                    const cardClass = selectable
                      ? `chain-worker-card chain-worker-card--selectable${checked ? " chain-worker-card--selected" : ""}${suggested ? " chain-worker-card--suggested" : ""}${isSelf ? " chain-worker-card--self" : ""}`
                      : `chain-worker-card chain-worker-card--disabled${offline ? " chain-worker-card--offline" : ""}`;
                    return (
                      <li
                        key={isSelf ? "self" : bond.peerOwnerId}
                        className={cardClass}
                        onClick={selectable && peerId ? () => toggleWorker(peerId) : undefined}
                        role={selectable ? "checkbox" : undefined}
                        aria-checked={selectable ? checked : undefined}
                        aria-disabled={selectable ? undefined : true}
                        tabIndex={selectable ? 0 : undefined}
                        onKeyDown={
                          selectable && peerId
                            ? (e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  toggleWorker(peerId);
                                }
                              }
                            : undefined
                        }
                      >
                        <input
                          type="checkbox"
                          className="chain-worker-card__checkbox"
                          checked={checked}
                          disabled={!selectable}
                          onChange={peerId ? () => toggleWorker(peerId) : undefined}
                          aria-label={displayName}
                          onClick={(e) => e.stopPropagation()}
                        />
                        <div className="chain-worker-card__avatar">
                          {displayName.slice(0, 1).toUpperCase()}
                        </div>
                        <div className="chain-worker-card__info">
                          <span className="chain-worker-card__name">
                            {displayName}
                          </span>
                          <div className="chain-worker-card__meta">
                            <span
                              className={`chain-worker-card__online chain-worker-card__online--${health.onlineStatus}`}
                              title={t(`chains.start.reach${health.onlineStatus.charAt(0).toUpperCase() + health.onlineStatus.slice(1)}`)}
                              aria-label={t(`chains.start.reach${health.onlineStatus.charAt(0).toUpperCase() + health.onlineStatus.slice(1)}`)}
                            />
                            {suggested ? (
                              <span className="chain-worker-card__system-pick" title={suggested.summary}>
                                {t("chains.start.systemPick")}
                              </span>
                            ) : null}
                            <span className={`chain-worker-card__tier chain-worker-card__tier--${isSelf ? "self" : bond.level}`}>
                              {isSelf ? t("chains.start.youTier") : bond.level}
                            </span>
                            <span className={`chain-bond-health chain-bond-health--${health.cardStatus}`}>
                              {health.cardStatus === "ready" ? "✓" : health.cardStatus === "stale" ? "⏳" : "?"}
                              {" "}
                              {t(`chains.start.contact${health.cardStatus.charAt(0).toUpperCase() + health.cardStatus.slice(1)}`)}
                            </span>
                            {offline ? (
                              <span className="chain-worker-card__offline-reason">
                                {isSelf && health.engineReady === false
                                  ? t("chains.start.engineOfflineReason")
                                  : t("chains.start.offlineReason")}
                              </span>
                            ) : null}
                            {!selectable && !offline && health.engineReady === false ? (
                              <span className="chain-worker-card__offline-reason">
                                {t("chains.start.engineOfflineReason")}
                              </span>
                            ) : null}
                            {!selectable && !offline && health.engineReady !== false && !health.optIn ? (
                              <span className="chain-worker-card__offline-reason">
                                {t("chains.start.notOptedInReason")}
                              </span>
                            ) : null}
                            {suggested ? (
                              <span className="chain-worker-card__score" title={suggested.summary}>
                                {t("chains.start.matchScore", { score: suggested.score.toFixed(2) })}
                              </span>
                            ) : null}
                            {suggested && suggested.matchedSubtaskIds.length > 0 ? (
                              <span className="chain-worker-card__matches">
                                {t("chains.start.matchedSteps", { count: suggested.matchedSubtaskIds.length })}
                              </span>
                            ) : null}
                          </div>
                          <AgentNetworkSkillsPreview card={card} compact />
                        </div>
                      </li>
                    );
                  })}
                </ul>
                <p className="chain-workers__preview-note">{t("chains.start.selectTeamPreviewNote")}</p>
              </div>
            ) : null}

            {noWorkers ? (
              <div className="chain-start-no-workers" data-testid="chain-start-no-workers">
                <p className="chain-start-no-workers__title">
                  {t("chains.start.noWorkersTitle")}
                </p>
                <p className="chain-start-no-workers__desc">
                  {t("chains.start.noWorkersDesc")}
                </p>
                {onOpenDiscover ? (
                  <button
                    type="button"
                    className="secondary"
                    data-testid="chain-start-open-discover"
                    onClick={() => {
                      onClose();
                      onOpenDiscover();
                    }}
                  >
                    {t("chains.start.openDiscover")}
                  </button>
                ) : null}
              </div>
            ) : (preview.diagnostics ?? []).length > 0 ? (
              <ul className="chain-start-diagnostics">
                {preview.diagnostics!.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            ) : null}

            {/* Per-job settings — collapsed by default so the primary flow stays
                focused on goal + worker selection. Values are seeded from the
                node's global defaults (chainGetDefaults) and override on a
                per-launch basis, letting the owner tweak e.g. refinement
                rounds on a job-by-job basis. */}
            <div className="chain-start-job-settings">
              <button
                type="button"
                className="chain-start-job-settings__toggle"
                aria-expanded={showJobSettings}
                onClick={() => setShowJobSettings((v) => !v)}
              >
                <span className="chain-start-job-settings__chevron">
                  {showJobSettings ? "▾" : "▸"}
                </span>
                {t("chains.start.jobSettingsTitle")}
              </button>
              {showJobSettings ? (
                <div className="chain-start-job-settings__body">
                  <label className="chain-start-iteration-label">
                    <span>{t("chains.start.iterationMaxRounds")}</span>
                    <select
                      value={iterationMaxRounds}
                      onChange={(e) => {
                        iterationTouchedRef.current = true;
                        setIterationMaxRounds(Number(e.target.value));
                      }}
                      disabled={starting || savingRecipe}
                      data-testid="chain-start-iteration-rounds"
                    >
                      <option value={1}>{t("chains.start.iterationRounds1")}</option>
                      <option value={2}>{t("chains.start.iterationRounds2")}</option>
                      <option value={3}>{t("chains.start.iterationRounds3")}</option>
                    </select>
                  </label>
                  <label className="chain-start-iteration-label">
                    <span>{t("chains.start.iterationJudge")}</span>
                    <select
                      value={iterationJudgeMode}
                      onChange={(e) => {
                        iterationTouchedRef.current = true;
                        setIterationJudgeMode(
                          e.target.value as "llm" | "always_stop" | "owner",
                        );
                      }}
                      disabled={starting || savingRecipe}
                    >
                      <option value="llm">{t("chains.start.iterationJudgeLlm")}</option>
                      <option value="owner">{t("chains.start.iterationJudgeOwner")}</option>
                      <option value="always_stop">
                        {t("chains.start.iterationJudgeAlwaysStop")}
                      </option>
                    </select>
                    <small className="chain-start-hint">
                      {t("chains.start.iterationJudgeHint")}
                    </small>
                  </label>
                  <label className="chain-start-iteration-label">
                    <span>{t("chains.start.extendMaxSteps")}</span>
                    <input
                      type="number"
                      min={0}
                      max={5}
                      value={extendMaxStepsPerRound}
                      onChange={(e) => {
                        iterationTouchedRef.current = true;
                        setExtendMaxStepsPerRound(
                          Math.max(0, Math.min(5, Number(e.target.value) || 0)),
                        );
                      }}
                      disabled={starting || savingRecipe}
                    />
                    <small className="chain-start-hint">
                      {t("chains.start.extendMaxStepsHint")}
                    </small>
                  </label>
                  <label className="chain-start-iteration-label chain-start-iteration-label--toggle">
                    <span>{t("chains.start.showCostUi")}</span>
                    <input
                      type="checkbox"
                      checked={showCostUi}
                      onChange={(e) => {
                        iterationTouchedRef.current = true;
                        setShowCostUi(e.target.checked);
                      }}
                      disabled={starting || savingRecipe}
                    />
                    <small className="chain-start-hint">
                      {t("chains.start.showCostUiHint")}
                    </small>
                  </label>
                </div>
              ) : null}
            </div>
            <label className="chain-start-recipe-label">
              <span>{t("chains.recipes.labelPlaceholder")}</span>
              <input
                type="text"
                value={recipeLabel}
                onChange={(e) => setRecipeLabel(e.target.value)}
                placeholder={goal.slice(0, 48)}
                disabled={starting || savingRecipe}
              />
            </label>
          </>
        ) : null}

        <div className="chain-start-actions">
          <button type="button" className="secondary" onClick={onClose} disabled={starting || savingRecipe}>
            {t("chains.start.cancel")}
          </button>
          {preview?.ok ? (
            <button
              type="button"
              className="secondary"
              onClick={() => void handleSaveRecipe()}
              disabled={loading || starting || savingRecipe}
            >
              {savingRecipe ? t("chains.recipes.saving") : t("chains.recipes.save")}
            </button>
          ) : null}
          <button
            type="button"
            className="primary"
            data-testid="chain-start-confirm"
            onClick={() => void handleStart()}
            disabled={
              loading ||
              starting ||
              savingRecipe ||
              !preview?.ok ||
              preview.subtasks.length === 0 ||
              !hasWorkers
            }
            title={!hasWorkers ? t("chains.start.noWorkersTitle") : undefined}
          >
            {starting ? t("chains.start.starting") : t("chains.start.confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}
