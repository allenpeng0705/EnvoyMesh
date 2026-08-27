/**
 * Phase A / Item 6 — `/review` handoff.
 *
 * **Reference:** deepseek plan-mode's
 * verifier-handoff pattern. envoy-harness uses the
 * existing v6 verifier (`src/verifier/`) to judge
 * "did the result match the plan".
 *
 * **What this is:** a thin wrapper over the existing
 * verifier that takes (plan, result) and returns a
 * `Verdict`. The REPL's `/review` command uses it
 * to print the verdict + route the user back to
 * plan mode on `disputed` or `fail`.
 *
 * **Why not a "loop" that retries the LLM:** the
 * deepseek approach (LLM loops until the verifier
 * passes) is a future chunk. envoy-harness keeps
 * the verifier + user as the loop: the user
 * decides whether to re-plan or accept the verdict.
 *
 * **Stability:** additive. New fields on the
 * `ReviewVerdict` are backward-compatible; the
 * `runReview` signature is stable.
 */
import type { Verdict } from "../types.js";
import { type VerifierRule } from "../verifier/index.js";
import type { PlanState } from "./state.js";
/** The result of a `/review` handoff. */
export interface ReviewVerdict {
    /** The aggregated verdict. */
    verdict: Verdict;
    /** One-line summary for the REPL. */
    summary: string;
    /** Suggested next step (for the REPL to print). */
    suggestion: string;
}
/** Options for `runReview`. */
export interface RunReviewOptions {
    /** The verifier rules to apply. Default: `DEFAULT_RULES`. */
    rules?: ReadonlyArray<VerifierRule>;
}
/**
 * Run the review. Takes a plan + the result, runs
 * the verifier, returns a `ReviewVerdict`.
 *
 * **No plan:** returns an `fail` verdict with
 * "no plan" — the user should re-enter plan mode
 * before running `/review`.
 *
 * **Hermetic:** the verifier is hermetic (no LLM
 * call by default — DEFAULT_RULES are pure). A
 * host that injects LLM-backed rules must inject
 * them via `opts.rules`.
 */
export declare function runReview(plan: PlanState | undefined, result: string, opts?: RunReviewOptions): Promise<ReviewVerdict>;
//# sourceMappingURL=review.d.ts.map