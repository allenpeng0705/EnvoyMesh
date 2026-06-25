/**
 * E2E: wire report.create → emitLocalOwnerReport → listAgentActivity (US-AV6).
 */
import {
  createAgentCredential,
  createDeviceCertificate,
  generateAgentIdentity,
  generateDeviceIdentity,
  generateOwnerIdentity,
  signUnsignedEnvelope,
  verifyInboundEnvelope,
} from "@envoymesh/identity";
import {
  createReport,
  createReportCreatePayload,
  createUnsignedEnvelope,
} from "@envoymesh/protocol";
import { afterEach, describe, expect, it } from "vitest";
import {
  cleanupPhase13Harness,
  createPhase13TestNode,
  registerBondedPeer,
  waitForPhase13,
  wireDaemonTaskInboundHandler,
} from "./phase13-e2e-harness.js";

afterEach(async () => {
  await cleanupPhase13Harness();
});

function agentScope() {
  return ["message.send", "task.execute", "report.create", "chat.message"] as const;
}

describe("E2E report.create → Activity (Phase 13D)", () => {
  it("surfaces inbound report.create as report_received Activity row", async () => {
    const alice = await createPhase13TestNode();
    const bob = await createPhase13TestNode();
    await registerBondedPeer(alice, bob, "Bob");
    wireDaemonTaskInboundHandler(alice);

    const bobAgent = generateAgentIdentity(bob.profile.owner.ownerId);
    const credential = createAgentCredential({
      owner: bob.profile.owner,
      agent: bobAgent,
      scope: [...agentScope()],
    });

    const report = createReport({
      reportId: "report-e2e-1",
      taskId: "task-e2e-1",
      ownerId: bob.profile.owner.ownerId,
      status: "completed",
      mode: "brief",
      summary: "Bilateral A2A work finished successfully.",
      evidence: [{ type: "peer_response", source: alice.profile.owner.ownerId, sensitivity: "friends" }],
      suggestedActions: [],
      createdAt: new Date().toISOString(),
    });
    const payload = createReportCreatePayload(report);
    const unsigned = createUnsignedEnvelope({
      senderPeerId: bobAgent.agentPeerId,
      senderPublicKey: bobAgent.publicKeyPem,
      senderRole: "agent",
      recipientPeerId: alice.mesh.peerId,
      recipientRole: "agent",
      intent: "report.create",
      payload,
      correlationId: "corr-report-e2e",
      agentCredential: credential,
      messageId: "msg-report-e2e-1",
      createdAt: new Date().toISOString(),
    });
    const signed = signUnsignedEnvelope(unsigned, bobAgent.privateKeyPem);
    expect(verifyInboundEnvelope(signed)).toBe(true);

    await alice.mesh.dial(bob.mesh.multiaddrs[0]!);
    await bob.mesh.dial(alice.mesh.multiaddrs[0]!);
    await bob.mesh.send(alice.mesh.multiaddrs[0]!, signed);

    await waitForPhase13(async () => {
      const rows = await alice.service.listAgentActivity({ limit: 20 });
      return rows.some((r) => r.kind === "report_received" && r.taskId === "task-e2e-1");
    }, 8000);

    const activity = await alice.service.listAgentActivity({ limit: 20 });
    const row = activity.find((r) => r.taskId === "task-e2e-1");
    expect(row?.kind).toBe("report_received");
    expect(row?.summary).toContain("Bilateral A2A work finished");

    const audits = await alice.service.listAuditEvents({ taskId: "task-e2e-1", limit: 20 });
    expect(audits.some((a) => a.intent === "report.create")).toBe(true);

    const journal = await alice.service.listTaskJournalEntries({ taskId: "task-e2e-1", limit: 20 });
    expect(journal.some((j) => j.eventType === "report_created")).toBe(true);
  });
});
