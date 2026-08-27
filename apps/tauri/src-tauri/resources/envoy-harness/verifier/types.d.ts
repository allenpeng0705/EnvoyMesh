/**
 * Verifier types (§12 of the design).
 *
 * **What is a verifier?** A function that judges whether a
 * worker's output actually answers the user's objective. The
 * verifier produces a `Verdict`: `pass`, `partial`, `fail`, or
 * `disputed`. Multiple verdicts from different sources
 * (rules, LLM, human, cross-agent) are combined.
 *
 * **Three layers of trust:**
 *
 * 1. **Local rules** (this module). Fast, deterministic, free.
 *    Six rules per design §12.1.
 *
 * 2. **LLM source** (Phase 2). The verifier is a separate,
 *    cheaper LLM that reads the worker's output and judges it.
 *    See design §12.3.
 *
 * 3. **Human / cross-agent** (Phase 4). Owner-signed review,
 *    or a parallel run on a different model.
 *
 * **Why rules first?** The 6 rules catch 80% of the obvious
 * failures (empty output, sandbox violations, etc.) without an
 * LLM round-trip. LLM verification is the escalation path,
 * not the default.
 *
 * **Stability:** `VerifierRule` and `runVerifierRules` are the
 * public API. Adding a rule is additive; removing one is a
 * major version bump.
 */
import type { AgentResult } from "../agent.js";
import type { Verdict } from "../types.js";
export type { Verdict };
/**
 * A single verifier rule. Returns `null` if the rule has no
 * opinion (e.g. cost-reasonable-for-work when there are no
 * cost metrics); the runner skips nulls.
 *
 * **Why `null` instead of `pass`?** Some rules only apply
 * under certain conditions (cost requires metrics; sandbox
 * requires a policy). A rule that returns `pass` when it
 * shouldn't run would skew the combination.
 */
export interface VerifierRule {
    /** Stable, kebab-case identifier. */
    name: string;
    /**
     * One-paragraph human description. Used by the hypothesis
     * prompt (§13) so the optimizer can reason about the ruleset
     * without seeing the rule bodies. Optional for backward
     * compatibility with rules that pre-date this field.
     */
    description?: string;
    /**
     * Run the rule. Returns a `Verdict` or `null`.
     *
     * **Async for forward-compat:** the interface is async
     * even though the 6 current rules are synchronous, so
     * future rules can do I/O (e.g., a remote policy lookup)
     * without a breaking change.
     */
    check(result: AgentResult, objective: string): Promise<Verdict | null>;
}
/**
 * Run a set of rules against a result. Each rule is invoked
 * in order; rules that return `null` are filtered out. The
 * caller is responsible for combining the verdicts (see
 * `combineVerdicts`).
 *
 * **Why sequential, not parallel?** rules are CPU-cheap and
 * each builds on the previous result shape. Parallelism
 * would be premature. Phase 2 may revisit.
 */
export declare function runVerifierRules(result: AgentResult, objective: string, ruleSet: ReadonlyArray<VerifierRule>): Promise<Verdict[]>;
/**
 * Combine multiple verdicts into a single, decisive one.
 * The order of precedence is:
 *
 * 1. Any `fail` → return that `fail` (with rollback=true).
 *    The first fail wins; the orchestrator should stop here.
 * 2. Empty input → `disputed` (verifier produced nothing).
 * 3. All `pass` → average the scores; confidence based on count.
 * 4. Any `disputed` → `disputed` (the verifier needs a human;
 *    a disputed signal must not be silently downgraded to
 *    partial — that loses the `needsHuman` flag).
 * 5. Mixed `pass` / `partial` → `partial` (verifier disagreement).
 *
 * **No LLM source in v0.** Phase 2 adds the 4-source cascade
 * (per design §12.4): rules first, then LLM, then human/cross.
 */
export declare function combineVerdicts(verdicts: ReadonlyArray<Verdict>): Verdict;
/**
 * Concatenate the text content of a result. Used by rules
 * that need to scan the worker's text (e.g. keyword overlap).
 */
export declare function concatText(content: ReadonlyArray<{
    type: string;
    text?: string;
}>): string;
//# sourceMappingURL=types.d.ts.map