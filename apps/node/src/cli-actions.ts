import {
  createProofOfIntent,
  derivePeerId,
  signMandate,
  signUnsignedEnvelope,
} from "@envoymesh/identity";
import type { NodeProfile } from "@envoymesh/local-store";
import {
  createBondRequestPayload,
  createChatMessagePayload,
  createDiscoveryRequestPayload,
  createDevicePairRequestPayload,
  createKnowledgeQueryPayload,
  createReport,
  createReportCreatePayload,
  createTaskCancelPayload,
  createTaskMandatePayload,
  createTaskProposePayload,
  createUnsignedEnvelope,
  createUnsignedMandate,
  type EnvoyEnvelope,
  type EnvoyIntent,
  type Mandate,
} from "@envoymesh/protocol";
import type { NodeArgs } from "./args.js";

export interface OutboundCliEnvelope {
  target: string;
  envelope: EnvoyEnvelope;
  label: string;
}

export function buildOutboundCliEnvelopes(
  args: NodeArgs,
  profile: NodeProfile,
): OutboundCliEnvelope[] {
  const envelopes: OutboundCliEnvelope[] = [];

  if (args.bondRequestTarget) {
    envelopes.push({
      target: args.bondRequestTarget,
      label: "bond.request",
      envelope: signedEnvelope(
        args,
        profile,
        args.bondRequestTarget,
        "bond.request",
        createBondRequestPayload({
          requesterOwnerId: profile.owner.ownerId,
          message: args.bondMessage,
          proofOfContext: args.bondProof,
          requestedLevel: args.bondRequestedLevel,
        }),
      ),
    });
  }

  if (args.discoveryRequestTarget) {
    envelopes.push({
      target: args.discoveryRequestTarget,
      label: "discovery.request",
      envelope: signedEnvelope(
        args,
        profile,
        args.discoveryRequestTarget,
        "discovery.request",
        createDiscoveryRequestPayload({
          requesterOwnerId: profile.owner.ownerId,
          requestedTagHashes: args.discoveryTagHashes,
          requestedCapabilities: args.discoveryCapabilities,
          maxResults: args.discoveryMaxResults,
        }),
      ),
    });
  }

  if (args.chatTarget) {
    const text = args.chatText?.trim();
    if (!text) {
      throw new Error("Missing --chat-text for --chat");
    }
    envelopes.push({
      target: args.chatTarget,
      label: "chat.message",
      envelope: signedEnvelope(
        args,
        profile,
        args.chatTarget,
        "chat.message",
        createChatMessagePayload({
          senderOwnerId: profile.owner.ownerId,
          text,
        }),
      ),
    });
  }

  if (args.pairRequestTarget) {
    envelopes.push({
      target: args.pairRequestTarget,
      label: "device.pair.request",
      envelope: signedEnvelope(
        args,
        profile,
        args.pairRequestTarget,
        "device.pair.request",
        createDevicePairRequestPayload({
          requesterOwnerId: profile.owner.ownerId,
          requesterDeviceId: profile.device.deviceId,
          requesterDevicePublicKeyPem: profile.device.publicKeyPem,
          note: args.pairNote,
        }),
      ),
    });
  }

  if (args.knowledgeQueryTarget) {
    const queryText = args.knowledgeQueryText ?? "mock knowledge query";
    envelopes.push({
      target: args.knowledgeQueryTarget,
      label: "knowledge.query",
      envelope: signedEnvelope(
        args,
        profile,
        args.knowledgeQueryTarget,
        "knowledge.query",
        createKnowledgeQueryPayload({
          query: queryText,
          requestedSensitivity: args.knowledgeQuerySensitivity,
        }),
      ),
    });
  }

  if (args.taskMandateTarget) {
    const taskId = requiredTaskId(args);
    const mandate = createSignedMandate(args, profile);
    envelopes.push({
      target: args.taskMandateTarget,
      label: `task.mandate task=${taskId} mandate=${mandate.mandateId}`,
      envelope: signedEnvelope(args, profile, args.taskMandateTarget, "task.mandate", {
        taskId,
        ...createTaskMandatePayload(mandate, { taskId }),
      }),
    });
  }

  if (args.taskProposeTarget) {
    const taskId = requiredTaskId(args);
    const mandate = createSignedMandate(args, profile);
    const proofOfIntent = createProofOfIntent({
      mandate,
      taskId,
      requestIntent: "task.propose",
      device: profile.device,
    });

    envelopes.push({
      target: args.taskProposeTarget,
      label: `task.propose task=${taskId} mandate=${mandate.mandateId}`,
      envelope: signedEnvelope(
        args,
        profile,
        args.taskProposeTarget,
        "task.propose",
        createTaskProposePayload({
          taskId,
          mandateId: mandate.mandateId,
          proofOfIntent,
          objective: args.objective ?? mandate.objective,
          requestedResult: args.requestedResult ?? "Return a concise result with evidence.",
          expiresAt: args.taskExpiresAt,
        }),
      ),
    });
  }

  if (args.taskCancelTarget) {
    const taskId = requiredTaskId(args);
    if (args.cancelForwardPeers?.length && args.cancelRelayHops === undefined) {
      throw new Error("Missing --cancel-relay-hops when using --cancel-forward-peer");
    }
    envelopes.push({
      target: args.taskCancelTarget,
      label: `task.cancel task=${taskId}`,
      envelope: signedEnvelope(
        args,
        profile,
        args.taskCancelTarget,
        "task.cancel",
        createTaskCancelPayload({
          taskId,
          mandateId: args.mandateId,
          reason: args.reason ?? "Owner cancelled the task.",
          cancelledBy: "owner",
          forwardToPeerIds: args.cancelForwardPeers?.length ? args.cancelForwardPeers : undefined,
          relayRemainingHops: args.cancelRelayHops,
        }),
      ),
    });
  }

  if (args.reportCreateTarget) {
    const taskId = requiredTaskId(args);
    const report = createReport({
      taskId,
      mandateId: args.mandateId,
      ownerId: profile.owner.ownerId,
      status: "completed",
      mode: args.reportMode ?? "brief",
      summary: args.reportSummary ?? "Task completed.",
    });

    envelopes.push({
      target: args.reportCreateTarget,
      label: `report.create task=${taskId} report=${report.reportId}`,
      envelope: signedEnvelope(
        args,
        profile,
        args.reportCreateTarget,
        "report.create",
        createReportCreatePayload(report),
      ),
    });
  }

  return envelopes;
}

function createSignedMandate(args: NodeArgs, profile: NodeProfile): Mandate {
  return signMandate({
    owner: profile.owner,
    unsignedMandate: createUnsignedMandate({
      ownerId: profile.owner.ownerId,
      issuedToDeviceId: profile.device.deviceId,
      taskIntent: args.taskIntent ?? "ad-hoc",
      objective: args.objective ?? "Owner-approved Envoy task.",
      mandateId: args.mandateId,
      expiresAt: args.mandateExpiresAt,
      closeOnFirstCompletedResult: args.closeOnFirstCompletedResult,
      collectCompletedResults: args.collectCompletedResults,
    }),
  });
}

function signedEnvelope(
  args: NodeArgs,
  profile: NodeProfile,
  target: string,
  intent: EnvoyIntent,
  payload: unknown,
): EnvoyEnvelope {
  const senderRole = intent === "chat.message" ? "human" : intent.startsWith("system.") ? "system" : "agent";
  const recipientRole = intent === "chat.message" ? "human" : "agent";
  return signUnsignedEnvelope(
    createUnsignedEnvelope({
      senderPeerId: derivePeerId(profile.device.publicKeyPem),
      senderPublicKey: profile.device.publicKeyPem,
      senderRole,
      recipientPeerId: target,
      recipientRole,
      intent,
      payload,
      correlationId: args.correlationId ?? undefined,
    }),
    profile.device.privateKeyPem,
  );
}

function requiredTaskId(args: NodeArgs): string {
  if (!args.taskId) {
    throw new Error("Missing --task-id for A2A task command");
  }

  return args.taskId;
}
