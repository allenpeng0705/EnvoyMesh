/**
 * Phase 49D — Pi tool-call bridge.
 *
 * Converts Pi's `extension_ui_request` (the tool-approval sub-protocol) into
 * a `PiToolProposal` for the UI, and emits `pi.tool.*` audit events.
 *
 * CRITICAL: EnvoyMesh does NOT execute Pi's tools. Pi executes them
 * internally after we send `confirmed: true` via `PiRuntime.respondToUiRequest`.
 * This module only:
 *   1. Shapes the request for UI consumption (PiToolProposal).
 *   2. Redacts secrets from title/message before audit logging.
 *   3. Provides the audit-event emitter for proposed/executed/denied/failed.
 *
 * See docs/pi-integration-design.md §7 ("Why NOT to reuse TerminalCommandProposal").
 */

import { randomUUID } from "node:crypto"
import { createAuditEvent, type LocalTaskStore } from "@envoymesh/local-store"
import { evaluateEgressContent } from "@envoymesh/models"
import type {
  PiExtensionUiRequest,
  PiToolProposal,
} from "@envoymesh/api"

// ---------------------------------------------------------------------------
// Request → Proposal (the UI payload)
// ---------------------------------------------------------------------------

/**
 * Convert a Pi extension_ui_request into a PiToolProposal for the UI.
 *
 * The title/message are NOT redacted here — the user needs to see the full
 * prompt to decide. Redaction applies only to the audit log (see auditPiTool*).
 *
 * Returns null if the request is malformed (missing/empty id/title/message).
 */
export function piRequestToProposal(req: PiExtensionUiRequest): PiToolProposal | null {
  if (
    !req.id ||
    typeof req.title !== "string" ||
    typeof req.message !== "string" ||
    req.title.trim() === "" ||
    req.message.trim() === ""
  ) {
    return null
  }
  return {
    uiRequestId: req.id,
    title: req.title,
    message: req.message,
    timeoutMs: typeof req.timeout === "number" ? req.timeout : 30_000,
    receivedAt: new Date().toISOString(),
  }
}

// ---------------------------------------------------------------------------
// Audit helpers
// ---------------------------------------------------------------------------

export type PiToolAuditType =
  | "pi.tool.proposed"
  | "pi.tool.executed"
  | "pi.tool.denied"
  | "pi.tool.failed"

/**
 * Build a redacted summary of a Pi tool request for the audit log.
 *
 * Concatenates title + message, runs the egress-content scan, and if secrets
 * are detected (PEM keys, AWS creds, JWTs, connection strings), replaces the
 * offending portions with `[redacted]`. The user sees the full prompt in the
 * dialog; only the persisted audit record is redacted.
 *
 * Returns the safe-to-log summary string.
 */
export function redactPiRequestForAudit(title: string, message: string): string {
  const combined = `${title}: ${message}`.slice(0, 500) // bound the log line
  const scan = evaluateEgressContent({ text: combined })
  if (scan.ok) return combined
  // The scanner detected a secret pattern. Rather than try to surgically
  // redact just the secret (scanner doesn't return offsets), fall back to
  // a generic summary that preserves context without leaking the secret.
  return `${title}: [redacted — secret pattern detected in prompt]`
}

/**
 * Emit a pi.tool.* audit event. Mirrors terminal-agent-assist.ts:1321 audit().
 *
 * `taskStore` is optional — callers without a store (tests) get a no-op.
 */
export async function auditPiTool(
  taskStore: LocalTaskStore | undefined | null,
  type: PiToolAuditType,
  params: {
    uiRequestId: string
    title: string
    message: string
    /** Optional error text for pi.tool.failed. */
    error?: string
  },
): Promise<void> {
  if (!taskStore) return
  try {
    const summary = redactPiRequestForAudit(params.title, params.message)
    const outcome: "allow" | "deny" | "record" =
      type === "pi.tool.executed"
        ? "allow"
        : type === "pi.tool.denied"
          ? "deny"
          : "record"
    await taskStore.appendAuditEvent(
      createAuditEvent({
        type,
        intent: "chat.message", // closest EMP intent for a local agent action
        messageId: randomUUID(),
        remotePeerId: "local",
        direction: "local",
        verificationStatus: "verified",
        latencyMs: 0,
        outcome,
        summary: params.error ? `${summary} — error: ${params.error.slice(0, 200)}` : summary,
        correlationId: params.uiRequestId,
      }),
    )
  } catch {
    // Audit failures must never break the tool-call flow.
  }
}
