import type { SendChatResult } from "./node-service.js";
import type { ApprovalItem } from "./approval-queue.js";

export type ApprovalExecutionResult =
  | { ok: true; actionType: ApprovalItem["actionType"]; messageId?: string }
  | { ok: false; reason: string };

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
  forwardDiscovery?: (payload: DiscoveryForwardApprovalPayload) => Promise<{ ok: boolean; error?: string }>;
}

/** Run an approved queue item (Phase 13 — send_chat uses honest agent role). */
export async function executeApprovedAction(
  item: ApprovalItem,
  deps: ApprovalExecutorDeps,
): Promise<ApprovalExecutionResult> {
  switch (item.actionType) {
    case "send_chat": {
      const targetOwnerId = item.context.contactOwnerId?.trim();
      const text = item.draftContent?.trim();
      if (!targetOwnerId) {
        return { ok: false, reason: "send_chat approval missing context.contactOwnerId" };
      }
      if (!text) {
        return { ok: false, reason: "send_chat approval missing draftContent" };
      }
      const result = await deps.sendAgentChat(targetOwnerId, text);
      return { ok: true, actionType: "send_chat", messageId: result.messageId };
    }
    case "discovery_forward": {
      if (!deps.forwardDiscovery) {
        return { ok: false, reason: "discovery_forward executor not configured" };
      }
      let parsed: DiscoveryForwardApprovalPayload;
      try {
        parsed = JSON.parse(item.draftContent) as DiscoveryForwardApprovalPayload;
      } catch {
        return { ok: false, reason: "discovery_forward approval has invalid draftContent JSON" };
      }
      const result = await deps.forwardDiscovery(parsed);
      if (!result.ok) {
        return { ok: false, reason: result.error ?? "discovery forward failed" };
      }
      return { ok: true, actionType: "discovery_forward" };
    }
    default:
      return {
        ok: false,
        reason: `action type "${item.actionType}" is not executable yet`,
      };
  }
}
