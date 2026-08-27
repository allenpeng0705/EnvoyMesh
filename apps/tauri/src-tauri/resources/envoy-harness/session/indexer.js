/**
 * Phase D / Item 14a — in-memory session index over JSONL.
 *
 * Scans a session directory (same layout as
 * {@link SessionStore}) and builds searchable entries
 * per message. Workspace auth is enforced by the query
 * service (paths must stay under the configured dir).
 */
import { promises as fs } from "node:fs";
import * as path from "node:path";
function extractToolNames(content) {
    const names = [];
    for (const b of content) {
        if (b.type === "tool_call")
            names.push(b.name);
    }
    return names;
}
function flattenText(content) {
    const parts = [];
    for (const b of content) {
        if (b.type === "text")
            parts.push(b.text);
        else if (b.type === "tool_call") {
            parts.push(b.name);
            try {
                parts.push(JSON.stringify(b.args));
            }
            catch {
                // ignore
            }
        }
        else if (b.type === "tool_result") {
            parts.push(typeof b.content === "string" ? b.content : JSON.stringify(b.content));
        }
    }
    return parts.join("\n");
}
/**
 * Index all `*.jsonl` sessions under `dir`. Corrupt
 * files are skipped (returned in `errors`).
 */
export async function indexSessionDirectory(options) {
    const dir = path.resolve(options.dir);
    const entries = [];
    const errors = [];
    let files;
    try {
        files = await fs.readdir(dir);
    }
    catch (err) {
        if (err.code === "ENOENT") {
            return { entries: [], errors: [] };
        }
        throw err;
    }
    for (const name of files) {
        if (!name.endsWith(".jsonl"))
            continue;
        const filePath = path.join(dir, name);
        try {
            const indexed = await indexSessionFile(filePath, dir);
            entries.push(...indexed);
        }
        catch (err) {
            errors.push(`${name}: ${err instanceof Error ? err.message : String(err)}`);
        }
    }
    return { entries, errors };
}
/** Index a single JSONL session file. */
export async function indexSessionFile(filePath, rootDir) {
    const resolved = path.resolve(filePath);
    const root = path.resolve(rootDir);
    if (!isPathInside(resolved, root)) {
        throw new Error(`session file outside workspace: ${filePath}`);
    }
    const raw = await fs.readFile(resolved, "utf8");
    const lines = raw.split("\n").filter((l) => l.length > 0);
    if (lines.length === 0)
        return [];
    const header = JSON.parse(lines[0]);
    if (header._kind !== "header" || typeof header.id !== "string") {
        throw new Error("missing or invalid header");
    }
    const metadata = header.metadata ?? {
        cwd: "",
        startedAt: new Date(0).toISOString(),
    };
    const sessionId = header.id;
    const out = [];
    for (let i = 1; i < lines.length; i++) {
        const msg = JSON.parse(lines[i]);
        if (typeof msg.role !== "string" || !Array.isArray(msg.content)) {
            throw new Error(`invalid message at line ${i + 1}`);
        }
        const entry = {
            sessionId,
            filePath: resolved,
            messageIndex: i - 1,
            role: msg.role,
            toolNames: extractToolNames(msg.content),
            text: flattenText(msg.content),
            metadata,
        };
        if (metadata.startedAt !== undefined) {
            entry.ts = metadata.startedAt;
        }
        out.push(entry);
    }
    return out;
}
/** True when `candidate` is the same as or under `root`. */
export function isPathInside(candidate, root) {
    const rel = path.relative(path.resolve(root), path.resolve(candidate));
    return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}
//# sourceMappingURL=indexer.js.map