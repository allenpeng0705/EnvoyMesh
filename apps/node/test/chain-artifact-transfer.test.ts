/**
 * Phase 65C — intermediate artifact transfer unit tests.
 */

import { describe, expect, it } from "vitest";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildArtifactGraph,
  buildIntermediateFileArtifacts,
  deliverIntermediateArtifactsOnAward,
  intermediateArtifactsReadyForAward,
  preferDeliveredFileArtifacts,
  registerArtifactsFromFinalPartial,
  registerParentArtifacts,
  sha256Hex,
} from "../src/chain-artifact-transfer.js";
import { chainArtifactPathWithinJobWorkspace } from "../src/chain-sensitivity-gate.js";
import { createChainState, type ChainState } from "../src/chain-orchestrator.js";
import type { ChainMandate, ChainSubtask, TaskChainPartialPayload } from "@envoymesh/protocol";
import { ChainSubtaskPartialSchema, TaskChainPartialPayloadSchema } from "@envoymesh/protocol";

function mandate(chainId = "chain_65c"): ChainMandate {
  return {
    version: "0.1",
    chainMandateId: `chainmandate_${chainId}`,
    chainId,
    issuerOwnerId: "envoy:owner:a",
    orchestratorOwnerId: "envoy:owner:a",
    maxChainCostUsd: 10,
    costCeilingUsd: 3,
    maxWorkers: 3,
    allowDepth3: false,
    maxSensitivity: "public",
    deadlineAt: "2026-09-05T01:00:00.000Z",
    createdAt: "2026-09-05T00:00:00.000Z",
    signature: "stub",
  };
}

function putSubtask(state: ChainState, sub: Partial<ChainSubtask> & { subtaskId: string }): void {
  state.subtasks.set(sub.subtaskId, {
    version: "0.1",
    chainId: state.chainId,
    chainMandateId: state.chainMandate.chainMandateId,
    depth: 1,
    requiredSkill: "task.execute",
    objective: sub.objective ?? sub.subtaskId,
    requestedResult: "result",
    constraints: [],
    dependsOn: [],
    createdAt: "2026-09-05T00:00:00.000Z",
    ...sub,
  } as ChainSubtask);
}

function putFinal(
  state: ChainState,
  partial: Parameters<typeof ChainSubtaskPartialSchema.parse>[0],
): TaskChainPartialPayload {
  const p = ChainSubtaskPartialSchema.parse(partial);
  const payload = TaskChainPartialPayloadSchema.parse({ partial: p }) as TaskChainPartialPayload;
  state.partials.set(p.subtaskId, payload);
  return payload;
}

describe("Phase 65C intermediate artifacts", () => {
  it("chainArtifactPathWithinJobWorkspace confines to job tree", () => {
    expect(
      chainArtifactPathWithinJobWorkspace("chain_x", "imports/team-jobs/chain_x/out/a.txt"),
    ).toBe(true);
    expect(
      chainArtifactPathWithinJobWorkspace("chain_x", "imports/team-jobs/other/out/a.txt"),
    ).toBe(false);
    expect(chainArtifactPathWithinJobWorkspace("chain_x", "../etc/passwd")).toBe(false);
  });

  it("registers text parent final and builds graph edges to dependent", () => {
    const state = createChainState(mandate());
    putSubtask(state, { subtaskId: "subtask_parent" });
    putSubtask(state, {
      subtaskId: "subtask_child",
      dependsOn: ["subtask_parent"],
      expects: [{ key: "research_notes" }],
    });
    const payload = putFinal(state, {
      version: "0.1",
      subtaskId: "subtask_parent",
      chainId: state.chainId,
      workerPeerId: "envoy_agent_w",
      seq: 1,
      isFinal: true,
      namedArtifacts: [
        {
          key: "research_notes",
          artifact: { kind: "text", content: "Parent research body for 65C" },
        },
      ],
      createdAt: "2026-09-05T00:00:00.000Z",
    });
    const rows = registerArtifactsFromFinalPartial(state, payload.partial);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.contentHash).toBe(sha256Hex("Parent research body for 65C"));
    expect(rows[0]?.stagedRelativePath).toContain("imports/team-jobs/chain_65c/out/");
    expect(intermediateArtifactsReadyForAward(state, "subtask_child", "envoy_agent_child")).toEqual({
      ok: true,
    });

    const graph = buildArtifactGraph(state);
    expect(graph.nodes.some((n) => n.id === "subtask_parent:research_notes")).toBe(true);
    expect(
      graph.edges.some(
        (e) =>
          e.from === "subtask_parent:research_notes" &&
          e.to === "subtask_child:research_notes",
      ),
    ).toBe(true);
  });

  it("delivers staged blob to remote worker and packs file inputArtifacts", async () => {
    const vaultDir = await mkdtemp(join(tmpdir(), "envoy-65c-"));
    const state = createChainState(mandate("chain_del"));
    putSubtask(state, { subtaskId: "subtask_parent" });
    putSubtask(state, {
      subtaskId: "subtask_child",
      dependsOn: ["subtask_parent"],
    });
    registerParentArtifacts(state, "subtask_parent", [
      { key: "notes", artifact: { kind: "text", content: "handoff body" } },
    ]);

    const pushes: Array<{ source: string; dest: string }> = [];
    const delivered = await deliverIntermediateArtifactsOnAward({
      state,
      subtaskId: "subtask_child",
      workerPeerId: "envoy_agent_remote",
      orchestratorPeerId: "envoy_agent_orch",
      vaultDir,
      transportPeerId: "12D3KooWremote",
      pushFile: async ({ sourceRelativePath, voucherRelativePath }) => {
        pushes.push({ source: sourceRelativePath, dest: voucherRelativePath });
        return { contentHash: "push-hash", transferId: "xfer_1" };
      },
    });
    expect(delivered).toHaveLength(1);
    expect(delivered[0]?.phase).toBe("verified");
    expect(pushes[0]?.source).toContain("/out/");
    expect(pushes[0]?.dest).toContain("/in/");

    const stagedAbs = join(vaultDir, pushes[0]!.source);
    expect(await readFile(stagedAbs, "utf8")).toBe("handoff body");

    expect(
      intermediateArtifactsReadyForAward(state, "subtask_child", "envoy_agent_remote"),
    ).toEqual({ ok: true });

    const files = buildIntermediateFileArtifacts(
      state,
      "subtask_child",
      "envoy_agent_remote",
    );
    expect(files[0]?.artifact).toMatchObject({
      kind: "file",
      vaultPath: expect.stringContaining("/in/"),
    });

    const preferred = preferDeliveredFileArtifacts(
      [{ key: "notes", artifact: { kind: "text", content: "handoff body" } }],
      files,
    );
    expect(preferred?.[0]?.artifact).toMatchObject({ kind: "file" });
  });

  it("refuses non-job-workspace file vault paths when registering", () => {
    const state = createChainState(mandate("chain_refuse"));
    const rows = registerParentArtifacts(state, "subtask_p", [
      {
        key: "leak",
        artifact: {
          kind: "file",
          vaultPath: "secrets/password.txt",
          contentHash: "abc",
        },
      },
    ]);
    expect(rows).toHaveLength(0);
  });
});
