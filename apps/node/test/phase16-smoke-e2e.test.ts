/**
 * Combined Phase 16 smoke: all three EnvoyAI postures on one bonded pair.
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
  createPhase13TestNode,
  ensureBridgeIdentity,
  ensureSocialProxyBridgeIdentity,
  registerBondedPeer,
  waitForPhase13,
  wireDiscoveryAndShareForAcquisition,
  wireFullDaemonAgentCardHandlers,
  wireInboundKnowledgeQueryReply,
  wireNodeServiceInboundHandlers,
  type Phase13TestNode,
} from "./phase13-e2e-harness.js";

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
          negotiationId: "neg-phase16-smoke",
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

describe.sequential("E2E Phase 16 combined smoke", () => {
  it("document acquisition + capability provider + social proxy on one mesh pair", async () => {
    const alice = await createPhase13TestNode();
    const bob = await createPhase13TestNode();
    nodes.push(alice, bob);

    const bobAgent = await ensureSocialProxyBridgeIdentity(bob);
    const bobBridge = await ensureBridgeIdentity(bob);

    await registerBondedPeer(alice, bob, "Bob");
    await registerBondedPeer(bob, alice, "Alice");
    wireDiscoveryAndShareForAcquisition(bob, alice);
    wireFullDaemonAgentCardHandlers(bob, bobBridge);
    wireBobTaskResponder(bob, bobBridge);
    wireNodeServiceInboundHandlers(alice);
    wireNodeServiceInboundHandlers(bob);

    const docPath = "shared/phase16-smoke.txt";
    const docContent = "phase 16 combined smoke document payload\n";
    await mkdir(join(bob.vaultDir, "shared"), { recursive: true });
    await writeFile(join(bob.vaultDir, docPath), docContent, { mode: 0o600 });
    await bob.service.runDocumentAgentTurn(`publish "${docPath}"`);

    await alice.service.updateNodeConfig({
      documentAcquisitionEnabled: true,
      capabilityProviderEnabled: true,
      socialProxyEnabled: true,
      trustModeEnabled: true,
      modelProviders: { mode: "mock" },
    });

    await alice.mesh.probePeer(bob.mesh.multiaddrs[0]!);
    await bob.mesh.probePeer(alice.mesh.multiaddrs[0]!);

    // 16C — document acquisition (catalog fast path)
    const docJob = await alice.service.startDocumentAcquisitionJob({
      query: "phase16 smoke",
      fileTitleHint: "phase16-smoke",
    });
    await waitForPhase13(async () => {
      const job = await alice.service.getDocumentAcquisitionJob(docJob.jobId);
      if (job?.stage === "completed") return true;
      await alice.service.runDocumentAcquisitionWorker();
      return false;
    }, 30_000);
    const docResult = await alice.service.getDocumentAcquisitionJob(docJob.jobId);
    expect(docResult?.stage).toBe("completed");
    expect(await readFile(join(alice.vaultDir, docResult!.resultVaultPath!), "utf8")).toBe(docContent);

    wireInboundKnowledgeQueryReply(bob);

    // 16E — capability provider
    const capJob = await alice.service.startCapabilityProviderJob({
      goal: "phase16 smoke capability route",
      capabilityIds: ["envoymesh.published-library"],
      targetOwnerId: bob.profile.owner.ownerId,
    });
    await waitForPhase13(async () => {
      const job = await alice.service.getCapabilityProviderJob(capJob.jobId);
      if (job?.stage === "completed") return true;
      if (job?.stage === "failed") throw new Error(`capability job failed: ${job.failureReason}`);
      await alice.service.runCapabilityProviderWorker();
      return false;
    }, 30_000);
    const capResult = await alice.service.getCapabilityProviderJob(capJob.jobId);
    expect(capResult?.stage).toBe("completed");

    // 16B — social proxy (session start; full bond flow covered in social-proxy-flow-e2e)
    const proxyPass = await alice.service.runSocialProxyPass({
      targetOwnerId: bob.profile.owner.ownerId,
      targetPeerId: bob.mesh.peerId,
      targetAgentPeerId: bobAgent.agentPeerId,
    });
    expect(proxyPass.ok).toBe(true);
    const sessions = await alice.service.listSocialProxySessions();
    expect(sessions.some((s) => s.candidateOwnerId === bob.profile.owner.ownerId)).toBe(true);
  }, 60_000);
});
