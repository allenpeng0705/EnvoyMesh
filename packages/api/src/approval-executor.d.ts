import type { SendChatResult } from "./node-service.js";
import type { ApprovalItem } from "./approval-queue.js";
export type ApprovalExecutionResult = {
    ok: true;
    actionType: ApprovalItem["actionType"];
    messageId?: string;
} | {
    ok: false;
    reason: string;
};
export interface DiscoveryForwardApprovalPayload {
    requestMessageId: string;
    requesterOwnerId: string;
    correlationId?: string;
    excludeOwnerIds: string[];
    requestedCapabilities: string[];
    requestedTagHashes: string[];
    maxHops: number;
    currentHop: number;
}
export interface ApprovalExecutorDeps {
    sendAgentChat: (targetOwnerId: string, text: string) => Promise<SendChatResult>;
    forwardDiscovery?: (payload: DiscoveryForwardApprovalPayload) => Promise<{
        ok: boolean;
        error?: string;
    }>;
}
/** Run an approved queue item (Phase 13 — send_chat uses honest agent role). */
export declare function executeApprovedAction(item: ApprovalItem, deps: ApprovalExecutorDeps): Promise<ApprovalExecutionResult>;
//# sourceMappingURL=approval-executor.d.ts.map