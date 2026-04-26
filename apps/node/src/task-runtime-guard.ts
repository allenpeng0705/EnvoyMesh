import type { TaskRuntimeStateStore } from "@envoymesh/local-store";
import type {
  EnvoyEnvelope,
  ReportCreatePayload,
  TaskAcceptPayload,
  TaskCancelPayload,
  TaskHeartbeatPayload,
  TaskMandatePayload,
  TaskNegotiatePayload,
  TaskProposePayload,
  TaskRejectPayload,
  TaskResultPayload,
} from "@envoymesh/protocol";
import type { A2ATaskIntent, A2ATaskPayloadByIntent, DispatcherDecision } from "./task-dispatcher.js";
import { isA2ATaskIntent, parseA2APayload } from "./task-dispatcher.js";

export async function guardInboundTaskRuntime(input: {
  envelope: EnvoyEnvelope;
  store: TaskRuntimeStateStore;
  now?: Date;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  const { envelope, store, now = new Date() } = input;

  if (!isA2ATaskIntent(envelope.intent)) {
    return { ok: true };
  }

  try {
    const intent = envelope.intent;
    const payload = parseA2APayload(intent, envelope.payload);
    const taskId = extractTaskId(intent, payload);
    const lifecycle = await store.getTaskLifecycle(taskId);

    if (lifecycle === "cancelled") {
      return { ok: false, reason: "task is cancelled" };
    }

    if (lifecycle === "satisfied") {
      return { ok: false, reason: "task is closed after a completed result" };
    }

    const deadlineIso = await resolveExpiryDeadlineIso(intent, payload, store);
    if (deadlineIso && new Date(deadlineIso).getTime() < now.getTime()) {
      return { ok: false, reason: `task window expired (deadline ${deadlineIso})` };
    }

    return { ok: true };
  } catch {
    return { ok: true };
  }
}

export async function applyTaskRuntimeAfterHandled(input: {
  decision: DispatcherDecision;
  envelope: EnvoyEnvelope;
  store: TaskRuntimeStateStore;
}): Promise<void> {
  const { decision, envelope, store } = input;

  if (decision.action !== "handled") {
    return;
  }

  const intent = decision.intent;
  if (!isA2ATaskIntent(intent)) {
    return;
  }

  try {
    const payload = parseA2APayload(intent, envelope.payload);

    if (intent === "task.mandate") {
      const mandatePayload = payload as TaskMandatePayload;
      const taskId = mandatePayload.taskId ?? mandatePayload.mandate.mandateId;
      await store.recordMandateTermination(mandatePayload.mandate, taskId);
    }

    if (intent === "task.cancel") {
      await store.markTaskCancelled((payload as TaskCancelPayload).taskId);
    }

    if (intent === "task.result") {
      const resultPayload = payload as TaskResultPayload;
      if (resultPayload.status === "completed" && resultPayload.mandateId) {
        const profile = await store.getMandateTermination(resultPayload.mandateId);
        if (profile?.closeOnFirstCompletedResult) {
          await store.markTaskSatisfied(resultPayload.taskId);
        }
      }
    }
  } catch {
    // ignore malformed payloads here; dispatcher already accepted them
  }
}

function extractTaskId(intent: A2ATaskIntent, payload: A2ATaskPayloadByIntent[A2ATaskIntent]): string {
  switch (intent) {
    case "task.mandate": {
      const mandatePayload = payload as TaskMandatePayload;
      return mandatePayload.taskId ?? mandatePayload.mandate.mandateId;
    }
    case "task.propose":
      return (payload as TaskProposePayload).taskId;
    case "task.negotiate":
      return (payload as TaskNegotiatePayload).taskId;
    case "task.accept":
      return (payload as TaskAcceptPayload).taskId;
    case "task.reject":
      return (payload as TaskRejectPayload).taskId;
    case "task.cancel":
      return (payload as TaskCancelPayload).taskId;
    case "task.heartbeat":
      return (payload as TaskHeartbeatPayload).taskId;
    case "task.result":
      return (payload as TaskResultPayload).taskId;
    case "report.create":
      return (payload as ReportCreatePayload).report.taskId;
  }
}

async function resolveExpiryDeadlineIso(
  intent: A2ATaskIntent,
  payload: A2ATaskPayloadByIntent[A2ATaskIntent],
  store: TaskRuntimeStateStore,
): Promise<string | undefined> {
  switch (intent) {
    case "task.mandate":
      return (payload as TaskMandatePayload).mandate.expiresAt;
    case "task.propose": {
      const proposal = payload as TaskProposePayload;
      if (proposal.expiresAt) {
        return proposal.expiresAt;
      }
      return (await store.getMandateTermination(proposal.mandateId))?.expiresAt;
    }
    case "task.negotiate":
      return (await store.getMandateTermination((payload as TaskNegotiatePayload).mandateId))?.expiresAt;
    case "task.accept":
      return (await store.getMandateTermination((payload as TaskAcceptPayload).mandateId))?.expiresAt;
    case "task.reject": {
      const rejected = payload as TaskRejectPayload;
      return rejected.mandateId ? (await store.getMandateTermination(rejected.mandateId))?.expiresAt : undefined;
    }
    case "task.cancel": {
      const cancelled = payload as TaskCancelPayload;
      return cancelled.mandateId ? (await store.getMandateTermination(cancelled.mandateId))?.expiresAt : undefined;
    }
    case "task.heartbeat": {
      const heartbeat = payload as TaskHeartbeatPayload;
      return heartbeat.mandateId ? (await store.getMandateTermination(heartbeat.mandateId))?.expiresAt : undefined;
    }
    case "task.result": {
      const result = payload as TaskResultPayload;
      return result.mandateId ? (await store.getMandateTermination(result.mandateId))?.expiresAt : undefined;
    }
    case "report.create": {
      const reportPayload = payload as ReportCreatePayload;
      const mandateId = reportPayload.report.mandateId;
      return mandateId ? (await store.getMandateTermination(mandateId))?.expiresAt : undefined;
    }
  }
}
