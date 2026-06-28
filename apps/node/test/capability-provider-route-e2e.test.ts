/**
 * E2E: capability provider route executor — in-process jobs, no bridge/RPC.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createTaskDispatcher } from "@envoymesh/api";
import { signUnsignedEnvelope, verifyInboundEnvelope } from "@envoymesh/identity";
import {
  createTaskNegotiatePayload,
  createUnsignedEnvelope,
  parseTaskProposePayload,
} from "@envoymesh/protocol";
import { afterEach, describe, expect, it } from "vitest";
import type { BridgeIdentity } from "../src/bridge/pipe.js";
import {
  cleanupPhase13Node,
  createPhase13TestNode,
  ensureBridgeIdentity,
  registerBondedPeer,
  waitForPhase13,
  wireDiscoveryAndShareForAcquisition,
  wireFullDaemonAgentCardHandlers,
  wireFullDaemonTaskInboundHandler,
  wireInboundKnowledgeQueryReply,
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
    if (envelope.intent === "agent.card.request" || envelope.intent === "agent.card.response") {
      return;
    }
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
          negotiationId: "neg-cap-e2e",
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

describe.sequential("E2E capability provider route executor", () => {
  it("completes document library route with discover step", async () => {
    const alice = await createPhase13TestNode();
    const bob = await createPhase13TestNode();
    nodes.push(alice, bob);
    await registerBondedPeer(alice, bob, "Bob");
    await registerBondedPeer(bob, alice, "Alice");
    wireDiscoveryAndShareForAcquisition(bob, alice);

    await mkdir(join(bob.vaultDir, "shared"), { recursive: true });
    await writeFile(join(bob.vaultDir, "shared/cap-route.txt"), "cap route payload\n", { mode: 0o600 });
    const publishTurn = await bob.service.runDocumentAgentTurn('publish "shared/cap-route.txt"');
    expect(publishTurn.toolsUsed).toContain("mesh.library_publish");
    await wireInboundKnowledgeQueryReply(bob);

    await alice.service.updateNodeConfig({
      capabilityProviderEnabled: true,
      modelProviders: { mode: "mock" },
    });
    await alice.mesh.dial(bob.mesh.multiaddrs[0]!);
    await bob.mesh.dial(alice.mesh.multiaddrs[0]!);

    const started = await alice.service.startCapabilityProviderJob({
      goal: "cap route catalog file",
      capabilityIds: ["envoymesh.published-library"],
      targetOwnerId: bob.profile.owner.ownerId,
    });

    await waitForPhase13(async () => {
      const job = await alice.service.getCapabilityProviderJob(started.jobId);
      if (job?.stage === "completed") return true;
      if (job?.stage === "failed") {
        throw new Error(
          `capability provider failed: ${job.error ?? "unknown"}; steps=${JSON.stringify(job.stepResults)}`,
        );
      }
      await alice.service.runCapabilityProviderWorker();
      return false;
    }, 30_000);

    const job = await alice.service.getCapabilityProviderJob(started.jobId);
    expect(job?.stage).toBe("completed");
    expect(job?.agentRouteId).toBe("document.published-library");
    expect(job?.stepResults.some((s) => s.toolName === "mesh.library_discover" && s.ok)).toBe(true);
  });

  it("completes task route with agent card + task.propose steps", async () => {
    const alice = await createPhase13TestNode();
    const bob = await createPhase13TestNode();
    nodes.push(alice, bob);
    await registerBondedPeer(alice, bob, "Bob");
    await registerBondedPeer(bob, alice, "Alice");
    wireDiscoveryAndShareForAcquisition(bob, alice);

    const aliceBridge = await ensureBridgeIdentity(alice);
    const bobBridge = await ensureBridgeIdentity(bob);
    wireFullDaemonAgentCardHandlers(alice, aliceBridge);
    wireFullDaemonAgentCardHandlers(bob, bobBridge);
    wireFullDaemonTaskInboundHandler(alice);
    wireBobTaskResponder(bob, bobBridge);

    await alice.service.updateNodeConfig({
      capabilityProviderEnabled: true,
      modelProviders: { mode: "mock" },
    });
    await alice.mesh.dial(bob.mesh.multiaddrs[0]!);
    await bob.mesh.dial(alice.mesh.multiaddrs[0]!);

    const started = await alice.service.startCapabilityProviderJob({
      goal: "delegate a task to another agent",
      targetOwnerId: bob.profile.owner.ownerId,
    });

    await waitForPhase13(async () => {
      const job = await alice.service.getCapabilityProviderJob(started.jobId);
      if (job?.stage === "completed") return true;
      if (job?.stage === "failed") {
        throw new Error(
          `capability provider failed: ${job.error ?? "unknown"}; steps=${JSON.stringify(job.stepResults)}`,
        );
      }
      await alice.service.runCapabilityProviderWorker();
      return false;
    }, 30_000);

    const job = await alice.service.getCapabilityProviderJob(started.jobId);
    expect(job?.stage).toBe("completed");
    expect(job?.agentRouteId).toBe("service.task-negotiation");
    expect(job?.stepResults.some((s) => s.toolName === "mesh.agent_card.request" && s.ok)).toBe(true);
    expect(job?.stepResults.some((s) => s.toolName === "mesh.task.propose" && s.ok)).toBe(true);
  });
});
