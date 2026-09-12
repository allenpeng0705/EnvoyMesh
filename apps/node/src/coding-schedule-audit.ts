/**
 * Audit helpers for Coding schedules (Phase 68-C7).
 */

import { randomUUID } from "node:crypto"
import { createAuditEvent, type LocalTaskStore } from "@envoymesh/local-store"

type AppendAudit = Pick<LocalTaskStore, "appendAuditEvent">

async function append(
  taskStore: AppendAudit | null | undefined,
  type: "coding.schedule.fired" | "coding.schedule.failed",
  summary: string,
  outcome: "allow" | "deny" | "record",
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
        outcome,
        summary,
      }),
    )
  } catch {
    // Audit must not break schedule dispatch.
  }
}

export function auditCodingScheduleFired(
  taskStore: AppendAudit | null | undefined,
  opts: { id: string; name: string; harness: string; workspaceId?: string },
): void {
  void append(
    taskStore,
    "coding.schedule.fired",
    `coding.schedule.fired id=${opts.id} name=${opts.name} harness=${opts.harness}${
      opts.workspaceId ? ` workspace=${opts.workspaceId}` : ""
    }`,
    "record",
  )
}

export function auditCodingScheduleFailed(
  taskStore: AppendAudit | null | undefined,
  opts: { id: string; name: string; reason: string },
): void {
  void append(
    taskStore,
    "coding.schedule.failed",
    `coding.schedule.failed id=${opts.id} name=${opts.name} reason=${opts.reason}`,
    "deny",
  )
}
