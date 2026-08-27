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
export const DEFAULT_FRAGMENT_TOKEN_CAP = 10_000;
/** The default prompt-assembly budget in tokens. */
export const DEFAULT_ASSEMBLY_TOKEN_BUDGET = 40_000;
/**
 * Construct a bounded fragment. Throws when `estimatedTokens`
 * exceeds the cap — over-budget fragments are rejected at the
 * boundary (construction), not at render time.
 */
export function createBoundedFragment(opts) {
    const cap = opts.tokenCap ?? DEFAULT_FRAGMENT_TOKEN_CAP;
    if (opts.estimatedTokens > cap) {
        throw new Error(`fragment "${opts.id}" (${opts.owner}) exceeds the token cap: ` +
            `${opts.estimatedTokens} > ${cap}`);
    }
    return {
        id: opts.id,
        owner: opts.owner,
        priority: opts.priority ?? 0,
        estimatedTokens: opts.estimatedTokens,
        render: () => opts.text,
    };
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
export function assembleFragments(fragments, budget = DEFAULT_ASSEMBLY_TOKEN_BUDGET) {
    const sorted = [...fragments].sort((a, b) => b.priority - a.priority);
    const included = [];
    const dropped = [];
    let total = 0;
    for (const f of sorted) {
        if (total + f.estimatedTokens > budget) {
            dropped.push(f.id);
            continue;
        }
        included.push(f);
        total += f.estimatedTokens;
    }
    return {
        text: included.map((f) => f.render()).join("\n\n"),
        dropped,
        included: included.map((f) => f.id),
        totalTokens: total,
    };
}
//# sourceMappingURL=fragment.js.map