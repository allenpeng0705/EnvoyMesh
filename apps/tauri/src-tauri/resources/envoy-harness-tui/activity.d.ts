/**
 * Format protocol activity events for the TUI transcript (Codex / Claude Code style).
 */
export interface ActivityLike {
    kind: string;
    summary: string;
    ts?: string;
    subagentOf?: string;
    toolName?: string;
    isError?: boolean;
    durationMs?: number;
    costUsd?: number;
}
/** One transcript line body for a live activity event. */
export declare function formatActivityLine(activity: ActivityLike): string;
/** Multi-line turn summary card (Codex / Claude Code end-of-turn). */
export declare function formatTurnEndCard(activity: ActivityLike): string;
//# sourceMappingURL=activity.d.ts.map