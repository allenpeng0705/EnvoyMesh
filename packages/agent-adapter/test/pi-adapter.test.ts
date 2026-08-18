/**
 * PiAdapter tests.
 *
 * Covers:
 * - `describeSkills` / `buildManifest` (runtime stamping + reputation echo).
 * - `execute` (routes through injected runPi, emits text + structured trace,
 *   signs via injected signer, respects a pre-aborted signal).
 * - `verify` (empty / echo fails; loop detection; destructive command
 *   detection; pass with and without a trace).
 */
import { describe, expect, it, vi } from "vitest";
import { PI_LOOP_THRESHOLD, PiAdapter } from "../src/index.js";
import type { AgentResult, SignedAgentResult } from "@envoymesh/protocol";

function makeAdapter(overrides?: {
  run?: () => Promise<{
    summary: string;
    trace?: Array<{ tool: string; args?: Record<string, unknown> }>;
  }>;
  sign?: (unsigned: AgentResult) => SignedAgentResult;
}) {
  const sign =
    overrides?.sign ?? ((unsigned: AgentResult) => ({ ...unsigned, signature: "sig" }));
  return {
    adapter: new PiAdapter({
      runPi: overrides?.run ?? (async () => ({ summary: "  Fixed the flaky test  " })),
      isReady: () => true,
      workerPeerId: "envoy_agent_self",
      signResult: sign,
    }),
    sign,
  };
}

const baseInput = {
  skillId: "debug",
  objective: "Investigate the flaky test and propose a fix",
  inputArtifacts: [],
  costCeilingUsd: 5,
  deadlineMs: 120_000,
  correlationId: "chain_1:subtask_1",
  signal: new AbortController().signal,
};

function signedResult(overrides?: Partial<SignedAgentResult>): SignedAgentResult {
  return {
    skillId: "debug",
    runtime: "pi",
    peerId: "envoy_agent_self",
    correlationId: "c",
    content: [{ kind: "text", text: "The test races on a shared timer." }],
    citations: [],
    metrics: { durationMs: 1, costUsd: 0 },
    completedAt: new Date().toISOString(),
    signature: "sig",
    ...overrides,
  };
}

describe("PiAdapter", () => {
  it("describes Team-job-shaped Pi skills", () => {
    const { adapter } = makeAdapter();
    const skills = adapter.describeSkills();
    expect(skills.length).toBeGreaterThan(0);
    expect(skills[0]?.skillId).toMatch(/^[a-z][a-z0-9_-]{1,63}$/);
    expect(skills.map((s) => s.skillId)).toContain("code_review");
    expect(skills.map((s) => s.skillId)).toContain("debug");
  });

  it("buildManifest stamps the pi runtime and echoes reputation", async () => {
    const { adapter } = makeAdapter();
    const manifest = await adapter.buildManifest({
      peerId: "peer-x",
      ownerId: "owner-y",
      reputationBySkill: { debug: 0.9 },
    });
    expect(manifest.runtime).toBe("pi");
    expect(manifest.peerId).toBe("peer-x");
    expect(manifest.ownerId).toBe("owner-y");
    expect(manifest.reputationBySkill).toEqual({ debug: 0.9 });
  });

  it("execute routes through runPi and signs the result", async () => {
    const runPi = vi.fn(async () => ({ summary: "Fixed the flaky test" }));
    const sign = vi.fn((unsigned: AgentResult) => ({ ...unsigned, signature: "sig-1" }));
    const { adapter } = makeAdapter({ run: runPi, sign });
    const result = await adapter.execute({ ...baseInput });

    expect(runPi).toHaveBeenCalledOnce();
    const runInput = runPi.mock.calls[0]?.[0];
    expect(runInput.objective).toBe("Investigate the flaky test and propose a fix");
    expect(runInput.prompt).toContain("Required skill hint: debug");
    expect(result.runtime).toBe("pi");
    expect(result.peerId).toBe("envoy_agent_self");
    expect(result.correlationId).toBe("chain_1:subtask_1");
    expect(result.signature).toBe("sig-1");
    expect(sign).toHaveBeenCalledOnce();
  });

  it("execute embeds the trace in a structured block when present", async () => {
    const { adapter } = makeAdapter({
      run: () =>
        Promise.resolve({
          summary: "Reproduced the failure",
          trace: [
            { tool: "read_file", args: { path: "src/timer.ts" } },
            { tool: "run_command", args: { command: "pnpm test -- --grep flaky" } },
          ],
        }),
    });
    const result = await adapter.execute({ ...baseInput });
    const structured = result.content.find((b) => b.kind === "structured");
    expect(structured).toBeDefined();
    if (structured?.kind !== "structured") return;
    expect(structured.schemaRef).toBe("envoymesh://pi/run/v1");
    expect((structured.data as { trace?: unknown }).trace).toHaveLength(2);
  });

  it("execute throws when the signal is already aborted", async () => {
    const { adapter } = makeAdapter({ run: vi.fn() });
    const controller = new AbortController();
    controller.abort();
    await expect(adapter.execute({ ...baseInput, signal: controller.signal })).rejects.toThrow(
      /aborted/,
    );
  });

  it("verify fails empty results", async () => {
    const { adapter } = makeAdapter();
    const verdicts = await adapter.verify({
      result: signedResult({ content: [] }),
      objective: baseInput.objective,
    });
    expect(verdicts[0]?.kind).toBe("fail");
  });

  it("verify fails a verbatim echo of the objective", async () => {
    const { adapter } = makeAdapter();
    const verdicts = await adapter.verify({
      result: signedResult({ content: [{ kind: "text", text: baseInput.objective }] }),
      objective: baseInput.objective,
    });
    expect(verdicts[0]?.kind).toBe("fail");
  });

  it("verify fails when the same tool+args repeats in a loop", async () => {
    const { adapter } = makeAdapter();
    const trace = Array.from({ length: PI_LOOP_THRESHOLD }, () => ({
      tool: "read_file",
      args: { path: "src/timer.ts" },
    }));
    const verdicts = await adapter.verify({
      result: signedResult({
        content: [
          { kind: "text", text: "Reading the timer module." },
          {
            kind: "structured",
            schemaRef: "envoymesh://pi/run/v1",
            data: { summary: "loop", trace },
          },
        ],
      }),
      objective: baseInput.objective,
    });
    expect(verdicts[0]?.kind).toBe("fail");
    expect(verdicts[0]).toMatchObject({ rollback: true });
    if (verdicts[0]?.kind === "fail") expect(verdicts[0].reason).toMatch(/loop detected/);
  });

  it("verify fails when the trace contains a destructive command", async () => {
    const { adapter } = makeAdapter();
    const verdicts = await adapter.verify({
      result: signedResult({
        content: [
          { kind: "text", text: "Cleaned up generated files." },
          {
            kind: "structured",
            schemaRef: "envoymesh://pi/run/v1",
            data: {
              summary: "cleanup",
              trace: [
                { tool: "run_command", args: { command: "git clean -fdx" } },
                { tool: "run_command", args: { command: "rm -rf node_modules" } },
              ],
            },
          },
        ],
      }),
      objective: baseInput.objective,
    });
    expect(verdicts[0]?.kind).toBe("fail");
    if (verdicts[0]?.kind === "fail") expect(verdicts[0].reason).toMatch(/destructive/);
  });

  it("verify passes a clean trace", async () => {
    const { adapter } = makeAdapter();
    const verdicts = await adapter.verify({
      result: signedResult({
        content: [
          { kind: "text", text: "The test races on a shared timer." },
          {
            kind: "structured",
            schemaRef: "envoymesh://pi/run/v1",
            data: {
              summary: "diagnosis",
              trace: [
                { tool: "read_file", args: { path: "src/timer.ts" } },
                { tool: "run_command", args: { command: "pnpm test -- --grep flaky" } },
              ],
            },
          },
        ],
      }),
      objective: baseInput.objective,
    });
    expect(verdicts[0]?.kind).toBe("pass");
  });

  it("verify passes (low confidence) when there is no trace to audit", async () => {
    const { adapter } = makeAdapter();
    const verdicts = await adapter.verify({
      result: signedResult(),
      objective: baseInput.objective,
    });
    expect(verdicts[0]?.kind).toBe("pass");
    if (verdicts[0]?.kind === "pass") expect(verdicts[0].confidence).toBe("low");
  });
});
