import type { Report, TaskJournalEntry } from "@envoymesh/protocol";
import type { AgentActivityRecord } from "./node-service.js";
/** Map inbound A2A task journal entry → Activity row (caller supplies `activityId`). */
export declare function mapTaskJournalToActivity(journalEntry: TaskJournalEntry, envelope: {
    messageId: string;
    correlationId?: string;
    senderPeerId: string;
    senderRole: string;
}, activityId: string): AgentActivityRecord;
/** Resolve bonded contact for A2A chat system lines / Activity remoteOwnerId. */
export declare function resolveReportContactOwnerId(report: Report, localOwnerId: string, explicitContactOwnerId?: string): string | undefined;
/** Local-only owner report (Option A — no P2P envelope to human). */
export declare function mapOwnerReportToActivity(report: Report, activityId: string, localOwnerId?: string): AgentActivityRecord;
//# sourceMappingURL=agent-activity-map.d.ts.map