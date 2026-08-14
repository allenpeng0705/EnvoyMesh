import { describe, expect, it } from "vitest";
import { createChainState } from "../src/chain-orchestrator.js";
import { collectSubtaskCancelClosure } from "../src/node-service-chain-orchestration.js";

const NOW = new Date("2026-06-18T00:00:00.000Z");

describe("collectSubtaskCancelClosure", () => {
  it("includes transitive dependents", () => {
    const state = createChainState({
      version: "0.1",
      chainMandateId: "chainmandate_test-1",
      chainId: "chain_test-1",
      orchestratorOwnerId: "envoy:owner:o",
      orchestratorPeerId: "envoy_agent_o",
      maxChainCostUsd: 10,
      maxSensitivity: "friends",
      expiresAt: new Date(NOW.getTime() + 3600_000).toISOString(),
      createdAt: NOW.toISOString(),
      signature: "sig",
    } as never);
    for (const [id, deps] of [
      ["a", [] as string[]],
      ["b", ["a"]],
      ["c", ["b"]],
      ["d", [] as string[]],
    ] as const) {
      state.subtasks.set(id, {
        version: "0.1",
        subtaskId: id,
        chainId: "chain_test-1",
        chainMandateId: "chainmandate_test-1",
        depth: 1,
        requiredSkill: "task.execute",
        objective: id,
        requestedResult: "r",
        constraints: [],
        dependsOn: [...deps],
        createdAt: NOW.toISOString(),
      });
    }
    expect(collectSubtaskCancelClosure(state, "a").sort()).toEqual(["a", "b", "c"]);
    expect(collectSubtaskCancelClosure(state, "d")).toEqual(["d"]);
  });
});
