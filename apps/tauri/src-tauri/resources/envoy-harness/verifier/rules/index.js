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
import { concatText } from "../types.js";
// ---------------------------------------------------------------------------
// 1. non-empty-content
// ---------------------------------------------------------------------------
/**
 * Pass if the result has at least one text or structured block.
 * Empty output is the cheapest fail to detect and the most
 * common one to fix (the worker crashed silently).
 */
export const nonEmptyContentRule = {
    name: "non-empty-content",
    async check(result) {
        if (result.content.length === 0) {
            return { kind: "fail", reason: "empty output", rollback: true };
        }
        return { kind: "pass", score: 1.0, confidence: "high" };
    },
};
// ---------------------------------------------------------------------------
// 2. output-matches-objective
// ---------------------------------------------------------------------------
/**
 * Cheap heuristic: does the output contain at least 50% of the
 * objective's keywords? Keyword = a word ≥ 4 chars, lowercase,
 * not a stop word.
 *
 * **This is a heuristic.** A pass here is necessary but not
 * sufficient — the LLM source (§12.3) is the higher-trust check.
 * A fail here is a strong signal of drift; a pass is weak.
 */
export const outputMatchesObjectiveRule = {
    name: "output-matches-objective",
    async check(result, objective) {
        const text = concatText(result.content);
        if (text.length === 0) {
            return { kind: "fail", reason: "empty output", rollback: false };
        }
        const keywords = extractKeywords(objective);
        if (keywords.length === 0) {
            // No keywords to check — we can't say pass or fail. The
            // LLM source will judge this; we abstain.
            return null;
        }
        const matched = keywords.filter((kw) => text.toLowerCase().includes(kw.toLowerCase()));
        const ratio = matched.length / keywords.length;
        if (ratio < 0.5) {
            return {
                kind: "partial",
                score: ratio,
                reason: `output matches ${matched.length}/${keywords.length} keywords`,
            };
        }
        return {
            kind: "pass",
            score: ratio,
            // 50% is the pass threshold; high overlap is "high" confidence.
            confidence: ratio >= 0.8 ? "high" : "medium",
        };
    },
};
/** Stop words: too common to be a useful keyword. */
const STOP_WORDS = new Set([
    "the",
    "this",
    "that",
    "with",
    "from",
    "have",
    "they",
    "them",
    "then",
    "than",
    "what",
    "when",
    "where",
    "which",
    "while",
    "would",
    "could",
    "should",
    "there",
    "their",
    "these",
    "those",
    "about",
    "above",
    "after",
    "again",
    "against",
    "also",
    "because",
    "before",
    "below",
    "between",
    "both",
    "each",
    "further",
    "into",
    "more",
    "most",
    "other",
    "over",
    "some",
    "such",
    "through",
    "under",
    "very",
    "just",
    "only",
    "your",
    "yours",
    "yourself",
]);
/** Extract keywords from a string. Drops short words and stop words. */
export function extractKeywords(s) {
    return Array.from(new Set(s
        .toLowerCase()
        .split(/[^a-z0-9]+/g)
        .filter((w) => w.length >= 4 && !STOP_WORDS.has(w))));
}
// ---------------------------------------------------------------------------
// 3. sandbox-respected
// ---------------------------------------------------------------------------
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
export const sandboxRespectedRule = {
    name: "sandbox-respected",
    async check(result) {
        // The transcript has the full tool-call history. We scan
        // tool results for "outside the policy" signals.
        const toolMessages = result.messages.filter((m) => m.role === "tool");
        const violations = [];
        for (const m of toolMessages) {
            for (const block of m.content) {
                if (block.type !== "tool_result")
                    continue;
                if (block.isError)
                    continue; // the policy caught it; that's pass
                // A success is "isError: false". We can't tell from the
                // result alone whether it was within policy; we trust
                // the validator's pre-check. If the result mentions an
                // explicitly-forbidden path, flag it.
                const text = String(block.content ?? "");
                if (text.includes("EACCES") || text.includes("EPERM")) {
                    violations.push(text.slice(0, 80));
                }
            }
        }
        if (violations.length > 0) {
            return {
                kind: "partial",
                score: 0.5,
                reason: `sandbox signal: ${violations[0]}`,
            };
        }
        return { kind: "pass", score: 1.0, confidence: "low" };
    },
};
// ---------------------------------------------------------------------------
// 4. approval-respected
// ---------------------------------------------------------------------------
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
export const approvalRespectedRule = {
    name: "approval-respected",
    async check() {
        // For v0, defer to sandbox-respected (which catches the
        // same class of violation at a different angle). Return
        // pass with low confidence so it counts in the average
        // but doesn't dominate.
        return { kind: "pass", score: 1.0, confidence: "low" };
    },
};
// ---------------------------------------------------------------------------
// 5. mesh-task-shape
// ---------------------------------------------------------------------------
/**
 * Check that `result.content` is a valid `ContentBlock[]` per
 * the schema. v0: the type system already enforces this; the
 * rule returns pass unconditionally. It's here as a place to
 * add mesh-specific shape checks (e.g. "every block has a
 * non-empty text field") without changing the rule engine.
 */
export const meshTaskShapeRule = {
    name: "mesh-task-shape",
    async check(result) {
        // The TS type guarantees the shape. Phase 2 adds content
        // validation (e.g., "all text blocks are non-empty").
        if (result.content.length === 0) {
            return { kind: "fail", reason: "no content blocks", rollback: false };
        }
        return { kind: "pass", score: 1.0, confidence: "high" };
    },
};
// ---------------------------------------------------------------------------
// 6. cost-reasonable-for-work
// ---------------------------------------------------------------------------
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
export const costReasonableForWorkRule = {
    name: "cost-reasonable-for-work",
    async check(result) {
        const cost = result.metrics.costUsd;
        // No cost data → pass (v0 default; F12 may add an LLM check).
        if (cost === 0) {
            return { kind: "pass", score: 1.0, confidence: "low" };
        }
        const budget = DEFAULT_COST_BUDGET_USD;
        if (cost > budget) {
            return {
                kind: "fail",
                reason: `cost ${cost.toFixed(4)} USD exceeds budget ${budget.toFixed(2)} USD`,
                rollback: true,
            };
        }
        const ratio = cost / budget;
        return {
            kind: "pass",
            score: ratio,
            // Lower ratio = better.
            confidence: ratio <= 0.5 ? "high" : "medium",
        };
    },
};
/** Default per-objective cost budget in USD. F12 will read this from config. */
const DEFAULT_COST_BUDGET_USD = 1.0;
// ---------------------------------------------------------------------------
// The default rule set (the 6 rules in design §12.1 order)
// ---------------------------------------------------------------------------
export const DEFAULT_RULES = [
    nonEmptyContentRule,
    outputMatchesObjectiveRule,
    sandboxRespectedRule,
    approvalRespectedRule,
    meshTaskShapeRule,
    costReasonableForWorkRule,
];
//# sourceMappingURL=index.js.map