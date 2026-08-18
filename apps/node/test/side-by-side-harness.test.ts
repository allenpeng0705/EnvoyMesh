/**
 * Side-by-side harness — same task through two adapters (design §6.4, §11).
 *
 * "Two-doctor" check: the same objective runs independently on the OpenClaw
 * adapter and the Pi adapter (both through their node-side seams), each
 * adapter's own rule verifier runs first, then
 * `CrossAgentDisagreementVerifier` compares the two conclusions:
 *
 * - agreement      → pass
 * - partial overlap → partial
 * - disagreement   → disputed (human review)
 *
 * OpenClaw talks prose (`askViaRuntime`); Pi carries a behavioral tool trace
 * inside its structured result. `extractConclusion` must still surface the
 * same summary from both shapes.
 */
import { describe, expect, it, vi } from "vitest";
import type { AgentResult } from "@envoymesh/protocol";
import {
  CrossAgentDisagreementVerifier,
  OpenClawAdapter,
} from "@envoymesh/agent-adapter";
import { createPiAdapterFromHost, type PiMapHost } from "../src/pi-map-adapter.js";

const OBJECTIVE = "Summarize the key risks of the mesh rollout";

const baseInput = {
  skillId: "summarize",
  objective: OBJECTIVE,
  inputArtifacts: [],
  costCeilingUsd: 3,
  deadlineMs: 120_000,
  correlationId: "chain_1:subtask_1",
  signal: new AbortController().signal,
};

/** Build an OpenClaw adapter whose runtime answers `conclusion`. */
function makeOpenClaw(conclusion: string) {
  return new OpenClawAdapter({
    askViaRuntime: vi.fn(async () => conclusion),
    isReady: () => true,
    workerPeerId: "envoy_agent_openclaw",
    signResult: (unsigned: AgentResult) => ({ ...unsigned, signature: "sig" }),
  });
}

/**
 * Build a Pi adapter through the node seam whose runtime answers `summary`
 * with an optional tool trace (clean by default, so the Pi rule verifier
 * passes with medium confidence).
 */
function makePi(summary: string, toolTrace?: PiMapHost["prompt"]) {
  const host: PiMapHost = {
    prompt: vi.fn(async () => ({
      text: summary,
      model: "mini-max",
      toolCallCount: 0,
      cancelled: false,
      toolTrace: [
        { tool: "grep", args: { pattern: "risk" } },
        { tool: "read", args: { path: "rollout-notes.md" } },
      ],
    })),
    isReady: () => true,
    workerPeerId: "envoy_agent_pi",
    signResult: (unsigned: AgentResult) => ({ ...unsigned, signature: "sig" }),
  };
  if (toolTrace) host.prompt = toolTrace;
  return { host, adapter: createPiAdapterFromHost(host) };
}

async function runTwoDoctor(
  openClawConclusion: string,
  piSummary: string,
  piToolTrace?: PiMapHost["prompt"],
) {
  const openClaw = makeOpenClaw(openClawConclusion);
  const { adapter: pi } = makePi(piSummary, piToolTrace);

  const resultA = await openClaw.execute({ ...baseInput });
  const resultB = await pi.execute({ ...baseInput });

  // Each runtime's own rule verifier runs first (design §8: rule → cross).
  const ruleA = await openClaw.verify({ result: resultA, objective: OBJECTIVE });
  const ruleB = await pi.verify({ result: resultB, objective: OBJECTIVE });
  expect(ruleA.every((v) => v.kind !== "fail")).toBe(true);
  expect(ruleB.every((v) => v.kind !== "fail")).toBe(true);

  return new CrossAgentDisagreementVerifier().verify({
    objective: OBJECTIVE,
    resultA,
    resultB,
  });
}

describe("side-by-side harness: two-doctor cross-agent check", () => {
  it("passes when OpenClaw and Pi reach the same conclusion", async () => {
    const verdict = await runTwoDoctor(
      "Key risks: governance, node churn, and cost control.",
      "Key risks: governance, node churn, and cost control.",
    );
    expect(verdict.kind).toBe("pass");
    if (verdict.kind === "pass") expect(verdict.confidence).toBe("high");
  });

  it("returns partial when the conclusions overlap but differ in scope", async () => {
    const verdict = await runTwoDoctor(
      "Governance, node churn, and cost control are the key risks to watch.",
      "Key risks are governance and node churn.",
    );
    expect(verdict.kind).toBe("partial");
  });

  it("disputes when the two runtimes clearly disagree", async () => {
    const verdict = await runTwoDoctor(
      "Governance is the main risk.",
      "The rollout is completely safe with no risks at all.",
    );
    expect(verdict.kind).toBe("disputed");
    if (verdict.kind === "disputed") expect(verdict.needsHuman).toBe(true);
  });
});
