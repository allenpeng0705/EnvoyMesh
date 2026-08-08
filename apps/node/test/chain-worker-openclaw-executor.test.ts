/**
 * Built-in OpenClaw as default Agent Network worker engine.
 */
import { describe, expect, it, vi } from "vitest";
import { createOpenClawChainSubtaskExecutor } from "../src/chain-worker-executor.js";
import {
  CHAIN_SUBTASK_PARTIAL_NOTE_MAX,
  type ChainSubtask,
} from "@envoymesh/protocol";

function sampleSubtask(overrides?: Partial<ChainSubtask>): ChainSubtask {
  return {
    version: "0.1",
    subtaskId: "subtask_1",
    chainId: "chain_1",
    objective: "Summarize local LLM trends",
    requiredSkill: "research",
    depth: 1,
    constraints: ["Keep under 200 words"],
    dependsOn: [],
    ...overrides,
  } as ChainSubtask;
}

describe("createOpenClawChainSubtaskExecutor", () => {
  it("fails honestly when OpenClaw is not ready", async () => {
    const executor = createOpenClawChainSubtaskExecutor({
      workerPeerId: "envoy_agent_self",
      isOpenClawReady: () => false,
      askOpenClaw: vi.fn(),
    });
    const partials: string[] = [];
    const result = await executor(sampleSubtask(), async (payload) => {
      partials.push(payload.partial.note ?? "");
    });
    expect(result.ok).toBe(false);
    expect(result.finalNote).toBe("openclaw_unavailable");
    expect(partials.at(-1)).toMatch(/^AN_ENGINE_FAIL:/);
    expect(partials.at(-1)).toMatch(/OpenClaw/);
  });

  it("asks OpenClaw and emits the final note", async () => {
    const askOpenClaw = vi.fn().mockResolvedValue("  Three trends: …  ");
    const executor = createOpenClawChainSubtaskExecutor({
      workerPeerId: "envoy_agent_self",
      isOpenClawReady: () => true,
      askOpenClaw,
    });
    const partials: Array<{ note?: string; isFinal: boolean }> = [];
    const result = await executor(sampleSubtask(), async (payload) => {
      partials.push({
        note: payload.partial.note,
        isFinal: payload.partial.isFinal,
      });
    });
    expect(result.ok).toBe(true);
    expect(result.finalNote).toBe("Three trends: …");
    expect(askOpenClaw).toHaveBeenCalledOnce();
    expect(String(askOpenClaw.mock.calls[0]?.[0])).toContain("Summarize local LLM trends");
    expect(partials.some((p) => !p.isFinal)).toBe(true);
    expect(partials.at(-1)).toEqual({ note: "Three trends: …", isFinal: true });
  });

  it("puts full OpenClaw text into namedArtifacts while clipping the note", async () => {
    const long = "y".repeat(CHAIN_SUBTASK_PARTIAL_NOTE_MAX + 2000);
    const askOpenClaw = vi.fn().mockResolvedValue(long);
    const executor = createOpenClawChainSubtaskExecutor({
      workerPeerId: "envoy_agent_self",
      isOpenClawReady: () => true,
      askOpenClaw,
    });
    let finalNote = "";
    let artifactLen = 0;
    const result = await executor(sampleSubtask(), async (payload) => {
      if (payload.partial.isFinal) {
        finalNote = payload.partial.note ?? "";
        const art = payload.partial.namedArtifacts?.[0]?.artifact as { content?: string };
        artifactLen = art?.content?.length ?? 0;
      }
    });
    expect(result.ok).toBe(true);
    expect(finalNote.length).toBe(CHAIN_SUBTASK_PARTIAL_NOTE_MAX);
    expect(artifactLen).toBe(CHAIN_SUBTASK_PARTIAL_NOTE_MAX + 2000);
  });

  it("includes inputArtifacts in the prompt and emits named result artifact", async () => {
    const askOpenClaw = vi.fn().mockResolvedValue("Merged summary");
    const executor = createOpenClawChainSubtaskExecutor({
      workerPeerId: "envoy_agent_self",
      isOpenClawReady: () => true,
      askOpenClaw,
    });
    let finalNamed: unknown;
    const result = await executor(
      sampleSubtask({ dependsOn: ["subtask_parent"] }),
      async (payload) => {
        if (payload.partial.isFinal) finalNamed = payload.partial.namedArtifacts;
      },
      {
        inputArtifacts: [
          { key: "research_notes", artifact: { kind: "text", content: "LAN discovery notes…" } },
          {
            key: "spec",
            artifact: {
              kind: "file",
              vaultPath: "specs/api.md",
              contentHash: "sha256:abc",
              displayName: "api.md",
            },
          },
        ],
      },
    );
    expect(result.ok).toBe(true);
    const prompt = String(askOpenClaw.mock.calls[0]?.[0]);
    expect(prompt).toContain("## Input: research_notes");
    expect(prompt).toContain("LAN discovery notes…");
    expect(prompt).toContain("## Input: spec");
    expect(prompt).toContain("path: specs/api.md");
    expect(prompt).toContain("contentHash: sha256:abc");
    expect(finalNamed).toEqual([
      { key: "result", artifact: { kind: "text", content: "Merged summary" } },
    ]);
  });

  it("fails when OpenClaw throws", async () => {
    const executor = createOpenClawChainSubtaskExecutor({
      workerPeerId: "envoy_agent_self",
      isOpenClawReady: () => true,
      askOpenClaw: vi.fn().mockRejectedValue(new Error("webhook timeout")),
    });
    const result = await executor(sampleSubtask(), async () => undefined);
    expect(result.ok).toBe(false);
    expect(result.finalNote).toBe("webhook timeout");
  });

  it("fails on empty OpenClaw response", async () => {
    const executor = createOpenClawChainSubtaskExecutor({
      workerPeerId: "envoy_agent_self",
      isOpenClawReady: () => true,
      askOpenClaw: vi.fn().mockResolvedValue("   "),
    });
    const result = await executor(sampleSubtask(), async () => undefined);
    expect(result.ok).toBe(false);
    expect(result.finalNote).toBe("openclaw_empty");
  });

  it("clips oversized OpenClaw answers so Zod note.max cannot fail the step", async () => {
    const long = "x".repeat(CHAIN_SUBTASK_PARTIAL_NOTE_MAX + 1500);
    const executor = createOpenClawChainSubtaskExecutor({
      workerPeerId: "envoy_agent_self",
      isOpenClawReady: () => true,
      askOpenClaw: vi.fn().mockResolvedValue(long),
    });
    const partials: string[] = [];
    const result = await executor(sampleSubtask(), async (payload) => {
      partials.push(payload.partial.note ?? "");
    });
    expect(result.ok).toBe(true);
    expect(result.finalNote?.length).toBe(CHAIN_SUBTASK_PARTIAL_NOTE_MAX);
    expect(partials.at(-1)?.length).toBe(CHAIN_SUBTASK_PARTIAL_NOTE_MAX);
  });
});
