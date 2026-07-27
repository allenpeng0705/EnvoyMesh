/**
 * Approval Queue for AI Agent
 *
 * Manages pending approval items for sensitive actions:
 * - AI-drafted actions held until owner review
 * - Escalation handling for important items
 * - Integration with audit logging
 */

function randomUUID(): string { return crypto.randomUUID(); }

/**
 * Pending action type.
 */
export type PendingActionType =
  | "send_chat"
  | "share_knowledge"
  | "send_digest"
  | "follow_up"
  | "proactive_checkin"
  | "external_request"
  | "discovery_forward"
  | "chain_award"
  | "tool_call";

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
export function createApprovalItem(
  actionType: PendingActionType,
  title: string,
  description: string,
  draftContent: string,
  context: ApprovalItem["context"] = {},
  priority: PriorityLevel = "normal",
): ApprovalItem {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    actionType,
    status: "pending",
    priority,
    title,
    description,
    draftContent,
    context,
    requestedAt: now,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
  };
}

/**
 * Check if an approval item should escalate based on context.
 */
export function shouldEscalate(item: ApprovalItem): EscalationReason | null {
  // Low confidence
  if (item.context.confidence !== undefined && item.context.confidence < 0.6) {
    return "low_confidence";
  }

  // Emotional content
  if (item.context.sentiment === "negative") {
    return "emotional_content";
  }

  // High sensitivity
  if (item.context.sensitivityLevel !== undefined && item.context.sensitivityLevel > 7) {
    return "sensitive_topic";
  }

  return null;
}

/**
 * Approval Queue manages pending approvals.
 */
export class ApprovalQueue {
  private items: Map<string, ApprovalItem>;
  /**
   * Subscribers notified after any mutation that could change
   * `pendingCount()`: add, update (covers approve/reject/escalate),
   * remove, expireOldItems, clearResolved.
   *
   * Used by NodeServiceImpl to invalidate the pending-approval-count
   * cache used by terminal activity enrichment when the count changes.
   * The Set lets us add/remove subscribers without leaking listeners.
   *
   * Errors thrown inside subscribers are swallowed — a single bad
   * subscriber must not poison the rest or break the mutation path.
   */
  private changeListeners: Set<() => void> = new Set();

  constructor() {
    this.items = new Map();
  }

  /**
   * Register a callback fired after every mutating operation. Returns
   * an unsubscribe function — the canonical pattern for cleanup in
   * teardown paths.
   */
  onChange(callback: () => void): () => void {
    this.changeListeners.add(callback);
    return () => {
      this.changeListeners.delete(callback);
    };
  }

  private notifyChange(): void {
    // Snapshot in case a callback unsubscribes during iteration.
    const listeners = Array.from(this.changeListeners);
    for (const cb of listeners) {
      try {
        cb();
      } catch (err) {
        // Defensive: one bad subscriber must not stop others from
        // firing. Log to stderr so the failure is still diagnosable.
        console.error("[approval-queue] onChange subscriber threw:", err);
      }
    }
  }

  /**
   * Add an item to the queue.
   */
  add(item: ApprovalItem): void {
    this.items.set(item.id, item);
    this.notifyChange();
  }

  /**
   * Get an item by ID.
   */
  get(id: string): ApprovalItem | undefined {
    return this.items.get(id);
  }

  /**
   * Remove an item from the queue.
   */
  remove(id: string): boolean {
    const result = this.items.delete(id);
    if (result) this.notifyChange();
    return result;
  }

  /**
   * Update an item.
   */
  update(id: string, updates: Partial<ApprovalItem>): ApprovalItem | undefined {
    const existing = this.items.get(id);
    if (!existing) return undefined;

    const updated: ApprovalItem = { ...existing, ...updates };
    this.items.set(id, updated);
    this.notifyChange();
    return updated;
  }

  /**
   * List all pending items.
   */
  listPending(): ApprovalItem[] {
    return Array.from(this.items.values())
      .filter((i) => i.status === "pending")
      .sort((a, b) => {
        // Sort by priority first (urgent > high > normal > low)
        const priorityOrder = { urgent: 0, high: 1, normal: 2, low: 3 };
        const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
        if (priorityDiff !== 0) return priorityDiff;
        // Then by date (oldest first)
        return new Date(a.requestedAt).getTime() - new Date(b.requestedAt).getTime();
      });
  }

  /**
   * List items for a specific contact.
   */
  listByContact(contactOwnerId: string): ApprovalItem[] {
    return Array.from(this.items.values()).filter(
      (i) => i.context.contactOwnerId === contactOwnerId && i.status === "pending",
    );
  }

  /**
   * List all items (any status).
   */
  listAll(): ApprovalItem[] {
    return Array.from(this.items.values()).sort(
      (a, b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime(),
    );
  }

  /**
   * Approve an item.
   */
  approve(id: string, notes?: string): ApprovalItem | undefined {
    const item = this.items.get(id);
    if (!item || item.status !== "pending") return undefined;

    return this.update(id, {
      status: "approved",
      resolution: "approved",
      resolvedAt: new Date().toISOString(),
      resolvedBy: "owner",
      notes: notes || item.notes,
    });
  }

  /**
   * Reject an item.
   */
  reject(id: string, notes?: string): ApprovalItem | undefined {
    const item = this.items.get(id);
    if (!item || item.status !== "pending") return undefined;

    return this.update(id, {
      status: "rejected",
      resolution: "rejected",
      resolvedAt: new Date().toISOString(),
      resolvedBy: "owner",
      notes: notes || item.notes,
    });
  }

  /**
   * Escalate an item.
   */
  escalate(id: string, reason: EscalationReason): ApprovalItem | undefined {
    const item = this.items.get(id);
    if (!item || item.status !== "pending") return undefined;

    return this.update(id, {
      status: "escalated",
      priority: reason === "low_confidence" || reason === "emotional_content" ? "urgent" : "high",
    });
  }

  /**
   * Expire old items.
   */
  expireOldItems(): string[] {
    const now = new Date();
    const expired: string[] = [];

    for (const item of this.items.values()) {
      if (item.status === "pending" && item.expiresAt) {
        const expiryDate = new Date(item.expiresAt);
        if (expiryDate < now) {
          // update() already calls notifyChange(); we still notify at
          // the end as a belt-and-suspenders so bulk operations get
          // exactly one notification per call rather than N. The
          // dedup is acceptable — subscribers should always check the
          // current state rather than count invocations.
          this.update(item.id, { status: "expired" });
          expired.push(item.id);
        }
      }
    }

    return expired;
  }

  /**
   * Clear all rejected/expired items.
   */
  clearResolved(): number {
    let count = 0;
    let mutated = false;
    for (const item of this.items.values()) {
      if (item.status === "rejected" || item.status === "expired") {
        this.items.delete(item.id);
        count++;
        mutated = true;
      }
    }
    if (mutated) this.notifyChange();
    return count;
  }

  /**
   * Get count of pending items.
   */
  pendingCount(): number {
    return Array.from(this.items.values()).filter((i) => i.status === "pending").length;
  }
}
