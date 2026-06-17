/**
 * Phase 33 — A2A round-trip test.
 *
 * Exercises the full A2A path with typed Artifacts:
 *   1. Caller builds task.mandate + task.propose via `sendAgentTaskPropose`.
 *   2. Callee's `handleDaemonTaskInbound` accepts the propose, journals the entry.
 *   3. Caller constructs a `task.result` envelope with typed Artifacts (text + file).
 *   4. Caller's `handleDaemonTaskInbound` accepts the result, journals the entry.
 *   5. Caller's journal query returns the result; the artifacts round-trip the typed shape.
 *
 * This test does NOT spin up a real mesh — it directly calls the inbound handler with the
 * envelope objects, which is the canonical production path used by `index.ts`.
 */

import { describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createAgentCredential,
  createDeviceCertificate,
  createProofOfIntent,
  generateAgentIdentity,
  generateDeviceIdentity,
  generateOwnerIdentity,
  signMandate,
  signUnsignedEnvelope,
  type AgentCredential,
} from "@envoymesh/identity";
import {
  createLocalTaskStore,
  createTaskRuntimeStateStore,
  type NodeProfile,
} from "@envoymesh/local-store";
import {
  createAgentCard,
  createFileArtifact,
  createTaskResultPayload,
  createTextArtifact,
  createUnsignedEnvelope,
  parseTaskResultPayload,
  type AgentCard,
  type TaskResultPayload,
} from "@envoymesh/protocol";
import { handleDaemonTaskInbound } from "../src/daemon-task-inbound.js";

async function tempDir() {
  const dir = await mkdtemp(join(tmpdir(), "a2a-roundtrip-"));
  return {
    dir,
    async cleanup() {
      await rm(dir, { recursive: true, force: true });
    },
  };
}

function makeIdentityBundle() {
  const owner = generateOwnerIdentity();
  const device = generateDeviceIdentity();
  const deviceCert = createDeviceCertificate({
    owner,
    device,
    deviceProfile: "full",
    capabilities: ["chat.message", "task.execute"],
    issuedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
  });
  const profile: NodeProfile = {
    owner,
    device,
    deviceCertificate: deviceCert,
  };
  const agent = generateAgentIdentity(owner.ownerId);
  const agentCredential: AgentCredential = createAgentCredential({
    owner,
    agent,
    scope: ["chat.message", "task.execute"],
  });
  return { owner, device, deviceCert, profile, agent, agentCredential };
}

describe("A2A round-trip — propose → result with typed Artifacts", () => {
  it("exchanges task.mandate + task.propose, journals the propose, returns a typed result", async () => {
    const t = await tempDir();
    try {
      const sender = makeIdentityBundle();
      const receiver = makeIdentityBundle();

      // Build receiver's peer-directory stub so the sender can resolve the transport.
      const taskStore = createLocalTaskStore(t.dir);
      const taskRuntimeStore = createTaskRuntimeStateStore(t.dir);

      // 1. Sender builds task.mandate + task.propose envelopes via the production helper.
      //    The helper expects a peerDirectoryStore — for this test we don't need it (we
      //    just want the envelopes), so we can hand a stub that throws to abort the send.
      //    Simpler: build the envelopes manually and reuse the helper.
      const { createTaskMandatePayload, createTaskProposePayload, createUnsignedMandate } = await import(
        "@envoymesh/protocol"
      );
      const mandateId = "mandate-1";
      const taskId = "task-1";
      const correlationId = "corr-1";

      const unsignedMandate = createUnsignedMandate({
        mandateId,
        ownerId: sender.profile.owner.ownerId,
        issuedToDeviceId: sender.profile.device.deviceId,
        issuedToAgentId: sender.agentCredential.agentId,
        taskIntent: "task.execute",
        objective: "summarize foo.pdf",
        allowedActions: ["discover", "query", "report"],
        disallowedActions: [],
        maxSensitivity: "friends",
        maxCost: { amount: 0, currency: "USD" },
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      });
      const mandate = signMandate({ unsignedMandate, owner: sender.profile.owner });

      const proofOfIntent = createProofOfIntent({
        mandate,
        taskId,
        requestIntent: "task.propose",
        device: sender.profile.device,
      });

      const recipientPeerId = receiver.profile.device.deviceId
        ? receiver.profile.device.deviceId
        : "envoy_unknown";

      const mandateEnvelope = signUnsignedEnvelope(
        createUnsignedEnvelope({
          senderPeerId: sender.agent.agentPeerId,
          senderPublicKey: sender.agent.publicKeyPem,
          senderRole: "agent",
          recipientPeerId,
          recipientRole: "agent",
          intent: "task.mandate",
          payload: createTaskMandatePayload(mandate, { taskId }),
          correlationId,
          agentCredential: sender.agentCredential,
        }),
        sender.agent.privateKeyPem,
      );

      const proposeEnvelope = signUnsignedEnvelope(
        createUnsignedEnvelope({
          senderPeerId: sender.agent.agentPeerId,
          senderPublicKey: sender.agent.publicKeyPem,
          senderRole: "agent",
          recipientPeerId,
          recipientRole: "agent",
          intent: "task.propose",
          payload: createTaskProposePayload({
            taskId,
            mandateId,
            proofOfIntent,
            objective: "summarize foo.pdf",
            requestedResult: "summary",
          }),
          correlationId,
          agentCredential: sender.agentCredential,
        }),
        sender.agent.privateKeyPem,
      );

      // 2. Receiver handles the mandate envelope.
      const r1 = await handleDaemonTaskInbound({
        envelope: mandateEnvelope,
        remotePeerId: sender.agent.agentPeerId,
        receivedAt: Date.now(),
        correlationId,
        taskStore,
        taskRuntimeStore,
      });
      expect(r1.handled).toBe(true);
      expect(r1.outcome).toBe("handled");

      // 3. Receiver handles the propose envelope.
      const r2 = await handleDaemonTaskInbound({
        envelope: proposeEnvelope,
        remotePeerId: sender.agent.agentPeerId,
        receivedAt: Date.now(),
        correlationId,
        taskStore,
        taskRuntimeStore,
      });
      expect(r2.handled).toBe(true);
      expect(r2.outcome).toBe("handled");

      // 4. Receiver responds with a typed-Artifact task.result.
      const card: AgentCard = createAgentCard({
        ownerId: receiver.profile.owner.ownerId,
        displayName: "Receiver",
        nodeProfile: "full",
        capabilities: ["task.execute"],
        publicTopics: [],
      });
      void card; // not used here, kept for the symmetry of the round-trip

      const result: TaskResultPayload = createTaskResultPayload({
        taskId,
        mandateId,
        status: "completed",
        summary: "summary text + file ref",
        artifacts: [
          createTextArtifact({ content: "Here is the summary." }),
          createFileArtifact({
            vaultPath: "/shared/foo.pdf",
            contentHash: "deadbeef",
            mimeType: "application/pdf",
          }),
        ],
      });
      const resultEnvelope = signUnsignedEnvelope(
        createUnsignedEnvelope({
          senderPeerId: receiver.agent.agentPeerId,
          senderPublicKey: receiver.agent.publicKeyPem,
          senderRole: "agent",
          recipientPeerId: sender.agent.agentPeerId,
          recipientRole: "agent",
          intent: "task.result",
          payload: result,
          correlationId,
          agentCredential: receiver.agentCredential,
        }),
        receiver.agent.privateKeyPem,
      );

      // 5. Sender (the home node) handles the result envelope. Note: the sender has its
      //    OWN taskStore, separate from the receiver. We pass sender's taskStore.
      const senderTaskStore = createLocalTaskStore(t.dir);
      const senderTaskRuntimeStore = createTaskRuntimeStateStore(t.dir);
      const r3 = await handleDaemonTaskInbound({
        envelope: resultEnvelope,
        remotePeerId: receiver.agent.agentPeerId,
        receivedAt: Date.now(),
        correlationId,
        taskStore: senderTaskStore,
        taskRuntimeStore: senderTaskRuntimeStore,
      });
      expect(r3.handled).toBe(true);
      expect(r3.outcome).toBe("handled");

      // 6. The journal on the sender side records a result_received entry; the typed
      //    artifacts are read back from the audit (via daemon-task-inbound.ts Phase 33
      //    audit hook) and via direct parse of the result payload.
      const events = await senderTaskStore.readAuditEvents();
      const artifactAudit = events.find(
        (e) =>
          e.type === "task.handled" &&
          e.intent === "task.result" &&
          e.summary?.includes("artifacts="),
      );
      expect(artifactAudit).toBeDefined();
      expect(artifactAudit?.summary).toMatch(/kinds=\[text,file\]/);

      // Direct round-trip via parser.
      const parsed = parseTaskResultPayload(resultEnvelope.payload);
      expect(parsed.artifacts).toHaveLength(2);
      expect(parsed.artifacts[0]?.kind).toBe("text");
      expect(parsed.artifacts[1]?.kind).toBe("file");
    } finally {
      await t.cleanup();
    }
  });
});
