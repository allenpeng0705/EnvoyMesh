import { createTaskJournalEntry, parseReportCreatePayload, parseTaskAcceptPayload, parseTaskCancelPayload, parseTaskHeartbeatPayload, parseTaskMandatePayload, parseTaskNegotiatePayload, parseTaskProposePayload, parseTaskRejectPayload, parseTaskResultPayload, } from "@envoymesh/protocol";
import { ZodError } from "zod";
const a2aTaskIntents = new Set([
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
export function createTaskDispatcher(handlers = {}) {
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
                const handler = handlers[envelope.intent];
                if (handler) {
                    return handler({
                        envelope: { ...envelope, payload },
                        payload,
                        defaultDecision,
                    });
                }
                return defaultDecision;
            }
            catch (error) {
                return {
                    action: "rejected",
                    intent: envelope.intent,
                    reason: `invalid ${envelope.intent} payload${formatZodError(error)}`,
                };
            }
        },
    };
}
export function isA2ATaskIntent(intent) {
    return a2aTaskIntents.has(intent);
}
export function parseA2APayload(intent, payload) {
    switch (intent) {
        case "task.mandate":
            return parseTaskMandatePayload(payload);
        case "task.propose":
            return parseTaskProposePayload(payload);
        case "task.negotiate":
            return parseTaskNegotiatePayload(payload);
        case "task.accept":
            return parseTaskAcceptPayload(payload);
        case "task.reject":
            return parseTaskRejectPayload(payload);
        case "task.cancel":
            return parseTaskCancelPayload(payload);
        case "task.heartbeat":
            return parseTaskHeartbeatPayload(payload);
        case "task.result":
            return parseTaskResultPayload(payload);
        case "report.create":
            return parseReportCreatePayload(payload);
    }
}
function createDefaultDecision(envelope, payload) {
    const { taskId, mandateId, state, summary, eventType } = taskDecisionMetadata(envelope.intent, payload);
    // Extract peer tracking info from envelope sender
    // peerOwnerId: the sender's runtime peer identity (used for routing cancellations)
    // peerDeviceId: derived from sender's public key (unique per device)
    const peerOwnerId = envelope.senderPeerId;
    const peerDeviceId = envelope.senderPublicKey;
    return {
        action: "handled",
        intent: envelope.intent,
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
            peerOwnerId,
            peerDeviceId,
        }),
    };
}
function taskDecisionMetadata(intent, payload) {
    switch (intent) {
        case "task.mandate": {
            const mandatePayload = payload;
            return {
                taskId: mandatePayload.taskId ?? mandatePayload.mandate.mandateId,
                mandateId: mandatePayload.mandate.mandateId,
                state: "created",
                eventType: "mandate_attached",
                summary: `Mandate attached for ${mandatePayload.mandate.taskIntent}.`,
            };
        }
        case "task.propose": {
            const proposal = payload;
            return {
                taskId: proposal.taskId,
                mandateId: proposal.mandateId,
                state: "negotiating",
                eventType: "proposed",
                summary: proposal.objective,
            };
        }
        case "task.negotiate": {
            const negotiation = payload;
            return {
                taskId: negotiation.taskId,
                mandateId: negotiation.mandateId,
                state: negotiation.requiresOwnerApproval ? "waiting_for_owner" : "negotiating",
                eventType: "negotiated",
                summary: negotiation.message,
            };
        }
        case "task.accept": {
            const accepted = payload;
            return {
                taskId: accepted.taskId,
                mandateId: accepted.mandateId,
                state: "running",
                eventType: "accepted",
                summary: accepted.agreementSummary,
            };
        }
        case "task.reject": {
            const rejected = payload;
            return {
                taskId: rejected.taskId,
                mandateId: rejected.mandateId,
                state: rejected.requiresOwnerApproval ? "waiting_for_owner" : "failed",
                eventType: "rejected",
                summary: rejected.reason,
            };
        }
        case "task.cancel": {
            const cancelled = payload;
            return {
                taskId: cancelled.taskId,
                mandateId: cancelled.mandateId,
                state: "cancelled",
                eventType: "cancelled",
                summary: cancelled.reason,
            };
        }
        case "task.heartbeat": {
            const heartbeat = payload;
            return {
                taskId: heartbeat.taskId,
                mandateId: heartbeat.mandateId,
                state: heartbeat.state,
                eventType: "heartbeat",
                summary: heartbeat.summary,
            };
        }
        case "task.result": {
            const result = payload;
            return {
                taskId: result.taskId,
                mandateId: result.mandateId,
                state: result.status,
                eventType: "result_received",
                summary: result.summary,
            };
        }
        case "report.create": {
            const reportPayload = payload;
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
function formatZodError(error) {
    if (!(error instanceof ZodError)) {
        return "";
    }
    const firstIssue = error.issues[0];
    if (!firstIssue) {
        return "";
    }
    return `: ${firstIssue.path.join(".")} ${firstIssue.message}`;
}
//# sourceMappingURL=task-dispatcher.js.map