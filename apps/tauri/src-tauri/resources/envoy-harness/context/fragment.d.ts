/**
 * Phase 8 / v2.1 — bounded context fragments
 * (the Codex `ContextualUserFragment` rule, ported).
 *
 * **Rule (from `codex/AGENTS.md` "Model visible context"):**
 * everything injected into the model context must have a
 * bounded size and a hard cap; items >10K tokens are rejected;
 * items that can cross 1K tokens need manual review (P0);
 * every injected fragment is a typed struct implementing the
 * trait.
 *
 * **Why a primitive:** the chain prompt assembly (EnvoyMesh)
 * injects the subtask objective, verifier feedback, and worker
 * responses with no size bounds. A 50K-token worker response
 * silently inflates every subsequent call. The fragment trait
 * makes the bound explicit and checked at CONSTRUCTION — an
 * over-budget fragment is rejected at the boundary, not at
 * render time.
 *
 * **Stability:** additive. New fields on `ContextualUserFragment`
 * are backward-compatible; removing one is a major version.
 */
/** The default hard cap per fragment (Codex's 10K-token rule). */
export declare const DEFAULT_FRAGMENT_TOKEN_CAP = 10000;
/** The default prompt-assembly budget in tokens. */
export declare const DEFAULT_ASSEMBLY_TOKEN_BUDGET = 40000;
/**
 * A model-visible prompt fragment. Every injected unit
 * implements this; `estimatedTokens` is bounded at
 * construction (see `createBoundedFragment`).
 */
export interface ContextualUserFragment {
    /** Stable id, for logs / traces. */
    readonly id: string;
    /** The fragment's source ("subtask-objective", "verifier-feedback", ...). */
    readonly owner: string;
    /** Higher priority = kept longer when the budget is tight. */
    readonly priority: number;
    /** Bounded at construction; used for budget accounting. */
    readonly estimatedTokens: number;
    /** Pure: the rendered prompt text. */
    render(): string;
}
/** Options for `createBoundedFragment`. */
export interface BoundedFragmentOptions {
    /** The fragment id. */
    id: string;
    /** The fragment source. */
    owner: string;
    /** Higher = kept longer. Default 0. */
    priority?: number;
    /** Estimated tokens. Must be ≤ `tokenCap`. */
    estimatedTokens: number;
    /** The rendered text. */
    text: string;
    /** Hard cap. Default 10_000. */
    tokenCap?: number;
}
/**
 * Construct a bounded fragment. Throws when `estimatedTokens`
 * exceeds the cap — over-budget fragments are rejected at the
 * boundary (construction), not at render time.
 */
export declare function createBoundedFragment(opts: BoundedFragmentOptions): ContextualUserFragment;
/** The result of `assembleFragments`. */
export interface AssembledContext {
    /** The rendered prompt text (within the budget). */
    text: string;
    /** The ids of fragments dropped by the budget, in drop order. */
    dropped: ReadonlyArray<string>;
    /** The ids of fragments included, in render order. */
    included: ReadonlyArray<string>;
    /** The total estimated tokens of the included fragments. */
    totalTokens: number;
}
/**
 * Assemble fragments into one prompt, honoring a token budget.
 *
 * **Algorithm:**
 * 1. Stable-sort by `priority` descending (fragments with equal
 *    priority keep their input order).
 * 2. Render in order, accumulating estimated tokens. When the
 *    next fragment would exceed the budget, it (and everything
 *    after it) is dropped.
 * 3. Return the text + the drop audit (so the trace/log can
 *    surface what was cut).
 *
 * @param fragments The bounded fragments (already construction-
 *   checked; the assembly does not re-check).
 * @param budget The total token budget. Default 40_000.
 */
export declare function assembleFragments(fragments: ReadonlyArray<ContextualUserFragment>, budget?: number): AssembledContext;
//# sourceMappingURL=fragment.d.ts.map