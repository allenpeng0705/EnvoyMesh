/**
 * E2E Phase 18 — multi-node scenarios for `runOwnerAgentTurn` (2–3 node meshes).
 * Uses configured MiniMax (openai-compatible) from .env or node-config.json — not mock.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { signUnsignedEnvelope, verifyInboundEnvelope } from "@envoymesh/identity";
import {
  createTaskNegotiatePayload,
  createUnsignedEnvelope,
  parseTaskProposePayload,
} from "@envoymesh/protocol";
import { createTaskDispatcher } from "@envoymesh/api";
import { afterEach, describe, expect, it } from "vitest";
import type { BridgeIdentity } from "../src/bridge/pipe.js";
import {
  cleanupPhase13Node,
  connectPhase13Peers,
  createPhase13TestNode,
  ensureBridgeIdentity,
  ensureSocialProxyBridgeIdentity,
  registerBondedPeer,
  waitForPhase13,
  wireDiscoveryAndShareForAcquisition,
  wireFullDaemonAgentCardHandlers,
  wireFullDaemonTaskInboundHandler,
  wireInboundKnowledgeQueryReply,
  wireNodeServiceInboundHandlers,
  wirePhase13AcquisitionCluster,
  type Phase13TestNode,
} from "./phase13-e2e-harness.js";
import {
  getPhase18ModelProviders,
  isPhase18LiveModelConfigured,
  phase18MinimaxSkipMessage,
} from "./phase18-minimax-config.js";

const nodes: Phase13TestNode[] = [];

afterEach(async () => {
  await Promise.all(nodes.splice(0).map((n) => cleanupPhase13Node(n)));
});

function wireBobTaskResponder(bob: Phase13TestNode, bobBridge: BridgeIdentity): void {
  const dispatcher = createTaskDispatcher();
  bob.mesh.onMessage(async ({ envelope, remotePeerId }) => {
    if (!verifyInboundEnvelope(envelope)) return;
    if (envelope.intent === "agent.card.request" || envelope.intent === "agent.card.response") return;
    const decision = await dispatcher.dispatch(envelope);
    if (decision.action !== "handled" || decision.intent !== "task.propose") return;
    const propose = parseTaskProposePayload(envelope.payload);
    const negotiate = signUnsignedEnvelope(
      createUnsignedEnvelope({
        senderPeerId: bobBridge.agentPeerId,
        senderPublicKey: bobBridge.agentPublicKeyPem,
        senderRole: "agent",
        recipientPeerId: envelope.senderPeerId,
        recipientRole: "agent",
        intent: "task.negotiate",
        payload: createTaskNegotiatePayload({
          taskId: propose.taskId,
          mandateId: propose.mandateId,
          proofOfIntent: propose.proofOfIntent,
          negotiationId: "neg-phase18-multinode",
          message: "ok",
        }),
        correlationId: envelope.correlationId,
        agentCredential: bobBridge.agentCredential,
      }),
      bobBridge.agentPrivateKeyPem,
    );
    await bob.mesh.send(remotePeerId, negotiate);
  });
}

async function runAcquisitionToCompletion(
  alice: Phase13TestNode,
  jobId: string,
  timeoutMs = 30_000,
): Promise<void> {
  await waitForPhase13(async () => {
    const job = await alice.service.getDocumentAcquisitionJob(jobId);
    if (job?.stage === "completed") return true;
    await alice.service.runDocumentAcquisitionWorker();
    return false;
  }, timeoutMs);
}

async function runCapabilityJobToCompletion(
  alice: Phase13TestNode,
  jobId: string,
  timeoutMs = 30_000,
): Promise<void> {
  await waitForPhase13(async () => {
    const job = await alice.service.getCapabilityProviderJob(jobId);
    if (job?.stage === "completed") return true;
    if (job?.stage === "failed") {
      throw new Error(`capability job failed: ${job.error ?? "unknown"}`);
    }
    await alice.service.runCapabilityProviderWorker();
    return false;
  }, timeoutMs);
}

describe.sequential.skipIf(!isPhase18LiveModelConfigured())(
  `E2E Phase 18 multi-node owner agent (${phase18MinimaxSkipMessage()})`,
  () => {
    const modelProviders = getPhase18ModelProviders();

  it("two-node: Assistant turn starts acquisition and completes with peer file in vault inbox", async () => {
    const alice = await createPhase13TestNode();
    const bob = await createPhase13TestNode();
    nodes.push(alice, bob);

    await wirePhase13AcquisitionCluster(alice, [{ node: bob, displayName: "Bob" }]);
    wireNodeServiceInboundHandlers(alice);

    const content = "phase18 multinode acquisition payload\n";
    await mkdir(join(bob.vaultDir, "shared"), { recursive: true });
    await writeFile(join(bob.vaultDir, "shared/golden-checklist.txt"), content, { mode: 0o600 });
    await bob.service.runDocumentAgentTurn('publish "shared/golden-checklist.txt"');

    await alice.service.updateNodeConfig({
      documentAcquisitionEnabled: true,
      modelProviders,
    });
    await connectPhase13Peers(alice, bob);

    const turn = await alice.service.runOwnerAgentTurn(
      "acquire golden checklist pdf document from library",
    );
    expect(turn.jobId).toBeDefined();
    expect(turn.domain).toBe("document");

    await runAcquisitionToCompletion(alice, turn.jobId!);

    const job = await alice.service.getDocumentAcquisitionJob(turn.jobId!);
    expect(job?.stage).toBe("completed");
    expect(job?.resultVaultPath).toMatch(/^inbox\//);
    expect(await readFile(join(alice.vaultDir, job!.resultVaultPath!), "utf8")).toBe(content);
  }, 120_000);

  it("three-node: acquisition completes from correct publisher among two bonded peers", async () => {
    const alice = await createPhase13TestNode();
    const bob = await createPhase13TestNode();
    const carol = await createPhase13TestNode();
    nodes.push(alice, bob, carol);

    await wirePhase13AcquisitionCluster(alice, [
      { node: bob, displayName: "Bob" },
      { node: carol, displayName: "Carol" },
    ]);
    wireNodeServiceInboundHandlers(alice);

    const targetContent = "golden checklist three-node target\n";
    const decoyContent = "unrelated decoy file\n";
    await mkdir(join(bob.vaultDir, "shared"), { recursive: true });
    await mkdir(join(carol.vaultDir, "shared"), { recursive: true });
    await writeFile(join(bob.vaultDir, "shared/golden-checklist.txt"), targetContent, { mode: 0o600 });
    await writeFile(join(carol.vaultDir, "shared/decoy-report.txt"), decoyContent, { mode: 0o600 });
    await bob.service.runDocumentAgentTurn('publish "shared/golden-checklist.txt"');
    await carol.service.runDocumentAgentTurn('publish "shared/decoy-report.txt"');

    await alice.service.updateNodeConfig({
      documentAcquisitionEnabled: true,
      modelProviders,
    });
    await connectPhase13Peers(alice, bob, carol);

    const turn = await alice.service.runOwnerAgentTurn(
      "find the golden checklist document on the mesh",
    );
    expect(turn.jobId).toBeDefined();

    await runAcquisitionToCompletion(alice, turn.jobId!);

    const job = await alice.service.getDocumentAcquisitionJob(turn.jobId!);
    expect(job?.stage).toBe("completed");
    expect(await readFile(join(alice.vaultDir, job!.resultVaultPath!), "utf8")).toBe(targetContent);
  }, 120_000);

  it("two-node: capability provider job from Assistant turn completes discover step", async () => {
    const alice = await createPhase13TestNode();
    const bob = await createPhase13TestNode();
    nodes.push(alice, bob);

    await registerBondedPeer(alice, bob, "Bob");
    await registerBondedPeer(bob, alice, "Alice");
    wireDiscoveryAndShareForAcquisition(bob, alice);
    wireNodeServiceInboundHandlers(alice);

    await mkdir(join(bob.vaultDir, "shared"), { recursive: true });
    await writeFile(join(bob.vaultDir, "shared/rust-guide.txt"), "rust guide\n", { mode: 0o600 });
    await bob.service.runDocumentAgentTurn('publish "shared/rust-guide.txt"');
    await wireInboundKnowledgeQueryReply(bob, modelProviders);

    await alice.service.updateNodeConfig({
      capabilityProviderEnabled: true,
      modelProviders,
    });
    await connectPhase13Peers(alice, bob);

    const turn = await alice.service.runOwnerAgentTurn(
      "negotiate service task with peer for rust deployment help",
    );
    expect(turn.jobId).toBeDefined();
    expect(turn.domain).toBe("service");

    await runCapabilityJobToCompletion(alice, turn.jobId!);

    const job = await alice.service.getCapabilityProviderJob(turn.jobId!);
    expect(job?.stage).toBe("completed");
    expect(job?.stepResults.some((s) => s.toolName === "mesh.library_discover" && s.ok)).toBe(true);
  }, 120_000);

  it("three-node: bonded task.propose reaches intended peer on full mesh", async () => {
    const alice = await createPhase13TestNode();
    const bob = await createPhase13TestNode();
    const carol = await createPhase13TestNode();
    nodes.push(alice, bob, carol);

    await registerBondedPeer(alice, bob, "Bob");
    await registerBondedPeer(alice, carol, "Carol");
    await registerBondedPeer(bob, alice, "Alice");
    await registerBondedPeer(carol, alice, "Alice");

    const bobBridge = await ensureBridgeIdentity(bob);
    const carolBridge = await ensureBridgeIdentity(carol);
    wireFullDaemonTaskInboundHandler(bob);
    wireFullDaemonTaskInboundHandler(carol);
    wireNodeServiceInboundHandlers(alice);

    await connectPhase13Peers(alice, bob, carol);
    await alice.service.updateNodeConfig({ modelProviders });

    const turn = await alice.service.runOwnerAgentTurn("ask Bob to audit the multinode contract");
    expect(turn.domain).toBe("service");
    expect(turn.toolsUsed).toContain("mesh.task.propose");
    expect(turn.answer).toMatch(/Bob|task\.propose|Task ID/i);
    expect(turn.answer).not.toMatch(/Carol/i);
  }, 120_000);

  it("two-node: discover published library via Assistant document command", async () => {
    const alice = await createPhase13TestNode();
    const bob = await createPhase13TestNode();
    nodes.push(alice, bob);

    await wirePhase13AcquisitionCluster(alice, [{ node: bob, displayName: "Bob" }]);
    wireNodeServiceInboundHandlers(alice);

    await mkdir(join(bob.vaultDir, "shared"), { recursive: true });
    await writeFile(join(bob.vaultDir, "shared/mesh-catalog.txt"), "mesh catalog\n", { mode: 0o600 });
    await bob.service.runDocumentAgentTurn('publish "shared/mesh-catalog.txt"');

    await connectPhase13Peers(alice, bob);

    await alice.service.updateNodeConfig({ modelProviders });

    const turn = await alice.service.runOwnerAgentTurn("discover mesh-catalog on contacts");
    expect(turn.intent).toBe("discover");
    expect(turn.toolsUsed).toContain("mesh.library_discover");
    expect(turn.answer).toMatch(/mesh-catalog|Bob/i);
  }, 60_000);

  it("three-node: sequential Assistant turns exercise document, capability, and social postures", async () => {
    const alice = await createPhase13TestNode();
    const bob = await createPhase13TestNode();
    const carol = await createPhase13TestNode();
    nodes.push(alice, bob, carol);

    await wirePhase13AcquisitionCluster(alice, [
      { node: bob, displayName: "Bob" },
      { node: carol, displayName: "Carol" },
    ]);
    await registerBondedPeer(bob, alice, "Alice");
    await registerBondedPeer(carol, alice, "Alice");

    const bobBridge = await ensureBridgeIdentity(bob);
    const bobAgent = await ensureSocialProxyBridgeIdentity(bob);
    wireFullDaemonAgentCardHandlers(bob, bobBridge);
    wireBobTaskResponder(bob, bobBridge);
    wireNodeServiceInboundHandlers(alice);
    wireNodeServiceInboundHandlers(bob);

    const docContent = "phase18 combined posture doc\n";
    await mkdir(join(bob.vaultDir, "shared"), { recursive: true });
    await writeFile(join(bob.vaultDir, "shared/combined-posture.txt"), docContent, { mode: 0o600 });
    await bob.service.runDocumentAgentTurn('publish "shared/combined-posture.txt"');

    await alice.service.updateNodeConfig({
      documentAcquisitionEnabled: true,
      capabilityProviderEnabled: true,
      socialProxyEnabled: true,
      trustModeEnabled: true,
      modelProviders,
    });
    await connectPhase13Peers(alice, bob, carol);

    const docTurn = await alice.service.runOwnerAgentTurn(
      "acquire combined posture pdf document from library",
    );
    expect(docTurn.jobId).toBeDefined();
    await runAcquisitionToCompletion(alice, docTurn.jobId!);
    const docJob = await alice.service.getDocumentAcquisitionJob(docTurn.jobId!);
    expect(docJob?.stage).toBe("completed");

    await wireInboundKnowledgeQueryReply(bob, modelProviders);

    const capTurn = await alice.service.runOwnerAgentTurn(
      "negotiate service task with peer for combined posture route",
    );
    expect(capTurn.jobId).toBeDefined();
    await runCapabilityJobToCompletion(alice, capTurn.jobId!);
    const capJob = await alice.service.getCapabilityProviderJob(capTurn.jobId!);
    expect(capJob?.stage).toBe("completed");

    const socialTurn = await alice.service.runOwnerAgentTurn(
      "help me find friends interested in hiking",
    );
    expect(socialTurn.domain).toBe("social");
    expect(socialTurn.toolsUsed).toContain("runSocialProxyPass");

    const targetedPass = await alice.service.runSocialProxyPass({
      targetOwnerId: bob.profile.owner.ownerId,
      targetPeerId: bob.mesh.peerId,
      targetAgentPeerId: bobAgent.agentPeerId,
    });
    expect(targetedPass.ok).toBe(true);
    const sessions = await alice.service.listSocialProxySessions();
    expect(sessions.some((s) => s.candidateOwnerId === bob.profile.owner.ownerId)).toBe(true);
  }, 180_000);
  },
);
