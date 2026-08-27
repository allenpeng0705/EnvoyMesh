/**
 * Phase 8 / Step 3 — `relay-status` B-class skill (canonical in the bridge).
 *
 * **What this is:** the canonical `relay-status` impl.
 * Shows the local relay manager snapshot. The bridge
 * owns the format (text + JSON); the host provides
 * the raw data + the snapshot-building callback.
 *
 * **Why the host provides `buildSnapshot`:** the
 * snapshot is built by `buildRelayManagerSnapshot`
 * in `@envoymesh/local-store` (a Package 2.5
 * EnvoyMesh-internal dep). The bridge cannot import
 * it (cross-monorepo dep). The host wraps the call:
 * `buildSnapshot: (input) => buildRelayManagerSnapshot(input)`.
 *
 * **The `BClassRelaySnapshot` interface:** the bridge
 * defines a minimal interface with the fields it
 * reads. EnvoyMesh's `RelayManagerSnapshot` (from
 * `@envoymesh/local-store`) satisfies this
 * structurally (it has all these fields plus more).
 * The bridge uses optional chaining to be robust
 * to schema drift.
 *
 * **Stability:** the public surface is
 * `relayStatusBridge` + `buildRelayStatusTool` +
 * `BClassRelayStatusDeps` + `BClassRelaySnapshot` +
 * `BClassRelayStatusResult`. Additive; new fields
 * are optional.
 */
import { z } from "zod";
// ---------------------------------------------------------------------------
// Format helpers
// ---------------------------------------------------------------------------
/** Format a record's counts as `key1=N1 key2=N2` (or `-` if empty). */
function formatCounts(counts) {
    if (!counts)
        return "-";
    const entries = Object.entries(counts);
    if (entries.length === 0)
        return "-";
    return entries.map(([k, v]) => `${k}=${v}`).join(" ");
}
/** Build the empty-snapshot hint line. */
function emptyHint() {
    return "hint: no relay.manager.snapshot found in this profile; start the relay with this same --profile and --relay --relay-server, then wait a few seconds.";
}
// ---------------------------------------------------------------------------
// Canonical impl
// ---------------------------------------------------------------------------
/**
 * Build the relay-status result. Pure function
 * (no I/O beyond the deps callbacks).
 *
 * **Algorithm:**
 * 1. Read profile + audit events in parallel.
 * 2. Call `deps.buildSnapshot(...)` to get the snapshot.
 * 3. Format as text (matches the dev-CLI output) + JSON
 *    (raw snapshot stringified).
 *
 * **Why the bridge owns the format:** the dev-CLI's
 * `showRelayStatus` (the reference impl) is in
 * `apps/node/src/developer-cli.ts:910`. The bridge's
 * text output matches the dev-CLI's output line-for-
 * line. The host's `developer-cli.ts` command becomes
 * a thin wrapper: read data + call the bridge +
 * return the bridge's text. (No duplicate format
 * logic.)
 */
export async function relayStatusBridge(deps) {
    const limit = deps.limit ?? 50;
    const [profile, auditEvents] = await Promise.all([
        deps.loadProfile(),
        deps.readAuditEvents(),
    ]);
    const snapshot = deps.buildSnapshot({ profile, auditEvents });
    if (!snapshot) {
        // No snapshot yet (relay hasn't started). The
        // dev-CLI prints the same hint in this case.
        return {
            text: ["Relay manager status", "source=empty", emptyHint()].join("\n"),
            json: JSON.stringify({ source: "empty" }, null, 2),
            snapshot: null,
        };
    }
    // Text format (mirrors `apps/node/src/developer-cli.ts:920-952`).
    const s = snapshot;
    const lines = [
        "Relay manager status",
        `source=${s.source ?? "empty"} generatedAt=${s.generatedAt ?? "?"}`,
        ...(s.source === "empty" ? [emptyHint()] : []),
        `peerId=${s.relay?.peerId ?? "-"} relay=${s.relay?.enabled ?? false} relayServer=${s.relay?.relayServerEnabled ?? false} listenAddrs=${s.relay?.listenAddrs?.length ?? 0}`,
        `roster total=${s.roster?.total ?? 0} fresh=${s.roster?.fresh ?? 0} stale=${s.roster?.stale ?? 0}`,
        `relayBook total=${s.relayBook?.total ?? 0} relations=${formatCounts(s.relayBook?.byRelation)} states=${formatCounts(s.relayBook?.byState)}`,
        `summaries total=${s.summaries?.total ?? 0} fresh=${s.summaries?.fresh ?? 0} stale=${s.summaries?.stale ?? 0}`,
        `health status=${s.health?.status ?? "?"} checks=${s.health?.recoveryCounters?.healthChecks ?? 0} degraded=${s.health?.recoveryCounters?.degraded ?? 0} unhealthy=${s.health?.recoveryCounters?.unhealthy ?? 0} critical=${s.health?.recoveryCounters?.critical ?? 0} actions=${(s.health?.actions ?? []).join(",") || "-"}`,
        ...((s.health?.reasons ?? []).length > 0
            ? (s.health?.reasons ?? []).map((reason) => `healthReason ${reason}`)
            : []),
        `routing forwarded=${s.routing?.forwardedLookupCount ?? 0} duplicates=${s.routing?.duplicateQueryDropCount ?? 0} negativeCache=${s.routing?.negativeCacheSize ?? 0} selectedTargets=${s.routing?.selectedForwardTargetCount ?? 0} failedForwards=${s.routing?.failedForwardCount ?? 0} collectedResponses=${s.routing?.collectedForwardResponseCount ?? 0}`,
        `topCapabilities=${(s.roster?.topCapabilities ?? []).map((item) => `${item.capability}:${item.count}`).join(",") || "-"}`,
        `topTopics=${(s.roster?.topTopics ?? []).map((item) => `${item.topicHash}:${item.count}`).join(",") || "-"}`,
        "",
        "Relay neighbors:",
        ...((s.relayBook?.neighbors ?? []).length > 0
            ? (s.relayBook?.neighbors ?? [])
                .slice(0, limit)
                .map((entry) => `${entry.relayId} relation=${entry.relation} state=${entry.state} addrs=${entry.addrs.length} failures=${entry.failureCount}`)
            : ["  (none yet)"]),
        "",
        "Recent relay traces:",
        ...((s.routing?.recentTraces ?? []).length > 0
            ? (s.routing?.recentTraces ?? [])
                .slice(-limit)
                .map((trace) => `${trace.createdAt} ${trace.protocol ?? "relay"} ${trace.remotePeerId ?? "-"} ${trace.summary}`)
            : ["  (none yet)"]),
        ...(s.warnings ?? []).map((warning) => `warning ${warning}`),
    ];
    return {
        text: lines.join("\n"),
        json: JSON.stringify(snapshot, null, 2),
        snapshot,
    };
}
// ---------------------------------------------------------------------------
// BUILTIN tool
// ---------------------------------------------------------------------------
/**
 * The `relay_status` BUILTIN tool. Always-on when
 * included in `bClassTools?`. The model calls this
 * when the orchestrator's `requiredSkill` is
 * `relay-status`.
 */
export const buildRelayStatusTool = (deps) => ({
    name: "relay_status",
    description: "Show the local relay manager snapshot. Includes the relay " +
        "node's peerId / enabled / listen addresses, the peer roster, " +
        "the relay book, routing counters, and recent relay traces. " +
        "Use `format='json'` for machine-readable output; default is " +
        "`'text'` for the human-readable CLI format.",
    parameters: z.object({
        format: z
            .enum(["text", "json"])
            .optional()
            .describe("Output format. 'text' (default) for CLI-style; 'json' for the raw snapshot."),
        limit: z
            .number()
            .int()
            .positive()
            .optional()
            .describe("Max number of items in lists (default 50)."),
    }),
    async execute(args, _ctx) {
        const result = await relayStatusBridge({
            ...deps,
            limit: args.limit ?? deps.limit,
        });
        if (args.format === "json") {
            return { content: result.json };
        }
        return { content: result.text };
    },
});
//# sourceMappingURL=relay-status.js.map