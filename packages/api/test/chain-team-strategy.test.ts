/**
 * Phase 60C — strategy presets + golden ranking fixtures.
 */
import { describe, expect, it } from "vitest";
import {
  CHAIN_TEAM_STRATEGY_PRESET_VERSION,
  compareChainWorkerTies,
  evaluateChainWorkerHardGates,
  getChainTeamStrategyPreset,
  listChainTeamStrategyPresets,
  resolveChainTeamStrategy,
  scoreChainWorkerWithStrategy,
  type ChainTeamStrategyId,
} from "../src/chain-team-strategy.js";

const COMPONENTS = {
  skill: 0.8,
  eta: 0.6,
  cost: 0.4,
  reliability: 0.7,
  transport: 0.5,
  modelDiversity: 0.3,
} as const;

describe("chain team strategy presets", () => {
  it("lists six versioned presets", () => {
    const presets = listChainTeamStrategyPresets();
    expect(presets).toHaveLength(6);
    expect(new Set(presets.map((p) => p.id)).size).toBe(6);
    for (const preset of presets) {
      expect(preset.version).toBe(CHAIN_TEAM_STRATEGY_PRESET_VERSION);
    }
  });

  it("resolves a replay-stable snapshot", () => {
    const resolved = resolveChainTeamStrategy("balanced", new Date("2030-01-01T00:00:00.000Z"));
    expect(resolved.id).toBe("balanced");
    expect(resolved.resolvedAt).toBe("2030-01-01T00:00:00.000Z");
    expect(resolved.constraints.maxAttemptsPerStep).toBe(1);
  });

  it.each([
    ["balanced", "skill"],
    ["fastest", "eta"],
    ["cheapest", "cost"],
    ["highest-confidence", "reliability"],
    ["privacy-local", "transport"],
    ["diverse-model", "modelDiversity"],
  ] as const)("%s weights %s highest", (id: ChainTeamStrategyId, key) => {
    const preset = getChainTeamStrategyPreset(id);
    const weights = preset.weights;
    const top = Math.max(...Object.values(weights));
    expect(weights[key]).toBe(top);
  });
});

describe("scoreChainWorkerWithStrategy golden fixtures", () => {
  it("orders presets deterministically for the same component vector", () => {
    const scores = (["balanced", "fastest", "cheapest", "highest-confidence", "privacy-local", "diverse-model"] as const)
      .map((id) => ({
        id,
        score: scoreChainWorkerWithStrategy({
          strategy: getChainTeamStrategyPreset(id),
          components: COMPONENTS,
        }).score,
      }));
    // Snapshot of relative ordering — change only with intentional preset edits.
    expect(scores.map((s) => s.id)).toEqual([
      "balanced",
      "fastest",
      "cheapest",
      "highest-confidence",
      "privacy-local",
      "diverse-model",
    ]);
    expect(scores.map((s) => Number(s.score.toFixed(4)))).toEqual([
      0.635,
      0.6,
      0.545,
      0.63,
      0.605,
      0.54,
    ]);
  });

  it("tie-breaks by lease sequence then peerId", () => {
    expect(
      compareChainWorkerTies(
        { score: 0.5, leaseSequence: 2, peerId: "b" },
        { score: 0.5, leaseSequence: 3, peerId: "a" },
      ),
    ).toBeGreaterThan(0);
    expect(
      compareChainWorkerTies(
        { score: 0.5, leaseSequence: 3, peerId: "b" },
        { score: 0.5, leaseSequence: 3, peerId: "a" },
      ),
    ).toBeGreaterThan(0);
  });

  it("hard-gates privacy-local and direct-only", () => {
    expect(
      evaluateChainWorkerHardGates({
        strategy: getChainTeamStrategyPreset("privacy-local"),
        isSelf: false,
        sameLan: true,
        viaRelay: false,
      }),
    ).toMatchObject({ ok: false, reason: "local_only" });
    expect(
      evaluateChainWorkerHardGates({
        strategy: getChainTeamStrategyPreset("fastest"),
        isSelf: false,
        sameLan: false,
        viaRelay: true,
      }),
    ).toMatchObject({ ok: false, reason: "direct_only" });
  });
});
