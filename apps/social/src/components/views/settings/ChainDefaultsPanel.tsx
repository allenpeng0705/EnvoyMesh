/**
 * Phase 42F — Chain Defaults panel.
 *
 * Configurable chain settings embedded in the AI Settings tab.
 * Controls: max chain budget, default stall policy, bid ranking
 * weights, cost estimation toggle.
 */

import React, { useEffect, useState, useCallback } from "react";
import { useNodeService } from "../../../hooks/useNodeService.js";
import { useT } from "../../../context/I18nContext.js";
import type { ChainDefaultsConfig } from "@envoymesh/api";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChainDefaults {
  maxChainBudgetUsd: number;
  defaultStallPolicy: ChainDefaultsConfig["rebalancePolicy"];
  bidWeights: {
    cost: number;
    reputation: number;
    freshness: number;
    precision: number;
  };
  costEstimationEnabled: boolean;
  maxNegotiationRounds: number;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ChainDefaultsPanel() {
  const t = useT();
  const nodeService = useNodeService();
  const [defaults, setDefaults] = useState<ChainDefaults>({
    maxChainBudgetUsd: 10,
    defaultStallPolicy: "manual",
    bidWeights: { cost: 35, reputation: 30, freshness: 20, precision: 15 },
    costEstimationEnabled: false,
    maxNegotiationRounds: 3,
  });
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  // Load chain defaults from the node once on mount.
  // Only updates rebalancePolicy (the only field the node currently persists).
  // Does NOT overwrite bidWeights / costEstimationEnabled / maxNegotiationRounds
  // since those are UI-only for now.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const result = await nodeService.chainGetDefaults({});
        if (!cancelled && result.defaults) {
          setDefaults((prev) => ({
            ...prev,
            defaultStallPolicy: result.defaults?.rebalancePolicy ?? prev.defaultStallPolicy,
          }));
        }
      } catch {
        // Node may not yet support chainGetDefaults — keep defaults
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [nodeService]);

  const writeField = useCallback(
    (field: string, value: unknown) => {
      setDefaults((prev) => {
        const next = { ...prev };
        if (field.startsWith("bidWeights.")) {
          const key = field.split(".")[1] as keyof ChainDefaults["bidWeights"];
          next.bidWeights = { ...next.bidWeights, [key]: value };
        } else {
          (next as Record<string, unknown>)[field] = value;
        }
        return next;
      });
      setSaveState("idle");
    },
    [],
  );

  const handleSave = useCallback(async () => {
    setSaveState("saving");
    try {
      // Persist the rebalance policy via chainSetDefaults
      await nodeService.chainSetDefaults({
        defaults: {
          rebalancePolicy: defaults.defaultStallPolicy,
        },
      });
      // Note: maxChainBudgetUsd, bidWeights, maxNegotiationRounds, and
      // costEstimationEnabled are not yet wired to persistent config.
      // They are held in component state only (Phase 40D.6 scope).
      setSaveState("saved");
    } catch (err) {
      console.error("[ChainDefaultsPanel] save failed:", err);
      setSaveState("error");
    }
  }, [nodeService, defaults]);

  // Validate bid weights sum to 100
  const weightSum =
    defaults.bidWeights.cost +
    defaults.bidWeights.reputation +
    defaults.bidWeights.freshness +
    defaults.bidWeights.precision;
  const weightsValid = weightSum === 100;

  return (
    <div className="chain-defaults-panel">
      <h4>{t("chainDefaults.title")}</h4>
      <p className="chain-defaults-description">
        {t("chainDefaults.description")}
      </p>

      {/* Default stall policy */}
      <div className="chain-default-row">
        <label htmlFor="chain-stall-policy">
          {t("chainDefaults.stallPolicy")}
        </label>
        <select
          id="chain-stall-policy"
          value={defaults.defaultStallPolicy}
          onChange={(e) =>
            writeField("defaultStallPolicy", e.target.value)
          }
        >
          <option value="manual">{t("chainDefaults.stallPolicyManual")}</option>
          <option value="auto">{t("chainDefaults.stallPolicyAuto")}</option>
          <option value="never">{t("chainDefaults.stallPolicyNever")}</option>
        </select>
      </div>

      {/* Bid ranking weights */}
      <h5>{t("chainDefaults.bidWeights")}</h5>
      <p className="chain-default-hint">{t("chainDefaults.bidWeightsHint")}</p>

      <div className="chain-default-row">
        <label htmlFor="chain-bid-cost">
          {t("chainDefaults.bidWeightCost")}
        </label>
        <input
          id="chain-bid-cost"
          type="number"
          min={0}
          max={100}
          value={defaults.bidWeights.cost}
          onChange={(e) =>
            writeField("bidWeights.cost", parseInt(e.target.value, 10) || 0)
          }
        />
      </div>
      <div className="chain-default-row">
        <label htmlFor="chain-bid-reputation">
          {t("chainDefaults.bidWeightReputation")}
        </label>
        <input
          id="chain-bid-reputation"
          type="number"
          min={0}
          max={100}
          value={defaults.bidWeights.reputation}
          onChange={(e) =>
            writeField("bidWeights.reputation", parseInt(e.target.value, 10) || 0)
          }
        />
      </div>
      <div className="chain-default-row">
        <label htmlFor="chain-bid-freshness">
          {t("chainDefaults.bidWeightFreshness")}
        </label>
        <input
          id="chain-bid-freshness"
          type="number"
          min={0}
          max={100}
          value={defaults.bidWeights.freshness}
          onChange={(e) =>
            writeField("bidWeights.freshness", parseInt(e.target.value, 10) || 0)
          }
        />
      </div>
      <div className="chain-default-row">
        <label htmlFor="chain-bid-precision">
          {t("chainDefaults.bidWeightPrecision")}
        </label>
        <input
          id="chain-bid-precision"
          type="number"
          min={0}
          max={100}
          value={defaults.bidWeights.precision}
          onChange={(e) =>
            writeField("bidWeights.precision", parseInt(e.target.value, 10) || 0)
          }
        />
      </div>

      {!weightsValid && (
        <p className="chain-default-error">
          {t("chainDefaults.weightsError", { sum: weightSum })}
        </p>
      )}

      <button
        className="btn-sm btn-primary"
        disabled={
          saveState === "saving" ||
          !weightsValid ||
          defaults.defaultStallPolicy === undefined
        }
        onClick={handleSave}
      >
        {saveState === "saving"
          ? t("chainDefaults.saving")
          : saveState === "saved"
            ? t("chainDefaults.saved")
            : saveState === "error"
              ? t("chainDefaults.saveFailed")
              : t("chainDefaults.saveStallPolicy")}
      </button>
    </div>
  );
}
