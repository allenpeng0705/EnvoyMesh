import {
  createTaskJournalEntry,
  type EnvoyEnvelope,
  type EnvoyIntent,
  parseReportCreatePayload,
  parseTaskAcceptPayload,
  parseTaskCancelPayload,
  parseTaskHeartbeatPayload,
  parseTaskMandatePayload,
  parseTaskNegotiatePayload,
  parseTaskProposePayload,
  parseTaskRejectPayload,
  parseTaskResultPayload,
  type ReportCreatePayload,
  type TaskAcceptPayload,
  type TaskCancelPayload,
  type TaskHeartbeatPayload,
  type TaskJournalEntry,
  type TaskLifecycleState,
  type TaskMandatePayload,
  type TaskNegotiatePayload,
  type TaskProposePayload,
  type TaskRejectPayload,
  type TaskResultPayload,
} from "@envoymesh/protocol";
import { ZodError } from "zod";

export type A2ATaskIntent =
  | "task.mandate"
  | "task.propose"
  | "task.negotiate"
  | "task.accept"
  | "task.reject"
  | "task.cancel"
  | "task.heartbeat"
  | "task.result"
  | "report.create";

export type A2ATaskPayloadByIntent = {
  "task.mandate": TaskMandatePayload;
  "task.propose": TaskProposePayload;
  "task.negotiate": TaskNegotiatePayload;
  "task.accept": TaskAcceptPayload;
  "task.reject": TaskRejectPayload;
  "task.cancel": TaskCancelPayload;
  "task.heartbeat": TaskHeartbeatPayload;
  "task.result": TaskResultPayload;
  "report.create": ReportCreatePayload;
};

export type DispatcherDecision =
  | {
      action: "handled";
      intent: A2ATaskIntent;
      taskId: string;
      mandateId?: string;
      state: TaskLifecycleState;
      journalEntry: TaskJournalEntry;
    }
  | { action: "ignored"; intent: EnvoyIntent; reason: string }
  | { action: "rejected"; intent: EnvoyIntent; reason: string };

export type TaskHandler<TIntent extends A2ATaskIntent> = (input: {
  envelope: EnvoyEnvelope<A2ATaskPayloadByIntent[TIntent]>;
  payload: A2ATaskPayloadByIntent[TIntent];
  defaultDecision: Extract<DispatcherDecision, { action: "handled" }>;
}) => DispatcherDecision | Promise<DispatcherDecision>;

export type TaskDispatcherHandlers = {
  [TIntent in A2ATaskIntent]?: TaskHandler<TIntent>;
};

export interface TaskDispatcher {
  dispatch(envelope: EnvoyEnvelope): Promise<DispatcherDecision>;
}

const a2aTaskIntents = new Set<EnvoyIntent>([
  "task.mandate",
  "task.propose",
  "task.negotiate",
  "task.accept",
  "task.reject",
  "task.cancel",
  "task.heartbeat",
  "task.result",
  "report.create",
]);

export function createTaskDispatcher(handlers: TaskDispatcherHandlers = {}): TaskDispatcher {
  return {
    async dispatch(envelope) {
      if (!isA2ATaskIntent(envelope.intent)) {
        return {
          action: "ignored",
          intent: envelope.intent,
          reason: "not an A2A task intent",
        };
      }

      try {
        const payload = parseA2APayload(envelope.intent, envelope.payload);
        const defaultDecision = createDefaultDecision(envelope, payload);
        const handler = handlers[envelope.intent] as TaskHandler<typeof envelope.intent> | undefined;

        if (handler) {
          return handler({
            envelope: { ...envelope, payload },
            payload,
            defaultDecision,
          });
        }

        return defaultDecision;
      } catch (error) {
        return {
          action: "rejected",
          intent: envelope.intent,
          reason: `invalid ${envelope.intent} payload${formatZodError(error)}`,
        };
      }
    },
  };
}

function isA2ATaskIntent(intent: EnvoyIntent): intent is A2ATaskIntent {
  return a2aTaskIntents.has(intent);
}

function parseA2APayload<TIntent extends A2ATaskIntent>(
  intent: TIntent,
  payload: unknown,
): A2ATaskPayloadByIntent[TIntent] {
  switch (intent) {
    case "task.mandate":
      return parseTaskMandatePayload(payload) as A2ATaskPayloadByIntent[TIntent];
    case "task.propose":
      return parseTaskProposePayload(payload) as A2ATaskPayloadByIntent[TIntent];
    case "task.negotiate":
      return parseTaskNegotiatePayload(payload) as A2ATaskPayloadByIntent[TIntent];
    case "task.accept":
      return parseTaskAcceptPayload(payload) as A2ATaskPayloadByIntent[TIntent];
    case "task.reject":
      return parseTaskRejectPayload(payload) as A2ATaskPayloadByIntent[TIntent];
    case "task.cancel":
      return parseTaskCancelPayload(payload) as A2ATaskPayloadByIntent[TIntent];
    case "task.heartbeat":
      return parseTaskHeartbeatPayload(payload) as A2ATaskPayloadByIntent[TIntent];
    case "task.result":
      return parseTaskResultPayload(payload) as A2ATaskPayloadByIntent[TIntent];
    case "report.create":
      return parseReportCreatePayload(payload) as A2ATaskPayloadByIntent[TIntent];
  }
}

function createDefaultDecision<TIntent extends A2ATaskIntent>(
  envelope: EnvoyEnvelope,
  payload: A2ATaskPayloadByIntent[TIntent],
): Extract<DispatcherDecision, { action: "handled" }> {
  const { taskId, mandateId, state, summary, eventType } = taskDecisionMetadata(
    envelope.intent as A2ATaskIntent,
    payload,
  );

  return {
    action: "handled",
    intent: envelope.intent as A2ATaskIntent,
    taskId,
    mandateId,
    state,
    journalEntry: createTaskJournalEntry({
      taskId,
      mandateId,
      state,
      eventType,
      summary,
      relatedMessageId: envelope.messageId,
      createdAt: envelope.createdAt,
    }),
  };
}

function taskDecisionMetadata(
  intent: A2ATaskIntent,
  payload: A2ATaskPayloadByIntent[A2ATaskIntent],
): {
  taskId: string;
  mandateId?: string;
  state: TaskLifecycleState;
  summary: string;
  eventType: Parameters<typeof createTaskJournalEntry>[0]["eventType"];
} {
  switch (intent) {
    case "task.mandate": {
      const mandatePayload = payload as TaskMandatePayload;
      return {
        taskId: mandatePayload.taskId ?? mandatePayload.mandate.mandateId,
        mandateId: mandatePayload.mandate.mandateId,
        state: "created",
        eventType: "mandate_attached",
        summary: `Mandate attached for ${mandatePayload.mandate.taskIntent}.`,
      };
    }
    case "task.propose": {
      const proposal = payload as TaskProposePayload;
      return {
        taskId: proposal.taskId,
        mandateId: proposal.mandateId,
        state: "negotiating",
        eventType: "proposed",
        summary: proposal.objective,
      };
    }
    case "task.negotiate": {
      const negotiation = payload as TaskNegotiatePayload;
      return {
        taskId: negotiation.taskId,
        mandateId: negotiation.mandateId,
        state: negotiation.requiresOwnerApproval ? "waiting_for_owner" : "negotiating",
        eventType: "negotiated",
        summary: negotiation.message,
      };
    }
    case "task.accept": {
      const accepted = payload as TaskAcceptPayload;
      return {
        taskId: accepted.taskId,
        mandateId: accepted.mandateId,
        state: "running",
        eventType: "accepted",
        summary: accepted.agreementSummary,
      };
    }
    case "task.reject": {
      const rejected = payload as TaskRejectPayload;
      return {
        taskId: rejected.taskId,
        mandateId: rejected.mandateId,
        state: rejected.requiresOwnerApproval ? "waiting_for_owner" : "failed",
        eventType: "rejected",
        summary: rejected.reason,
      };
    }
    case "task.cancel": {
      const cancelled = payload as TaskCancelPayload;
      return {
        taskId: cancelled.taskId,
        mandateId: cancelled.mandateId,
        state: "cancelled",
        eventType: "cancelled",
        summary: cancelled.reason,
      };
    }
    case "task.heartbeat": {
      const heartbeat = payload as TaskHeartbeatPayload;
      return {
        taskId: heartbeat.taskId,
        mandateId: heartbeat.mandateId,
        state: heartbeat.state,
        eventType: "heartbeat",
        summary: heartbeat.summary,
      };
    }
    case "task.result": {
      const result = payload as TaskResultPayload;
      return {
        taskId: result.taskId,
        mandateId: result.mandateId,
        state: result.status,
        eventType: "result_received",
        summary: result.summary,
      };
    }
    case "report.create": {
      const reportPayload = payload as ReportCreatePayload;
      return {
        taskId: reportPayload.report.taskId,
        mandateId: reportPayload.report.mandateId,
        state: reportPayload.report.status,
        eventType: "report_created",
        summary: reportPayload.report.summary,
      };
    }
  }
}

function formatZodError(error: unknown): string {
  if (!(error instanceof ZodError)) {
    return "";
  }

  const firstIssue = error.issues[0];
  if (!firstIssue) {
    return "";
  }

  return `: ${firstIssue.path.join(".")} ${firstIssue.message}`;
}
