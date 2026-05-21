import {
  createDeviceCertificate,
  derivePeerId,
  generateDeviceIdentity,
  generateOwnerIdentity,
  signUnsignedEnvelope,
  verifyInboundEnvelope,
} from "@envoymesh/identity";
import {
  auditEventForDispatcherDecision,
  createApprovalRequest,
  createAuditEvent,
  createLocalTaskStore,
  type NodeProfile,
} from "@envoymesh/local-store";
import { EnvoyMesh } from "@envoymesh/network";
import {
  createDevicePairRequestPayload,
  createUnsignedEnvelope,
  parseDevicePairRequestPayload,
} from "@envoymesh/protocol";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildOutboundCliEnvelopes } from "../src/cli-actions.js";
import { createTaskDispatcher } from "../src/task-dispatcher.js";

const meshes: EnvoyMesh[] = [];
let receiverProfileDir: string;

beforeEach(async () => {
  receiverProfileDir = await mkdtemp(join(tmpdir(), "envoymesh-p2p-a2a-"));
});

afterEach(async () => {
  await Promise.all(meshes.splice(0).map((mesh) => mesh.stop()));
  await rm(receiverProfileDir, { recursive: true, force: true });
});

describe("A2A lifecycle over EnvoyMesh", () => {
  it("sends task lifecycle envelopes between two local nodes and persists receiver journal/audit", async () => {
    const senderProfile = testProfile();
    const receiver = await startMesh();
    const sender = await startMesh();
    const receiverStore = createLocalTaskStore(receiverProfileDir);
    const receiverDispatcher = createTaskDispatcher();

    receiver.onMessage(async ({ envelope, remotePeerId }) => {
      if (!verifyInboundEnvelope(envelope)) {
        return;
      }

      const decision = await receiverDispatcher.dispatch(envelope);
      if (decision.action === "handled") {
        await receiverStore.appendTaskJournalEntry(decision.journalEntry);
        await receiverStore.appendAuditEvent(
          auditEventForDispatcherDecision(decision, {
            messageId: envelope.messageId,
            remotePeerId,
            createdAt: envelope.createdAt,
          }),
        );
      }
    });

    const outbounds = buildOutboundCliEnvelopes(
      {
        profileDir: "./data/test",
        listen: [],
        enableMdns: false,
        taskMandateTarget: receiver.multiaddrs[0],
        taskProposeTarget: receiver.multiaddrs[0],
        taskCancelTarget: receiver.multiaddrs[0],
        reportCreateTarget: receiver.multiaddrs[0],
        taskId: "task-1",
        mandateId: "mandate-1",
        taskIntent: "find.book",
        objective: "Find one distributed systems book.",
        requestedResult: "Return one recommendation.",
        reason: "Owner cancelled follow-up work.",
        reportSummary: "The task lifecycle reached the receiver.",
        reportMode: "brief",
      },
      senderProfile,
    );

    for (const outbound of outbounds) {
      await sender.send(outbound.target, outbound.envelope);
    }

    await waitFor(async () => (await receiverStore.readTaskJournalEntries()).length === 4);

    const journal = await receiverStore.readTaskJournalEntries();
    const audit = await receiverStore.readAuditEvents();

    expect(journal.map((entry) => entry.eventType)).toEqual([
      "mandate_attached",
      "proposed",
      "cancelled",
      "report_created",
    ]);
    expect(journal.map((entry) => entry.taskId)).toEqual(["task-1", "task-1", "task-1", "task-1"]);
    expect(audit).toHaveLength(4);
    expect(audit.every((event) => event.type === "task.handled")).toBe(true);
  });

  it("sends pairing request over mesh and persists receiver approval queue", async () => {
    const senderProfile = testProfile();
    const receiver = await startMesh();
    const sender = await startMesh();
    const receiverStore = createLocalTaskStore(receiverProfileDir);

    receiver.onMessage(async ({ envelope, remotePeerId }) => {
      if (!verifyInboundEnvelope(envelope) || envelope.intent !== "device.pair.request") {
        return;
      }
      const payload = parseDevicePairRequestPayload(envelope.payload);
      await receiverStore.appendApprovalRequest(
        createApprovalRequest({
          approvalId: `approval-${payload.requestId}`,
          ownerId: "receiver-owner",
          taskId: `pairing:${payload.requestId}`,
          requestedAction: "device.sync",
          reason: `Pairing from ${payload.requesterOwnerId}/${payload.requesterDeviceId}`,
          peerOwnerId: payload.requesterOwnerId,
          peerDeviceId: payload.requesterDeviceId,
        }),
      );
      await receiverStore.appendAuditEvent(
        createAuditEvent({
          type: "message.verified",
          intent: "device.pair.request",
          messageId: envelope.messageId,
          remotePeerId,
          outcome: "allow",
          summary: "pairing request received",
          createdAt: envelope.createdAt,
        }),
      );
    });

    const requestPayload = createDevicePairRequestPayload({
      requesterOwnerId: senderProfile.owner.ownerId,
      requesterDeviceId: senderProfile.device.deviceId,
      requesterDevicePublicKeyPem: senderProfile.device.publicKeyPem,
      note: "please pair",
    });
    const signed = signEnvelope(senderProfile, receiver.multiaddrs[0], "device.pair.request", requestPayload);
    await sender.send(receiver.multiaddrs[0], signed);

    await waitFor(async () => (await receiverStore.readApprovalRequests()).length === 1);
    const approvals = await receiverStore.readApprovalRequests();
    const audit = await receiverStore.readAuditEvents();
    expect(approvals[0].taskId).toContain("pairing:");
    expect(approvals[0].requestedAction).toBe("device.sync");
    expect(audit.some((event) => event.intent === "device.pair.request")).toBe(true);
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

function signEnvelope(
  profile: NodeProfile,
  target: string,
  intent: "device.pair.request",
  payload: unknown,
) {
  return signUnsignedEnvelope(
    createUnsignedEnvelope({
      senderPeerId: derivePeerId(profile.device.publicKeyPem),
      senderPublicKey: profile.device.publicKeyPem,
      recipientPeerId: target,
      intent,
      payload,
    }),
    profile.device.privateKeyPem,
  );
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
