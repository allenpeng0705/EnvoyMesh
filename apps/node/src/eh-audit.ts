/**
 * Thin audit wrappers for Envoy Harness coding actions (mirrors pi-tool-bridge).
 */

import { randomUUID } from "node:crypto"

import {
  createAuditEvent,
  type LocalTaskStore,
} from "@envoymesh/local-store"

export type EhAuditType =
  | "eh.turn.started"
  | "eh.turn.cancelled"
  | "eh.permission.responded"
  | "eh.review.accepted"
  | "eh.review.invited"

type AppendAudit = Pick<LocalTaskStore, "appendAuditEvent">

async function appendEhAudit(
  taskStore: AppendAudit | null | undefined,
  type: EhAuditType,
  params: {
    summary: string
    outcome: "allow" | "deny" | "record"
    correlationId?: string
  },
): Promise<void> {
  if (!taskStore) return
  try {
    await taskStore.appendAuditEvent(
      createAuditEvent({
        type,
        intent: "chat.message",
        messageId: randomUUID(),
        remotePeerId: "local",
        direction: "local",
        verificationStatus: "verified",
        latencyMs: 0,
        outcome: params.outcome,
        summary: params.summary.slice(0, 400),
        ...(params.correlationId
          ? { correlationId: params.correlationId }
          : {}),
      }),
    )
  } catch {
    // Audit failures must never break the harness flow.
  }
}

export function auditEhTurnStarted(
  taskStore: AppendAudit | null | undefined,
  params: { turnId: string; chatId?: string },
): void {
  void appendEhAudit(taskStore, "eh.turn.started", {
    outcome: "allow",
    summary: params.chatId
      ? `EH turn started chat=${params.chatId}`
      : "EH turn started",
    correlationId: params.turnId,
  })
}

export function auditEhTurnCancelled(
  taskStore: AppendAudit | null | undefined,
  params: { turnId?: string; chatId?: string },
): void {
  void appendEhAudit(taskStore, "eh.turn.cancelled", {
    outcome: "record",
    summary: params.chatId
      ? `EH turn cancelled chat=${params.chatId}`
      : "EH turn cancelled",
    correlationId: params.turnId,
  })
}

export function auditEhPermissionResponded(
  taskStore: AppendAudit | null | undefined,
  params: { requestId: string; allowed: boolean },
): void {
  void appendEhAudit(taskStore, "eh.permission.responded", {
    outcome: params.allowed ? "allow" : "deny",
    summary: params.allowed
      ? "EH permission allowed"
      : "EH permission denied",
    correlationId: params.requestId,
  })
}

export function auditEhReviewAccepted(
  taskStore: AppendAudit | null | undefined,
  params: { turnId: string; remainingFiles: number },
): void {
  void appendEhAudit(taskStore, "eh.review.accepted", {
    outcome: "allow",
    summary: `EH review accepted remaining=${params.remainingFiles}`,
    correlationId: params.turnId,
  })
}

export function auditEhReviewInvited(
  taskStore: AppendAudit | null | undefined,
  params: { chatId: string; peerOwnerId: string; turnId?: string },
): void {
  void appendEhAudit(taskStore, "eh.review.invited", {
    outcome: "record",
    summary: `EH review invited chat=${params.chatId} peer=${params.peerOwnerId}`,
    correlationId: params.turnId ?? params.chatId,
  })
}
