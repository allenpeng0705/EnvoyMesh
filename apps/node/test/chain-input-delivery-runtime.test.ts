import { describe, expect, it, vi } from "vitest";
import { createChainState } from "../src/chain-orchestrator.js";
import {
  attachmentsForAwardedSubtask,
  deliverChainInputsOnAward,
  ensureChainInputManifest,
} from "../src/chain-input-delivery-runtime.js";

const NOW = new Date("2026-08-14T12:00:00.000Z");

function mandate() {
  return {
    version: "0.1" as const,
    chainMandateId: "chainmandate_test-1",
    chainId: "chain_test-1",
    orchestratorOwnerId: "envoy:owner:o",
    orchestratorPeerId: "envoy_agent_o",
    maxChainCostUsd: 10,
    maxSensitivity: "friends" as const,
    expiresAt: new Date(NOW.getTime() + 3600_000).toISOString(),
    createdAt: NOW.toISOString(),
    signature: "sig",
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
    state.subtasks.set("sub_a", {
      version: "0.1",
      subtaskId: "sub_a",
      chainId: "chain_test-1",
      chainMandateId: "chainmandate_test-1",
      depth: 1,
      requiredSkill: "task.execute",
      objective: "Summarize [brief]",
      requestedResult: "r",
      constraints: [],
      dependsOn: [],
      createdAt: NOW.toISOString(),
    });
    expect(attachmentsForAwardedSubtask(state, "sub_a").map((a) => a.label)).toEqual([
      "brief",
    ]);
  });

  it("marks local You worker verified without pushFile", async () => {
    const state = createChainState(mandate() as never, {
      goal: ["G", "", "Attachments:", "- [brief] imports/a/brief.pdf"].join("\n"),
    });
    state.subtasks.set("sub_a", {
      version: "0.1",
      subtaskId: "sub_a",
      chainId: "chain_test-1",
      chainMandateId: "chainmandate_test-1",
      depth: 1,
      requiredSkill: "task.execute",
      objective: "Read [brief]",
      requestedResult: "r",
      constraints: [],
      dependsOn: [],
      createdAt: NOW.toISOString(),
    });
    const pushFile = vi.fn();
    const records = await deliverChainInputsOnAward({
      state,
      subtaskId: "sub_a",
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
    state.subtasks.set("sub_a", {
      version: "0.1",
      subtaskId: "sub_a",
      chainId: "chain_test-1",
      chainMandateId: "chainmandate_test-1",
      depth: 1,
      requiredSkill: "task.execute",
      objective: "Read [brief]",
      requestedResult: "r",
      constraints: [],
      dependsOn: [],
      createdAt: NOW.toISOString(),
    });
    const pushFile = vi.fn().mockResolvedValue({
      contentHash: "abc",
      transferId: "xfer_1",
    });
    const records = await deliverChainInputsOnAward({
      state,
      subtaskId: "sub_a",
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
    state.subtasks.set("sub_a", {
      version: "0.1",
      subtaskId: "sub_a",
      chainId: "chain_test-1",
      chainMandateId: "chainmandate_test-1",
      depth: 1,
      requiredSkill: "task.execute",
      objective: "Read [brief]",
      requestedResult: "r",
      constraints: [],
      dependsOn: [],
      createdAt: NOW.toISOString(),
    });
    const records = await deliverChainInputsOnAward({
      state,
      subtaskId: "sub_a",
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
