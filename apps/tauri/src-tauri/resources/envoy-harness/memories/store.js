/**
 * Phase A / Item 2 (chunks 2.1 + 2.2) — the memory store.
 *
 * **Reference:** codex `codex-rs/memories/` (file-based
 * progressive disclosure) + deepseek memories
 * (retrieval discipline).
 *
 * **What this is:** a long-running REPL session
 * accumulates knowledge (user prefs, repo conventions,
 * "landmines", reusable workflows). When the context
 * window compacts, the model forgets it. The memory
 * store persists knowledge across sessions: a
 * one-line `memory_index.md` lists all titles
 * (always loaded); individual memories are loaded
 * on-demand via the model's `read_file` tool.
 *
 * **File format (codex-flavored):**
 *
 *   ```markdown
 *   ---
 *   tags: [typescript, harness]
 *   created: 2026-08-21
 *   ---
 *
 *   # Memory title
 *
 *   Body. Keep it short (< 1K tokens; the bounded
 *   fragment will reject over-budget ones at
 *   construction).
 *   ```
 *
 * **Reserved filenames (per codex convention):** the
 * store ignores `MEMORY.md` (handbook) and
 * `memory_summary.md` (always-loaded summary). Those are
 * a different shape; the chunk-2.2 consolidation work
 * may write them, but `list()` doesn't return them.
 *
 * **Stability:** the public `MemoryStore` interface is
 * stable. New methods are additive; removing one is a
 * major version bump.
 */
import { promises as fs } from "node:fs";
import * as path from "node:path";
// ---------------------------------------------------------------------------
// Reserved filenames
// ---------------------------------------------------------------------------
/**
 * Codex reserves these names for handbook + always-loaded
 * summary. They're a different shape and are NOT
 * included in the memory index. The store still
 * tolerates their presence (the host can write them via
 * the filesystem; `list()` just doesn't return them).
 */
const RESERVED_NAMES = new Set([
    "MEMORY",
    "memory_summary",
]);
// ---------------------------------------------------------------------------
// LocalMemoryStore
// ---------------------------------------------------------------------------
/**
 * File-based memory store. Reads + writes markdown
 * files under `memoryRoot`.
 *
 * **Hermetic tests:** the tests use a temp dir from
 * `mkdtemp` and dispose of it. No real paths, no real
 * writes to the user's home directory.
 *
 * **Concurrent writes:** the store does NOT lock. Two
 * concurrent `write()` calls for the same name can
 * race; the last write wins. The store is designed for
 * single-host / single-user use (a REPL session, a
 * Tauri app); multi-host concurrency is a future
 * concern (a future chunk can add file locks or
 * append-only logging).
 */
export class LocalMemoryStore {
    memoryRoot;
    constructor(options) {
        this.memoryRoot = options.memoryRoot;
    }
    /** List all memories (excluding reserved filenames). */
    async list() {
        let entries;
        try {
            entries = await fs.readdir(this.memoryRoot);
        }
        catch (err) {
            // ENOENT → empty store. Other errors propagate.
            if (err.code === "ENOENT") {
                return [];
            }
            throw err;
        }
        const out = [];
        for (const entry of entries) {
            if (!entry.endsWith(".md"))
                continue;
            const name = entry.slice(0, -3); // strip .md
            if (!isValidName(name))
                continue;
            if (RESERVED_NAMES.has(name))
                continue;
            // Read the file lazily to compute title + tokens.
            // We use `read` (no throw) so a corrupt memory
            // doesn't break the list.
            const filePath = path.join(this.memoryRoot, entry);
            try {
                const mem = await this.read(name);
                if (mem === undefined)
                    continue;
                out.push({
                    name: mem.name,
                    path: filePath,
                    title: mem.title,
                    tags: mem.tags,
                    created: mem.created,
                    estimatedTokens: estimateMemoryTokens(mem),
                });
            }
            catch {
                // Corrupt file — skip. (The host can read it
                // directly via `read_file` if they want to
                // inspect.)
            }
        }
        // Stable sort by name (predictable order for the
        // memory index).
        out.sort((a, b) => a.name.localeCompare(b.name));
        return out;
    }
    /**
     * Read a single memory by name (without the `.md`
     * extension). Returns `undefined` when the file
     * doesn't exist or the name is reserved.
     */
    async read(name) {
        if (!isValidName(name))
            return undefined;
        if (RESERVED_NAMES.has(name))
            return undefined;
        const filePath = path.join(this.memoryRoot, `${name}.md`);
        let raw;
        try {
            raw = await fs.readFile(filePath, "utf8");
        }
        catch (err) {
            if (err.code === "ENOENT") {
                return undefined;
            }
            throw err;
        }
        return parseMemoryFile(name, raw);
    }
    /**
     * Write (or overwrite) a memory. Creates the parent
     * directory if it doesn't exist. Throws on invalid
     * name (reserved or bad characters).
     */
    async write(mem) {
        // Check reserved names FIRST so the error is
        // specific (not the generic "invalid name").
        if (RESERVED_NAMES.has(mem.name)) {
            throw new Error(`reserved memory name: "${mem.name}" (cannot write to reserved files)`);
        }
        if (!isValidName(mem.name)) {
            throw new Error(`invalid memory name: "${mem.name}" (must match [a-z0-9_-]+)`);
        }
        await fs.mkdir(this.memoryRoot, { recursive: true });
        const filePath = path.join(this.memoryRoot, `${mem.name}.md`);
        const body = serializeMemoryFile(mem);
        await fs.writeFile(filePath, body, "utf8");
        return {
            name: mem.name,
            path: filePath,
            title: mem.title,
            tags: mem.tags,
            created: mem.created,
            estimatedTokens: estimateMemoryTokens({
                ...mem,
            }),
        };
    }
    /** Expose the root (for tests + the consolidation
     *  helper that needs to know where the hash file is). */
    getMemoryRoot() {
        return this.memoryRoot;
    }
}
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
/**
 * Validate a memory name. Lowercase, starts with a
 * letter or digit, `[a-z0-9_-]+`. Mirrors the
 * `SkillIdSchema` shape (deliberately — memories and
 * skills share the namespace).
 */
function isValidName(name) {
    return /^[a-z0-9][a-z0-9_-]{0,63}$/.test(name);
}
/**
 * Estimate a memory's token count. The estimator is
 * the same char/4 + per-block-overhead heuristic used
 * by `estimateMessageTokens`. Memories are pure
 * markdown text (no role blocks, no tool calls) so we
 * just count chars / 4 with a small structural
 * overhead.
 *
 * The estimate is pure + deterministic; the bounded
 * fragment construction will reject memories > 10K
 * tokens.
 */
export function estimateMemoryTokens(mem) {
    let chars = mem.title.length + mem.body.length;
    chars += mem.tags.length * 4; // tag overhead
    return Math.ceil(chars / 4);
}
// ---------------------------------------------------------------------------
// File format parser + serializer
// ---------------------------------------------------------------------------
/**
 * Parse a memory file's raw contents. Splits YAML
 * frontmatter (if present) from the body, extracts
 * the first `# heading` as the title, and normalizes
 * the body.
 *
 * **Why lenient:** the file may be hand-edited, may
 * have no frontmatter, may have multiple headings
 * (subsections are fine). We take the FIRST `# ` as
 * the title; later headings are subsections.
 *
 * **Throws** on parse errors that would corrupt the
 * memory (the caller catches and skips in `list()`).
 */
export function parseMemoryFile(name, raw) {
    let body = raw;
    let tags = [];
    let created = "unknown";
    // Strip BOM if present.
    if (body.charCodeAt(0) === 0xfeff) {
        body = body.slice(1);
    }
    // Frontmatter: lines starting with `---` and ending
    // with another `---` line.
    const fmMatch = body.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
    if (fmMatch) {
        const fm = fmMatch[1] ?? "";
        body = fmMatch[2] ?? "";
        // Minimal YAML parser — only `tags: [...]` and
        // `created: <string>` are recognized. Anything
        // else is ignored.
        const tagsMatch = fm.match(/^tags:\s*\[(.*)\]\s*$/m);
        if (tagsMatch) {
            const inner = tagsMatch[1] ?? "";
            tags = inner
                .split(",")
                .map((t) => t.trim().replace(/^["']|["']$/g, ""))
                .filter((t) => t.length > 0);
        }
        const createdMatch = fm.match(/^created:\s*(.+?)\s*$/m);
        if (createdMatch) {
            created = (createdMatch[1] ?? "").replace(/^["']|["']$/g, "");
        }
    }
    // Extract the first H1 as the title.
    const titleMatch = body.match(/^#\s+(.+?)\s*$/m);
    const title = titleMatch ? (titleMatch[1] ?? "").trim() : name;
    // Strip the title line from the body (we keep
    // everything after it; H2+ subsections stay in the
    // body).
    if (titleMatch) {
        const idx = body.indexOf(titleMatch[0]);
        if (idx >= 0) {
            body = body.slice(idx + (titleMatch[0]?.length ?? 0)).trimStart();
        }
    }
    return { name, title, tags, created, body: body.trim() };
}
/**
 * Serialize a memory to its file format. Frontmatter
 * is written when tags or created is set.
 */
export function serializeMemoryFile(mem) {
    const lines = [];
    if (mem.tags.length > 0 || mem.created !== "unknown") {
        lines.push("---");
        if (mem.tags.length > 0) {
            lines.push(`tags: [${mem.tags.join(", ")}]`);
        }
        if (mem.created !== "unknown") {
            lines.push(`created: ${mem.created}`);
        }
        lines.push("---");
        lines.push("");
    }
    lines.push(`# ${mem.title}`);
    lines.push("");
    if (mem.body.length > 0) {
        lines.push(mem.body);
        lines.push("");
    }
    return lines.join("\n");
}
//# sourceMappingURL=store.js.map