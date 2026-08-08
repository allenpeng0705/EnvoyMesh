import { describe, expect, it } from "vitest";
import {
  buildInputArtifacts,
  CHAIN_INPUT_ARTIFACTS_BYTES_MAX,
  chooseWorkersForSubtask,
  createChainState,
  pickStallReassignWorker,
  prepareSubtaskPropose,
  type ChainState,
} from "../src/chain-orchestrator.js";
import { materializePlanAssignWithMeta, parsePlanAssignResult } from "../src/chain-plan-assign.js";
import type { ChainMandate, ChainSubtask, TaskChainPartialPayload } from "@envoymesh/protocol";
import { ChainSubtaskPartialSchema, TaskChainPartialPayloadSchema } from "@envoymesh/protocol";

function mandate(chainId = "chain_artifacts"): ChainMandate {
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
    deadlineAt: "2026-08-09T01:00:00.000Z",
    createdAt: "2026-08-09T00:00:00.000Z",
    signature: "stub",
  };
}

function putSubtask(state: ChainState, sub: Partial<ChainSubtask> & { subtaskId: string }): ChainSubtask {
  const full = {
    version: "0.1" as const,
    chainId: state.chainId,
    chainMandateId: state.chainMandate.chainMandateId,
    depth: 1,
    requiredSkill: "task.execute",
    objective: sub.objective ?? sub.subtaskId,
    requestedResult: "result",
    constraints: [],
    dependsOn: [],
    createdAt: "2026-08-09T00:00:00.000Z",
    ...sub,
  } as ChainSubtask;
  state.subtasks.set(full.subtaskId, full);
  return full;
}

function putFinalPartial(
  state: ChainState,
  partial: Parameters<typeof ChainSubtaskPartialSchema.parse>[0],
): void {
  const p = ChainSubtaskPartialSchema.parse(partial);
  const payload = TaskChainPartialPayloadSchema.parse({ partial: p }) as TaskChainPartialPayload;
  state.partials.set(p.subtaskId, payload);
}

describe("Phase 53 artifact handoff", () => {
  it("buildInputArtifacts prefers namedArtifacts over note snippet", () => {
    const state = createChainState(mandate());
    putSubtask(state, { subtaskId: "subtask_parent" });
    putSubtask(state, {
      subtaskId: "subtask_child",
      dependsOn: ["subtask_parent"],
    });
    putFinalPartial(state, {
      version: "0.1",
      subtaskId: "subtask_parent",
      chainId: state.chainId,
      workerPeerId: "envoy_agent_bob",
      seq: 1,
      isFinal: true,
      note: "short note",
      namedArtifacts: [
        { key: "research_notes", artifact: { kind: "text", content: "Full research body that is long enough" } },
      ],
      createdAt: "2026-08-09T00:00:00.000Z",
    });
    const inputs = buildInputArtifacts(state, state.subtasks.get("subtask_child")!);
    expect(inputs).toHaveLength(1);
    expect(inputs[0]?.key).toBe("research_notes");
    expect(inputs[0]?.artifact).toMatchObject({
      kind: "text",
      content: "Full research body that is long enough",
    });
  });

  it("buildInputArtifacts passes file refs not only display labels", () => {
    const state = createChainState(mandate("chain_file"));
    putSubtask(state, { subtaskId: "subtask_parent" });
    const child = putSubtask(state, {
      subtaskId: "subtask_child",
      dependsOn: ["subtask_parent"],
    });
    putFinalPartial(state, {
      version: "0.1",
      subtaskId: "subtask_parent",
      chainId: state.chainId,
      workerPeerId: "envoy_agent_bob",
      seq: 1,
      isFinal: true,
      namedArtifacts: [
        {
          key: "spec",
          artifact: {
            kind: "file",
            vaultPath: "specs/api.md",
            contentHash: "sha256:deadbeef",
            displayName: "api.md",
          },
        },
      ],
      createdAt: "2026-08-09T00:00:00.000Z",
    });
    const prepared = prepareSubtaskPropose(state, child);
    expect(prepared.inputArtifacts?.[0]?.artifact).toMatchObject({
      kind: "file",
      vaultPath: "specs/api.md",
      contentHash: "sha256:deadbeef",
    });
    expect(prepared.subtask.constraints.some((c) => c.includes("prior[subtask_parent]"))).toBe(true);
    expect(prepared.subtask.constraints.some((c) => c.includes("hash="))).toBe(true);
  });

  it("buildInputArtifacts falls back from artifactFragment to key default", () => {
    const state = createChainState(mandate("chain_frag"));
    putSubtask(state, { subtaskId: "subtask_parent" });
    const child = putSubtask(state, {
      subtaskId: "subtask_child",
      dependsOn: ["subtask_parent"],
    });
    putFinalPartial(state, {
      version: "0.1",
      subtaskId: "subtask_parent",
      chainId: state.chainId,
      workerPeerId: "envoy_agent_bob",
      seq: 1,
      isFinal: true,
      artifactFragment: { kind: "text", content: "legacy fragment" },
      createdAt: "2026-08-09T00:00:00.000Z",
    });
    const inputs = buildInputArtifacts(state, child);
    expect(inputs[0]).toEqual({
      key: "default",
      artifact: { kind: "text", content: "legacy fragment" },
    });
  });

  it("structured oversize truncates into budget instead of dropping", () => {
    const state = createChainState(mandate("chain_struct"));
    putSubtask(state, { subtaskId: "subtask_parent" });
    const child = putSubtask(state, {
      subtaskId: "subtask_child",
      dependsOn: ["subtask_parent"],
    });
    const hugeObj: Record<string, string> = {};
    for (let i = 0; i < 2000; i++) hugeObj[`k${i}`] = "x".repeat(40);
    putFinalPartial(state, {
      version: "0.1",
      subtaskId: "subtask_parent",
      chainId: state.chainId,
      workerPeerId: "envoy_agent_bob",
      seq: 1,
      isFinal: true,
      namedArtifacts: [
        {
          key: "table",
          artifact: { kind: "structured", schemaRef: "table/v1", data: hugeObj },
        },
      ],
      createdAt: "2026-08-09T00:00:00.000Z",
    });
    const inputs = buildInputArtifacts(state, child);
    expect(inputs.length).toBe(1);
    expect(inputs[0]?.key).toBe("table");
    expect(JSON.stringify(inputs).length).toBeLessThanOrEqual(CHAIN_INPUT_ARTIFACTS_BYTES_MAX);
    expect(inputs[0]?.artifact).toMatchObject({ kind: "text" });
  });

  it("buildInputArtifacts respects size budget", () => {
    const state = createChainState(mandate("chain_cap"));
    putSubtask(state, { subtaskId: "subtask_parent" });
    const child = putSubtask(state, {
      subtaskId: "subtask_child",
      dependsOn: ["subtask_parent"],
    });
    const huge = "Z".repeat(CHAIN_INPUT_ARTIFACTS_BYTES_MAX);
    putFinalPartial(state, {
      version: "0.1",
      subtaskId: "subtask_parent",
      chainId: state.chainId,
      workerPeerId: "envoy_agent_bob",
      seq: 1,
      isFinal: true,
      namedArtifacts: [{ key: "big", artifact: { kind: "text", content: huge } }],
      createdAt: "2026-08-09T00:00:00.000Z",
    });
    const inputs = buildInputArtifacts(state, child);
    expect(inputs.length).toBe(1);
    const encoded = JSON.stringify(inputs);
    expect(encoded.length).toBeLessThanOrEqual(CHAIN_INPUT_ARTIFACTS_BYTES_MAX);
    expect(JSON.stringify(inputs[0]?.artifact)).toContain("[truncated]");
  });
});

describe("Phase 53 worker stickiness", () => {
  it("chooseWorkersForSubtask keeps preferred even when ranking missed them", () => {
    const chosen = chooseWorkersForSubtask(
      "envoy_agent_bob",
      ["envoy_agent_carol", "envoy_agent_dave"],
      1,
    );
    expect(chosen[0]).toBe("envoy_agent_bob");
    expect(chosen).toContain("envoy_agent_carol");
  });

  it("materialize forces same preferredWorkerPeerId for shared threadId", () => {
    const parsed = parsePlanAssignResult(
      JSON.stringify({
        assignmentMode: "skill",
        steps: [
          {
            objective: "Write module A",
            requiredSkill: "coding",
            depth: 1,
            dependsOn: [],
            assignedPeerId: "envoy_agent_bob",
            threadId: "coding",
            reason: "coder",
          },
          {
            objective: "Write module B",
            requiredSkill: "coding",
            depth: 1,
            dependsOn: [],
            assignedPeerId: "envoy_agent_carol",
            threadId: "coding",
            reason: "should stick to bob",
          },
        ],
      }),
    );
    const { subtasks } = materializePlanAssignWithMeta({
      goal: "code",
      chainId: "chain_thread",
      chainMandateId: "chainmandate_thread",
      drafts: parsed!.steps,
      roster: [
        {
          peerId: "envoy_agent_bob",
          membership: ["task.execute", "agent-network-worker"],
          profile: { skills: ["coding"] },
        },
        {
          peerId: "envoy_agent_carol",
          membership: ["task.execute", "agent-network-worker"],
          profile: { skills: ["coding"] },
        },
      ],
      createdAt: "2026-08-09T00:00:00.000Z",
      assignmentMode: "skill",
    });
    expect(subtasks[0]!.threadId).toBe("coding");
    expect(subtasks[1]!.threadId).toBe("coding");
    expect(subtasks[0]!.preferredWorkerPeerId).toBe("envoy_agent_bob");
    expect(subtasks[1]!.preferredWorkerPeerId).toBe("envoy_agent_bob");
  });

  it("pickStallReassignWorker prefers same-thread sticky peer", () => {
    const state = createChainState(mandate("chain_stall"));
    putSubtask(state, {
      subtaskId: "subtask_a",
      threadId: "coding",
      preferredWorkerPeerId: "envoy_agent_bob",
      requiredRole: "programmer",
    });
    putSubtask(state, {
      subtaskId: "subtask_b",
      threadId: "coding",
      preferredWorkerPeerId: "envoy_agent_bob",
      requiredRole: "programmer",
    });
    state.workersBySubtask.set("subtask_b", [
      "envoy_agent_carol",
      "envoy_agent_bob",
      "envoy_agent_dave",
    ]);
    const next = pickStallReassignWorker(state, "subtask_b", "envoy_agent_carol");
    expect(next).toBe("envoy_agent_bob");
  });

  it("pickStallReassignWorker prefers same requiredRole preferred peer", () => {
    const state = createChainState(mandate("chain_role_stall"));
    putSubtask(state, {
      subtaskId: "subtask_a",
      requiredRole: "tester",
      preferredWorkerPeerId: "envoy_agent_qa",
    });
    putSubtask(state, {
      subtaskId: "subtask_b",
      requiredRole: "tester",
      preferredWorkerPeerId: "envoy_agent_other",
    });
    state.workersBySubtask.set("subtask_b", ["envoy_agent_other", "envoy_agent_qa", "envoy_agent_x"]);
    const next = pickStallReassignWorker(state, "subtask_b", "envoy_agent_other");
    expect(next).toBe("envoy_agent_qa");
  });
});
