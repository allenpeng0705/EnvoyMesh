/**
 * Browser-safe EHUI types + panel catalog (no Node / envoy-harness imports).
 * EnvoyMesh Social and @envoymesh/envoy-harness-ehui import this entry only.
 */
export const EHUI_PANELS = [
    { id: "chat", label: "Chat", kind: "session" },
    { id: "plan", label: "Plan", method: "session/plan" },
    { id: "memory", label: "Memory", method: "session/memory" },
    { id: "git-diff", label: "Diff", method: "git/diff" },
    { id: "git-status", label: "Status", method: "git/status" },
    { id: "mesh", label: "Mesh", method: "cluster/status" },
    { id: "peers", label: "Peers", method: "peers/list" },
    { id: "cluster", label: "Cluster", method: "cluster/status" },
    { id: "team", label: "Team", method: "team/jobs" },
    { id: "scoreboard", label: "Scoreboard", method: "scoreboard/summary" },
    {
        id: "trace",
        label: "Trace",
        notification: "discovery/event",
    },
    { id: "resume", label: "Sessions", method: "sessions/list" },
];
//# sourceMappingURL=ehui.js.map