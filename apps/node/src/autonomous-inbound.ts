import { createAuditEvent, type LocalTaskStore } from "@envoymesh/local-store";
import type { EnvoyIntent } from "@envoymesh/protocol";
import type { AutonomousDomain } from "@envoymesh/api";
import {
  evaluateAutonomousPolicy,
  type AutonomousAction,
  type EvaluateAutonomousPolicyResult,
} from "@envoymesh/api";

export { evaluateAutonomousPolicy, type AutonomousAction, type EvaluateAutonomousPolicyResult };

/**
 * Audit event type for autonomous policy decisions.
 */
export type AutonomousAuditEventType = "autonomous.decided";

/**
 * Record an autonomous policy decision in the audit log.
 */
export async function auditAutonomousDecision(input: {
  taskStore: Pick<LocalTaskStore, "appendAuditEvent">;
  intent: string;
  messageId: string;
  correlationId: string | undefined;
  remotePeerId: string;
  receivedAt: number;
  domain: AutonomousDomain;
  action: AutonomousAction;
  allowed: boolean;
  reason?: string;
  createdAt: string;
}): Promise<void> {
  const { taskStore, intent, messageId, correlationId, remotePeerId, receivedAt, domain, action, allowed, reason, createdAt } = input;
  await taskStore.appendAuditEvent(
    createAuditEvent({
      type: "autonomous.decided",
      intent: intent as EnvoyIntent,
      messageId,
      correlationId,
      remotePeerId,
      direction: "inbound",
      verificationStatus: "verified",
      latencyMs: Date.now() - receivedAt,
      outcome: allowed ? "allow" : "deny",
      summary: [
        `autonomous policy: domain=${domain} action=${action}`,
        allowed ? "→ allowed" : `→ denied${reason ? `: ${reason}` : ""}`,
      ].join(" "),
      createdAt,
    }),
  );
}
