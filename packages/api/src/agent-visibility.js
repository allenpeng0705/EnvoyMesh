const MILESTONE_KINDS = new Set([
    "task_completed",
    "task_failed",
    "report_received",
    "approval_needed",
    "commerce_receipt",
]);
/** Whether to push `agent:activity` to the owner for this row. Store always retains the row. */
export function shouldPushAgentActivity(kind, visibility, domain) {
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
export function shouldPostA2aChatLine(kind, mode) {
    if (!mode || mode === "off")
        return false;
    if (mode === "all_reports")
        return true;
    return MILESTONE_KINDS.has(kind);
}
export function formatA2aChatSystemLine(input) {
    const who = input.remoteOwnerId ? ` with ${input.remoteOwnerId}` : "";
    const task = input.taskId ? ` (${input.taskId})` : "";
    return `Agent activity: ${input.summary}${who}${task}`;
}
//# sourceMappingURL=agent-visibility.js.map