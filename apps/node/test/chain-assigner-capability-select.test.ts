/**
 * Phase 62D — node-side re-export gate for Assigner capability scorer tests.
 * Core scorer unit tests live in packages/api/test/chain-assigner-capability.test.ts.
 */
import { describe, expect, it } from "vitest";
import { selectBestCapableAssigner, scoreAssignerCapability } from "@envoymesh/api";

describe("chain-assigner-capability-select (node gate)", () => {
  it("selectBestCapableAssigner handoffs when remote strictly wins", () => {
    const local = scoreAssignerCapability({
      peerId: "envoy_agent_a",
      isLocal: true,
      sameLan: true,
      online: true,
      engineReady: true,
      membership: ["task.execute"],
      modelProviders: { mode: "mock" },
    });
    const remote = scoreAssignerCapability({
      peerId: "envoy_agent_b",
      isLocal: false,
      sameLan: true,
      online: true,
      engineReady: true,
      membership: ["task.execute", "chain.orchestrate"],
      profile: {
        modelFreshness: 10,
        spendPosture: "subscription",
        contextWindow: "1M+",
      },
      displayName: "Remote",
    });
    const picked = selectBestCapableAssigner({
      candidates: [local, remote],
      localPeerId: local.peerId,
    });
    expect(picked?.handoff).toBe(true);
    expect(picked?.selected.peerId).toBe(remote.peerId);
  });

  // Phase 62 release gate: "Preview shows suggested Assigner + reason
  // when capability mode on." Pin the contract that downstream RPC
  // (`node-service-chains.ts` chainPreviewViaRuntime) relies on:
  //   - `selected.peerId` → `suggestedAssignerPeerId` (forwarded to UI)
  //   - `selected.summary` → `suggestedAssignerReason` (human-readable)
  //   - `selected.reasonCodes` → audit trail (operator-facing only)
  //   - `handoff` flag → whether the orchestrator will hand off the chain
  it("preview surfaces peerId + reason + handoff flag for the selected Assigner", () => {
    const local = scoreAssignerCapability({
      peerId: "envoy_agent_local",
      isLocal: true,
      sameLan: true,
      online: true,
      engineReady: true,
      membership: ["task.execute"],
      modelProviders: { mode: "mock" },
    });
    const remote = scoreAssignerCapability({
      peerId: "envoy_agent_remote",
      isLocal: false,
      sameLan: true,
      online: true,
      engineReady: true,
      membership: ["task.execute", "chain.orchestrate"],
      profile: {
        modelFreshness: 10,
        spendPosture: "subscription",
        contextWindow: "1M+",
      },
      displayName: "Mac Pro",
    });
    const picked = selectBestCapableAssigner({
      candidates: [local, remote],
      localPeerId: local.peerId,
    });
    // The remote must be selected AND must have the contract fields populated.
    expect(picked?.selected.peerId).toBe("envoy_agent_remote");
    expect(picked?.handoff).toBe(true);
    expect(picked?.selected.summary).toBeTruthy();
    expect(picked?.selected.reasonCodes.length).toBeGreaterThan(0);
    expect(picked?.selected.displayName).toBe("Mac Pro");
    // `localScore` is the pre-handoff local baseline (used by the RPC
    // to render "X% better than local" in the start dialog).
    expect(typeof picked?.localScore).toBe("number");
  });

  it("preview returns null when no candidate is engine-ready", () => {
    // Mirrors `chainPreviewViaRuntime` `assignerPreview` short-circuit:
    // if the candidate pool is empty after the engine-ready filter,
    // the UI should NOT show a "suggested Assigner" row.
    const mockOnly = scoreAssignerCapability({
      peerId: "envoy_agent_mock",
      isLocal: true,
      sameLan: true,
      online: true,
      engineReady: false,
      membership: ["task.execute"],
      modelProviders: { mode: "mock" },
    });
    const picked = selectBestCapableAssigner({
      candidates: [mockOnly],
      localPeerId: mockOnly.peerId,
    });
    expect(picked).toBeNull();
  });
});
