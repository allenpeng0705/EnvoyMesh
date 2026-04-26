import {
  createProofOfIntent,
  derivePeerId,
  signMandate,
  signUnsignedEnvelope,
} from "@envoymesh/identity";
import type { NodeProfile } from "@envoymesh/local-store";
import {
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

  if (args.taskMandateTarget) {
    const taskId = requiredTaskId(args);
    const mandate = createSignedMandate(args, profile);
    envelopes.push({
      target: args.taskMandateTarget,
      label: `task.mandate task=${taskId} mandate=${mandate.mandateId}`,
      envelope: signedEnvelope(profile, args.taskMandateTarget, "task.mandate", {
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
        profile,
        args.taskProposeTarget,
        "task.propose",
        createTaskProposePayload({
          taskId,
          mandateId: mandate.mandateId,
          proofOfIntent,
          objective: args.objective ?? mandate.objective,
          requestedResult: args.requestedResult ?? "Return a concise result with evidence.",
        }),
      ),
    });
  }

  if (args.taskCancelTarget) {
    const taskId = requiredTaskId(args);
    envelopes.push({
      target: args.taskCancelTarget,
      label: `task.cancel task=${taskId}`,
      envelope: signedEnvelope(
        profile,
        args.taskCancelTarget,
        "task.cancel",
        createTaskCancelPayload({
          taskId,
          mandateId: args.mandateId,
          reason: args.reason ?? "Owner cancelled the task.",
          cancelledBy: "owner",
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
    }),
  });
}

function signedEnvelope(
  profile: NodeProfile,
  target: string,
  intent: EnvoyIntent,
  payload: unknown,
): EnvoyEnvelope {
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

function requiredTaskId(args: NodeArgs): string {
  if (!args.taskId) {
    throw new Error("Missing --task-id for A2A task command");
  }

  return args.taskId;
}
