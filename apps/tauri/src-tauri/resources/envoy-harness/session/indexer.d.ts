/**
 * Phase D / Item 14a — in-memory session index over JSONL.
 *
 * Scans a session directory (same layout as
 * {@link SessionStore}) and builds searchable entries
 * per message. Workspace auth is enforced by the query
 * service (paths must stay under the configured dir).
 */
import type { Role } from "../tools/types.js";
import type { SessionMetadata } from "../session.js";
/** One indexed message row. */
export interface SessionIndexEntry {
    sessionId: string;
    filePath: string;
    messageIndex: number;
    role: Role;
    /** ISO timestamp when known (from metadata.startedAt + order). */
    ts?: string;
    /** Tool names referenced in this message (calls or results). */
    toolNames: readonly string[];
    /** Flattened searchable text. */
    text: string;
    metadata: SessionMetadata;
}
export interface SessionIndexerOptions {
    /** Absolute path to the session directory. */
    dir: string;
}
/**
 * Index all `*.jsonl` sessions under `dir`. Corrupt
 * files are skipped (returned in `errors`).
 */
export declare function indexSessionDirectory(options: SessionIndexerOptions): Promise<{
    entries: SessionIndexEntry[];
    errors: string[];
}>;
/** Index a single JSONL session file. */
export declare function indexSessionFile(filePath: string, rootDir: string): Promise<SessionIndexEntry[]>;
/** True when `candidate` is the same as or under `root`. */
export declare function isPathInside(candidate: string, root: string): boolean;
//# sourceMappingURL=indexer.d.ts.map