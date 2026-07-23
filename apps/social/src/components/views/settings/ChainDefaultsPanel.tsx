/**
 * Phase 42F — Chain Defaults panel.
 *
 * Configurable chain settings embedded in the AI Settings tab. Every field
 * shown here is persisted via `chainSetDefaults` (no UI-only state that
 * silently vanishes on reload). Non-persisting fields (bid weights, max
 * budget, cost estimation) were removed in favor of the real persistent
 * knobs from `ChainDefaultsConfig`.
 */

import { useEffect, useState, useCallback } from "react";
import { useNodeService } from "../../../hooks/useNodeService.js";
import { useT } from "../../../context/I18nContext.js";
import type { ChainDefaultsConfig } from "@envoymesh/api";

interface ChainDefaultsState {
  rebalancePolicy: NonNullable<ChainDefaultsConfig["rebalancePolicy"]>;
  stallTimeoutMs: number;
  lowConfidenceThreshold: number;
  maxAutoRebalances: number;
  autoRebalanceIncrementUsd: number;
  allowLlmDecompose: boolean;
  awardMode: NonNullable<ChainDefaultsConfig["awardMode"]>;
  showCostUi: boolean;
  iterationMaxRounds: number;
  extendMaxStepsPerRound: number;
  iterationJudgeMode: NonNullable<ChainDefaultsConfig["iterationJudgeMode"]>;
}

const DEFAULTS: ChainDefaultsState = {
  rebalancePolicy: "never",
  stallTimeoutMs: 60_000,
  lowConfidenceThreshold: 0.5,
  maxAutoRebalances: 2,
  autoRebalanceIncrementUsd: 5,
  allowLlmDecompose: false,
  awardMode: "direct",
  showCostUi: false,
  iterationMaxRounds: 1,
  extendMaxStepsPerRound: 2,
  iterationJudgeMode: "llm",
};

export function ChainDefaultsPanel() {
  const t = useT();
  const nodeService = useNodeService();
  const [defaults, setDefaults] = useState<ChainDefaultsState>(DEFAULTS);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  // Load the persisted chain defaults on mount.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const result = await nodeService.chainGetDefaults({});
        if (!cancelled && result.defaults) {
          const d = result.defaults;
          setDefaults({
            rebalancePolicy: d.rebalancePolicy ?? DEFAULTS.rebalancePolicy,
            stallTimeoutMs: d.stallTimeoutMs ?? DEFAULTS.stallTimeoutMs,
            lowConfidenceThreshold: d.lowConfidenceThreshold ?? DEFAULTS.lowConfidenceThreshold,
            maxAutoRebalances: d.maxAutoRebalances ?? DEFAULTS.maxAutoRebalances,
            autoRebalanceIncrementUsd: d.autoRebalanceIncrementUsd ?? DEFAULTS.autoRebalanceIncrementUsd,
            allowLlmDecompose: d.allowLlmDecompose ?? DEFAULTS.allowLlmDecompose,
            awardMode: d.awardMode ?? DEFAULTS.awardMode,
            showCostUi: d.showCostUi ?? (d.awardMode === "competitive"),
            iterationMaxRounds: d.iterationMaxRounds ?? DEFAULTS.iterationMaxRounds,
            extendMaxStepsPerRound: d.extendMaxStepsPerRound ?? DEFAULTS.extendMaxStepsPerRound,
            iterationJudgeMode: d.iterationJudgeMode ?? DEFAULTS.iterationJudgeMode,
          });
        }
      } catch {
        // Node may not yet support chainGetDefaults — keep defaults
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [nodeService]);

  const writeField = useCallback(<K extends keyof ChainDefaultsState>(field: K, value: ChainDefaultsState[K]) => {
    setDefaults((prev) => ({ ...prev, [field]: value }));
    setSaveState("idle");
  }, []);

  const handleSave = useCallback(async () => {
    setSaveState("saving");
    try {
      await nodeService.chainSetDefaults({
        defaults: {
          rebalancePolicy: defaults.rebalancePolicy,
          stallTimeoutMs: defaults.stallTimeoutMs,
          lowConfidenceThreshold: defaults.lowConfidenceThreshold,
          maxAutoRebalances: defaults.maxAutoRebalances,
          autoRebalanceIncrementUsd: defaults.autoRebalanceIncrementUsd,
          allowLlmDecompose: defaults.allowLlmDecompose,
          awardMode: defaults.awardMode,
          showCostUi: defaults.showCostUi,
          iterationMaxRounds: defaults.iterationMaxRounds,
          extendMaxStepsPerRound: defaults.extendMaxStepsPerRound,
          iterationJudgeMode: defaults.iterationJudgeMode,
        },
      });
      setSaveState("saved");
    } catch (err) {
      console.error("[ChainDefaultsPanel] save failed:", err);
      setSaveState("error");
    }
  }, [nodeService, defaults]);

  return (
    <div className="chain-defaults-panel">
      <h4>{t("chainDefaults.title")}</h4>
      <p className="chain-defaults-description">
        {t("chainDefaults.description")}
      </p>

      {/* Award mode — primary UX choice */}
      <div className="chain-default-row">
        <label htmlFor="chain-award-mode">
          {t("chainDefaults.awardMode")}
        </label>
        <select
          id="chain-award-mode"
          value={defaults.awardMode}
          onChange={(e) => {
            const mode = e.target.value as ChainDefaultsState["awardMode"];
            writeField("awardMode", mode);
            if (mode === "direct") writeField("showCostUi", false);
            if (mode === "competitive") writeField("showCostUi", true);
          }}
        >
          <option value="direct">{t("chainDefaults.awardModeDirect")}</option>
          <option value="competitive">{t("chainDefaults.awardModeCompetitive")}</option>
        </select>
        <small className="chain-default-hint">{t("chainDefaults.awardModeHint")}</small>
      </div>

      <div className="chain-default-row chain-default-row--toggle">
        <label htmlFor="chain-show-cost-ui">
          {t("chainDefaults.showCostUiLabel")}
        </label>
        <input
          id="chain-show-cost-ui"
          type="checkbox"
          checked={defaults.showCostUi}
          onChange={(e) => writeField("showCostUi", e.target.checked)}
        />
        <small className="chain-default-hint">{t("chainDefaults.showCostUiHint")}</small>
      </div>

      {/* Rebalance policy */}
      <div className="chain-default-row">
        <label htmlFor="chain-stall-policy">
          {t("chainDefaults.stallPolicy")}
        </label>
        <select
          id="chain-stall-policy"
          value={defaults.rebalancePolicy}
          onChange={(e) =>
            writeField("rebalancePolicy", e.target.value as ChainDefaultsState["rebalancePolicy"])
          }
        >
          <option value="manual">{t("chainDefaults.stallPolicyManual")}</option>
          <option value="auto">{t("chainDefaults.stallPolicyAuto")}</option>
          <option value="never">{t("chainDefaults.stallPolicyNever")}</option>
        </select>
      </div>

      {/* Stall timeout */}
      <div className="chain-default-row">
        <label htmlFor="chain-stall-timeout">
          {t("chainDefaults.stallTimeoutLabel")}
        </label>
        <input
          id="chain-stall-timeout"
          type="number"
          min={10_000}
          max={600_000}
          step={10_000}
          value={defaults.stallTimeoutMs}
          onChange={(e) =>
            writeField("stallTimeoutMs", parseInt(e.target.value, 10) || DEFAULTS.stallTimeoutMs)
          }
        />
        <small className="chain-default-hint">{t("chainDefaults.stallTimeoutHint")}</small>
      </div>

      {/* Max auto-rebalances */}
      <div className="chain-default-row">
        <label htmlFor="chain-max-rebalances">
          {t("chainDefaults.maxAutoRebalancesLabel")}
        </label>
        <input
          id="chain-max-rebalances"
          type="number"
          min={0}
          max={10}
          value={defaults.maxAutoRebalances}
          onChange={(e) =>
            writeField("maxAutoRebalances", parseInt(e.target.value, 10) || 0)
          }
        />
        <small className="chain-default-hint">{t("chainDefaults.maxAutoRebalancesHint")}</small>
      </div>

      {/* Auto-rebalance increment */}
      <div className="chain-default-row">
        <label htmlFor="chain-rebalance-increment">
          {t("chainDefaults.rebalanceIncrementLabel")}
        </label>
        <input
          id="chain-rebalance-increment"
          type="number"
          min={0.5}
          max={50}
          step={0.5}
          value={defaults.autoRebalanceIncrementUsd}
          onChange={(e) =>
            writeField("autoRebalanceIncrementUsd", parseFloat(e.target.value) || DEFAULTS.autoRebalanceIncrementUsd)
          }
        />
        <small className="chain-default-hint">{t("chainDefaults.rebalanceIncrementHint")}</small>
      </div>

      {/* Low confidence threshold */}
      <div className="chain-default-row">
        <label htmlFor="chain-confidence">
          {t("chainDefaults.lowConfidenceLabel")}
        </label>
        <input
          id="chain-confidence"
          type="number"
          min={0}
          max={1}
          step={0.1}
          value={defaults.lowConfidenceThreshold}
          onChange={(e) =>
            writeField("lowConfidenceThreshold", parseFloat(e.target.value) || 0)
          }
        />
        <small className="chain-default-hint">{t("chainDefaults.lowConfidenceHint")}</small>
      </div>

      {/* LLM decompose toggle */}
      <div className="chain-default-row chain-default-row--toggle">
        <label htmlFor="chain-llm-decompose">
          {t("chainDefaults.allowLlmDecomposeLabel")}
        </label>
        <input
          id="chain-llm-decompose"
          type="checkbox"
          checked={defaults.allowLlmDecompose}
          onChange={(e) => writeField("allowLlmDecompose", e.target.checked)}
        />
        <small className="chain-default-hint">{t("chainDefaults.allowLlmDecomposeHint")}</small>
      </div>

      <div className="chain-default-row">
        <label htmlFor="chain-iteration-max-rounds">
          {t("chainDefaults.iterationMaxRoundsLabel")}
        </label>
        <input
          id="chain-iteration-max-rounds"
          type="number"
          min={1}
          max={5}
          value={defaults.iterationMaxRounds}
          onChange={(e) =>
            writeField("iterationMaxRounds", Math.max(1, Math.min(5, parseInt(e.target.value, 10) || 1)))
          }
        />
        <small className="chain-default-hint">{t("chainDefaults.iterationMaxRoundsHint")}</small>
      </div>

      <div className="chain-default-row">
        <label htmlFor="chain-extend-max-steps">
          {t("chainDefaults.extendMaxStepsLabel")}
        </label>
        <input
          id="chain-extend-max-steps"
          type="number"
          min={0}
          max={5}
          value={defaults.extendMaxStepsPerRound}
          onChange={(e) =>
            writeField(
              "extendMaxStepsPerRound",
              Math.max(0, Math.min(5, parseInt(e.target.value, 10) || 0)),
            )
          }
        />
        <small className="chain-default-hint">{t("chainDefaults.extendMaxStepsHint")}</small>
      </div>

      <div className="chain-default-row">
        <label htmlFor="chain-iteration-judge">
          {t("chainDefaults.iterationJudgeModeLabel")}
        </label>
        <select
          id="chain-iteration-judge"
          value={defaults.iterationJudgeMode}
          onChange={(e) =>
            writeField(
              "iterationJudgeMode",
              e.target.value as ChainDefaultsState["iterationJudgeMode"],
            )
          }
        >
          <option value="llm">{t("chainDefaults.iterationJudgeLlm")}</option>
          <option value="owner">{t("chainDefaults.iterationJudgeOwner")}</option>
          <option value="always_stop">{t("chainDefaults.iterationJudgeAlwaysStop")}</option>
        </select>
        <small className="chain-default-hint">{t("chainDefaults.iterationJudgeModeHint")}</small>
      </div>

      <button
        className="btn-sm btn-primary"
        disabled={saveState === "saving"}
        onClick={handleSave}
      >
        {saveState === "saving"
          ? t("chainDefaults.saving")
          : saveState === "saved"
            ? t("chainDefaults.saved")
            : saveState === "error"
              ? t("chainDefaults.saveFailed")
              : t("chainDefaults.saveButton")}
      </button>
    </div>
  );
}
