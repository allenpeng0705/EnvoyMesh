/**
 * Phase 43B — Plan preview + one-click chain launch from chat.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { ChainPreviewGoalResult, ChainStartFromGoalResult } from "@envoymesh/api";

import { useT } from "../context/I18nContext.js";
import { useNodeService } from "../hooks/useNodeService.js";
import { useToast } from "../hooks/useToast.js";

export interface ChainStartDialogProps {
  goal: string;
  onClose: () => void;
  onStarted?: (chainId: string) => void;
  /** Optional — send the user to Discover when no workers are available. */
  onOpenDiscover?: () => void;
}

export function ChainStartDialog({
  goal,
  onClose,
  onStarted,
  onOpenDiscover,
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
  const iterationTouchedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void nodeService.chainGetDefaults({}).then((r) => {
      if (cancelled) return;
      setShowCostUi(r.defaults?.showCostUi === true);
      // Don't clobber a choice the user already made while defaults were loading.
      if (!iterationTouchedRef.current) {
        setIterationMaxRounds(r.defaults?.iterationMaxRounds ?? 1);
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
  }, [goal, hasWorkers, iterationMaxRounds, nodeService, onClose, onStarted, showToast, t]);

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
              {preview.subtasks.map((s) => (
                <li key={s.subtaskId}>
                  <strong>{s.requiredCapability}</strong>
                  <span>{s.objective}</span>
                  <span className="chain-start-workers">
                    {t("chains.start.workerCount", { count: s.workerCount })}
                  </span>
                </li>
              ))}
            </ul>
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
