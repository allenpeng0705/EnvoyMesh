/**
 * F14.1 — `SessionStore`: knows the session directory
 * and how to load / save / list / check sessions.
 *
 * **What this is:** a thin directory-aware wrapper
 * around `PersistedSession.create()` /
 * `PersistedSession.open()`. It does NOT own the
 * session instances — it just knows where they
 * live on disk and how to find them.
 *
 * **File layout** (managed by the store):
 *
 * ```
 * <dir>/
 *   <session-id>.jsonl
 *   <session-id>.jsonl
 *   ...
 * ```
 *
 * The session id is the file name (without
 * extension). UUIDs are safe filenames (alphanumeric
 * + dashes).
 *
 * **Why not a database:** JSONL files are append-
 * friendly, human-readable, and easy to inspect
 * (`cat <session-id>.jsonl`). A database would add
 * migration overhead, a new dep, and a new failure
 * mode (corrupt DB). The F9.4 trace layer already
 * uses JSONL for the same reasons — consistency.
 *
 * **Why not just `InMemorySession` everywhere:**
 * the `--resume` and `--fork` CLI flags need to
 * restore / copy the transcript from disk. A
 * `SessionStore` makes that trivial.
 */
import type { SessionMetadata } from "../session.js";
import { PersistedSession } from "./persisted-session.js";
/**
 * Options for `SessionStore.create()`. The store
 * lazily creates the directory on first save (so
 * the constructor is cheap + doesn't fail on a
 * read-only filesystem).
 */
export interface SessionStoreOptions {
    /**
     * The directory where session files live. One
     * JSONL file per session id.
     *
     * **Default:** `~/.local/state/envoy-harness/sessions`
     * (or `$ENVOY_HARNESS_SESSION_DIR` if set). The
     * default is set by the CLI runner; the store
     * itself just uses whatever the host passes.
     */
    dir: string;
}
/**
 * A `SessionStore` is a thin wrapper around a
 * directory. It does NOT own sessions — it just
 * knows where they live and how to find them.
 */
export declare class SessionStore {
    /** The directory where session files live. */
    readonly dir: string;
    constructor(options: SessionStoreOptions);
    /** The file path for a given session id. */
    private filePath;
    /**
     * Load an existing session by id. Throws if the
     * session doesn't exist or the file is corrupt.
     */
    load(id: string): Promise<PersistedSession>;
    /**
     * Create a new session with a fresh id. The id
     * is embedded in the returned `PersistedSession`;
     * the caller reads it from `.id`.
     */
    create(metadata: SessionMetadata): Promise<PersistedSession>;
    /**
     * Create a session with a specific id. Used by
     * the CLI's `--fork` flag: load an existing
     * session, copy its messages, save under a new
     * id.
     *
     * The caller is responsible for populating the
     * session's messages (via `appendMessage`); the
     * store just creates the file.
     */
    createWithId(id: string, metadata: SessionMetadata): Promise<PersistedSession>;
    /**
     * Does a session with this id exist?
     */
    exists(id: string): Promise<boolean>;
    /**
     * List all session ids in the store. Sorted by
     * file modification time (most recent first) so
     * the user sees their latest session at the top.
     */
    list(): Promise<string[]>;
    /**
     * List persisted sessions with summary metadata for UI pickers (U6a.5).
     */
    listSummaries(): Promise<Array<{
        id: string;
        mtimeMs: number;
        title?: string;
        cwd?: string;
        startedAt?: string;
        messageCount: number;
    }>>;
    /**
     * Delete a session by id. No-op if it doesn't
     * exist. Returns `true` if a file was deleted.
     */
    delete(id: string): Promise<boolean>;
}
//# sourceMappingURL=session-store.d.ts.map