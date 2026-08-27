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
/** A memory's metadata (returned by `list()`). */
export interface MemoryMeta {
    /** Canonical id — the file name without the `.md`
     *  extension, lowercase + `[a-z0-9_-]+`. */
    name: string;
    /** Absolute path to the memory file. */
    path: string;
    /** One-line title (from the first `# heading`). */
    title: string;
    /** Tags from the YAML frontmatter; empty when absent. */
    tags: ReadonlyArray<string>;
    /** Created date as a string (ISO 8601 if present);
     *  `"unknown"` when not set. */
    created: string;
    /** Estimated tokens (computed lazily on `read`). */
    estimatedTokens: number;
}
/** A memory's full content. */
export interface Memory {
    /** Same as `MemoryMeta.name`. */
    name: string;
    /** Same as `MemoryMeta.title`. */
    title: string;
    /** Same as `MemoryMeta.tags`. */
    tags: ReadonlyArray<string>;
    /** Same as `MemoryMeta.created`. */
    created: string;
    /** The full markdown body (after the title heading). */
    body: string;
}
/**
 * The contract for a memory store. `LocalMemoryStore`
 * is the file-based implementation; the interface lets
 * tests + the consolidation chunk inject fakes.
 */
export interface MemoryStore {
    /** List all memories (excluding reserved filenames). */
    list(): Promise<MemoryMeta[]>;
    /** Read a single memory by name. */
    read(name: string): Promise<Memory | undefined>;
    /** Write (or overwrite) a memory. */
    write(mem: Memory): Promise<MemoryMeta>;
    /** Expose the root (for tests + the consolidation
     *  helper that needs to know where the hash file is).
     *  Optional — fakes may omit it. */
    getMemoryRoot?(): string;
}
/** Constructor options for `LocalMemoryStore`. */
export interface LocalMemoryStoreOptions {
    /** The directory holding the memory files. The
     *  store does NOT create it — the host (CLI / Tauri)
     *  creates it on first write. Reads require the
     *  directory to exist. */
    memoryRoot: string;
}
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
export declare class LocalMemoryStore implements MemoryStore {
    private readonly memoryRoot;
    constructor(options: LocalMemoryStoreOptions);
    /** List all memories (excluding reserved filenames). */
    list(): Promise<MemoryMeta[]>;
    /**
     * Read a single memory by name (without the `.md`
     * extension). Returns `undefined` when the file
     * doesn't exist or the name is reserved.
     */
    read(name: string): Promise<Memory | undefined>;
    /**
     * Write (or overwrite) a memory. Creates the parent
     * directory if it doesn't exist. Throws on invalid
     * name (reserved or bad characters).
     */
    write(mem: Memory): Promise<MemoryMeta>;
    /** Expose the root (for tests + the consolidation
     *  helper that needs to know where the hash file is). */
    getMemoryRoot(): string;
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
export declare function estimateMemoryTokens(mem: Memory): number;
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
export declare function parseMemoryFile(name: string, raw: string): Memory;
/**
 * Serialize a memory to its file format. Frontmatter
 * is written when tags or created is set.
 */
export declare function serializeMemoryFile(mem: Memory): string;
//# sourceMappingURL=store.d.ts.map