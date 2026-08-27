/**
 * Phase D / Item 14a — session history search service + tool.
 *
 * Indexes JSONL sessions under a configured directory and
 * exposes pattern / role / tool / time filters. Results are
 * bounded; paths outside the session dir are rejected.
 */
import type { Role } from "../tools/types.js";
import type { Tool } from "../tools/types.js";
import type { ToolRegistry } from "../tools/registry.js";
export interface SessionQueryRequest {
    pattern?: string;
    role?: Role;
    toolName?: string;
    /** Inclusive ISO lower bound on entry.ts. */
    since?: string;
    /** Inclusive ISO upper bound on entry.ts. */
    until?: string;
    /** Max hits (default 20, hard cap 100). */
    limit?: number;
}
export interface SessionQueryHit {
    sessionId: string;
    messageIndex: number;
    role: Role;
    toolNames: readonly string[];
    /** Snippet of matching text (bounded). */
    snippet: string;
    ts?: string;
}
export interface SessionQueryService {
    /** Re-scan the session directory. */
    reindex(): Promise<{
        entryCount: number;
        errors: readonly string[];
    }>;
    search(request: SessionQueryRequest): SessionQueryHit[];
    /** Absolute session directory (auth root). */
    readonly dir: string;
}
export interface SessionQueryServiceOptions {
    dir: string;
    /** Soft cap on snippet chars (default 240). */
    snippetChars?: number;
}
/**
 * Create a {@link SessionQueryService} bound to a session dir.
 * Call {@link SessionQueryService.reindex} before searching
 * (or after new sessions land).
 */
export declare function createSessionQueryService(options: SessionQueryServiceOptions): SessionQueryService;
/** Build the model-facing `session_query` tool. */
export declare function makeSessionQueryTool(service: SessionQueryService): Tool;
/** Register `session_query` on a tool registry. */
export declare function registerSessionQueryTool(tools: ToolRegistry, service: SessionQueryService): void;
//# sourceMappingURL=query.d.ts.map