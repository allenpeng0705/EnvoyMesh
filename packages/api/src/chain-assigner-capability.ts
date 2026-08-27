/**
 * Phase 62C — deterministic capability scoring for optional Assigner selection.
 *
 * The creator home starts the job; the Assigner runs LLM loops (plan+assign,
 * judge, merge). When `assignerSelection` is `best_capable`, pick the eligible
 * peer with the strongest orchestration signals. Default remains local.
 */

import type { AgentNetworkProfile } from "@envoymesh/protocol";
import {
  DEFAULT_AGENT_NETWORK_PROFILE,
  coerceAgentNetworkRoles,
  coerceAgentNetworkSkills,
} from "@envoymesh/protocol";

import type { ModelProviderConfig } from "./ws-protocol.js";
import {
  hasUsableModelProvider,
  hasUsableNonEnvoyLocalModelProvider,
  inferModelProviderPreset,
} from "./model-provider-presets.js";

export type AssignerSelectionMode = "local" | "best_capable";

export type AssignerAvailabilitySource = "lease" | "legacy_probe" | "local" | "unknown";

export interface AssignerCapabilityInput {
  peerId: string;
  isLocal: boolean;
  sameLan: boolean;
  online: boolean;
  engineReady: boolean;
  availabilitySource?: AssignerAvailabilitySource;
  membership: readonly string[];
  profile?: Partial<AgentNetworkProfile> | null;
  /** Known only for the local home — remote peers infer tier from profile. */
  modelProviders?: ModelProviderConfig | null;
  displayName?: string;
}

export interface AssignerCapabilityBreakdown {
  modelTier: number;
  context: number;
  freshness: number;
  spendPosture: number;
  engineReady: number;
  online: number;
  orchestrateTag: number;
}

export interface AssignerCapabilityScore {
  peerId: string;
  score: number;
  breakdown: AssignerCapabilityBreakdown;
  reasonCodes: string[];
  summary: string;
  displayName: string;
  sameLan: boolean;
  isLocal: boolean;
}

const CONTEXT_SCORE: Record<string, number> = {
  "128k": 0.25,
  "256k": 0.5,
  "512k": 0.75,
  "1M+": 1,
};

const SPEND_SCORE: Record<string, number> = {
  subscription: 1,
  metered: 0.55,
  unknown: 0.35,
};

const WEIGHTS = {
  modelTier: 0.4,
  context: 0.14,
  freshness: 0.12,
  spendPosture: 0.08,
  engineReady: 0.1,
  online: 0.06,
  orchestrateTag: 0.1,
} as const;

/** Minimum score gap before auto-handoff beats local Assigner. */
export const ASSIGNER_HANDOFF_MIN_SCORE_DELTA = 0.03;

/** Legacy probe readiness is penalized (matches worker ranking). */
export const ASSIGNER_LEGACY_PROBE_PENALTY = 0.05;

export function resolveAssignerSelectionMode(
  override?: AssignerSelectionMode | null,
  defaults?: { assignerSelection?: AssignerSelectionMode | null } | null,
): AssignerSelectionMode {
  if (override === "best_capable" || override === "local") return override;
  return defaults?.assignerSelection === "best_capable" ? "best_capable" : "local";
}

/** Score local modelProviders tier for Assigner-side LLM work. */
export function scoreModelProviderTier(
  config: ModelProviderConfig | null | undefined,
): { tier: number; reason: string } {
  if (!config || config.mode === "disabled" || config.mode === "mock") {
    return { tier: 0.1, reason: "model_disabled" };
  }
  if (hasUsableNonEnvoyLocalModelProvider(config)) {
    const preset = inferModelProviderPreset(config);
    if (preset.localOnly || config.mode === "ollama") {
      return { tier: 0.55, reason: "model_local" };
    }
    return { tier: 1, reason: "model_cloud" };
  }
  if (hasUsableModelProvider(config)) {
    return { tier: 0.45, reason: "model_envoy_local" };
  }
  if (config.mode === "ollama") return { tier: 0.55, reason: "model_ollama" };
  return { tier: 0.2, reason: "model_weak" };
}

/** Remote peers: infer orchestration model tier from AN profile heuristics. */
export function inferRemoteModelTierFromProfile(
  profile?: Partial<AgentNetworkProfile> | null,
): { tier: number; reason: string } {
  const spend = SPEND_SCORE[profile?.spendPosture ?? "unknown"] ?? 0.35;
  const fresh = Math.max(0, Math.min(1, ((profile?.modelFreshness ?? 5) - 1) / 9));
  const tier = 0.35 * spend + 0.65 * fresh;
  if (spend >= 0.9 && fresh >= 0.7) return { tier: Math.max(tier, 0.85), reason: "profile_cloud_like" };
  if (spend >= 0.5) return { tier, reason: "profile_metered" };
  return { tier, reason: "profile_unknown" };
}

export function scoreAssignerCapability(input: AssignerCapabilityInput): AssignerCapabilityScore {
  const profile: AgentNetworkProfile = {
    ...DEFAULT_AGENT_NETWORK_PROFILE,
    ...input.profile,
    skills: coerceAgentNetworkSkills(input.profile?.skills ?? DEFAULT_AGENT_NETWORK_PROFILE.skills),
    roles: coerceAgentNetworkRoles(input.profile?.roles ?? DEFAULT_AGENT_NETWORK_PROFILE.roles),
  };

  const modelFromProviders = input.isLocal && input.modelProviders !== undefined;
  const model = modelFromProviders
    ? scoreModelProviderTier(input.modelProviders)
    : inferRemoteModelTierFromProfile(profile);

  const breakdown: AssignerCapabilityBreakdown = {
    modelTier: model.tier,
    context: CONTEXT_SCORE[profile.contextWindow] ?? 0.25,
    freshness: Math.max(0, Math.min(1, (profile.modelFreshness - 1) / 9)),
    spendPosture: SPEND_SCORE[profile.spendPosture] ?? 0.35,
    engineReady: input.engineReady ? 1 : 0,
    online: input.online ? 1 : 0.15,
    orchestrateTag: input.membership.includes("chain.orchestrate") ? 1 : 0.5,
  };

  // Remote model tier already folds freshness — dampen the separate freshness term.
  const freshnessWeight = modelFromProviders ? WEIGHTS.freshness : WEIGHTS.freshness * 0.25;

  let score =
    WEIGHTS.modelTier * breakdown.modelTier +
    WEIGHTS.context * breakdown.context +
    freshnessWeight * breakdown.freshness +
    WEIGHTS.spendPosture * breakdown.spendPosture +
    WEIGHTS.engineReady * breakdown.engineReady +
    WEIGHTS.online * breakdown.online +
    WEIGHTS.orchestrateTag * breakdown.orchestrateTag;

  const reasonCodes: string[] = [model.reason];
  if (input.engineReady) reasonCodes.push("engine_ready");
  else reasonCodes.push("engine_down");
  if (input.online) reasonCodes.push("online");
  else reasonCodes.push("offline");
  if (input.sameLan) reasonCodes.push("same_lan");
  if (input.membership.includes("chain.orchestrate")) reasonCodes.push("chain_orchestrate");
  if (input.availabilitySource === "lease") reasonCodes.push("lease_ready");
  if (input.availabilitySource === "legacy_probe") {
    reasonCodes.push("legacy_probe");
    score = Math.max(0, score - ASSIGNER_LEGACY_PROBE_PENALTY);
  }
  if (input.isLocal) reasonCodes.push("local_home");

  const displayName = input.displayName?.trim() || (input.isLocal ? "This node" : input.peerId);
  const modelLabel =
    model.reason === "model_cloud" || model.reason === "profile_cloud_like"
      ? "cloud model"
      : model.reason === "model_local" || model.reason === "model_ollama"
        ? "local model"
        : "limited model";
  const summary = `${displayName}: ${modelLabel}, score ${score.toFixed(2)} (fresh ${profile.modelFreshness}/10, ${profile.contextWindow})`;

  return {
    peerId: input.peerId,
    score,
    breakdown,
    reasonCodes,
    summary,
    displayName,
    sameLan: input.sameLan,
    isLocal: input.isLocal,
  };
}

/** Stable tie-break: score → same-LAN → freshness → lexicographic peer id. */
export function rankAssignerCapabilityScores(
  rows: AssignerCapabilityScore[],
): AssignerCapabilityScore[] {
  return [...rows].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const aLan = a.sameLan ? 1 : 0;
    const bLan = b.sameLan ? 1 : 0;
    if (bLan !== aLan) return bLan - aLan;
    if (b.breakdown.freshness !== a.breakdown.freshness) {
      return b.breakdown.freshness - a.breakdown.freshness;
    }
    return a.peerId.localeCompare(b.peerId);
  });
}

export function selectBestCapableAssigner(input: {
  candidates: AssignerCapabilityScore[];
  localPeerId: string;
  minScoreDelta?: number;
}): {
  selected: AssignerCapabilityScore;
  handoff: boolean;
  localScore: number;
} | null {
  // Require engine capability; remotes must be mesh-online or same-LAN (dialable).
  const ranked = rankAssignerCapabilityScores(
    input.candidates.filter(
      (c) =>
        c.breakdown.engineReady > 0 &&
        (c.isLocal || c.breakdown.online >= 1 || c.sameLan),
    ),
  );
  if (ranked.length === 0) return null;
  const local = ranked.find((r) => r.peerId === input.localPeerId) ?? ranked.find((r) => r.isLocal);
  const localScore = local?.score ?? 0;
  const top = ranked[0]!;
  const delta = input.minScoreDelta ?? ASSIGNER_HANDOFF_MIN_SCORE_DELTA;
  const handoff =
    top.peerId !== input.localPeerId &&
    top.score > localScore + delta;
  return {
    selected: handoff ? top : (local ?? top),
    handoff,
    localScore,
  };
}

export function formatAssignerSelectionReason(
  mode: AssignerSelectionMode,
  selected: AssignerCapabilityScore,
  handoff: boolean,
): string {
  if (mode === "local" || !handoff) {
    return "Assigner: this node (default).";
  }
  const modelHint =
    selected.reasonCodes.includes("model_cloud") || selected.reasonCodes.includes("profile_cloud_like")
      ? "cloud model"
      : "stronger capability";
  return `Assigner: ${selected.displayName} (${modelHint}).`;
}
