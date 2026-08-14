import { beforeAll, describe, expect, it, vi } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import { createChainState, directAwardSubtask, mergeProposeInputArtifacts } from "../src/chain-orchestrator.js";
import type { ChainOrchestratorHandlerDeps } from "../src/chain-orchestrator.js";
import {
  attachmentsForAwardedSubtask,
  buildJobInputFileArtifacts,
  deliverChainInputsOnAward,
  ensureChainInputManifest,
  jobInputsReadyForAward,
} from "../src/chain-input-delivery-runtime.js";

const NOW = new Date("2026-08-14T12:00:00.000Z");

let keyPair: { privateKey: string; publicKey: string };

beforeAll(() => {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  keyPair = {
    privateKey: privateKey.export({ format: "pem", type: "pkcs8" }).toString(),
    publicKey: publicKey.export({ format: "pem", type: "spki" }).toString(),
  };
});

function mandate() {
  return {
    version: "0.1" as const,
    chainMandateId: "chainmandate_test-1",
    chainId: "chain_test-1",
    issuerOwnerId: "envoy:owner:o",
    orchestratorOwnerId: "envoy:owner:o",
    orchestratorPeerId: "envoy_agent_o",
    maxChainCostUsd: 10,
    costCeilingUsd: 3,
    maxWorkers: 3,
    allowDepth3: false,
    maxSensitivity: "friends" as const,
    deadlineAt: new Date(NOW.getTime() + 3600_000).toISOString(),
    expiresAt: new Date(NOW.getTime() + 3600_000).toISOString(),
    createdAt: NOW.toISOString(),
    signature: "sig",
  };
}

function subtaskWithBrief() {
  return {
    version: "0.1" as const,
    subtaskId: "subtask_a",
    chainId: "chain_test-1",
    chainMandateId: "chainmandate_test-1",
    depth: 1,
    requiredSkill: "task.execute",
    objective: "Read [brief]",
    requestedResult: "r",
    constraints: [] as string[],
    dependsOn: [] as string[],
    createdAt: NOW.toISOString(),
  };
}

describe("chain-input-delivery-runtime (Phase 59B)", () => {
  it("parses attachments from goal into ChainState", () => {
    const state = createChainState(mandate() as never, {
      awardMode: "direct",
      goal: [
        "Use the brief",
        "",
        "Attachments:",
        "- [brief] imports/team-jobs/tj_1/brief.pdf",
      ].join("\n"),
    });
    expect(ensureChainInputManifest(state)).toEqual([
      expect.objectContaining({
        sourceRelativePath: "imports/team-jobs/tj_1/brief.pdf",
        label: "brief",
      }),
    ]);
  });

  it("selects referenced attachment for a subtask", () => {
    const state = createChainState(mandate() as never, {
      goal: [
        "Job",
        "",
        "Attachments:",
        "- [brief] imports/a/brief.pdf",
        "- [sales] imports/a/sales.csv",
      ].join("\n"),
    });
    state.subtasks.set("subtask_a", subtaskWithBrief());
    expect(attachmentsForAwardedSubtask(state, "subtask_a").map((a) => a.label)).toEqual([
      "brief",
    ]);
  });

  it("marks local You worker verified without pushFile", async () => {
    const state = createChainState(mandate() as never, {
      goal: ["G", "", "Attachments:", "- [brief] imports/a/brief.pdf"].join("\n"),
    });
    state.subtasks.set("subtask_a", subtaskWithBrief());
    const pushFile = vi.fn();
    const records = await deliverChainInputsOnAward({
      state,
      subtaskId: "subtask_a",
      workerPeerId: "envoy_agent_o",
      orchestratorPeerId: "envoy_agent_o",
      pushFile,
    });
    expect(pushFile).not.toHaveBeenCalled();
    expect(records[0]?.phase).toBe("verified");
    expect(records[0]?.deliveredRelativePath).toBe("imports/a/brief.pdf");
  });

  it("pushes to remote worker and records verified", async () => {
    const state = createChainState(mandate() as never, {
      goal: ["G", "", "Attachments:", "- [brief] imports/a/brief.pdf"].join("\n"),
    });
    state.subtasks.set("subtask_a", subtaskWithBrief());
    const pushFile = vi.fn().mockResolvedValue({
      contentHash: "abc",
      transferId: "xfer_1",
    });
    const records = await deliverChainInputsOnAward({
      state,
      subtaskId: "subtask_a",
      workerPeerId: "envoy_agent_w",
      orchestratorPeerId: "envoy_agent_o",
      transportPeerId: "12D3KooWworker",
      pushFile,
      now: () => NOW,
    });
    expect(pushFile).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceRelativePath: "imports/a/brief.pdf",
        voucherRelativePath: "imports/team-jobs/chain_test-1/in/brief.pdf",
        toPeerId: "12D3KooWworker",
        chainId: "chain_test-1",
      }),
    );
    expect(records[0]?.phase).toBe("verified");
    expect(records[0]?.contentHash).toBe("abc");
    expect(records[0]?.transferId).toBe("xfer_1");
  });

  it("records failed when push throws", async () => {
    const state = createChainState(mandate() as never, {
      goal: ["G", "", "Attachments:", "- [brief] imports/a/brief.pdf"].join("\n"),
    });
    state.subtasks.set("subtask_a", subtaskWithBrief());
    const records = await deliverChainInputsOnAward({
      state,
      subtaskId: "subtask_a",
      workerPeerId: "envoy_agent_w",
      orchestratorPeerId: "envoy_agent_o",
      transportPeerId: "12D3KooWworker",
      pushFile: async () => {
        throw new Error("offline");
      },
    });
    expect(records[0]?.phase).toBe("failed");
    expect(records[0]?.error).toContain("offline");
  });
});

describe("chain-input-delivery-runtime (Phase 59C)", () => {
  it("jobInputsReadyForAward is ok with no attachments", () => {
    const state = createChainState(mandate() as never, { goal: "plain" });
    state.subtasks.set("subtask_a", { ...subtaskWithBrief(), objective: "noop" });
    expect(jobInputsReadyForAward(state, "subtask_a", "w1")).toEqual({ ok: true });
  });

  it("jobInputsReadyForAward pending / failed / verified", async () => {
    const state = createChainState(mandate() as never, {
      goal: ["G", "", "Attachments:", "- [brief] imports/a/brief.pdf"].join("\n"),
    });
    state.subtasks.set("subtask_a", subtaskWithBrief());
    expect(jobInputsReadyForAward(state, "subtask_a", "envoy_agent_w")).toEqual({
      ok: false,
      reason: "input_delivery_pending",
    });

    await deliverChainInputsOnAward({
      state,
      subtaskId: "subtask_a",
      workerPeerId: "envoy_agent_w",
      orchestratorPeerId: "envoy_agent_o",
      transportPeerId: "12D3KooWworker",
      pushFile: async () => {
        throw new Error("offline");
      },
    });
    expect(jobInputsReadyForAward(state, "subtask_a", "envoy_agent_w")).toEqual({
      ok: false,
      reason: "input_delivery_failed",
    });

    const state2 = createChainState(mandate() as never, {
      goal: ["G", "", "Attachments:", "- [brief] imports/a/brief.pdf"].join("\n"),
    });
    state2.subtasks.set("subtask_a", subtaskWithBrief());
    await deliverChainInputsOnAward({
      state: state2,
      subtaskId: "subtask_a",
      workerPeerId: "envoy_agent_w",
      orchestratorPeerId: "envoy_agent_o",
      transportPeerId: "12D3KooWworker",
      pushFile: async () => ({ contentHash: "h1" }),
    });
    expect(jobInputsReadyForAward(state2, "subtask_a", "envoy_agent_w")).toEqual({ ok: true });
  });

  it("buildJobInputFileArtifacts uses worker-local delivered path", async () => {
    const state = createChainState(mandate() as never, {
      goal: ["G", "", "Attachments:", "- [brief] imports/a/brief.pdf"].join("\n"),
    });
    state.subtasks.set("subtask_a", subtaskWithBrief());
    await deliverChainInputsOnAward({
      state,
      subtaskId: "subtask_a",
      workerPeerId: "envoy_agent_w",
      orchestratorPeerId: "envoy_agent_o",
      transportPeerId: "12D3KooWworker",
      pushFile: async () => ({ contentHash: "hash_brief" }),
    });
    expect(buildJobInputFileArtifacts(state, "subtask_a", "envoy_agent_w")).toEqual([
      {
        key: "brief",
        artifact: {
          kind: "file",
          vaultPath: "imports/team-jobs/chain_test-1/in/brief.pdf",
          contentHash: "hash_brief",
          displayName: "brief.pdf",
        },
      },
    ]);
  });

  it("mergeProposeInputArtifacts appends job files after parent packs", () => {
    const parent = [
      { key: "prior", artifact: { kind: "text" as const, content: "hello" } },
    ];
    const state = createChainState(mandate() as never, {
      goal: ["G", "", "Attachments:", "- [brief] imports/a/brief.pdf"].join("\n"),
    });
    state.subtasks.set("subtask_a", subtaskWithBrief());
    state.inputDeliveries = [
      {
        chainId: "chain_test-1",
        workerPeerId: "w",
        sourceRelativePath: "imports/a/brief.pdf",
        deliveredRelativePath: "imports/team-jobs/chain_test-1/in/brief.pdf",
        contentHash: "h",
        phase: "verified",
        updatedAt: NOW.toISOString(),
      },
    ];
    const job = buildJobInputFileArtifacts(state, "subtask_a", "w");
    const merged = mergeProposeInputArtifacts(parent, job as never);
    expect(merged?.map((m) => m.key)).toEqual(["prior", "brief"]);
  });

  it("directAwardSubtask stalls when delivery fails and does not send accept", async () => {
    const sent: unknown[] = [];
    const deps: ChainOrchestratorHandlerDeps = {
      sendEnvelope: async (_peer, _env, payload) => {
        sent.push(payload);
        return true;
      },
      findWorkers: async () => ["envoy_agent_w"],
      signingKeyPem: keyPair.privateKey,
      publicKeyPem: keyPair.publicKey,
      orchestratorPeerId: "envoy_agent_o",
      orchestratorOwnerId: "envoy:owner:o",
      now: () => NOW,
      audit: { record: () => {} },
      storeChainReport: async () => {},
      onAwardAccepted: async (state, subtaskId, workerPeerId) => {
        await deliverChainInputsOnAward({
          state,
          subtaskId,
          workerPeerId,
          orchestratorPeerId: "envoy_agent_o",
          transportPeerId: "12D3KooWworker",
          pushFile: async () => {
            throw new Error("wan_down");
          },
        });
      },
    };
    const state = createChainState(mandate() as never, {
      awardMode: "direct",
      goal: ["G", "", "Attachments:", "- [brief] imports/a/brief.pdf"].join("\n"),
    });
    state.subtasks.set("subtask_a", subtaskWithBrief());
    const result = await directAwardSubtask(deps, state, "subtask_a", "envoy_agent_w");
    expect(result).toEqual({ ok: false, reason: "input_delivery_failed" });
    expect(sent).toEqual([]);
    expect(state.awards.has("subtask_a")).toBe(false);
  });

  it("directAwardSubtask accept carries worker-local file inputArtifacts", async () => {
    const accepts: Array<{ inputArtifacts?: unknown }> = [];
    const deps: ChainOrchestratorHandlerDeps = {
      sendEnvelope: async (_peer, envelope, payload) => {
        if (envelope.intent === "task.chain.accept") {
          accepts.push(payload as { inputArtifacts?: unknown });
        }
        return true;
      },
      findWorkers: async () => ["envoy_agent_w"],
      signingKeyPem: keyPair.privateKey,
      publicKeyPem: keyPair.publicKey,
      orchestratorPeerId: "envoy_agent_o",
      orchestratorOwnerId: "envoy:owner:o",
      now: () => NOW,
      audit: { record: () => {} },
      storeChainReport: async () => {},
      onAwardAccepted: async (state, subtaskId, workerPeerId) => {
        await deliverChainInputsOnAward({
          state,
          subtaskId,
          workerPeerId,
          orchestratorPeerId: "envoy_agent_o",
          transportPeerId: "12D3KooWworker",
          pushFile: async () => ({ contentHash: "delivered_h" }),
        });
      },
    };
    const state = createChainState(mandate() as never, {
      awardMode: "direct",
      goal: ["G", "", "Attachments:", "- [brief] imports/a/brief.pdf"].join("\n"),
    });
    state.subtasks.set("subtask_a", subtaskWithBrief());
    const result = await directAwardSubtask(deps, state, "subtask_a", "envoy_agent_w");
    expect(result.ok).toBe(true);
    expect(accepts[0]?.inputArtifacts).toEqual([
      expect.objectContaining({
        key: "brief",
        artifact: expect.objectContaining({
          kind: "file",
          vaultPath: "imports/team-jobs/chain_test-1/in/brief.pdf",
          contentHash: "delivered_h",
        }),
      }),
    ]);
  });
});
