/**
 * Approval Queue for AI Agent
 *
 * Manages pending approval items for sensitive actions:
 * - AI-drafted actions held until owner review
 * - Escalation handling for important items
 * - Integration with audit logging
 */
/**
 * Pending action type.
 */
export type PendingActionType = "send_chat" | "share_knowledge" | "send_digest" | "follow_up" | "proactive_checkin" | "external_request" | "discovery_forward";
/**
 * Approval status.
 */
export type ApprovalStatus = "pending" | "approved" | "rejected" | "expired" | "escalated";
/**
 * Priority level.
 */
export type PriorityLevel = "low" | "normal" | "high" | "urgent";
/**
 * Pending approval item.
 */
export interface ApprovalItem {
    id: string;
    actionType: PendingActionType;
    status: ApprovalStatus;
    priority: PriorityLevel;
    title: string;
    description: string;
    draftContent: string;
    context: {
        contactOwnerId?: string;
        contactDisplayName?: string;
        triggerId?: string;
        triggerName?: string;
        confidence?: number;
        sentiment?: "positive" | "neutral" | "negative";
        sensitivityLevel?: number;
        requestedCapabilities?: string[];
        metadata?: Record<string, unknown>;
    };
    requestedAt: string;
    expiresAt?: string;
    resolvedAt?: string;
    resolvedBy?: "owner" | "agent";
    resolution?: "approved" | "rejected";
    notes?: string;
}
/**
 * Escalation reason.
 */
export type EscalationReason = "low_confidence" | "emotional_content" | "sensitive_topic" | "high_cost" | "manual";
/**
 * Create a new approval item.
 */
export declare function createApprovalItem(actionType: PendingActionType, title: string, description: string, draftContent: string, context?: ApprovalItem["context"], priority?: PriorityLevel): ApprovalItem;
/**
 * Check if an approval item should escalate based on context.
 */
export declare function shouldEscalate(item: ApprovalItem): EscalationReason | null;
/**
 * Approval Queue manages pending approvals.
 */
export declare class ApprovalQueue {
    private items;
    constructor();
    /**
     * Add an item to the queue.
     */
    add(item: ApprovalItem): void;
    /**
     * Get an item by ID.
     */
    get(id: string): ApprovalItem | undefined;
    /**
     * Remove an item from the queue.
     */
    remove(id: string): boolean;
    /**
     * Update an item.
     */
    update(id: string, updates: Partial<ApprovalItem>): ApprovalItem | undefined;
    /**
     * List all pending items.
     */
    listPending(): ApprovalItem[];
    /**
     * List items for a specific contact.
     */
    listByContact(contactOwnerId: string): ApprovalItem[];
    /**
     * List all items (any status).
     */
    listAll(): ApprovalItem[];
    /**
     * Approve an item.
     */
    approve(id: string, notes?: string): ApprovalItem | undefined;
    /**
     * Reject an item.
     */
    reject(id: string, notes?: string): ApprovalItem | undefined;
    /**
     * Escalate an item.
     */
    escalate(id: string, reason: EscalationReason): ApprovalItem | undefined;
    /**
     * Expire old items.
     */
    expireOldItems(): string[];
    /**
     * Clear all rejected/expired items.
     */
    clearResolved(): number;
    /**
     * Get count of pending items.
     */
    pendingCount(): number;
}
//# sourceMappingURL=approval-queue.d.ts.map