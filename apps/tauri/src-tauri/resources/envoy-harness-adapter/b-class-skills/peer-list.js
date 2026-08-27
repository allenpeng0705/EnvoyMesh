/**
 * Phase 8 / Step 3 — `peer-list` B-class skill (canonical in the bridge).
 *
 * **What this is:** the canonical `peer-list` impl.
 * Lists observed peers (LAN + WAN) from the local
 * audit log. The bridge is the source of truth;
 * envoy-harness + OpenClaw both consume this through
 * their respective adapter.
 *
 * **Why this is a separate file:** per the Phase 8
 * design doc §2.2, the bridge owns the B-class skill
 * impls (sponsor-friend / peer-list / relay-status).
 * The host (`apps/node/src/`) becomes a thin wrapper
 * that builds the deps from `NodeServiceImpl` state
 * and calls the bridge.
 *
 * **Why peer-list is the simplest of the 3:** it only
 * reads from the audit log (no mesh ops, no config
 * persistence, no state mutation). A single
 * `readAuditEvents()` callback + a `limit` option is
 * enough.
 *
 * **The `BClassAuditEventLike` interface:** the bridge
 * doesn't import EnvoyMesh's `AuditEvent` type
 * (cross-monorepo dep would be wrong). The bridge
 * defines a minimal interface with the fields it
 * needs (`type`, `createdAt`, `remotePeerId?`).
 * EnvoyMesh's `AuditEvent` satisfies this
 * structurally (it has all these fields plus more).
 *
 * **Stability:** the public surface is
 * `listPeersBridge` + `listPeersTool` + `BClassPeerListDeps` +
 * `PeerListResult` + `PeerListEntry` +
 * `BClassAuditEventLike`. Additive; new fields are
 * optional.
 */
import { z } from "zod";
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
/**
 * Return the lexicographically larger ISO date. ISO
 * 8601 dates sort correctly as strings; we don't need
 * to parse them.
 */
function maxIsoDate(left, right) {
    if (!left)
        return right;
    return left > right ? left : right;
}
// ---------------------------------------------------------------------------
// Canonical impl
// ---------------------------------------------------------------------------
/**
 * Build the peer-list from the audit log. Pure
 * function (no I/O beyond `deps.readAuditEvents()`).
 *
 * **Algorithm:**
 * 1. Read all audit events via `deps.readAuditEvents()`.
 * 2. Filter: drop events without `remotePeerId` (local
 *    events); drop `p2p.trace` events when
 *    `includeP2pTraceInAudit === false` (the default).
 * 3. Aggregate by `remotePeerId`: `count` (number of
 *    events) + `lastSeenAt` (max of `createdAt`).
 * 4. Sort by `lastSeenAt` descending.
 * 5. Limit to `deps.limit` (default 50).
 * 6. Format as text: `Observed peers (N)` header + one
 *    line per peer (`<lastSeenAt> <peerId> messages=<count>`).
 *
 * **Why sync + `Promise<...>` (not `async function`):
 * no I/O in this function itself. The only I/O is in
 * `deps.readAuditEvents()` (the host's callback). The
 * outer `async` keeps the API consistent with the
 * other B-class skills (sponsor-friend + relay-status
 * are also `async`).
 *
 * **Snapshot test:** the bridge's output matches
 * `apps/node/src/developer-cli.ts:756`
 * (`listObservedPeers`) for the same input. The dev-CLI
 * is the reference; the bridge's output is the
 * canonical contract.
 */
export async function listPeersBridge(deps) {
    const allEvents = await deps.readAuditEvents();
    const includeP2p = deps.includeP2pTraceInAudit ?? false;
    // Step 1 + 2: filter.
    const filtered = allEvents.filter((event) => {
        if (!includeP2p && event.type === "p2p.trace")
            return false;
        // v0: `auditCorrelationId` is a no-op (the minimal
        // interface doesn't expose `correlationId`; the
        // host's wrapper applies the full filter). Future:
        // extend the interface to expose `correlationId` +
        // `taskId`.
        return true;
    });
    // Step 3: aggregate by remotePeerId.
    const byPeer = new Map();
    for (const event of filtered) {
        if (!event.remotePeerId)
            continue;
        const current = byPeer.get(event.remotePeerId);
        byPeer.set(event.remotePeerId, {
            count: (current?.count ?? 0) + 1,
            lastSeenAt: maxIsoDate(current?.lastSeenAt, event.createdAt),
        });
    }
    // Step 4: sort by lastSeenAt desc.
    const sorted = [...byPeer.entries()]
        .map(([peerId, summary]) => ({ peerId, ...summary }))
        .sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt));
    // Step 5: limit.
    const limit = deps.limit ?? 50;
    const entries = sorted.slice(0, limit);
    // Step 6: format text.
    const text = [
        `Observed peers (${byPeer.size})`,
        ...entries.map((e) => `${e.lastSeenAt} ${e.peerId} messages=${e.count}`),
    ].join("\n");
    return { total: byPeer.size, entries, text };
}
// ---------------------------------------------------------------------------
// BUILTIN tool
// ---------------------------------------------------------------------------
/**
 * The `list_peers` BUILTIN tool. Always-on when
 * included in `bClassTools?` (the host's runtime
 * passes the deps at construction). The model calls
 * this when the orchestrator's `requiredSkill` is
 * `peer-list` (or any skill that should expose the
 * peer's connectivity state).
 *
 * **The `Tool` shape:** `name` + `description` (model
 * sees these in the system prompt) + `parameters`
 * (zod schema) + `async execute(args, ctx)`. The
 * harness's `ToolRegistry` validates args before
 * calling `execute`.
 */
export const listPeersTool = (deps) => ({
    name: "list_peers",
    description: "List observed peers (LAN + WAN) from the local audit log. " +
        "Each entry shows the peer's `lastSeenAt` timestamp and the " +
        "number of messages exchanged. Use `limit` to cap the result " +
        "for large peer lists (default 50).",
    parameters: z.object({
        limit: z
            .number()
            .int()
            .positive()
            .optional()
            .describe("Maximum number of peers to return. Defaults to 50. " +
            "Larger lists are truncated to the most-recently-seen peers."),
    }),
    async execute(args, _ctx) {
        const result = await listPeersBridge({
            ...deps,
            limit: args.limit ?? deps.limit,
        });
        return { content: result.text };
    },
});
//# sourceMappingURL=peer-list.js.map