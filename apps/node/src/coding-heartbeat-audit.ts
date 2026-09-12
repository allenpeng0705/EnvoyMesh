/**
 * Audit helpers for Coding heartbeats (Phase 68-C6).
 */

import { randomUUID } from "node:crypto"
import { createAuditEvent, type LocalTaskStore } from "@envoymesh/local-store"

type AppendAudit = Pick<LocalTaskStore, "appendAuditEvent">

async function append(
  taskStore: AppendAudit | null | undefined,
  type: "coding.heartbeat.fired" | "coding.heartbeat.failed",
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
    // Audit must not break heartbeat dispatch.
  }
}

export function auditCodingHeartbeatFired(
  taskStore: AppendAudit | null | undefined,
  opts: { id: string; name: string; kind: string },
): void {
  void append(
    taskStore,
    "coding.heartbeat.fired",
    `coding.heartbeat.fired id=${opts.id} name=${opts.name} kind=${opts.kind}`,
    "record",
  )
}

export function auditCodingHeartbeatFailed(
  taskStore: AppendAudit | null | undefined,
  opts: { id: string; name: string; reason: string },
): void {
  void append(
    taskStore,
    "coding.heartbeat.failed",
    `coding.heartbeat.failed id=${opts.id} name=${opts.name} reason=${opts.reason}`,
    "deny",
  )
}
