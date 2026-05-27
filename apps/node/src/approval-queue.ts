export {
  ApprovalQueue,
  createApprovalItem,
  shouldEscalate,
  type ApprovalItem,
  type ApprovalStatus,
  type EscalationReason,
  type PendingActionType,
  type PriorityLevel,
} from "@envoymesh/api";

import {
  ApprovalQueue,
  type ApprovalItem,
  type EscalationReason,
} from "@envoymesh/api";

export function buildListPendingTool(
  queue: ApprovalQueue,
): (params: Record<string, unknown>) => Promise<{
  ok: boolean;
  items: ApprovalItem[];
  count: number;
  contactOwnerId?: string;
}> {
  return async (params) => {
    const contactOwnerId = params.contactOwnerId as string | undefined;
    const items = contactOwnerId ? queue.listByContact(contactOwnerId) : queue.listPending();
    return { ok: true, items, count: items.length, contactOwnerId };
  };
}

export function buildApproveTool(
  queue: ApprovalQueue,
): (params: Record<string, unknown>) => Promise<{ ok: boolean; item?: ApprovalItem; error?: string }> {
  return async (params) => {
    const itemId = params.itemId as string | undefined;
    const notes = params.notes as string | undefined;
    if (!itemId) return { ok: false, error: "itemId is required" };
    const approved = queue.approve(itemId, notes);
    if (!approved) return { ok: false, error: "Item not found or not pending" };
    return { ok: true, item: approved };
  };
}

export function buildRejectTool(
  queue: ApprovalQueue,
): (params: Record<string, unknown>) => Promise<{ ok: boolean; item?: ApprovalItem; error?: string }> {
  return async (params) => {
    const itemId = params.itemId as string | undefined;
    const notes = params.notes as string | undefined;
    if (!itemId) return { ok: false, error: "itemId is required" };
    const rejected = queue.reject(itemId, notes);
    if (!rejected) return { ok: false, error: "Item not found or not pending" };
    return { ok: true, item: rejected };
  };
}

export function buildRejectAllTool(
  queue: ApprovalQueue,
): (params: Record<string, unknown>) => Promise<{ ok: boolean; count: number }> {
  return async (params) => {
    const notes = params.notes as string | undefined;
    let count = 0;
    for (const item of queue.listPending()) {
      queue.reject(item.id, notes);
      count++;
    }
    return { ok: true, count };
  };
}

export function buildEscalateTool(
  queue: ApprovalQueue,
): (params: Record<string, unknown>) => Promise<{ ok: boolean; item?: ApprovalItem; error?: string }> {
  return async (params) => {
    const itemId = params.itemId as string | undefined;
    const reason = params.reason as EscalationReason | undefined;
    if (!itemId) return { ok: false, error: "itemId is required" };
    if (
      !reason ||
      !["low_confidence", "emotional_content", "sensitive_topic", "high_cost", "manual"].includes(reason)
    ) {
      return { ok: false, error: "Valid reason is required" };
    }
    const escalated = queue.escalate(itemId, reason);
    if (!escalated) return { ok: false, error: "Item not found or not pending" };
    return { ok: true, item: escalated };
  };
}

export function buildListAllApprovalsTool(
  queue: ApprovalQueue,
): (params: Record<string, unknown>) => Promise<{ ok: boolean; items: ApprovalItem[]; count: number }> {
  return async () => {
    const items = queue.listAll();
    return { ok: true, items, count: items.length };
  };
}
