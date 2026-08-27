/**
 * Phase A / Item 2 (chunk 2.2) — session-end memory
 * consolidation.
 *
 * **Reference:** codex `codex-rs/memories/write/` phase-1
 * (single-rollout extraction) + phase-2 (consolidation
 * across rollouts). envoy-harness takes the simpler
 * shape: a session-end pass that asks the LLM for
 * "what's worth remembering", then dedups + writes.
 *
 * **What this does:** at the end of a session, the
 * host calls `consolidateMemories(store, messages, opts)`.
 * The function:
 * 1. Asks the LLM (host-injected) for a list of
 *    `Memory` candidates worth saving.
 * 2. Hashes each candidate's body (normalized
 *    sha-256) and skips any that match an existing
 *    memory's hash.
 * 3. Writes the new memories to the store.
 * 4. Returns the list of added memories.
 *
 * **The LLM call is opt-in:** the host passes a
 * `consolidate` function that returns the
 * candidate list. The store + dedup logic is
 * hermetic; the LLM is the host's responsibility.
 *
 * **Why hash-dedup, not semantic dedup:** the host's
 * LLM is the judge of "is this a new memory?". The
 * store only enforces "we don't store the same body
 * twice". A trivial SHA-256 of the normalized body
 * catches the common case (re-running consolidation
 * on the same session).
 *
 * **No-OP semantics:** if the LLM returns an empty
 * list OR all candidates are duplicates, the
 * function returns `{ added: [] }` — no writes.
 *
 * **Stability:** additive. The LLM contract is a
 * single function; new fields on `Memory` are
 * additive.
 */
import { createHash } from "node:crypto";
async function loadHashStore(file) {
    const fs = await import("node:fs/promises");
    try {
        const raw = await fs.readFile(file, "utf8");
        const parsed = JSON.parse(raw);
        if (parsed && parsed.version === 1 && parsed.hashes) {
            return { version: 1, hashes: parsed.hashes };
        }
    }
    catch {
        // Missing or corrupt → start fresh.
    }
    return { version: 1, hashes: {} };
}
async function saveHashStore(file, store) {
    const fs = await import("node:fs/promises");
    await fs.writeFile(file, JSON.stringify(store, null, 2), "utf8");
}
// ---------------------------------------------------------------------------
// Hash
// ---------------------------------------------------------------------------
/**
 * Hash a memory's body. Normalizes whitespace
 * (collapses runs of whitespace, trims) so trivial
 * formatting differences don't defeat the dedup.
 */
export function hashMemoryBody(mem) {
    const normalized = mem.body.replace(/\s+/g, " ").trim();
    return createHash("sha256").update(normalized).digest("hex");
}
// ---------------------------------------------------------------------------
// Consolidate
// ---------------------------------------------------------------------------
/**
 * Run a consolidation pass. Returns the added +
 * duplicates + rejected memories. Never throws on
 * per-memory failures (they go in `rejected`); only
 * throws on a fatal error (e.g. the LLM extract
 * function throws).
 */
export async function consolidateMemories(store, messages, opts) {
    // The hash-file lives in the same directory as the
    // memory store (the host can override). The
    // LocalMemoryStore has a `getMemoryRoot()`; we
    // duck-type here so a non-LocalMemoryStore can be
    // used in tests.
    const root = typeof store.getMemoryRoot === "function"
        ? store.getMemoryRoot()
        : null;
    const hashFile = opts.hashFile ?? (root ? `${root}/.envoy-harness-memory-hashes.json` : null);
    // Pull existing hashes (so re-runs dedup against
    // the prior state).
    const hashes = hashFile
        ? await loadHashStore(hashFile)
        : { version: 1, hashes: {} };
    // Pre-seed hashes from the existing memories. The
    // hash file only tracks memories THIS process
    // wrote; a pre-existing memory (seeded by the user
    // or another tool) wouldn't be in the file. We
    // scan the store and add their hashes so the
    // first-run dedup catches them.
    try {
        const existing = await store.list();
        for (const m of existing) {
            if (hashes.hashes[m.name] === undefined) {
                const mem = await store.read(m.name);
                if (mem !== undefined) {
                    hashes.hashes[m.name] = hashMemoryBody(mem);
                }
            }
        }
    }
    catch {
        // Store is unavailable (e.g. missing directory).
        // Skip pre-seeding; the dedup still works against
        // the hash file.
    }
    // Ask the LLM for the candidates. A throw here
    // surfaces as a fatal error — the caller catches
    // and degrades to "no consolidation".
    const candidates = await opts.extract(messages);
    const added = [];
    const duplicates = [];
    const rejected = [];
    for (const mem of candidates) {
        if (!mem.name || !mem.title) {
            rejected.push({ memory: mem, reason: "missing name or title" });
            continue;
        }
        const hash = hashMemoryBody(mem);
        // Check against existing memories' hashes.
        if (Object.values(hashes.hashes).includes(hash)) {
            duplicates.push(mem);
            continue;
        }
        // Write the new memory.
        try {
            await store.write(mem);
            added.push(mem);
            hashes.hashes[mem.name] = hash;
        }
        catch (err) {
            rejected.push({
                memory: mem,
                reason: err.message,
            });
        }
    }
    // Persist the updated hash store.
    if (hashFile) {
        await saveHashStore(hashFile, hashes);
    }
    return { added, duplicates, rejected };
}
//# sourceMappingURL=consolidate.js.map