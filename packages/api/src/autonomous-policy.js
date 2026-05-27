const SENSITIVITY_RANK = {
    public: 0,
    friends: 1,
    private: 2,
};
function withinCeiling(requested, ceiling) {
    return SENSITIVITY_RANK[requested] <= SENSITIVITY_RANK[ceiling];
}
/** Whether an autonomous action is permitted given current node configuration. */
export function evaluateAutonomousPolicy(input) {
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
//# sourceMappingURL=autonomous-policy.js.map