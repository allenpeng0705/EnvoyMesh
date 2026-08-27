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
import type { Memory, MemoryStore } from "./store.js";
/** The result of a consolidation pass. */
export interface ConsolidateResult {
    /** The memories that were actually written to the
     *  store (post-dedup). */
    added: ReadonlyArray<Memory>;
    /** The candidates the LLM returned but were
     *  skipped because of hash collision with an
     *  existing memory. */
    duplicates: ReadonlyArray<Memory>;
    /** The candidates the LLM returned but were skipped
     *  for other reasons (e.g. invalid name). */
    rejected: ReadonlyArray<{
        memory: Memory;
        reason: string;
    }>;
}
/** Options for `consolidateMemories`. */
export interface ConsolidateOptions {
    /**
     * The LLM-side memory extractor. Receives the
     * session messages and returns the list of
     * memories the LLM thinks are worth saving. The
     * host injects this — the store is hermetic.
     *
     * The function MAY return `[]` (the "no-op" signal
     * gate — see codex's "Will a future agent plausibly
     * act better because of what I write here?").
     */
    extract: (messages: ReadonlyArray<unknown>) => Promise<ReadonlyArray<Memory>>;
    /** Optional override for the hash file name.
     *  Default: `<memoryRoot>/.envoy-harness-memory-hashes.json`. */
    hashFile?: string;
}
/**
 * Hash a memory's body. Normalizes whitespace
 * (collapses runs of whitespace, trims) so trivial
 * formatting differences don't defeat the dedup.
 */
export declare function hashMemoryBody(mem: Memory): string;
/**
 * Run a consolidation pass. Returns the added +
 * duplicates + rejected memories. Never throws on
 * per-memory failures (they go in `rejected`); only
 * throws on a fatal error (e.g. the LLM extract
 * function throws).
 */
export declare function consolidateMemories(store: MemoryStore, messages: ReadonlyArray<unknown>, opts: ConsolidateOptions): Promise<ConsolidateResult>;
//# sourceMappingURL=consolidate.d.ts.map