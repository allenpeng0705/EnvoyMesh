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
import type { Tool } from "@envoymesh/envoy-harness";
import { z } from "zod";
/**
 * Minimal audit event shape the peer-list skill needs.
 *
 * **Why a minimal interface:** the bridge must NOT
 * import EnvoyMesh's `AuditEvent` (cross-monorepo dep
 * would couple the bridge to a specific host). The
 * bridge defines the fields it needs; the host's
 * `AuditEvent` (with its full type union, intent,
 * messageId, etc.) satisfies this structurally.
 *
 * **Used fields:**
 * - `type`: the audit event type (e.g. `"message.sent"`,
 *   `"p2p.trace"`). Used to filter `p2p.trace` events
 *   (off by default).
 * - `createdAt`: ISO timestamp. Used to compute
 *   `lastSeenAt` per peer.
 * - `remotePeerId?`: the peer that originated the
 *   event. Events without a `remotePeerId` are skipped
 *   (local events).
 */
export interface BClassAuditEventLike {
    type: string;
    createdAt: string;
    remotePeerId?: string;
}
/**
 * Deps for the peer-list skill. The host provides:
 * - `readAuditEvents()`: callback to read the audit log
 *   (host reads from `@envoymesh/local-store`).
 * - Optional filter options (mirrors the dev-CLI's
 *   `--include-p2p-trace` + `--audit-correlation-id`).
 */
export interface BClassPeerListDeps {
    readAuditEvents(): Promise<ReadonlyArray<BClassAuditEventLike>>;
    /** When `false` (default), `p2p.trace` events are filtered out. */
    includeP2pTraceInAudit?: boolean | undefined;
    /** When set, only events whose `correlationId` + `taskId`
     *  contains this substring are kept. The minimal
     *  interface doesn't expose `correlationId` / `taskId` —
     *  the host's wrapper applies the full filter before
     *  calling the bridge. v0: this option is a no-op
     *  for the bridge; the host filters. */
    auditCorrelationId?: string | undefined;
    /** Max number of peers to return. Default 50. */
    limit?: number | undefined;
}
/** One entry in the peer-list result. */
export interface PeerListEntry {
    peerId: string;
    count: number;
    lastSeenAt: string;
}
/** The peer-list result. */
export interface PeerListResult {
    /** Total observed peer count (may exceed `entries.length` if `limit` truncates). */
    total: number;
    /** Sorted entries (lastSeenAt desc), limited to `deps.limit`. */
    entries: ReadonlyArray<PeerListEntry>;
    /** Text format for CLI display. */
    text: string;
}
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
export declare function listPeersBridge(deps: BClassPeerListDeps): Promise<PeerListResult>;
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
export declare const listPeersTool: (deps: BClassPeerListDeps) => Tool<z.ZodObject<{
    limit: z.ZodOptional<z.ZodNumber>;
}>>;
//# sourceMappingURL=peer-list.d.ts.map