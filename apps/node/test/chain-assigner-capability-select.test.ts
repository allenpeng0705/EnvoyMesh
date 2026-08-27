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
});
