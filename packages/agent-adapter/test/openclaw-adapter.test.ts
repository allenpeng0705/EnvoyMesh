/**
 * OpenClawAdapter tests.
 *
 * Verifies the canonical adapter:
 * - `describeSkills` returns Team-job-shaped skills.
 * - `buildManifest` stamps runtime/runtimeVersion/peerId/ownerId and echoes
 *   the injected reputation.
 * - `execute` routes through the injected ask path, stamps the node's
 *   workerPeerId, and returns a signed result via the injected signer.
 * - `execute` respects a pre-aborted signal.
 * - `verify` (first-cut) fails empty / objective-echo results and passes
 *   otherwise.
 */
import { describe, expect, it, vi } from "vitest";
import { OpenClawAdapter } from "../src/index.js";
import type { AgentResult, SignedAgentResult } from "@envoymesh/protocol";

function makeAdapter(overrides?: {
  ask?: () => Promise<string>;
  sign?: (unsigned: AgentResult) => SignedAgentResult;
  buildPrompt?: (input: { objective: string; skillId: string }) => string;
}) {
  const sign = overrides?.sign ?? ((unsigned: AgentResult) => ({ ...unsigned, signature: "sig" }));
  return {
    adapter: new OpenClawAdapter({
      askViaRuntime: overrides?.ask ?? (async () => "  Three trends: …  "),
      isReady: () => true,
      workerPeerId: "envoy_agent_self",
      signResult: sign,
    }),
    sign,
  };
}

const baseInput = {
  skillId: "summarize",
  objective: "Summarize local LLM trends",
  inputArtifacts: [],
  costCeilingUsd: 3,
  deadlineMs: 120_000,
  correlationId: "chain_1:subtask_1",
  signal: new AbortController().signal,
};

describe("OpenClawAdapter", () => {
  it("describes Team-job-shaped skills", () => {
    const { adapter } = makeAdapter();
    const skills = adapter.describeSkills();
    expect(skills.length).toBeGreaterThan(0);
    expect(skills[0]?.skillId).toMatch(/^[a-z][a-z0-9_-]{1,63}$/);
    expect(skills.map((s) => s.skillId)).toContain("research");
    expect(skills.map((s) => s.skillId)).toContain("summarize");
  });

  it("buildManifest stamps runtime, version, and echoes reputation", async () => {
    const { adapter } = makeAdapter({});
    const manifest = await adapter.buildManifest({
      peerId: "peer-x",
      ownerId: "owner-y",
      reputationBySkill: { summarize: 0.5 },
    });
    expect(manifest.runtime).toBe("openclaw");
    expect(manifest.peerId).toBe("peer-x");
    expect(manifest.ownerId).toBe("owner-y");
    expect(manifest.reputationBySkill).toEqual({ summarize: 0.5 });
    expect(manifest.ttlSeconds).toBe(300);
  });

  it("buildManifest honors a custom runtimeVersion resolver", async () => {
    const adapter = new OpenClawAdapter({
      askViaRuntime: async () => "x",
      isReady: () => true,
      workerPeerId: "envoy_agent_self",
      signResult: (u) => ({ ...u, signature: "sig" }),
      runtimeVersion: async () => "1.2.3",
    });
    const manifest = await adapter.buildManifest({
      peerId: "p",
      ownerId: "o",
      reputationBySkill: {},
    });
    expect(manifest.runtimeVersion).toBe("1.2.3");
  });

  it("execute routes through the injected ask path and signs the result", async () => {
    const ask = vi.fn(async () => "  Three trends: …  ");
    const sign = vi.fn((unsigned: AgentResult) => ({ ...unsigned, signature: "sig-1" }));
    const { adapter } = makeAdapter({ ask, sign });
    const result = await adapter.execute({ ...baseInput });

    expect(ask).toHaveBeenCalledOnce();
    expect(String(ask.mock.calls[0]?.[0])).toContain("Summarize local LLM trends");
    expect(String(ask.mock.calls[0]?.[0])).toContain("Required skill hint: summarize");
    expect(result.runtime).toBe("openclaw");
    expect(result.peerId).toBe("envoy_agent_self");
    expect(result.correlationId).toBe("chain_1:subtask_1");
    expect(result.signature).toBe("sig-1");
    expect(sign).toHaveBeenCalledOnce();
  });

  it("execute includes input artifacts in the default prompt", async () => {
    const ask = vi.fn(async () => "ok");
    const { adapter } = makeAdapter({ ask });
    await adapter.execute({
      ...baseInput,
      inputArtifacts: [
        { key: "brief", artifact: { kind: "text", content: "parent output" } },
      ],
    });
    const prompt = String(ask.mock.calls[0]?.[0]);
    expect(prompt).toContain("Input artifacts:");
    expect(prompt).toContain("- brief: parent output");
  });

  it("execute throws when the signal is already aborted", async () => {
    const { adapter } = makeAdapter({ ask: vi.fn() });
    const controller = new AbortController();
    controller.abort();
    await expect(adapter.execute({ ...baseInput, signal: controller.signal })).rejects.toThrow(
      /aborted/,
    );
  });

  it("verify fails empty results", async () => {
    const { adapter } = makeAdapter();
    const verdicts = await adapter.verify({
      result: {
        skillId: "summarize",
        runtime: "openclaw",
        peerId: "envoy_agent_self",
        correlationId: "c",
        content: [],
        citations: [],
        metrics: { durationMs: 1, costUsd: 0 },
        completedAt: new Date().toISOString(),
        signature: "sig",
      },
      objective: "Summarize local LLM trends",
    });
    expect(verdicts[0]?.kind).toBe("fail");
  });

  it("verify fails a verbatim echo of the objective", async () => {
    const { adapter } = makeAdapter();
    const verdicts = await adapter.verify({
      result: {
        skillId: "summarize",
        runtime: "openclaw",
        peerId: "envoy_agent_self",
        correlationId: "c",
        content: [{ kind: "text", text: "  Summarize local LLM trends  " }],
        citations: [],
        metrics: { durationMs: 1, costUsd: 0 },
        completedAt: new Date().toISOString(),
        signature: "sig",
      },
      objective: "Summarize local LLM trends",
    });
    expect(verdicts[0]?.kind).toBe("fail");
  });

  it("verify passes a substantive answer", async () => {
    const { adapter } = makeAdapter();
    const verdicts = await adapter.verify({
      result: {
        skillId: "summarize",
        runtime: "openclaw",
        peerId: "envoy_agent_self",
        correlationId: "c",
        content: [{ kind: "text", text: "Three trends dominate: local RAG, tiny LLMs, mesh routing." }],
        citations: [],
        metrics: { durationMs: 1, costUsd: 0 },
        completedAt: new Date().toISOString(),
        signature: "sig",
      },
      objective: "Summarize local LLM trends",
    });
    expect(verdicts[0]?.kind).toBe("pass");
  });
});
