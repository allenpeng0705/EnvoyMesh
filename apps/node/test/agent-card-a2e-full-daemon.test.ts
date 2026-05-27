/**
 * Full-daemon E2E: agent.card + task loop via extracted daemon handlers and NodeServiceImpl.requestAgentCard.
 */
import { createTaskDispatcher } from "@envoymesh/api";
import {
  signUnsignedEnvelope,
  verifyInboundEnvelope,
} from "@envoymesh/identity";
import {
  createTaskAcceptPayload,
  createTaskMandatePayload,
  createTaskNegotiatePayload,
  createTaskProposePayload,
  createTaskResultPayload,
  createUnsignedEnvelope,
  parseTaskAcceptPayload,
  parseTaskProposePayload,
  type ProofOfIntent,
} from "@envoymesh/protocol";
import { afterEach, describe, expect, it } from "vitest";
import {
  cleanupPhase13Harness,
  createPhase13TestNode,
  ensureBridgeIdentity,
  registerBondedPeer,
  waitForPhase13,
  wireFullDaemonTaskInboundHandler,
  wireFullDaemonAgentCardHandlers,
} from "./phase13-e2e-harness.js";
import type { Phase13TestNode } from "./phase13-e2e-harness.js";
import type { BridgeIdentity } from "../src/bridge/pipe.js";

afterEach(async () => {
  await cleanupPhase13Harness();
});

function proofOfIntent(node: Phase13TestNode, taskId: string, mandateId: string): ProofOfIntent {
  return {
    version: "0.1",
    mandateId,
    mandateHash: "hash-daemon-e2e",
    taskId,
    requestIntent: "task.propose",
    nonce: "nonce-daemon-e2e",
    deviceId: node.profile.device.deviceId,
    proof: "test-signature",
  };
}

function wireBobTaskResponder(bob: Phase13TestNode, bobBridge: BridgeIdentity, allIntents: string[]): void {
  const bobDispatcher = createTaskDispatcher();

  bob.mesh.onMessage(async ({ envelope, remotePeerId }) => {
    if (!verifyInboundEnvelope(envelope)) return;
    if (envelope.intent === "agent.card.request" || envelope.intent === "agent.card.response") {
      return;
    }
    allIntents.push(envelope.intent);

    const taskDecision = await bobDispatcher.dispatch(envelope);
    if (taskDecision.action !== "handled") return;

    if (taskDecision.intent === "task.propose") {
      const propose = parseTaskProposePayload(envelope.payload);
      const negotiatePayload = createTaskNegotiatePayload({
        taskId: propose.taskId,
        mandateId: propose.mandateId,
        proofOfIntent: propose.proofOfIntent,
        negotiationId: "neg-daemon-e2e",
        message: "Ready to execute",
      });
      const unsignedNegotiate = createUnsignedEnvelope({
        senderPeerId: bobBridge.agentPeerId,
        senderPublicKey: bobBridge.agentPublicKeyPem,
        senderRole: "agent",
        recipientPeerId: envelope.senderPeerId,
        recipientRole: "agent",
        intent: "task.negotiate",
        payload: negotiatePayload,
        correlationId: envelope.correlationId,
        agentCredential: bobBridge.agentCredential,
      });
      await bob.mesh.send(remotePeerId, signUnsignedEnvelope(unsignedNegotiate, bobBridge.agentPrivateKeyPem));
      return;
    }

    if (taskDecision.intent === "task.accept") {
      const accept = parseTaskAcceptPayload(envelope.payload);
      const resultPayload = createTaskResultPayload({
        taskId: accept.taskId,
        mandateId: accept.mandateId,
        status: "completed",
        summary: "Structured work completed without chat.message",
      });
      const unsignedResult = createUnsignedEnvelope({
        senderPeerId: bobBridge.agentPeerId,
        senderPublicKey: bobBridge.agentPublicKeyPem,
        senderRole: "agent",
        recipientPeerId: envelope.senderPeerId,
        recipientRole: "agent",
        intent: "task.result",
        payload: resultPayload,
        correlationId: envelope.correlationId,
        agentCredential: bobBridge.agentCredential,
      });
      await bob.mesh.send(remotePeerId, signUnsignedEnvelope(unsignedResult, bobBridge.agentPrivateKeyPem));
    }
  });
}

describe("E2E agent.card + task via full daemon handlers (Phase 13C)", () => {
  it("requestAgentCard then task.propose → task.result without chat.message", async () => {
    const alice = await createPhase13TestNode();
    const bob = await createPhase13TestNode();
    await registerBondedPeer(alice, bob, "Bob");
    await registerBondedPeer(bob, alice, "Alice");

    const aliceBridge = await ensureBridgeIdentity(alice);
    const bobBridge = await ensureBridgeIdentity(bob);
    wireFullDaemonAgentCardHandlers(alice, aliceBridge);
    wireFullDaemonAgentCardHandlers(bob, bobBridge);
    wireFullDaemonTaskInboundHandler(alice);
    wireFullDaemonTaskInboundHandler(bob);

    const allIntents: string[] = [];
    wireBobTaskResponder(bob, bobBridge, allIntents);

    alice.mesh.onMessage(async ({ envelope }) => {
      if (!verifyInboundEnvelope(envelope)) return;
      allIntents.push(envelope.intent);
    });

    await alice.mesh.probePeer(bob.mesh.multiaddrs[0]!);
    await bob.mesh.probePeer(alice.mesh.multiaddrs[0]!);

    const requested = await alice.service.requestAgentCard(bob.profile.owner.ownerId);
    expect(requested.ok).toBe(true);

    await waitForPhase13(async () => {
      const cards = await alice.service.listAgentCards();
      return cards.some((row) => row.ownerId === bob.profile.owner.ownerId);
    }, 8000);

    const taskId = "task-daemon-e2e-1";
    const mandateId = "mandate-daemon-e2e-1";
    const correlationId = "corr-daemon-e2e-1";

    const mandatePayload = createTaskMandatePayload({
      mandateId,
      ownerOwnerId: alice.profile.owner.ownerId,
      ownerDeviceId: alice.profile.device.deviceId,
      maxSensitivity: "friends",
      maxCost: { limit: 100, unit: "calls" },
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      closeOnFirstCompletedResult: true,
    });
    await alice.mesh.send(
      bob.mesh.multiaddrs[0]!,
      signUnsignedEnvelope(
        createUnsignedEnvelope({
          senderPeerId: aliceBridge.agentPeerId,
          senderPublicKey: aliceBridge.agentPublicKeyPem,
          senderRole: "agent",
          recipientPeerId: bob.mesh.peerId,
          recipientRole: "agent",
          intent: "task.mandate",
          payload: mandatePayload,
          correlationId,
          agentCredential: aliceBridge.agentCredential,
        }),
        aliceBridge.agentPrivateKeyPem,
      ),
    );

    const proposePayload = createTaskProposePayload({
      taskId,
      mandateId,
      proofOfIntent: proofOfIntent(alice, taskId, mandateId),
      objective: "Run structured bilateral work",
      requestedResult: "Completion summary",
    });
    await alice.mesh.send(
      bob.mesh.multiaddrs[0]!,
      signUnsignedEnvelope(
        createUnsignedEnvelope({
          senderPeerId: aliceBridge.agentPeerId,
          senderPublicKey: aliceBridge.agentPublicKeyPem,
          senderRole: "agent",
          recipientPeerId: bob.mesh.peerId,
          recipientRole: "agent",
          intent: "task.propose",
          payload: proposePayload,
          correlationId,
          agentCredential: aliceBridge.agentCredential,
        }),
        aliceBridge.agentPrivateKeyPem,
      ),
    );

    await waitForPhase13(async () => allIntents.includes("task.negotiate"), 8000);

    const acceptPayload = createTaskAcceptPayload({
      taskId,
      mandateId,
      agreementSummary: "Accepted negotiated terms",
    });
    await alice.mesh.send(
      bob.mesh.multiaddrs[0]!,
      signUnsignedEnvelope(
        createUnsignedEnvelope({
          senderPeerId: aliceBridge.agentPeerId,
          senderPublicKey: aliceBridge.agentPublicKeyPem,
          senderRole: "agent",
          recipientPeerId: bob.mesh.peerId,
          recipientRole: "agent",
          intent: "task.accept",
          payload: acceptPayload,
          correlationId,
          agentCredential: aliceBridge.agentCredential,
        }),
        aliceBridge.agentPrivateKeyPem,
      ),
    );

    await waitForPhase13(async () => allIntents.includes("task.result"), 8000);

    expect(allIntents.filter((intent) => intent === "chat.message")).toHaveLength(0);
    expect(allIntents).toContain("agent.card.response");
    expect(allIntents).toContain("task.propose");
    expect(allIntents).toContain("task.result");

    const bobJournal = await bob.taskStore.readTaskJournalEntries();
    expect(bobJournal.some((entry) => entry.taskId === taskId && entry.eventType === "proposed")).toBe(true);

    const aliceActivity = await alice.service.listAgentActivity({ limit: 20 });
    expect(aliceActivity.some((row) => row.taskId === taskId)).toBe(true);
  });
});
