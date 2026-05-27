import type { AutonomousDomain, AutonomousPolicy } from "./ws-protocol.js";
export type AutonomousAction = "auto_answer" | "auto_send_chat";
export type EvaluateAutonomousPolicyResult = {
    allowed: true;
    domain: AutonomousDomain;
    action: AutonomousAction;
} | {
    allowed: false;
    reason: string;
};
/** Whether an autonomous action is permitted given current node configuration. */
export declare function evaluateAutonomousPolicy(input: {
    autonomousKillSwitch: boolean;
    autonomousPolicies: readonly AutonomousPolicy[];
    domain: AutonomousDomain;
    action: AutonomousAction;
    requestedSensitivity: "public" | "friends" | "private";
}): EvaluateAutonomousPolicyResult;
//# sourceMappingURL=autonomous-policy.d.ts.map