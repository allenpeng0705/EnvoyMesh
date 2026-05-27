const JOURNAL_KIND = {
    proposed: "task_started",
    accepted: "task_progress",
    negotiated: "task_progress",
    heartbeat: "task_progress",
    result_received: "task_completed",
    failed: "task_failed",
    cancelled: "task_failed",
    report_created: "report_received",
};
function journalKind(eventType) {
    return JOURNAL_KIND[eventType] ?? "task_progress";
}
/** Map inbound A2A task journal entry → Activity row (caller supplies `activityId`). */
export function mapTaskJournalToActivity(journalEntry, envelope, activityId) {
    return {
        activityId,
        correlationId: envelope.correlationId ?? journalEntry.taskId,
        taskId: journalEntry.taskId,
        domain: "research",
        kind: journalKind(journalEntry.eventType),
        summary: journalEntry.summary,
        remoteAgentId: envelope.senderRole === "agent" ? envelope.senderPeerId : undefined,
        remoteActorRole: envelope.senderRole === "agent" ? "agent" : "human",
        evidence: [{ type: "intent", ref: journalEntry.relatedMessageId ?? envelope.messageId }],
        createdAt: journalEntry.createdAt,
    };
}
/** Resolve bonded contact for A2A chat system lines / Activity remoteOwnerId. */
export function resolveReportContactOwnerId(report, localOwnerId, explicitContactOwnerId) {
    if (explicitContactOwnerId?.trim()) {
        return explicitContactOwnerId.trim();
    }
    for (const item of report.evidence) {
        if (item.type === "peer_response" &&
            item.source.startsWith("envoy:owner:") &&
            item.source !== localOwnerId) {
            return item.source;
        }
    }
    return undefined;
}
/** Local-only owner report (Option A — no P2P envelope to human). */
export function mapOwnerReportToActivity(report, activityId, localOwnerId) {
    const owner = localOwnerId ?? report.ownerId;
    return {
        activityId,
        correlationId: report.taskId,
        taskId: report.taskId,
        domain: "research",
        kind: "report_received",
        summary: report.summary,
        remoteOwnerId: resolveReportContactOwnerId(report, owner),
        evidence: report.evidence.map((item) => ({
            type: item.type,
            ref: item.source,
        })),
        requiresOwnerAction: report.suggestedActions.some((action) => action.requiresApproval),
        createdAt: report.createdAt,
    };
}
//# sourceMappingURL=agent-activity-map.js.map