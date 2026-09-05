/**
 * Phase 65C exit — intermediate artifact handoff across ≥2 homes.
 *
 * 1. Parent on Assigner → live `out/` persist (before terminal GC).
 * 2. Voucher-push staged blob to worker `in/` (Phase 59E data path).
 * 3. Job publishes; provenance `artifactGraph` shows parent→child edge.
 *
 * Note: Phase 59E GC deletes `imports/team-jobs/<chainId>/` on publish, so
 * the cross-home voucher must run while the staged file still exists (or
 * from retained `inlineText` on the ledger).
 *
 * Gated: RUN_E2E=1
 *   RUN_E2E=1 npx vitest run apps/node/test/chain-intermediate-artifact-two-home-e2e.test.ts
 */

import { afterEach, describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { chainArtifactDeliveredRelativePath } from "@envoymesh/api";

import {
  cleanupPhase13Harness,
  cleanupPhase13Node,
  createPhase13TestNode,
  waitForPhase13,
  wireMockTeamJobEngine,
  type Phase13TestNode,
} from "./phase13-e2e-harness.js";
import {
  bondAndExchangeCards,
  enableAgentNetworkWorker,
  wireHomeAsChainParticipant,
} from "./chain-plan-assign-e2e-helpers.js";
import { installEnvoyDataTransferReceiver } from "../src/data-transfer-inbound.js";
import { sendVaultFileViaDataTransfer } from "../src/node-file-share.js";

const nodes: Phase13TestNode[] = [];

function installDataTransferReceiver(node: Phase13TestNode): void {
  installEnvoyDataTransferReceiver({
    mesh: node.mesh,
    peerDirectoryStore: node.peerDirectory,
    taskStore: node.taskStore,
    vaultDir: node.vaultDir,
    resolveInboundRelativePath: (remotePeerId, voucherRelativePath) =>
      node.service.resolveInboundDataTransferRelativePath(remotePeerId, voucherRelativePath),
    onInboundVaultWriteCommitted: (remotePeerId, voucherSourceRelativePath) =>
      node.service.consumeInboundDataTransferSaveMapping(remotePeerId, voucherSourceRelativePath),
    onInboundTransferVerified: (input) => node.service.notifyInboundTransferVerified(input),
  });
}

afterEach(async () => {
  await Promise.all(nodes.splice(0).map((n) => cleanupPhase13Node(n)));
  await cleanupPhase13Harness();
});

describe.sequential("E2E Phase 65C intermediate artifacts two-home", () => {
  it("stages parent final, voucher-delivers out/ across homes, surfaces artifact graph", async () => {
    const orch = await createPhase13TestNode();
    const worker = await createPhase13TestNode();
    nodes.push(orch, worker);

    await wireHomeAsChainParticipant(orch);
    await wireHomeAsChainParticipant(worker);
    installDataTransferReceiver(orch);
    installDataTransferReceiver(worker);
    wireMockTeamJobEngine(orch, "Parent intermediate notes for 65C handoff.");
    wireMockTeamJobEngine(worker, "Child rollup using delivered parent artifact.");

    const orchPeerId = await enableAgentNetworkWorker(orch, {
      displayName: "Orch",
      membership: ["task.execute", "chain.orchestrate", "agent-network-worker"],
      profile: {
        modelFreshness: 5,
        spendPosture: "subscription",
        contextWindow: "128k",
        skills: ["task.execute"],
        throughputTokensPerSec: 20,
      },
    });
    const workerPeerId = await enableAgentNetworkWorker(worker, {
      displayName: "Worker",
      membership: ["task.execute", "research.web", "agent-network-worker"],
      profile: {
        modelFreshness: 9,
        spendPosture: "metered",
        contextWindow: "1M+",
        skills: ["research.web", "task.execute"],
        throughputTokensPerSec: 80,
      },
    });

    await bondAndExchangeCards(orch, worker, "Orch", "Worker");
    await orch.service.refreshAgentNetworkMembershipIndex();
    await orch.service.updateNodeConfig({
      chainDefaults: {
        awardMode: "direct",
        allowLlmDecompose: false,
        rebalancePolicy: "never",
        iterationMaxRounds: 1,
        extendMaxStepsPerRound: 0,
      },
    });

    const parentId = "subtask_65c_parent";
    const childId = "subtask_65c_child";
    const planned = [
      {
        subtaskId: parentId,
        depth: 1,
        requiredSkill: "task.execute",
        objective: "Produce intermediate research notes",
        requestedResult: "notes",
        constraints: [] as string[],
        dependsOn: [] as string[],
        preferredWorkerPeerId: orchPeerId,
        produces: ["result"],
      },
      {
        subtaskId: childId,
        depth: 1,
        requiredSkill: "research.web",
        objective: "Roll up using parent intermediate artifact",
        requestedResult: "summary",
        constraints: [] as string[],
        dependsOn: [parentId],
        preferredWorkerPeerId: workerPeerId,
        expects: [{ key: "result" }],
      },
    ];

    const started = await orch.service.chainStartFromGoal({
      goal: "65C intermediate artifact handoff across two homes",
      allowLlm: false,
      plannedSubtasks: planned,
      maxChainCostUsd: 20,
      costCeilingUsd: 5,
    });
    expect(started.ok).toBe(true);
    if (!started.ok || !started.chainId) return;
    const chainId = started.chainId;

    // Prove live Assigner persist before Phase 59E terminal GC.
    let stagedRel = "";
    let contentHash = "";
    let body = "";
    await waitForPhase13(async () => {
      const state = await orch.service.chainGetState({ chainId });
      const staged = (state.artifactDeliveries ?? []).filter((d) => !d.workerPeerId);
      if (staged.length === 0) return false;
      const rel = staged[0]!.stagedRelativePath;
      try {
        body = await readFile(join(orch.vaultDir, rel), "utf8");
      } catch {
        return false;
      }
      if (body.length === 0) return false;
      stagedRel = rel;
      contentHash = staged[0]!.contentHash;
      return true;
    }, 60_000);

    expect(stagedRel).toContain(`imports/team-jobs/${chainId}/out/`);
    const deliveredRel = chainArtifactDeliveredRelativePath(
      chainId,
      "result",
      contentHash,
      "txt",
    );

    await orch.mesh.probePeer(worker.mesh.multiaddrs[0]!);
    await sendVaultFileViaDataTransfer({
      mesh: orch.mesh,
      profile: orch.profile,
      taskStore: orch.taskStore,
      vaultDir: orch.vaultDir,
      relativePath: stagedRel,
      voucherRelativePath: deliveredRel,
      toPeerId: worker.mesh.multiaddrs[0]!,
    });
    await waitForPhase13(async () => {
      try {
        return (await readFile(join(worker.vaultDir, deliveredRel), "utf8")) === body;
      } catch {
        return false;
      }
    }, 20_000);
    expect(await readFile(join(worker.vaultDir, deliveredRel), "utf8")).toBe(body);

    await waitForPhase13(async () => {
      const report = await orch.service.chainGetReport({ chainId });
      return report.report != null;
    }, 120_000);

    const state = await orch.service.chainGetState({ chainId });
    expect(state.published).toBe(true);
    const staged = (state.artifactDeliveries ?? []).filter((d) => !d.workerPeerId);
    expect(staged.length).toBeGreaterThan(0);
    expect(staged[0]?.inlineText?.length).toBeGreaterThan(0);

    const provenance = await orch.service.chainGetStepProvenance({
      chainId,
      subtaskId: childId,
    });
    expect(provenance.artifactGraph).toBeDefined();
    expect(
      provenance.artifactGraph?.edges.some(
        (e) => e.from.includes(parentId) && e.to.includes(childId),
      ),
    ).toBe(true);
  }, 180_000);
});
