/**
 * The 6 verifier rules (§12.1 of the design).
 *
 * Each rule is a `VerifierRule` (async, returns `Verdict | null`).
 * The set is the v0 default; the 5-step self-evolution protocol
 * (design §13) edits this list as it learns what passes / fails
 * the user's specific work.
 *
 * **Adding a 7th rule:** append to `DEFAULT_RULES`. The runner
 * picks it up automatically. The order is not significant (rules
 * are independent); the 6 here are listed in the design's order.
 *
 * **Removing a rule:** edit `DEFAULT_RULES`. This is a major
 * version bump per the design's stability rules.
 */
import { type VerifierRule } from "../types.js";
/**
 * Pass if the result has at least one text or structured block.
 * Empty output is the cheapest fail to detect and the most
 * common one to fix (the worker crashed silently).
 */
export declare const nonEmptyContentRule: VerifierRule;
/**
 * Cheap heuristic: does the output contain at least 50% of the
 * objective's keywords? Keyword = a word ≥ 4 chars, lowercase,
 * not a stop word.
 *
 * **This is a heuristic.** A pass here is necessary but not
 * sufficient — the LLM source (§12.3) is the higher-trust check.
 * A fail here is a strong signal of drift; a pass is weak.
 */
export declare const outputMatchesObjectiveRule: VerifierRule;
/** Extract keywords from a string. Drops short words and stop words. */
export declare function extractKeywords(s: string): string[];
/**
 * Check that the transcript doesn't show any tool calls that
 * violated the sandbox policy. We look at every tool result;
 * a blocked command's `isError: true` is a positive signal
 * (the policy caught the violation), but a SUCCESSFUL
 * out-of-policy command is a fail.
 *
 * **v0 limitation:** this is a string-level check. A more
 * thorough verifier would parse the tool call's args (path
 * resolution, etc.) and compare against `sandboxPolicy.writableRoots`.
 * Phase 2 (mesh-native) has the data to do that; for v0 we
 * just check that no tool result is "I wrote to a forbidden path".
 */
export declare const sandboxRespectedRule: VerifierRule;
/**
 * Check that no tool call in the transcript did something the
 * session's approval policy would have forbidden. v0: this is
 * a string-level check on tool result messages; if the worker
 * says it did something its permission mode wouldn't allow
 * (e.g. "wrote to /etc/passwd" in workspace-write), we flag.
 *
 * **v0 is conservative:** it checks for explicit "I wrote"
 * patterns in tool results. A more thorough check would
 * cross-reference every bash command with the validator's
 * decision. That's a Phase 2 / cost-tracking concern.
 */
export declare const approvalRespectedRule: VerifierRule;
/**
 * Check that `result.content` is a valid `ContentBlock[]` per
 * the schema. v0: the type system already enforces this; the
 * rule returns pass unconditionally. It's here as a place to
 * add mesh-specific shape checks (e.g. "every block has a
 * non-empty text field") without changing the rule engine.
 */
export declare const meshTaskShapeRule: VerifierRule;
/**
 * Check that the work done was reasonable for the work asked.
 *
 * **v0 heuristic:** cost is judged against a per-objective
 * budget. The default budget is $1.00 per objective (set
 * here as a constant; v0 doesn't yet parse the operator's
 * custom budgets from config). Work below the budget passes
 * with confidence scaled by ratio; work over fails with
 * `rollback: true` (the orchestrator may want to release
 * the cost reserve).
 *
 * **Why a heuristic, not an LLM:** the rule runs on every
 * verifier check. An LLM call would dominate the verifier's
 * latency. v0 ships the heuristic; F12 (cost) can layer an
 * LLM-source check on top for high-criticality chains.
 *
 * **Edge case:** if `result.metrics.costUsd` is 0 (no model
 * reported usage, e.g. FakeModel in tests, or a local
 * model), the rule passes unconditionally. The 0-cost
 * path is the safe default — the absence of cost data
 * isn't a signal of failure.
 */
export declare const costReasonableForWorkRule: VerifierRule;
export declare const DEFAULT_RULES: ReadonlyArray<VerifierRule>;
//# sourceMappingURL=index.d.ts.map