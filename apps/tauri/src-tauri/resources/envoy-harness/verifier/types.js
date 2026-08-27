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
export async function runVerifierRules(result, objective, ruleSet) {
    const verdicts = [];
    for (const rule of ruleSet) {
        const v = await rule.check(result, objective);
        if (v !== null)
            verdicts.push(v);
    }
    return verdicts;
}
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
export function combineVerdicts(verdicts) {
    if (verdicts.some((v) => v.kind === "fail")) {
        return verdicts.find((v) => v.kind === "fail");
    }
    if (verdicts.length === 0) {
        return {
            kind: "disputed",
            needsHuman: true,
            signals: ["verifier produced no verdicts"],
        };
    }
    if (verdicts.every((v) => v.kind === "pass")) {
        const scores = verdicts
            .filter((v) => v.kind === "pass")
            .map((v) => v.score);
        const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
        return {
            kind: "pass",
            score: avg,
            confidence: scores.length >= 3 ? "high" : "medium",
        };
    }
    // Any disputed signal needs a human. Aggregate the signals so
    // the escalation path has context.
    const disputed = verdicts.filter((v) => v.kind === "disputed");
    if (disputed.length > 0) {
        return {
            kind: "disputed",
            needsHuman: true,
            signals: disputed.flatMap((v) => v.signals),
        };
    }
    // Mixed pass / partial → partial (verifier disagreement).
    return {
        kind: "partial",
        score: 0.5,
        reason: "verifier disagreement",
    };
}
/**
 * Concatenate the text content of a result. Used by rules
 * that need to scan the worker's text (e.g. keyword overlap).
 */
export function concatText(content) {
    return content
        .filter((b) => b.type === "text" && typeof b.text === "string")
        .map((b) => b.text)
        .join("\n");
}
//# sourceMappingURL=types.js.map