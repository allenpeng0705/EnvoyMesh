import { randomUUID } from "node:crypto";
import {
  createProofOfIntent,
  derivePeerId,
  signMandate,
  signUnsignedEnvelope,
} from "@envoymesh/identity";
import type { LocalPeerDirectoryStore } from "@envoymesh/local-store";
import type { NodeProfile } from "@envoymesh/local-store";
import type { EnvoyMesh } from "@envoymesh/network";
import {
  createTaskMandatePayload,
  createTaskProposePayload,
  createUnsignedEnvelope,
  createUnsignedMandate,
  type AgentCredential,
} from "@envoymesh/protocol";

export async function sendAgentTaskPropose(input: {
  mesh: EnvoyMesh;
  profile: NodeProfile;
  agentPeerId: string;
  agentPublicKeyPem: string;
  agentPrivateKeyPem: string;
  agentCredential: AgentCredential;
  peerDirectoryStore: LocalPeerDirectoryStore;
  targetOwnerId: string;
  objective: string;
  correlationId?: string;
}): Promise<{ ok: boolean; summary: string; taskId?: string }> {
  const peerRecords = await input.peerDirectoryStore.listPeerRecords();
  const targetPeer = peerRecords.find((row) => row.ownerId === input.targetOwnerId);
  const transportPeerId = targetPeer?.peerId;
  if (!transportPeerId) {
    return { ok: false, summary: `contact not found: ${input.targetOwnerId}` };
  }

  const recipientPeerId = targetPeer?.devicePublicKeyPem
    ? derivePeerId(targetPeer.devicePublicKeyPem)
    : transportPeerId;

  const taskId = `task-${randomUUID()}`;
  const mandateId = `mandate-${randomUUID()}`;
  const correlationId = input.correlationId ?? randomUUID();

  const unsignedMandate = createUnsignedMandate({
    mandateId,
    ownerId: input.profile.owner.ownerId,
    issuedToDeviceId: input.profile.device.deviceId,
    issuedToAgentId: input.agentCredential.agentId,
    taskIntent: "task.execute",
    objective: input.objective.slice(0, 500),
    allowedActions: ["discover", "query", "negotiate", "report"],
    disallowedActions: ["raw_contact_exchange"],
    maxSensitivity: "friends",
    maxCost: { amount: 0, currency: "USD" },
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  });
  const mandate = signMandate({ unsignedMandate, owner: input.profile.owner });

  const mandateEnvelope = signUnsignedEnvelope(
    createUnsignedEnvelope({
      senderPeerId: input.agentPeerId,
      senderPublicKey: input.agentPublicKeyPem,
      senderRole: "agent",
      recipientPeerId,
      recipientRole: "agent",
      intent: "task.mandate",
      payload: createTaskMandatePayload(mandate, { taskId }),
      correlationId,
      agentCredential: input.agentCredential,
    }),
    input.agentPrivateKeyPem,
  );
  await input.mesh.send(transportPeerId, mandateEnvelope);

  const proofOfIntent = createProofOfIntent({
    mandate,
    taskId,
    requestIntent: "task.propose",
    device: input.profile.device,
  });
  const proposeEnvelope = signUnsignedEnvelope(
    createUnsignedEnvelope({
      senderPeerId: input.agentPeerId,
      senderPublicKey: input.agentPublicKeyPem,
      senderRole: "agent",
      recipientPeerId,
      recipientRole: "agent",
      intent: "task.propose",
      payload: createTaskProposePayload({
        taskId,
        mandateId,
        proofOfIntent,
        objective: input.objective.slice(0, 500),
        requestedResult: "Concise completion summary",
      }),
      correlationId,
      agentCredential: input.agentCredential,
    }),
    input.agentPrivateKeyPem,
  );
  await input.mesh.send(transportPeerId, proposeEnvelope);

  return {
    ok: true,
    summary: `task.propose sent taskId=${taskId}`,
    taskId,
  };
}
