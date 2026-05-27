import type { AgentActivityKind, AgentActivityDomain } from "@envoymesh/api";

export type AgentNotifyMode = "instant" | "brief" | "silent" | "approval";

export type A2aChatNotificationMode = "off" | "milestones_only" | "all_reports";

export type AgentVisibilityConfig = Partial<
  Record<AgentActivityDomain, AgentNotifyMode>
>;

const MILESTONE_KINDS = new Set<AgentActivityKind>([
  "task_completed",
  "task_failed",
  "report_received",
  "approval_needed",
  "commerce_receipt",
]);

/** Whether to push `agent:activity` to the owner for this row. Store always retains the row. */
export function shouldPushAgentActivity(
  kind: AgentActivityKind,
  visibility: AgentVisibilityConfig | undefined,
  domain: AgentActivityDomain,
): boolean {
  const mode = visibility?.[domain] ?? "instant";
  switch (mode) {
    case "silent":
      return false;
    case "brief":
      return MILESTONE_KINDS.has(kind);
    case "approval":
      return kind === "approval_needed" || kind === "report_received";
    case "instant":
    default:
      return true;
  }
}

export function shouldPostA2aChatLine(
  kind: AgentActivityKind,
  mode: A2aChatNotificationMode | undefined,
): boolean {
  if (!mode || mode === "off") return false;
  if (mode === "all_reports") return true;
  return MILESTONE_KINDS.has(kind);
}

export function formatA2aChatSystemLine(input: {
  kind: AgentActivityKind;
  summary: string;
  remoteOwnerId?: string;
  taskId?: string;
}): string {
  const who = input.remoteOwnerId ? ` with ${input.remoteOwnerId}` : "";
  const task = input.taskId ? ` (${input.taskId})` : "";
  return `Agent activity: ${input.summary}${who}${task}`;
}
