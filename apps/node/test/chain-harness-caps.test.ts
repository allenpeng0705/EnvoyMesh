import { describe, expect, it } from "vitest";
import {
  DEFAULT_CHAIN_MAX_PARALLEL,
  DEFAULT_CHAIN_MAX_SUBAGENTS,
  applyChainHarnessSubagentCaps,
  resolveChainHarnessSubagentCaps,
} from "../src/agent-runtime-envoy/chain-harness-caps.js";

describe("chain-harness-caps (FH-P1-D)", () => {
  it("defaults match EnvoyHome TASK_MAX_* / harness library", () => {
    expect(DEFAULT_CHAIN_MAX_SUBAGENTS).toBe(8);
    expect(DEFAULT_CHAIN_MAX_PARALLEL).toBe(4);
    const caps = resolveChainHarnessSubagentCaps();
    expect(caps).toEqual({
      maxSubagents: 8,
      maxParallelToolCalls: 4,
    });
  });

  it("honors ENVOYMESH_CHAIN_* overrides with ceiling", () => {
    const prevSub = process.env.ENVOYMESH_CHAIN_MAX_SUBAGENTS;
    const prevPar = process.env.ENVOYMESH_CHAIN_MAX_PARALLEL;
    process.env.ENVOYMESH_CHAIN_MAX_SUBAGENTS = "2";
    process.env.ENVOYMESH_CHAIN_MAX_PARALLEL = "99";
    try {
      expect(resolveChainHarnessSubagentCaps()).toEqual({
        maxSubagents: 2,
        maxParallelToolCalls: 16,
      });
    } finally {
      if (prevSub === undefined) delete process.env.ENVOYMESH_CHAIN_MAX_SUBAGENTS;
      else process.env.ENVOYMESH_CHAIN_MAX_SUBAGENTS = prevSub;
      if (prevPar === undefined) delete process.env.ENVOYMESH_CHAIN_MAX_PARALLEL;
      else process.env.ENVOYMESH_CHAIN_MAX_PARALLEL = prevPar;
    }
  });

  it("patches Agent caps after construction", () => {
    const agent = {
      maxSubagents: 99,
      maxParallelToolCalls: 99,
    } as import("@envoymesh/envoy-harness").Agent;
    applyChainHarnessSubagentCaps(agent, {
      maxSubagents: 3,
      maxParallelToolCalls: 1,
    });
    expect(agent.maxSubagents).toBe(3);
    expect(agent.maxParallelToolCalls).toBe(1);
  });
});