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
import { DEFAULT_RULES, combineVerdicts, runVerifierRules, } from "../verifier/index.js";
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
export async function runReview(plan, result, opts = {}) {
    if (plan === undefined || plan.planText.length === 0) {
        const verdict = {
            kind: "fail",
            reason: "no plan to review against",
            rollback: false,
        };
        return {
            verdict,
            summary: "fail: no plan to review",
            suggestion: "use /plan enter + /plan propose + /plan approve first",
        };
    }
    const rules = opts.rules ?? DEFAULT_RULES;
    // Build a synthetic `AgentResult` with the plan
    // + the result in the messages. The verifier
    // reads `result.messages`; the objective (the
    // second arg) is the plan text.
    const synthetic = {
        content: [{ type: "text", text: result }],
        stopReason: "end_turn",
        iterations: 1,
        toolCalls: 0,
        messages: [
            {
                role: "system",
                content: [{ type: "text", text: `Active plan:\n${plan.planText}` }],
            },
            { role: "user", content: [{ type: "text", text: result }] },
        ],
        sandboxPolicy: {
            mode: "read-only",
            approval: "never",
            backend: "none",
            writableRoots: [],
            networkAccess: false,
            slashTmpWritable: false,
        },
        metrics: { inputTokens: 0, outputTokens: 0, costUsd: 0 },
    };
    const verdicts = await runVerifierRules(synthetic, plan.planText, rules);
    const combined = combineVerdicts(verdicts);
    return summarize(combined);
}
/** Map a `Verdict` to a one-line summary + suggestion. */
function summarize(verdict) {
    switch (verdict.kind) {
        case "pass":
            return {
                verdict,
                summary: `pass (score ${verdict.score.toFixed(2)}, confidence ${verdict.confidence})`,
                suggestion: "result matches the plan; ready for the next step",
            };
        case "partial":
            return {
                verdict,
                summary: `partial: ${verdict.reason}`,
                suggestion: "result is partially correct; review the gaps before continuing",
            };
        case "fail":
            return {
                verdict,
                summary: `fail: ${verdict.reason}`,
                suggestion: "result does not match the plan; re-enter plan mode with /plan enter",
            };
        case "disputed":
            return {
                verdict,
                summary: `disputed: ${verdict.signals.join("; ")}`,
                suggestion: "verifier is uncertain; review the signals before re-planning",
            };
    }
}
//# sourceMappingURL=review.js.map