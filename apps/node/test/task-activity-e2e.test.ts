/**
 * E2E: inbound task.propose → Activity + audit/journal (US-AV3).
 */
import {
  createAgentCredential,
  generateAgentIdentity,
  signUnsignedEnvelope,
  verifyInboundEnvelope,
} from "@envoymesh/identity";
import {
  createTaskProposePayload,
  createUnsignedEnvelope,
  type ProofOfIntent,
} from "@envoymesh/protocol";
import { afterEach, describe, expect, it } from "vitest";
import {
  cleanupPhase13Harness,
  createPhase13TestNode,
  phase13TestProfile,
  registerBondedPeer,
  waitForPhase13,
  wireDaemonTaskInboundHandler,
} from "./phase13-e2e-harness.js";

afterEach(async () => {
  await cleanupPhase13Harness();
});

function proofOfIntent(profile: ReturnType<typeof phase13TestProfile>, taskId: string, mandateId: string): ProofOfIntent {
  return {
    version: "0.1",
    mandateId,
    mandateHash: "hash-e2e",
    taskId,
    requestIntent: "task.propose",
    nonce: "nonce-e2e",
    deviceId: profile.device.deviceId,
    proof: "proof-e2e",
  };
}

describe("E2E task.propose → Activity (Phase 13D)", () => {
  it("records task_started Activity and audit/journal rows for inbound task.propose", async () => {
    const alice = await createPhase13TestNode();
    const bob = await createPhase13TestNode();
    await registerBondedPeer(alice, bob, "Bob");
    wireDaemonTaskInboundHandler(alice);

    const bobAgent = generateAgentIdentity(bob.profile.owner.ownerId);
    const credential = createAgentCredential({
      owner: bob.profile.owner,
      agent: bobAgent,
      scope: ["task.propose", "task.execute", "message.send"],
    });

    const taskId = "task-activity-e2e";
    const mandateId = "mandate-activity-e2e";
    const correlationId = "corr-activity-e2e";
    const unsigned = createUnsignedEnvelope({
      senderPeerId: bobAgent.agentPeerId,
      senderPublicKey: bobAgent.publicKeyPem,
      senderRole: "agent",
      recipientPeerId: alice.mesh.peerId,
      recipientRole: "agent",
      intent: "task.propose",
      payload: createTaskProposePayload({
        taskId,
        mandateId,
        proofOfIntent: proofOfIntent(bob.profile, taskId, mandateId),
        objective: "Research distributed systems reading list",
        requestedResult: "Three book titles",
      }),
      correlationId,
      agentCredential: credential,
      messageId: "msg-task-propose-e2e",
      createdAt: new Date().toISOString(),
    });
    const signed = signUnsignedEnvelope(unsigned, bobAgent.privateKeyPem);
    expect(verifyInboundEnvelope(signed)).toBe(true);

    await alice.mesh.dial(bob.mesh.multiaddrs[0]!);
    await bob.mesh.dial(alice.mesh.multiaddrs[0]!);
    await bob.mesh.send(alice.mesh.multiaddrs[0]!, signed);

    await waitForPhase13(async () => {
      const rows = await alice.service.listAgentActivity({ limit: 20 });
      return rows.some((r) => r.taskId === taskId && r.kind === "task_started");
    }, 8000);

    const activity = await alice.service.listAgentActivity({ limit: 20 });
    const row = activity.find((r) => r.taskId === taskId);
    expect(row?.kind).toBe("task_started");
    expect(row?.correlationId).toBe(correlationId);

    const journal = await alice.service.listTaskJournalEntries({ taskId, limit: 10 });
    expect(journal.some((j) => j.eventType === "proposed")).toBe(true);

    const audits = await alice.service.listAuditEvents({ correlationId, taskId, limit: 10 });
    expect(audits.some((a) => a.intent === "task.propose")).toBe(true);
  });
});
