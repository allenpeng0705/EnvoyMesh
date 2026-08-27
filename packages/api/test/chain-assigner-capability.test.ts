import { describe, expect, it } from "vitest";
import {
  inferRemoteModelTierFromProfile,
  rankAssignerCapabilityScores,
  scoreAssignerCapability,
  scoreModelProviderTier,
  selectBestCapableAssigner,
} from "../src/chain-assigner-capability.js";

describe("chain-assigner-capability", () => {
  it("scores cloud modelProviders above mock/disabled", () => {
    expect(scoreModelProviderTier({ mode: "mock" }).tier).toBeLessThan(0.2);
    expect(scoreModelProviderTier({ mode: "disabled" }).tier).toBeLessThan(0.2);
    expect(
      scoreModelProviderTier({
        mode: "openai-compatible",
        modelName: "gpt-4",
        endpoint: "https://api.openai.com/v1",
        presetId: "openai",
      }).tier,
    ).toBe(1);
  });

  it("prefers cloud-capable remote profile over weak local mock", () => {
    const local = scoreAssignerCapability({
      peerId: "envoy_agent_local",
      isLocal: true,
      sameLan: true,
      online: true,
      engineReady: true,
      availabilitySource: "local",
      membership: ["task.execute", "chain.orchestrate"],
      modelProviders: { mode: "mock" },
      displayName: "Creator",
    });
    const remote = scoreAssignerCapability({
      peerId: "envoy_agent_remote",
      isLocal: false,
      sameLan: true,
      online: true,
      engineReady: true,
      availabilitySource: "lease",
      membership: ["task.execute", "chain.orchestrate"],
      profile: {
        modelFreshness: 9,
        spendPosture: "subscription",
        contextWindow: "1M+",
      },
      displayName: "Alice",
    });
    expect(remote.score).toBeGreaterThan(local.score);
    const picked = selectBestCapableAssigner({
      candidates: [local, remote],
      localPeerId: local.peerId,
    });
    expect(picked?.handoff).toBe(true);
    expect(picked?.selected.peerId).toBe(remote.peerId);
  });

  it("stable tie-break prefers same-LAN then freshness then peer id", () => {
    const a = scoreAssignerCapability({
      peerId: "envoy_agent_b",
      isLocal: false,
      sameLan: false,
      online: true,
      engineReady: true,
      membership: ["task.execute"],
      profile: { modelFreshness: 8, spendPosture: "subscription", contextWindow: "512k" },
    });
    const b = scoreAssignerCapability({
      peerId: "envoy_agent_a",
      isLocal: false,
      sameLan: true,
      online: true,
      engineReady: true,
      membership: ["task.execute"],
      profile: { modelFreshness: 8, spendPosture: "subscription", contextWindow: "512k" },
    });
    b.score = a.score;
    const ranked = rankAssignerCapabilityScores([a, b]);
    expect(ranked[0]!.peerId).toBe(b.peerId);
  });

  it("inferRemoteModelTierFromProfile rewards subscription + freshness", () => {
    const weak = inferRemoteModelTierFromProfile({
      modelFreshness: 3,
      spendPosture: "unknown",
      contextWindow: "128k",
    });
    const strong = inferRemoteModelTierFromProfile({
      modelFreshness: 9,
      spendPosture: "subscription",
      contextWindow: "1M+",
    });
    expect(strong.tier).toBeGreaterThan(weak.tier);
  });

  it("keeps local Assigner when remote is not strictly better", () => {
    const local = scoreAssignerCapability({
      peerId: "envoy_agent_local",
      isLocal: true,
      sameLan: true,
      online: true,
      engineReady: true,
      membership: ["task.execute"],
      modelProviders: {
        mode: "openai-compatible",
        modelName: "gpt-4",
        endpoint: "https://api.openai.com/v1",
        presetId: "openai",
      },
    });
    const remote = scoreAssignerCapability({
      peerId: "envoy_agent_remote",
      isLocal: false,
      sameLan: false,
      online: true,
      engineReady: true,
      membership: ["task.execute"],
      profile: { modelFreshness: 5, spendPosture: "unknown", contextWindow: "128k" },
    });
    const picked = selectBestCapableAssigner({
      candidates: [local, remote],
      localPeerId: local.peerId,
    });
    expect(picked?.handoff).toBe(false);
    expect(picked?.selected.peerId).toBe(local.peerId);
  });
});
