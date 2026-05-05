import {
  createDeviceCertificate,
  derivePeerId,
  generateDeviceIdentity,
  generateOwnerIdentity,
  signUnsignedEnvelope,
  verifyEnvelope,
} from "@envoymesh/identity";
import type { ProofOfIntent } from "@envoymesh/protocol";
import {
  createTaskAcceptPayload,
  createTaskMandatePayload,
  createTaskNegotiatePayload,
  createTaskProposePayload,
  createTaskResultPayload,
  createUnsignedEnvelope,
  parseTaskMandatePayload,
  parseTaskProposePayload,
  parseTaskNegotiatePayload,
  parseTaskAcceptPayload,
  parseTaskResultPayload,
} from "@envoymesh/protocol";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EnvoyMesh } from "@envoymesh/network";
import type { NodeProfile } from "@envoymesh/local-store";

const meshes: EnvoyMesh[] = [];

afterEach(async () => {
  await Promise.all(meshes.splice(0).map((mesh) => mesh.stop()));
});

describe("task lifecycle over EnvoyMesh", () => {
  it("executes full task lifecycle: mandate -> propose -> negotiate -> accept -> result", async () => {
    const senderProfile = testProfile();
    const receiverProfile = testProfile();
    const sender = await startMesh();
    const receiver = await startMesh();

    // Track received intents
    const senderReceived: string[] = [];
    const receiverReceived: string[] = [];

    sender.onMessage(async ({ envelope }) => {
      if (!verifyEnvelope(envelope)) return;
      senderReceived.push(envelope.intent);
    });

    receiver.onMessage(async ({ envelope }) => {
      if (!verifyEnvelope(envelope)) return;
      receiverReceived.push(envelope.intent);

      // Auto-respond to task.intents based on state
      if (envelope.intent === "task.propose") {
        const propose = parseTaskProposePayload(envelope.payload);

        // Receiver negotiates
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

        // Receiver executes task and returns result
        const resultPayload = createTaskResultPayload({
          taskId: accept.taskId,
          mandateId: accept.mandateId,
          status: "completed",
          summary: "Task completed successfully",
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
      }
    });

    const taskId = "task-test-1";
    const mandateId = "mandate-test-1";

    // Step 1: Sender sends mandate
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
    expect(receiverReceived).toContain("task.mandate");

    // Step 2: Sender proposes task
    const proposePayload = createTaskProposePayload({
      taskId,
      mandateId,
      proofOfIntent: testProofOfIntent(senderProfile, taskId, mandateId),
      objective: "Find the answer to life",
      requestedResult: "Return the number 42",
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

    await waitFor(async () => receiverReceived.includes("task.propose"), 2000);
    expect(receiverReceived).toContain("task.propose");

    // Step 3: Wait for negotiate response
    await waitFor(async () => senderReceived.includes("task.negotiate"), 2000);
    expect(senderReceived).toContain("task.negotiate");

    // Step 4: Sender accepts
    const acceptPayload = createTaskAcceptPayload({
      taskId,
      mandateId,
      agreementSummary: "I accept the negotiated task",
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
    expect(receiverReceived).toContain("task.accept");

    // Step 5: Wait for result
    await waitFor(async () => senderReceived.includes("task.result"), 3000);
    expect(senderReceived).toContain("task.result");
  });

  it("sender receives task.result with correct taskId and summary", async () => {
    const senderProfile = testProfile();
    const receiverProfile = testProfile();
    const sender = await startMesh();
    const receiver = await startMesh();

    let receivedResult: ReturnType<typeof parseTaskResultPayload> | null = null;
    let senderReceivedNegotiate = false;

    sender.onMessage(async ({ envelope }) => {
      if (!verifyEnvelope(envelope)) return;
      if (envelope.intent === "task.result") {
        receivedResult = parseTaskResultPayload(envelope.payload);
      } else if (envelope.intent === "task.negotiate") {
        senderReceivedNegotiate = true;
      }
    });

    receiver.onMessage(async ({ envelope }) => {
      if (!verifyEnvelope(envelope)) return;
      if (envelope.intent === "task.propose") {
        const propose = parseTaskProposePayload(envelope.payload);

        // First negotiate
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

        const resultPayload = createTaskResultPayload({
          taskId: accept.taskId,
          mandateId: accept.mandateId,
          status: "completed",
          summary: "Successfully completed the task",
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
      }
    });

    // Send mandate
    const mandatePayload = createTaskMandatePayload({
      mandateId: "mandate-r1",
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

    // Send propose
    const proposePayload = createTaskProposePayload({
      taskId: "task-r1",
      mandateId: "mandate-r1",
      proofOfIntent: testProofOfIntent(senderProfile, "task-r1", "mandate-r1"),
      objective: "Run a test",
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

    // Wait for negotiate
    await waitFor(async () => senderReceivedNegotiate, 3000);
    expect(senderReceivedNegotiate).toBe(true);

    // Send accept
    const acceptPayload = createTaskAcceptPayload({
      taskId: "task-r1",
      mandateId: "mandate-r1",
      agreementSummary: "I accept the negotiated task",
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

    // Wait for result
    await waitFor(async () => receivedResult !== null, 4000);

    expect(receivedResult).not.toBeNull();
    expect(receivedResult?.taskId).toBe("task-r1");
    expect(receivedResult?.mandateId).toBe("mandate-r1");
    expect(receivedResult?.summary).toBe("Successfully completed the task");
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
