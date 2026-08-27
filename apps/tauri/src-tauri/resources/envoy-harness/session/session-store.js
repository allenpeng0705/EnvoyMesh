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
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { newSessionId } from "../session.js";
import { PersistedSession } from "./persisted-session.js";
/**
 * A `SessionStore` is a thin wrapper around a
 * directory. It does NOT own sessions — it just
 * knows where they live and how to find them.
 */
export class SessionStore {
    /** The directory where session files live. */
    dir;
    constructor(options) {
        this.dir = options.dir;
    }
    /** The file path for a given session id. */
    filePath(id) {
        return path.join(this.dir, `${id}.jsonl`);
    }
    /**
     * Load an existing session by id. Throws if the
     * session doesn't exist or the file is corrupt.
     */
    async load(id) {
        return PersistedSession.open(this.filePath(id));
    }
    /**
     * Create a new session with a fresh id. The id
     * is embedded in the returned `PersistedSession`;
     * the caller reads it from `.id`.
     */
    async create(metadata) {
        const id = newSessionId();
        return PersistedSession.create({
            id,
            metadata,
            filePath: this.filePath(id),
        });
    }
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
    async createWithId(id, metadata) {
        return PersistedSession.create({
            id,
            metadata,
            filePath: this.filePath(id),
        });
    }
    /**
     * Does a session with this id exist?
     */
    async exists(id) {
        try {
            await fs.access(this.filePath(id));
            return true;
        }
        catch {
            return false;
        }
    }
    /**
     * List all session ids in the store. Sorted by
     * file modification time (most recent first) so
     * the user sees their latest session at the top.
     */
    async list() {
        let entries;
        try {
            entries = await fs.readdir(this.dir);
        }
        catch (err) {
            if (err.code === "ENOENT") {
                return [];
            }
            throw err;
        }
        const ids = entries
            .filter((e) => e.endsWith(".jsonl"))
            .map((e) => e.slice(0, -".jsonl".length));
        // Sort by mtime, most recent first.
        const mtimes = await Promise.all(ids.map(async (id) => {
            const stat = await fs.stat(this.filePath(id));
            return { id, mtime: stat.mtimeMs };
        }));
        mtimes.sort((a, b) => b.mtime - a.mtime);
        return mtimes.map((m) => m.id);
    }
    /**
     * List persisted sessions with summary metadata for UI pickers (U6a.5).
     */
    async listSummaries() {
        const ids = await this.list();
        const summaries = await Promise.all(ids.map(async (id) => {
            const stat = await fs.stat(this.filePath(id));
            let title;
            let cwd;
            let startedAt;
            let messageCount = 0;
            try {
                const raw = await fs.readFile(this.filePath(id), "utf8");
                const lines = raw.split("\n").filter((l) => l.trim().length > 0);
                messageCount = Math.max(0, lines.length - 1);
                const header = JSON.parse(lines[0] ?? "{}");
                if (header._kind === "header" && header.metadata !== undefined) {
                    title = header.metadata.title;
                    cwd = header.metadata.cwd;
                    startedAt = header.metadata.startedAt;
                }
            }
            catch {
                // skip corrupt headers
            }
            return {
                id,
                mtimeMs: stat.mtimeMs,
                ...(title !== undefined ? { title } : {}),
                ...(cwd !== undefined ? { cwd } : {}),
                ...(startedAt !== undefined ? { startedAt } : {}),
                messageCount,
            };
        }));
        return summaries;
    }
    /**
     * Delete a session by id. No-op if it doesn't
     * exist. Returns `true` if a file was deleted.
     */
    async delete(id) {
        try {
            await fs.unlink(this.filePath(id));
            return true;
        }
        catch (err) {
            if (err.code === "ENOENT") {
                return false;
            }
            throw err;
        }
    }
}
//# sourceMappingURL=session-store.js.map