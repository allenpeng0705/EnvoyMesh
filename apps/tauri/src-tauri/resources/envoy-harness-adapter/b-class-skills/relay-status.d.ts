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
import type { Tool } from "@envoymesh/envoy-harness";
import { z } from "zod";
import type { BClassAuditEventLike } from "./peer-list.js";
/**
 * Minimal shape of the relay manager snapshot the
 * `relay-status` formatter reads. The host's
 * `RelayManagerSnapshot` (from `@envoymesh/local-store`)
 * satisfies this structurally.
 *
 * **All fields are optional** in this interface (the
 * bridge uses optional chaining). The snapshot may
 * be `null` / `undefined` (the relay hasn't been
 * started yet) — the formatter handles that case.
 */
export interface BClassRelaySnapshot {
    generatedAt?: string;
    source?: "runtime" | "audit" | "empty";
    relay?: {
        peerId?: string;
        enabled?: boolean;
        relayServerEnabled?: boolean;
        listenAddrs?: string[];
        uptimeMs?: number;
    };
    roster?: {
        total?: number;
        fresh?: number;
        stale?: number;
        topCapabilities?: Array<{
            capability: string;
            count: number;
        }>;
        topTopics?: Array<{
            topicHash: string;
            count: number;
        }>;
    };
    relayBook?: {
        total?: number;
        byRelation?: Record<string, number>;
        byState?: Record<string, number>;
        neighbors?: Array<{
            relayId: string;
            relation: string;
            state: string;
            addrs: string[];
            failureCount: number;
        }>;
    };
    summaries?: {
        total?: number;
        fresh?: number;
        stale?: number;
    };
    health?: {
        status?: string;
        recoveryCounters?: {
            healthChecks?: number;
            degraded?: number;
            unhealthy?: number;
            critical?: number;
        };
        actions?: string[];
        reasons?: string[];
    };
    routing?: {
        forwardedLookupCount?: number;
        duplicateQueryDropCount?: number;
        negativeCacheSize?: number;
        selectedForwardTargetCount?: number;
        failedForwardCount?: number;
        collectedForwardResponseCount?: number;
        recentTraces?: Array<{
            createdAt: string;
            protocol?: string;
            remotePeerId?: string;
            summary: string;
        }>;
    };
    warnings?: string[];
}
/**
 * Deps for the relay-status skill. The host provides:
 * - `readAuditEvents()`: callback to read the audit log.
 * - `loadProfile()`: callback to load the local node profile.
 * - `buildSnapshot(input)`: callback that builds the
 *   snapshot (host's `buildRelayManagerSnapshot`).
 */
export interface BClassRelayStatusDeps {
    readAuditEvents(): Promise<ReadonlyArray<BClassAuditEventLike>>;
    loadProfile(): Promise<unknown>;
    /**
     * Build the snapshot from the profile + audit events.
     * The host's wrapper calls `@envoymesh/local-store`'s
     * `buildRelayManagerSnapshot(input)` and returns the
     * result. The bridge never imports the local-store
     * directly (cross-monorepo dep).
     */
    buildSnapshot(input: {
        profile: unknown;
        auditEvents: ReadonlyArray<BClassAuditEventLike>;
    }): BClassRelaySnapshot | null | undefined;
    /** Max number of items in lists. Default 50. */
    limit?: number | undefined;
}
/** The relay-status result. */
export interface BClassRelayStatusResult {
    /** Text format (mirrors `apps/node/src/developer-cli.ts:910` `showRelayStatus` text output). */
    text: string;
    /** JSON format (raw snapshot stringified). */
    json: string;
    /** The underlying snapshot, for callers that want to inspect it. */
    snapshot: BClassRelaySnapshot | null | undefined;
}
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
export declare function relayStatusBridge(deps: BClassRelayStatusDeps): Promise<BClassRelayStatusResult>;
/**
 * The `relay_status` BUILTIN tool. Always-on when
 * included in `bClassTools?`. The model calls this
 * when the orchestrator's `requiredSkill` is
 * `relay-status`.
 */
export declare const buildRelayStatusTool: (deps: BClassRelayStatusDeps) => Tool<z.ZodObject<{
    format: z.ZodOptional<z.ZodEnum<["text", "json"]>>;
    limit: z.ZodOptional<z.ZodNumber>;
}>>;
//# sourceMappingURL=relay-status.d.ts.map