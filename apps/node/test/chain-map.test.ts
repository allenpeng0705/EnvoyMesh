/**
 * Worker-side MAP interop layer tests.
 *
 * Covers the pure mappings (`mapChainSubtaskToExecuteInput`,
 * `contentBlocksToResultArtifacts`, `combineVerdicts`) and the adapter-backed
 * executor (`createMapChainSubtaskExecutor`), mirroring the legacy
 * `chain-worker-openclaw-executor.test.ts` conventions.
 */
import { describe, expect, it, vi } from "vitest";
import {
  CHAIN_NAMED_ARTIFACTS_MAX,
  CHAIN_SUBTASK_PARTIAL_NOTE_MAX,
  type ChainSubtask,
  type ContentBlock,
  type NamedArtifact,
  type Verdict,
} from "@envoymesh/protocol";
import type { AgentAdapter, ExecuteInput } from "@envoymesh/agent-adapter";
import {
  MAP_DEFAULT_DEADLINE_MS,
  combineVerdicts,
  contentBlocksToResultArtifacts,
  createMapChainSubtaskExecutor,
  mapChainSubtaskToExecuteInput,
} from "../src/chain-map.js";

function sampleSubtask(overrides?: Partial<ChainSubtask>): ChainSubtask {
  return {
    version: "0.1",
    subtaskId: "subtask_1",
    chainId: "chain_1",
    chainMandateId: "mandate_1",
    depth: 1,
    requiredSkill: "research",
    objective: "Summarize local LLM trends",
    requestedResult: "markdown summary",
    constraints: ["Keep under 200 words"],
    dependsOn: [],
    createdAt: new Date().toISOString(),
    ...overrides,
  } as ChainSubtask;
}

class StubAdapter implements AgentAdapter {
  readonly runtime = "openclaw" as const;
  describeSkills = vi.fn(() => []);
  buildManifest = vi.fn();
  execute: AgentAdapter["execute"] = vi.fn(async (input: ExecuteInput) => ({
    skillId: input.skillId,
    runtime: "openclaw",
    peerId: "envoy_agent_self",
    correlationId: input.correlationId,
    content: [{ kind: "text", text: "  Three trends: …  " }],
    citations: [],
    metrics: { durationMs: 12, costUsd: 0.001 },
    completedAt: new Date().toISOString(),
    signature: "test-signature",
  }));
  verify: AgentAdapter["verify"] = vi.fn(async () => [{ kind: "pass", score: 0.9 }]);
}

describe("mapChainSubtaskToExecuteInput", () => {
  it("maps skillId, objective and correlationId from the subtask", () => {
    const { input } = mapChainSubtaskToExecuteInput({
      subtask: sampleSubtask(),
      now: () => new Date("2026-01-01T00:00:00.000Z"),
    });
    expect(input.skillId).toBe("research");
    expect(input.objective).toBe("Summarize local LLM trends");
    expect(input.correlationId).toBe("chain_1:subtask_1");
    expect(input.signal.aborted).toBe(false);
  });

  it("carries Phase 53 input artifacts through", () => {
    const inputArtifacts: NamedArtifact[] = [
      { key: "brief", artifact: { kind: "text", content: "parent output" } },
    ];
    const { input } = mapChainSubtaskToExecuteInput({
      subtask: sampleSubtask(),
      inputArtifacts,
    });
    expect(input.inputArtifacts).toBe(inputArtifacts);
  });

  it("uses the subtask deadlineAt when present, else the default budget", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const withDeadline = mapChainSubtaskToExecuteInput({
      subtask: sampleSubtask({ deadlineAt: "2026-01-01T00:01:30.000Z" }),
      now: () => now,
    });
    expect(withDeadline.input.deadlineMs).toBe(90_000);

    const noDeadline = mapChainSubtaskToExecuteInput({ subtask: sampleSubtask(), now: () => now });
    expect(noDeadline.input.deadlineMs).toBe(MAP_DEFAULT_DEADLINE_MS);
  });

  it("defaults costCeilingUsd to the subtask value, else 0 (unset)", () => {
    expect(
      mapChainSubtaskToExecuteInput({
        subtask: sampleSubtask({ costCeilingUsd: 0.5 }),
      }).input.costCeilingUsd,
    ).toBe(0.5);
    expect(
      mapChainSubtaskToExecuteInput({ subtask: sampleSubtask() }).input.costCeilingUsd,
    ).toBe(0);
  });
});

describe("contentBlocksToResultArtifacts", () => {
  it("converts text blocks to a text artifact keyed result", () => {
    const out = contentBlocksToResultArtifacts([{ kind: "text", text: "hello" }]);
    expect(out.namedArtifacts).toEqual([
      { key: "result", artifact: { kind: "text", content: "hello" } },
    ]);
    expect(out.artifactFragment).toEqual({ kind: "text", content: "hello" });
    expect(out.skipped).toEqual([]);
  });

  it("clips oversized text blocks to the protocol artifact max", () => {
    const long = "x".repeat(64_000 + 100);
    const out = contentBlocksToResultArtifacts([{ kind: "text", text: long }]);
    const artifact = out.namedArtifacts[0]?.artifact as { content?: string };
    expect(artifact?.content?.length).toBe(64_000);
  });

  it("maps image and file blocks to file artifacts", () => {
    const out = contentBlocksToResultArtifacts([
      { kind: "image", vaultPath: "shots/a.png", contentHash: "h1", mimeType: "image/png", altText: "chart" },
      { kind: "file", vaultPath: "specs/api.md", contentHash: "h2", displayName: "api.md" },
    ]);
    expect(out.namedArtifacts[0]?.artifact).toEqual({
      kind: "file",
      vaultPath: "shots/a.png",
      contentHash: "h1",
      mimeType: "image/png",
      displayName: "chart",
    });
    expect(out.namedArtifacts[1]?.artifact).toEqual({
      kind: "file",
      vaultPath: "specs/api.md",
      contentHash: "h2",
      displayName: "api.md",
    });
  });

  it("converts structured blocks only when data is a plain record", () => {
    const ok = contentBlocksToResultArtifacts([
      { kind: "structured", schemaRef: "envoymesh://x/v1", data: { a: 1 } },
    ]);
    expect(ok.namedArtifacts[0]?.artifact).toEqual({
      kind: "structured",
      schemaRef: "envoymesh://x/v1",
      data: { a: 1 },
    });
    expect(ok.skipped).toEqual([]);

    const bad = contentBlocksToResultArtifacts([
      { kind: "structured", schemaRef: "envoymesh://x/v1", data: "not-a-record" },
    ]);
    expect(bad.namedArtifacts).toEqual([]);
    expect(bad.skipped).toHaveLength(1);
    expect(bad.skipped[0]).toMatch(/structured/);
  });

  it("caps named artifacts at CHAIN_NAMED_ARTIFACTS_MAX and reports the rest as skipped", () => {
    const blocks: ContentBlock[] = Array.from({ length: 12 }, (_, i) => ({
      kind: "text" as const,
      text: `block ${i}`,
    }));
    const out = contentBlocksToResultArtifacts(blocks);
    expect(out.namedArtifacts).toHaveLength(CHAIN_NAMED_ARTIFACTS_MAX);
    expect(out.skipped.length).toBe(12 - CHAIN_NAMED_ARTIFACTS_MAX);
  });
});

describe("combineVerdicts", () => {
  it("short-circuits to pass when any verdict passes", () => {
    const verdicts: Verdict[] = [
      { kind: "partial", score: 0.4, reason: "some blocks unusable" },
      { kind: "pass", score: 0.95 },
      { kind: "fail", reason: "policy breach" },
    ];
    expect(combineVerdicts(verdicts)).toBe("pass");
  });

  it("short-circuits to fail when nothing passes but something fails", () => {
    expect(
      combineVerdicts([
        { kind: "disputed", needsHuman: true, signals: ["uncertain"] },
        { kind: "fail", reason: "empty output" },
      ]),
    ).toBe("fail");
  });

  it("defaults to disputed for all-uncertain or empty verdicts", () => {
    expect(combineVerdicts([])).toBe("disputed");
    expect(
      combineVerdicts([{ kind: "partial", score: 0.5, reason: "meh" }]),
    ).toBe("disputed");
  });
});

describe("createMapChainSubtaskExecutor", () => {
  it("fails honestly when the runtime is not ready", async () => {
    const adapter = new StubAdapter();
    const executor = createMapChainSubtaskExecutor({
      workerPeerId: "envoy_agent_self",
      engineLabel: "OpenClaw (MAP)",
      unavailableCode: "map_openclaw_unavailable",
      isReady: () => false,
      adapter,
    });
    const partials: string[] = [];
    const result = await executor(sampleSubtask(), async (payload) => {
      partials.push(payload.partial.note ?? "");
    });
    expect(result.ok).toBe(false);
    expect(result.finalNote).toBe("map_openclaw_unavailable");
    expect(partials.at(-1)).toMatch(/^AN_ENGINE_FAIL:/);
    expect(partials.at(-1)).toMatch(/OpenClaw/);
  });

  it("executes via the adapter, emits progress + final partials, and records the verdict", async () => {
    const adapter = new StubAdapter();
    adapter.execute = vi.fn(async (input: ExecuteInput) => ({
      skillId: input.skillId,
      runtime: "openclaw",
      peerId: "envoy_agent_self",
      correlationId: input.correlationId,
      content: [{ kind: "text", text: "Three trends: …" }],
      citations: [],
      metrics: { durationMs: 12, costUsd: 0.001 },
      completedAt: new Date().toISOString(),
      signature: "test-signature",
    }));
    const onShadowRecord = vi.fn();
    const executor = createMapChainSubtaskExecutor({
      workerPeerId: "envoy_agent_self",
      engineLabel: "OpenClaw (MAP)",
      unavailableCode: "map_openclaw_unavailable",
      isReady: () => true,
      adapter,
      onShadowRecord,
    });
    const partials: Array<{ note?: string; isFinal: boolean }> = [];
    const result = await executor(sampleSubtask(), async (payload) => {
      partials.push({ note: payload.partial.note, isFinal: payload.partial.isFinal });
    });

    expect(result.ok).toBe(true);
    expect(result.finalNote).toBe("Three trends: …");
    expect(adapter.execute).toHaveBeenCalledOnce();
    expect(adapter.verify).toHaveBeenCalledOnce();
    const input = adapter.execute.mock.calls[0]?.[0] as ExecuteInput;
    expect(input.objective).toBe("Summarize local LLM trends");
    expect(input.correlationId).toBe("chain_1:subtask_1");
    expect(partials.some((p) => !p.isFinal)).toBe(true);
    const finalPartial = partials.at(-1);
    expect(finalPartial?.isFinal).toBe(true);
    expect(finalPartial?.note).toBe("Three trends: …");
    expect(onShadowRecord).toHaveBeenCalledWith(
      expect.objectContaining({ subtaskId: "subtask_1", ok: true, overall: "pass" }),
    );
  });

  it("emits named result artifacts on the final partial", async () => {
    const adapter = new StubAdapter();
    const executor = createMapChainSubtaskExecutor({
      workerPeerId: "envoy_agent_self",
      engineLabel: "OpenClaw (MAP)",
      unavailableCode: "map_openclaw_unavailable",
      isReady: () => true,
      adapter,
    });
    let finalNamed: NamedArtifact[] | undefined;
    await executor(sampleSubtask(), async (payload) => {
      if (payload.partial.isFinal) finalNamed = payload.partial.namedArtifacts;
    });
    expect(finalNamed).toEqual([
      { key: "result", artifact: { kind: "text", content: "  Three trends: …  " } },
    ]);
  });

  it("fails the subtask when the adapter's own verify returns fail", async () => {
    const adapter = new StubAdapter();
    adapter.verify = vi.fn(async () => [
      { kind: "fail", reason: "output does not match objective", rollback: true },
    ]);
    const executor = createMapChainSubtaskExecutor({
      workerPeerId: "envoy_agent_self",
      engineLabel: "OpenClaw (MAP)",
      unavailableCode: "map_openclaw_unavailable",
      isReady: () => true,
      adapter,
    });
    const partials: string[] = [];
    const result = await executor(sampleSubtask(), async (payload) => {
      partials.push(payload.partial.note ?? "");
    });
    expect(result.ok).toBe(false);
    expect(result.finalNote).toBe("map_verify_fail");
    expect(partials.at(-1)).toMatch(/^AN_ENGINE_FAIL:/);
    expect(partials.at(-1)).toMatch(/verify/);
  });

  it("skips verification when runVerify is false", async () => {
    const adapter = new StubAdapter();
    const executor = createMapChainSubtaskExecutor({
      workerPeerId: "envoy_agent_self",
      engineLabel: "OpenClaw (MAP)",
      unavailableCode: "map_openclaw_unavailable",
      isReady: () => true,
      adapter,
      runVerify: false,
    });
    const result = await executor(sampleSubtask(), async () => undefined);
    expect(result.ok).toBe(true);
    expect(adapter.verify).not.toHaveBeenCalled();
  });

  it("fails on empty content (no usable blocks)", async () => {
    const adapter = new StubAdapter();
    adapter.execute = vi.fn(async (input: ExecuteInput) => ({
      skillId: input.skillId,
      runtime: "openclaw",
      peerId: "envoy_agent_self",
      correlationId: input.correlationId,
      content: [],
      citations: [],
      metrics: { durationMs: 1, costUsd: 0 },
      completedAt: new Date().toISOString(),
      signature: "test-signature",
    }));
    const executor = createMapChainSubtaskExecutor({
      workerPeerId: "envoy_agent_self",
      engineLabel: "OpenClaw (MAP)",
      unavailableCode: "map_openclaw_unavailable",
      isReady: () => true,
      adapter,
    });
    const result = await executor(sampleSubtask(), async () => undefined);
    expect(result.ok).toBe(false);
    expect(result.finalNote).toBe("map_empty_result");
  });

  it("fails honestly when the adapter throws", async () => {
    const adapter = new StubAdapter();
    adapter.execute = vi.fn(async () => {
      throw new Error("webhook timeout");
    });
    const executor = createMapChainSubtaskExecutor({
      workerPeerId: "envoy_agent_self",
      engineLabel: "OpenClaw (MAP)",
      unavailableCode: "map_openclaw_unavailable",
      isReady: () => true,
      adapter,
    });
    const result = await executor(sampleSubtask(), async () => undefined);
    expect(result.ok).toBe(false);
    expect(result.finalNote).toBe("webhook timeout");
  });

  it("clips the final note to the partial note max", async () => {
    const long = "y".repeat(CHAIN_SUBTASK_PARTIAL_NOTE_MAX + 500);
    const adapter = new StubAdapter();
    adapter.execute = vi.fn(async (input: ExecuteInput) => ({
      skillId: input.skillId,
      runtime: "openclaw",
      peerId: "envoy_agent_self",
      correlationId: input.correlationId,
      content: [{ kind: "text", text: long }],
      citations: [],
      metrics: { durationMs: 1, costUsd: 0 },
      completedAt: new Date().toISOString(),
      signature: "test-signature",
    }));
    const executor = createMapChainSubtaskExecutor({
      workerPeerId: "envoy_agent_self",
      engineLabel: "OpenClaw (MAP)",
      unavailableCode: "map_openclaw_unavailable",
      isReady: () => true,
      adapter,
    });
    let noteLen = 0;
    const result = await executor(sampleSubtask(), async (payload) => {
      if (payload.partial.isFinal) noteLen = payload.partial.note?.length ?? 0;
    });
    expect(result.ok).toBe(true);
    expect(result.finalNote?.length).toBe(CHAIN_SUBTASK_PARTIAL_NOTE_MAX);
    expect(noteLen).toBe(CHAIN_SUBTASK_PARTIAL_NOTE_MAX);
  });

  it("summarizes structured-only results into the final note", async () => {
    const adapter = new StubAdapter();
    adapter.execute = vi.fn(async (input: ExecuteInput) => ({
      skillId: input.skillId,
      runtime: "openclaw",
      peerId: "envoy_agent_self",
      correlationId: input.correlationId,
      content: [{ kind: "structured", schemaRef: "envoymesh://chain-report/v1", data: { ok: true } }],
      citations: [],
      metrics: { durationMs: 1, costUsd: 0 },
      completedAt: new Date().toISOString(),
      signature: "test-signature",
    }));
    const executor = createMapChainSubtaskExecutor({
      workerPeerId: "envoy_agent_self",
      engineLabel: "OpenClaw (MAP)",
      unavailableCode: "map_openclaw_unavailable",
      isReady: () => true,
      adapter,
    });
    const result = await executor(sampleSubtask(), async () => undefined);
    expect(result.ok).toBe(true);
    expect(result.finalNote).toMatch(/MAP result: 1 block\(s\) \[structured\]/);
  });
});
