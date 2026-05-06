import { createAuditEvent, type LocalTaskStore } from "@envoymesh/local-store";
import type { EnvoyIntent } from "@envoymesh/protocol";
import type { AutonomousDomain, AutonomousPolicy } from "@envoymesh/api";

export type AutonomousAction = "auto_answer" | "auto_send_chat";

export type EvaluateAutonomousPolicyResult =
  | { allowed: true; domain: AutonomousDomain; action: AutonomousAction }
  | { allowed: false; reason: string };

/**
 * Sensitivity ordering for ceiling comparison.
 * "public" < "friends" < "private"
 */
const SENSITIVITY_RANK: Record<"public" | "friends" | "private", number> = {
  public: 0,
  friends: 1,
  private: 2,
};

/**
 * Returns true if requestedSensitivity is <= ceilingSensitivity.
 */
function withinCeiling(
  requested: "public" | "friends" | "private",
  ceiling: "public" | "friends" | "private",
): boolean {
  return SENSITIVITY_RANK[requested] <= SENSITIVITY_RANK[ceiling];
}

/**
 * Evaluate whether an autonomous action is permitted given current node configuration.
 *
 * Returns { allowed: true } if the action can proceed autonomously.
 * Returns { allowed: false, reason } if approval is required or the action is blocked.
 *
 * Ordering:
 * 1. Kill switch always blocks all autonomous actions when true.
 * 2. No policy for the domain → approval required (conservative default).
 * 3. Policy exists but action (autoAnswer / autoSendChat) is disabled → approval required.
 * 4. Policy action is enabled but sensitivity exceeds maxSensitivity ceiling → approval required.
 * 5. Otherwise → allowed.
 */
export function evaluateAutonomousPolicy(input: {
  autonomousKillSwitch: boolean;
  autonomousPolicies: readonly AutonomousPolicy[];
  domain: AutonomousDomain;
  action: AutonomousAction;
  requestedSensitivity: "public" | "friends" | "private";
}): EvaluateAutonomousPolicyResult {
  const { autonomousKillSwitch, autonomousPolicies, domain, action, requestedSensitivity } = input;

  // 1. Kill switch
  if (autonomousKillSwitch) {
    return {
      allowed: false,
      reason: "autonomous kill switch is active; all autonomous actions are paused",
    };
  }

  // 2. Find domain policy
  const policy = autonomousPolicies.find((p) => p.domain === domain);
  if (!policy) {
    return {
      allowed: false,
      reason: `no autonomous policy configured for domain "${domain}"; approval required`,
    };
  }

  // 3. Check action is enabled
  const actionEnabled = action === "auto_answer" ? policy.autoAnswer : policy.autoSendChat;
  if (!actionEnabled) {
    return {
      allowed: false,
      reason: `autonomous ${action} is disabled for domain "${domain}"; approval required`,
    };
  }

  // 4. Sensitivity ceiling check
  if (!withinCeiling(requestedSensitivity, policy.maxSensitivity)) {
    return {
      allowed: false,
      reason: `requested sensitivity "${requestedSensitivity}" exceeds domain "${domain}" ceiling "${policy.maxSensitivity}"; approval required`,
    };
  }

  return { allowed: true, domain, action };
}

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
