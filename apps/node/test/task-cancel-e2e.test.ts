import {
  createDeviceCertificate,
  derivePeerId,
  generateDeviceIdentity,
  generateOwnerIdentity,
  signUnsignedEnvelope,
  verifyInboundEnvelope,
} from "@envoymesh/identity";
import {
  createTaskAcceptPayload,
  createTaskCancelPayload,
  createTaskMandatePayload,
  createTaskNegotiatePayload,
  createTaskProposePayload,
  createTaskResultPayload,
  createUnsignedEnvelope,
  parseTaskAcceptPayload,
  parseTaskCancelPayload,
  parseTaskMandatePayload,
  parseTaskNegotiatePayload,
  parseTaskProposePayload,
} from "@envoymesh/protocol";
import { afterEach, describe, expect, it } from "vitest";
import { EnvoyMesh } from "@envoymesh/network";
import type { NodeProfile } from "@envoymesh/protocol";
import type { ProofOfIntent } from "@envoymesh/protocol";

const meshes: EnvoyMesh[] = [];
// Track late-firing setTimeout handles for `task.result` so we can clear
// them in afterEach. Otherwise a 100ms timer fires AFTER the receiver
// mesh is stopped, surfacing "EnvoyMesh has not been started" as an
// unhandled rejection and failing the vitest run.
const pendingResults: ReturnType<typeof setTimeout>[] = [];

afterEach(async () => {
  for (const t of pendingResults.splice(0)) clearTimeout(t);
  await Promise.all(meshes.splice(0).map((mesh) => mesh.stop()));
});

describe("E2E task cancel flow", () => {
  it("sender can cancel task before result is received", async () => {
    const senderProfile = testProfile();
    const receiverProfile = testProfile();
    const sender = await startMesh();
    const receiver = await startMesh();

    const receiverReceived: string[] = [];
    let receivedCancel: ReturnType<typeof parseTaskCancelPayload> | null = null;

    sender.onMessage(async ({ envelope }) => {
      if (!verifyInboundEnvelope(envelope)) return;
      receiverReceived.push(envelope.intent);
    });

    receiver.onMessage(async ({ envelope }) => {
      if (!verifyInboundEnvelope(envelope)) return;
      receiverReceived.push(envelope.intent);

      if (envelope.intent === "task.propose") {
        const propose = parseTaskProposePayload(envelope.payload);

        // Negotiate
        const negotiatePayload = createTaskNegotiatePayload({
          taskId: propose.taskId,
          mandateId: propose.mandateId,
          proofOfIntent: propose.proofOfIntent,
          negotiationId: "neg-1",
          message: "I accept this task",
        });

        const unsignedNegotiate = createUnsignedEnvelope({
          senderPeerId: derivePeerId(receiverProfile.device.publicKeyPem),
          senderPublicKey: receiverProfile.device.publicKeyPem,
          senderRole: "agent",
          recipientPeerId: sender.peerId,
          recipientRole: "agent",
          intent: "task.negotiate",
          payload: negotiatePayload,
        });

        const signedNegotiate = signUnsignedEnvelope(unsignedNegotiate, receiverProfile.device.privateKeyPem);
        await receiver.send(sender.multiaddrs[0], signedNegotiate);
      } else if (envelope.intent === "task.accept") {
        const accept = parseTaskAcceptPayload(envelope.payload);

        // Send result after a short delay to simulate work
        pendingResults.push(setTimeout(async () => {
          const resultPayload = createTaskResultPayload({
            taskId: accept.taskId,
            mandateId: accept.mandateId,
            status: "completed",
            summary: "Task was completed",
            artifacts: [],
          });

          const unsignedResult = createUnsignedEnvelope({
            senderPeerId: derivePeerId(receiverProfile.device.publicKeyPem),
            senderPublicKey: receiverProfile.device.publicKeyPem,
            senderRole: "agent",
            recipientPeerId: sender.peerId,
            recipientRole: "agent",
            intent: "task.result",
            payload: resultPayload,
          });

          const signedResult = signUnsignedEnvelope(unsignedResult, receiverProfile.device.privateKeyPem);
          await receiver.send(sender.multiaddrs[0], signedResult);
        }, 100));

      } else if (envelope.intent === "task.cancel") {
        receivedCancel = parseTaskCancelPayload(envelope.payload);
      }
    });

    const taskId = "task-cancel-1";
    const mandateId = "mandate-cancel-1";

    // Send mandate
    const mandatePayload = createTaskMandatePayload({
      mandateId,
      ownerOwnerId: senderProfile.owner.ownerId,
      ownerDeviceId: senderProfile.device.deviceId,
      maxSensitivity: "friends",
      maxCost: { limit: 100, unit: "calls" },
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      closeOnFirstCompletedResult: true,
    });

    const unsignedMandate = createUnsignedEnvelope({
      senderPeerId: derivePeerId(senderProfile.device.publicKeyPem),
      senderPublicKey: senderProfile.device.publicKeyPem,
      senderRole: "agent",
      recipientPeerId: receiver.peerId,
      recipientRole: "agent",
      intent: "task.mandate",
      payload: mandatePayload,
    });

    const signedMandate = signUnsignedEnvelope(unsignedMandate, senderProfile.device.privateKeyPem);
    await sender.send(receiver.multiaddrs[0], signedMandate);

    await waitFor(async () => receiverReceived.includes("task.mandate"), 2000);

    // Send propose
    const proposePayload = createTaskProposePayload({
      taskId,
      mandateId,
      proofOfIntent: testProofOfIntent(senderProfile, taskId, mandateId),
      objective: "Do some work",
      requestedResult: "Return success",
    });

    const unsignedPropose = createUnsignedEnvelope({
      senderPeerId: derivePeerId(senderProfile.device.publicKeyPem),
      senderPublicKey: senderProfile.device.publicKeyPem,
      senderRole: "agent",
      recipientPeerId: receiver.peerId,
      recipientRole: "agent",
      intent: "task.propose",
      payload: proposePayload,
    });

    const signedPropose = signUnsignedEnvelope(unsignedPropose, senderProfile.device.privateKeyPem);
    await sender.send(receiver.multiaddrs[0], signedPropose);

    await waitFor(async () => receiverReceived.includes("task.negotiate"), 2000);

    // Send accept
    const acceptPayload = createTaskAcceptPayload({
      taskId,
      mandateId,
      agreementSummary: "I accept",
    });

    const unsignedAccept = createUnsignedEnvelope({
      senderPeerId: derivePeerId(senderProfile.device.publicKeyPem),
      senderPublicKey: senderProfile.device.publicKeyPem,
      senderRole: "agent",
      recipientPeerId: receiver.peerId,
      recipientRole: "agent",
      intent: "task.accept",
      payload: acceptPayload,
    });

    const signedAccept = signUnsignedEnvelope(unsignedAccept, senderProfile.device.privateKeyPem);
    await sender.send(receiver.multiaddrs[0], signedAccept);

    await waitFor(async () => receiverReceived.includes("task.accept"), 2000);

    // Now cancel the task
    const cancelPayload = createTaskCancelPayload({
      taskId,
      mandateId,
      reason: "No longer needed",
      cancelledBy: "owner",
      createdAt: new Date().toISOString(),
    });

    const unsignedCancel = createUnsignedEnvelope({
      senderPeerId: derivePeerId(senderProfile.device.publicKeyPem),
      senderPublicKey: senderProfile.device.publicKeyPem,
      senderRole: "agent",
      recipientPeerId: receiver.peerId,
      recipientRole: "agent",
      intent: "task.cancel",
      payload: cancelPayload,
    });

    const signedCancel = signUnsignedEnvelope(unsignedCancel, senderProfile.device.privateKeyPem);
    await sender.send(receiver.multiaddrs[0], signedCancel);

    // Wait for cancel to be received
    await waitFor(async () => receivedCancel !== null, 2000);

    expect(receivedCancel).not.toBeNull();
    expect(receivedCancel?.taskId).toBe(taskId);
    expect(receivedCancel?.cancelledBy).toBe("owner");
    expect(receivedCancel?.reason).toBe("No longer needed");
  });
});

async function startMesh(): Promise<EnvoyMesh> {
  const mesh = new EnvoyMesh({
    listen: ["/ip4/127.0.0.1/tcp/0"],
    enableMdns: false,
  });

  await mesh.start();
  meshes.push(mesh);
  return mesh;
}

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
      capabilities: ["mesh.listen", "message.send", "task.execute"],
    }),
  };
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

async function waitFor(predicate: () => Promise<boolean>, timeoutMs = 2000): Promise<void> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (await predicate()) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 20));
  }

  throw new Error("Timed out waiting for condition");
}