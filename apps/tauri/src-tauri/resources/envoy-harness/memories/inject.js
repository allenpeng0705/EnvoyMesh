/**
 * Phase A / Item 2 (chunk 2.1) — memory injection as
 * bounded context fragments.
 *
 * **Reference:** codex `codex-rs/memories/` progressive
 * disclosure + the `ContextualUserFragment` rule
 * (Phase 8 / v2.1, ported in `src/context/fragment.ts`).
 *
 * **What this does:** the `buildMemoryIndex` function
 * returns a single bounded fragment that lists every
 * memory's title + a one-line summary. The model sees
 * the list (always-loaded, low token cost) and uses
 * `read_file` to load individual memories on demand.
 *
 * **Why ONE fragment, not N:** the existing
 * `assembleFragments` algorithm stable-sorts by
 * priority and drops the tail when over-budget. With
 * one fragment, "what memories exist" is a single
 * token-cap decision. With N, the model would see a
 * random subset ("the memory index was over budget;
 * here are 2 of 7 memories") — confusing and
 * unactionable. The index is the canonical surface;
 * the model can load individual ones via `read_file`.
 *
 * **No- memories behavior:** the function returns
 * `[]` when the store is empty. The caller (the
 * agent's prompt assembly) is a no-op for empty
 * fragment lists.
 *
 * **Stability:** the fragment's `render()` output is
 * stable + parseable (each line is `- [<name>] <title>`)
 * so the model can read it + humans can copy it.
 */
import { createBoundedFragment, } from "../context/fragment.js";
import { estimateMessageTokens } from "../context/budget.js";
// ---------------------------------------------------------------------------
// Memory index (the always-loaded surface)
// ---------------------------------------------------------------------------
/**
 * Build the "memory index" fragment. Returns a
 * single `ContextualUserFragment` listing every
 * memory's title + a one-line summary. The fragment
 * is bounded at construction (over-budget
 * memories throw — the host catches and degrades).
 *
 * **Empty store:** returns `[]`.
 */
export async function buildMemoryIndex(store) {
    const list = await store.list();
    if (list.length === 0)
        return [];
    return [buildIndexFragment(list, "memory-index")];
}
/**
 * Build a single `ContextualUserFragment` from a
 * pre-fetched list of `MemoryMeta[]`. Exposed for
 * the consolidation chunk (2.2) which holds the
 * list in memory.
 */
export function buildIndexFragment(list, id = "memory-index") {
    // Sort by name for a stable index (the list is
    // already sorted; this is defensive).
    const sorted = [...list].sort((a, b) => a.name.localeCompare(b.name));
    const lines = [
        "Available memories (read with `read_file memories/<name>.md`):",
        "",
    ];
    for (const m of sorted) {
        const tags = m.tags.length > 0 ? ` [${m.tags.join(", ")}]` : "";
        lines.push(`- [${m.name}]${tags} ${m.title}`);
    }
    const text = lines.join("\n");
    return createBoundedFragment({
        id,
        owner: "memory-index",
        priority: -100, // low priority; memory index is informative, not action-guiding
        estimatedTokens: estimateMessageTokens({
            role: "user",
            content: [{ type: "text", text }],
        }),
        text,
    });
}
// ---------------------------------------------------------------------------
// Per-memory fragment (for the consolidation chunk 2.2 + tests)
// ---------------------------------------------------------------------------
/**
 * Build a single `ContextualUserFragment` from one
 * memory's full body. Used by the `/memory read <name>`
 * REPL command and by the consolidation chunk when
 * the host wants the model to see a specific memory
 * in full.
 *
 * **Over-budget:** if the body exceeds the token cap,
 * construction throws. The host catches and
 * truncates.
 */
export function buildMemoryFragment(mem, id = `memory:${mem.name}`) {
    const lines = [
        `# Memory: ${mem.name}`,
        `Title: ${mem.title}`,
    ];
    if (mem.tags.length > 0) {
        lines.push(`Tags: ${mem.tags.join(", ")}`);
    }
    if (mem.created !== "unknown") {
        lines.push(`Created: ${mem.created}`);
    }
    lines.push("", mem.body);
    const text = lines.join("\n");
    return createBoundedFragment({
        id,
        owner: `memory:${mem.name}`,
        priority: 100, // high priority; the model explicitly asked for this
        estimatedTokens: estimateMessageTokens({
            role: "user",
            content: [{ type: "text", text }],
        }),
        text,
    });
}
//# sourceMappingURL=inject.js.map