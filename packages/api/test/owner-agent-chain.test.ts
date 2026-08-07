/**
 * Phase 40 — owner-agent-loop chain integration tests.
 *
 * Validates:
 *  - detectMultiStepGoal: heuristic correctly identifies multi-step requests
 *  - runOwnerAgentTurn with runChain dep: short-circuit to chain orchestrator
 *    when the message triggers the multi-step heuristic
 *  - runOwnerAgentTurn falls through to the LLM planner / route handlers when
 *    the message is a single-step request
 *  - runOwnerAgentTurn respects the autonomousKillSwitch and skips chain
 *  - Trust-mode requirement: chains are blocked when Trust mode is off
 *  - runChain is not called when no multi-step signal is present
 *  - Successful chain start returns chainId/chainMandateId/subtasks
 *  - Failed chain start (e.g. no_goal) falls through to other handlers
 *  - The planner allowlist includes `mesh.chain.run` and gates on Trust mode
 */

import { describe, expect, it, vi } from "vitest";

import {
  detectMultiStepGoal,
  runOwnerAgentTurn,
  type OwnerAgentTurnDeps,
  type OwnerAgentTurnResult,
} from "../src/owner-agent-loop.js";
import { findOwnerAgentTool, filterOwnerAgentTools, isOwnerAgentToolAllowed } from "../src/owner-agent-tool-allowlist.js";

function makeDeps(overrides: Partial<OwnerAgentTurnDeps> = {}): OwnerAgentTurnDeps {
  return {
    message: "",
    runDocumentTurn: async () => ({
      answer: "ok",
      intent: "knowledge",
      toolsUsed: [],
    }),
    executeTool: async (toolName, params) => {
      void toolName;
      void params;
      return { ok: true, intent: "knowledge", toolsUsed: [] };
    },
    matchRoutes: () => [],
    postureEnabled: {
      trustMode: true,
      socialProxy: false,
      documentAcquisition: false,
      capabilityProvider: false,
    },
    ...overrides,
  };
}

describe("detectMultiStepGoal", () => {
  it("returns null for empty input", () => {
    expect(detectMultiStepGoal("")).toBeNull();
    expect(detectMultiStepGoal("   ")).toBeNull();
  });

  it("returns null for single-step requests", () => {
    expect(detectMultiStepGoal("summarize the Q3 report")).toBeNull();
    expect(detectMultiStepGoal("find a contact who knows Rust")).toBeNull();
    expect(detectMultiStepGoal("translate this paragraph to French")).toBeNull();
  });

  it("detects two-verb patterns", () => {
    const r = detectMultiStepGoal("analyze the codebase and summarize the findings");
    expect(r).not.toBeNull();
    expect(r!.reason).toBe("two_verbs");
    expect(r!.subGoals.length).toBeGreaterThan(1);
  });

  it("detects compound-summarize patterns with multiple items", () => {
    // Use a message with only one of the multi-step verbs and a clear list
    // separator so the compound-summarize path is exercised.
    const r = detectMultiStepGoal("summarize Q3 financials, Q4 financials, and the YTD figures");
    expect(r).not.toBeNull();
    expect(r!.reason).toBe("compound_summarize");
    expect(r!.subGoals.length).toBeGreaterThanOrEqual(2);
  });

  it("does not trigger on a single summarize with one subject", () => {
    expect(detectMultiStepGoal("summarize the entire meeting transcript")).toBeNull();
  });

  it("detects research + draft combinations", () => {
    const r = detectMultiStepGoal("research the topic, then draft an executive summary");
    expect(r).not.toBeNull();
  });

  it("sub-goals carry the leading verb when relevant", () => {
    const r = detectMultiStepGoal("analyze X and Y");
    expect(r).not.toBeNull();
    expect(r!.subGoals.every((s) => s.toLowerCase().includes("analyze"))).toBe(true);
  });
});

describe("runOwnerAgentTurn — chain integration", () => {
  it("routes multi-step messages through runChain when configured", async () => {
    const runChain = vi.fn().mockResolvedValue({
      ok: true,
      chainId: "chain_abc",
      chainMandateId: "chainmandate_abc",
      subtasks: [
        { subtaskId: "subtask_a", depth: 1, requiredSkill: "task.execute", objective: "analyze X" },
        { subtaskId: "subtask_b", depth: 1, requiredSkill: "task.execute", objective: "analyze Y" },
      ],
    });
    const deps = makeDeps({ runChain });
    const result = await runOwnerAgentTurn({
      ...deps,
      message: "analyze the Q3 report and summarize the key findings",
    });
    expect(runChain).toHaveBeenCalledTimes(1);
    expect(result.domain).toBe("service");
    expect(result.intent).toBe("task.chain.run");
    expect(result.toolsUsed).toContain("mesh.chain.run");
    expect(result.jobId).toBe("chain_abc");
    expect(result.answer).toContain("chain_abc");
    expect(result.answer).toContain("subtask_a");
  });

  it("does not call runChain for single-step messages", async () => {
    const runChain = vi.fn();
    const deps = makeDeps({ runChain });
    await runOwnerAgentTurn({ ...deps, message: "summarize the Q3 report" });
    expect(runChain).not.toHaveBeenCalled();
  });

  it("respects the autonomousKillSwitch — chain is not started", async () => {
    const runChain = vi.fn();
    const deps = makeDeps({
      runChain,
      postureEnabled: {
        trustMode: true,
        socialProxy: false,
        documentAcquisition: false,
        capabilityProvider: false,
        autonomousKillSwitch: true,
      },
    });
    const result = await runOwnerAgentTurn({
      ...deps,
      message: "analyze X and Y",
    });
    expect(runChain).not.toHaveBeenCalled();
    // The fallback should still produce a result (no chain).
    expect(result).toBeDefined();
  });

  it("respects the trust-mode requirement — chain is not started without it", async () => {
    const runChain = vi.fn();
    const deps = makeDeps({
      runChain,
      postureEnabled: {
        trustMode: false,
        socialProxy: false,
        documentAcquisition: false,
        capabilityProvider: false,
      },
    });
    await runOwnerAgentTurn({ ...deps, message: "analyze X and Y" });
    expect(runChain).not.toHaveBeenCalled();
  });

  it("falls through to the LLM planner when chain start fails", async () => {
    const runChain = vi.fn().mockResolvedValue({
      ok: false,
      chainId: "chain_fail",
      chainMandateId: "chainmandate_fail",
      subtasks: [],
      error: "no_goal",
    });
    const askPlanner = vi.fn().mockResolvedValue(
      JSON.stringify({
        action: "answer",
        text: "fallback answer",
        domain: "knowledge",
        format: "plain",
      }),
    );
    const deps = makeDeps({ runChain, askPlanner });
    const result = await runOwnerAgentTurn({
      ...deps,
      message: "analyze X and Y",
    });
    expect(runChain).toHaveBeenCalledTimes(1);
    expect(askPlanner).toHaveBeenCalledTimes(1);
    expect(result.answer).toBe("fallback answer");
  });

  it("still works without runChain configured (no crash)", async () => {
    const deps = makeDeps(); // no runChain
    const result = await runOwnerAgentTurn({
      ...deps,
      message: "analyze X and Y",
    });
    // Should fall through to documentTurn.
    expect(result.answer).toBe("ok");
  });

  it("empty message short-circuits without calling runChain", async () => {
    const runChain = vi.fn();
    const deps = makeDeps({ runChain });
    const result = await runOwnerAgentTurn({ ...deps, message: "" });
    expect(runChain).not.toHaveBeenCalled();
    expect(result.intent).toBe("empty");
  });

  it("preserves the chain run's toolsUsed across the answer", async () => {
    const runChain = vi.fn().mockResolvedValue({
      ok: true,
      chainId: "chain_z",
      chainMandateId: "chainmandate_z",
      subtasks: [
        { subtaskId: "subtask_a", depth: 1, requiredSkill: "task.execute", objective: "research" },
      ],
    });
    const deps = makeDeps({ runChain });
    const result = await runOwnerAgentTurn({
      ...deps,
      message: "research the topic, then draft a summary",
    });
    expect(result.toolsUsed).toEqual(["mesh.chain.run"]);
  });
});

describe("owner-agent-tool-allowlist — mesh.chain.run", () => {
  it("registers mesh.chain.run as a service-domain job tool", () => {
    const spec = findOwnerAgentTool("mesh.chain.run");
    expect(spec).toBeDefined();
    expect(spec!.kind).toBe("job");
    expect(spec!.domain).toBe("service");
    expect(spec!.requiresTrustMode).toBe(true);
  });

  it("filters out mesh.chain.run when Trust mode is off", () => {
    const filtered = filterOwnerAgentTools({
      trustMode: false,
      socialProxy: false,
      documentAcquisition: false,
      capabilityProvider: false,
    });
    expect(filtered.some((t) => t.name === "mesh.chain.run")).toBe(false);
  });

  it("includes mesh.chain.run when Trust mode is on", () => {
    const filtered = filterOwnerAgentTools({
      trustMode: true,
      socialProxy: false,
      documentAcquisition: false,
      capabilityProvider: false,
    });
    expect(filtered.some((t) => t.name === "mesh.chain.run")).toBe(true);
  });

  it("isOwnerAgentToolAllowed gates mesh.chain.run on trust mode", () => {
    expect(
      isOwnerAgentToolAllowed("mesh.chain.run", {
        trustMode: true,
        socialProxy: false,
        documentAcquisition: false,
        capabilityProvider: false,
      }),
    ).toBe(true);
    expect(
      isOwnerAgentToolAllowed("mesh.chain.run", {
        trustMode: false,
        socialProxy: false,
        documentAcquisition: false,
        capabilityProvider: false,
      }),
    ).toBe(false);
  });
});