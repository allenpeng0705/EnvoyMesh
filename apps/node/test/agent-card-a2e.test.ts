/**
 * Two-node E2E: agent.card handshake then task.propose → task.result without chat.message.
 */
import {
  createAgentCardStore,
  createLocalTaskStore,
  createLocalTrustStore,
  type NodeProfile,
} from "@envoymesh/local-store";
import {
  createAgentCredential,
  createDeviceCertificate,
  derivePeerId,
  generateAgentIdentity,
  generateDeviceIdentity,
  generateOwnerIdentity,
  signUnsignedEnvelope,
  verifyInboundEnvelope,
} from "@envoymesh/identity";
import {
  createAgentCardRequestPayload,
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
import { createTaskDispatcher } from "@envoymesh/api";
import { EnvoyMesh } from "@envoymesh/network";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { handleInboundAgentCardIntent } from "../src/agent-card-inbound.js";
import type { BridgeIdentity } from "../src/bridge/pipe.js";

const meshes: EnvoyMesh[] = [];
const profileDirs: string[] = [];

afterEach(async () => {
  await Promise.all(meshes.splice(0).map((m) => m.stop().catch(() => {})));
  await Promise.all(profileDirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

function testProfile(): NodeProfile {
  const owner = generateOwnerIdentity();
  const device = generateDeviceIdentity();
  return {
    owner,
    device,
    deviceCertificate: createDeviceCertificate({
      owner,
      device,
      deviceProfile: "primary",
      capabilities: ["message.send", "task.execute"],
    }),
  };
}

function bridgeIdentity(profile: NodeProfile): BridgeIdentity {
  const agent = generateAgentIdentity(profile.owner.ownerId);
  return {
    agentPeerId: agent.agentPeerId,
    agentPublicKeyPem: agent.publicKeyPem,
    agentPrivateKeyPem: agent.privateKeyPem,
    ownerId: profile.owner.ownerId,
    agentCredential: createAgentCredential({
      owner: profile.owner,
      agent,
      scope: [
        "message.send",
        "task.execute",
        "agent.card.request",
        "agent.card.response",
        "task.mandate",
        "task.propose",
        "task.negotiate",
        "task.accept",
        "task.result",
      ],
    }),
  };
}

async function startMesh(): Promise<EnvoyMesh> {
  const mesh = new EnvoyMesh({ listen: ["/ip4/127.0.0.1/tcp/0"], enableMdns: false });
  await mesh.start();
  meshes.push(mesh);
  return mesh;
}

async function waitFor(check: () => boolean | Promise<boolean>, timeoutMs = 4000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error("waitFor timeout");
}

function testProofOfIntent(profile: NodeProfile, taskId: string, mandateId: string): ProofOfIntent {
  return {
    version: "0.1",
    mandateId,
    mandateHash: "hash-test",
    taskId,
    requestIntent: "task.propose",
    nonce: "nonce-test",
    deviceId: profile.device.deviceId,
    proof: "test-signature",
  };
}

describe("E2E agent.card + task loop (Phase 13C)", () => {
  it("exchanges agent cards then completes task.propose → task.result without chat.message", async () => {
    const aliceProfile = testProfile();
    const bobProfile = testProfile();
    const aliceMesh = await startMesh();
    const bobMesh = await startMesh();

    const aliceDir = await mkdtemp(join(tmpdir(), "envoymesh-a2e-alice-"));
    const bobDir = await mkdtemp(join(tmpdir(), "envoymesh-a2e-bob-"));
    profileDirs.push(aliceDir, bobDir);

    const aliceTrust = createLocalTrustStore(aliceDir);
    const bobTrust = createLocalTrustStore(bobDir);
    const aliceCards = createAgentCardStore(aliceDir);
    const bobCards = createAgentCardStore(bobDir);
    const aliceTasks = createLocalTaskStore(aliceDir);
    const bobTasks = createLocalTaskStore(bobDir);
    const bobDispatcher = createTaskDispatcher();

    await aliceTrust.setTrustRecord({
      peerOwnerId: bobProfile.owner.ownerId,
      level: "direct",
      displayName: "Bob",
    });
    await bobTrust.setTrustRecord({
      peerOwnerId: aliceProfile.owner.ownerId,
      level: "direct",
      displayName: "Alice",
    });

    const aliceBridge = bridgeIdentity(aliceProfile);
    const bobBridge = bridgeIdentity(bobProfile);
    const allIntents: string[] = [];

    bobMesh.onMessage(async ({ envelope, remotePeerId }) => {
      if (!verifyInboundEnvelope(envelope)) return;
      allIntents.push(envelope.intent);

      if (envelope.intent === "agent.card.request") {
        const cardResult = await handleInboundAgentCardIntent({
          envelope,
          profile: bobProfile,
          remotePeerId,
          receivedAt: Date.now(),
          correlationId: envelope.correlationId,
          taskStore: bobTasks,
          trustStore: bobTrust,
          agentCardStore: bobCards,
          humanProfileStore: { loadHumanProfile: async () => null } as never,
          bridgeIdentity: bobBridge,
        });
        if (cardResult.ok && cardResult.action === "respond") {
          const unsigned = createUnsignedEnvelope({
            senderPeerId: bobBridge.agentPeerId,
            senderPublicKey: bobBridge.agentPublicKeyPem,
            senderRole: "agent",
            recipientPeerId: envelope.senderPeerId,
            recipientRole: "agent",
            intent: "agent.card.response",
            payload: cardResult.responsePayload,
            correlationId: envelope.correlationId,
            agentCredential: bobBridge.agentCredential,
          });
          const signed = signUnsignedEnvelope(unsigned, bobBridge.agentPrivateKeyPem);
          await bobMesh.send(aliceMesh.multiaddrs[0]!, signed);
        }
        return;
      }

      const taskDecision = await bobDispatcher.dispatch(envelope);
      if (taskDecision.action === "handled") {
        await bobTasks.appendTaskJournalEntry(taskDecision.journalEntry);
        if (taskDecision.intent === "task.propose") {
          const propose = parseTaskProposePayload(envelope.payload);
          const negotiatePayload = createTaskNegotiatePayload({
            taskId: propose.taskId,
            mandateId: propose.mandateId,
            proofOfIntent: propose.proofOfIntent,
            negotiationId: "neg-a2e-1",
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
          const signedNegotiate = signUnsignedEnvelope(unsignedNegotiate, bobBridge.agentPrivateKeyPem);
          await bobMesh.send(aliceMesh.multiaddrs[0]!, signedNegotiate);
        } else if (taskDecision.intent === "task.accept") {
          const accept = parseTaskAcceptPayload(envelope.payload);
          const resultPayload = createTaskResultPayload({
            taskId: accept.taskId,
            mandateId: accept.mandateId,
            status: "completed",
            summary: "Structured A2A task completed",
            artifacts: [],
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
          const signedResult = signUnsignedEnvelope(unsignedResult, bobBridge.agentPrivateKeyPem);
          await bobMesh.send(aliceMesh.multiaddrs[0]!, signedResult);
        }
      }
    });

    aliceMesh.onMessage(async ({ envelope, remotePeerId }) => {
      if (!verifyInboundEnvelope(envelope)) return;
      allIntents.push(envelope.intent);

      if (envelope.intent === "agent.card.response") {
        await handleInboundAgentCardIntent({
          envelope,
          profile: aliceProfile,
          remotePeerId,
          receivedAt: Date.now(),
          correlationId: envelope.correlationId,
          taskStore: aliceTasks,
          trustStore: aliceTrust,
          agentCardStore: aliceCards,
          humanProfileStore: { loadHumanProfile: async () => null } as never,
          bridgeIdentity: aliceBridge,
        });
      }
    });

    await aliceMesh.probePeer(bobMesh.multiaddrs[0]!);
    await bobMesh.probePeer(aliceMesh.multiaddrs[0]!);

    const cardRequest = createUnsignedEnvelope({
      senderPeerId: aliceBridge.agentPeerId,
      senderPublicKey: aliceBridge.agentPublicKeyPem,
      senderRole: "agent",
      recipientPeerId: bobMesh.peerId,
      recipientRole: "agent",
      intent: "agent.card.request",
      payload: createAgentCardRequestPayload({
        requesterOwnerId: aliceProfile.owner.ownerId,
        requesterDeviceId: aliceProfile.device.deviceId,
      }),
      agentCredential: aliceBridge.agentCredential,
    });
    await aliceMesh.send(bobMesh.multiaddrs[0]!, signUnsignedEnvelope(cardRequest, aliceBridge.agentPrivateKeyPem));

    await waitFor(async () => Boolean(await aliceCards.get(bobProfile.owner.ownerId)), 8000);

    const cached = await aliceCards.get(bobProfile.owner.ownerId);
    expect(cached?.card.ownerId).toBe(bobProfile.owner.ownerId);

    const taskId = "task-a2e-card-1";
    const mandateId = "mandate-a2e-card-1";
    const correlationId = "corr-a2e-card-1";

    const mandatePayload = createTaskMandatePayload({
      mandateId,
      ownerOwnerId: aliceProfile.owner.ownerId,
      ownerDeviceId: aliceProfile.device.deviceId,
      maxSensitivity: "friends",
      maxCost: { limit: 100, unit: "calls" },
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      closeOnFirstCompletedResult: true,
    });
    const signedMandate = signUnsignedEnvelope(
      createUnsignedEnvelope({
        senderPeerId: aliceBridge.agentPeerId,
        senderPublicKey: aliceBridge.agentPublicKeyPem,
        senderRole: "agent",
        recipientPeerId: bobMesh.peerId,
        recipientRole: "agent",
        intent: "task.mandate",
        payload: mandatePayload,
        correlationId,
        agentCredential: aliceBridge.agentCredential,
      }),
      aliceBridge.agentPrivateKeyPem,
    );
    await aliceMesh.send(bobMesh.multiaddrs[0]!, signedMandate);

    const proposePayload = createTaskProposePayload({
      taskId,
      mandateId,
      proofOfIntent: testProofOfIntent(aliceProfile, taskId, mandateId),
      objective: "Run structured bilateral work",
      requestedResult: "Completion summary",
    });
    const signedPropose = signUnsignedEnvelope(
      createUnsignedEnvelope({
        senderPeerId: aliceBridge.agentPeerId,
        senderPublicKey: aliceBridge.agentPublicKeyPem,
        senderRole: "agent",
        recipientPeerId: bobMesh.peerId,
        recipientRole: "agent",
        intent: "task.propose",
        payload: proposePayload,
        correlationId,
        agentCredential: aliceBridge.agentCredential,
      }),
      aliceBridge.agentPrivateKeyPem,
    );
    await aliceMesh.send(bobMesh.multiaddrs[0]!, signedPropose);

    await waitFor(async () => allIntents.includes("task.negotiate"));

    const acceptPayload = createTaskAcceptPayload({
      taskId,
      mandateId,
      agreementSummary: "Accepted negotiated terms",
    });
    const signedAccept = signUnsignedEnvelope(
      createUnsignedEnvelope({
        senderPeerId: aliceBridge.agentPeerId,
        senderPublicKey: aliceBridge.agentPublicKeyPem,
        senderRole: "agent",
        recipientPeerId: bobMesh.peerId,
        recipientRole: "agent",
        intent: "task.accept",
        payload: acceptPayload,
        correlationId,
        agentCredential: aliceBridge.agentCredential,
      }),
      aliceBridge.agentPrivateKeyPem,
    );
    await aliceMesh.send(bobMesh.multiaddrs[0]!, signedAccept);

    await waitFor(async () => allIntents.includes("task.result"), 5000);

    expect(allIntents.filter((intent) => intent === "chat.message")).toHaveLength(0);
    expect(allIntents).toContain("agent.card.request");
    expect(allIntents).toContain("agent.card.response");
    expect(allIntents).toContain("task.propose");
    expect(allIntents).toContain("task.result");

    const bobJournal = await bobTasks.readTaskJournalEntries();
    expect(bobJournal.some((entry) => entry.taskId === taskId && entry.eventType === "proposed")).toBe(true);
  });
});
