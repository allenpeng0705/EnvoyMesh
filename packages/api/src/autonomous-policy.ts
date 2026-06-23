import type { AutonomousDomain, AutonomousPolicy, ModelProviderConfig } from "./ws-protocol.js";

export type AutonomousAction = "auto_answer" | "auto_send_chat";

export type EvaluateAutonomousPolicyResult =
  | { allowed: true; domain: AutonomousDomain; action: AutonomousAction }
  | { allowed: false; reason: string };

/** True when chat/knowledge model routing is enabled (any mode except disabled). */
export function isModelProviderConfigured(
  mode: ModelProviderConfig["mode"] | undefined,
): boolean {
  return mode !== undefined && mode !== "disabled";
}

/** Default social policy when global auto-send is first enabled alongside a configured model. */
export function defaultSocialAutonomousPolicy(): AutonomousPolicy {
  return {
    domain: "social",
    maxSensitivity: "friends",
    autoAnswer: false,
    autoSendChat: true,
  };
}

/**
 * When a model is configured, ensure a social autonomous policy exists with
 * auto-send enabled. Does not override an existing social policy (user opt-out).
 */
export function ensureDefaultAutonomousPoliciesForModel(
  policies: readonly AutonomousPolicy[] | undefined,
  modelMode: ModelProviderConfig["mode"] | undefined,
): AutonomousPolicy[] {
  const list = policies ? [...policies] : [];
  if (!isModelProviderConfigured(modelMode)) {
    return list;
  }
  if (list.some((p) => p.domain === "social")) {
    return list;
  }
  return [...list, defaultSocialAutonomousPolicy()];
}

const SENSITIVITY_RANK: Record<"public" | "friends" | "private", number> = {
  public: 0,
  friends: 1,
  private: 2,
};

function withinCeiling(
  requested: "public" | "friends" | "private",
  ceiling: "public" | "friends" | "private",
): boolean {
  return SENSITIVITY_RANK[requested] <= SENSITIVITY_RANK[ceiling];
}

/** Whether an autonomous action is permitted given current node configuration. */
export function evaluateAutonomousPolicy(input: {
  autonomousKillSwitch: boolean;
  autonomousPolicies: readonly AutonomousPolicy[];
  domain: AutonomousDomain;
  action: AutonomousAction;
  requestedSensitivity: "public" | "friends" | "private";
}): EvaluateAutonomousPolicyResult {
  const { autonomousKillSwitch, autonomousPolicies, domain, action, requestedSensitivity } = input;

  if (autonomousKillSwitch) {
    return {
      allowed: false,
      reason: "autonomous kill switch is active; all autonomous actions are paused",
    };
  }

  const policy = autonomousPolicies.find((p) => p.domain === domain);
  if (!policy) {
    return {
      allowed: false,
      reason: `no autonomous policy configured for domain "${domain}"; approval required`,
    };
  }

  const actionEnabled = action === "auto_answer" ? policy.autoAnswer : policy.autoSendChat;
  if (!actionEnabled) {
    return {
      allowed: false,
      reason: `autonomous ${action} is disabled for domain "${domain}"; approval required`,
    };
  }

  if (!withinCeiling(requestedSensitivity, policy.maxSensitivity)) {
    return {
      allowed: false,
      reason: `requested sensitivity "${requestedSensitivity}" exceeds domain "${domain}" ceiling "${policy.maxSensitivity}"; approval required`,
    };
  }

  return { allowed: true, domain, action };
}
