import type { AgentActivityKind, AgentActivityDomain } from "@envoymesh/api";
export type AgentNotifyMode = "instant" | "brief" | "silent" | "approval";
export type A2aChatNotificationMode = "off" | "milestones_only" | "all_reports";
export type AgentVisibilityConfig = Partial<Record<AgentActivityDomain, AgentNotifyMode>>;
/** Whether to push `agent:activity` to the owner for this row. Store always retains the row. */
export declare function shouldPushAgentActivity(kind: AgentActivityKind, visibility: AgentVisibilityConfig | undefined, domain: AgentActivityDomain): boolean;
export declare function shouldPostA2aChatLine(kind: AgentActivityKind, mode: A2aChatNotificationMode | undefined): boolean;
export declare function formatA2aChatSystemLine(input: {
    kind: AgentActivityKind;
    summary: string;
    remoteOwnerId?: string;
    taskId?: string;
}): string;
//# sourceMappingURL=agent-visibility.d.ts.map